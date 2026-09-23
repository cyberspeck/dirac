import { DiracToolSet } from "@core/prompts/system-prompt/registry/DiracToolSet"
import type { SystemPromptContext } from "@core/prompts/system-prompt/types"
import { DiracDefaultTool } from "@/shared/tools"
import { ToolExecutorCoordinator } from "../ToolExecutorCoordinator"
import { SurfaceToolEnvironmentFactory } from "../adapters/SurfaceAdapter"
import { ToolRegistry } from "../registry/ToolRegistry"
import { refreshToolRegistryForWorkspace } from "../registry/refreshToolRegistry"
import type { TaskConfig } from "../types/TaskConfig"
import type { DiscoveredTool } from "../discovery/DiscoveredTool"
import type { SkillMetadata } from "@shared/skills"
import { ToolInventorySnapshot, ToolRequestSnapshot, ToolSnapshotDirtyReason, validateToolRequestSnapshot } from "./ToolSnapshot"
import { applyToolSelectionPolicy, type ToolSelectionPolicy } from "./ToolSelectionPolicy"

import { Logger } from "@/shared/services/Logger"

interface ToolSnapshotManagerOptions {
	createTaskConfig: (coordinator: ToolExecutorCoordinator) => TaskConfig
	getTaskId: () => string
	getWorkspaceRoot: () => string | undefined
	getToggles: () => Record<string, boolean>
	getSelectionPolicy: () => ToolSelectionPolicy | undefined
	getActiveSkills: () => readonly SkillMetadata[]
	isToolAvailable?: (tool: DiscoveredTool) => boolean
	environmentFactory?: import("../interfaces/ToolEnvironmentFactory").ToolEnvironmentFactory
}

export class ToolSnapshotManager {
	private inventoryDirty = true
	private cachedRegistryVersion = -1
	private togglesDirty = true
	private inventoryVersion = 0
	private inventorySnapshot?: ToolInventorySnapshot
	private activeRequestSnapshot?: ToolRequestSnapshot

	constructor(private readonly options: ToolSnapshotManagerOptions) { }

	markDirty(reason: ToolSnapshotDirtyReason): void {
		if (reason === "tool_toggles_changed") {
			this.togglesDirty = true
			return
		}

		this.inventoryDirty = true
		this.togglesDirty = true
	}

	getActiveSnapshot(): ToolRequestSnapshot | undefined {
		return this.activeRequestSnapshot
	}

	activateSnapshot(snapshot: ToolRequestSnapshot): void {
		this.activeRequestSnapshot = snapshot
	}

	async getSnapshotForRequest(
		context: SystemPromptContext,
		request: { requestId: string; configurationRevision: number },
	): Promise<ToolRequestSnapshot> {
		const captureSnapshot = (registry: ToolRegistry): ToolRequestSnapshot => {
			// Registry toggle state is process-global, so every task capture must install
			// this request's detached toggles before deriving enabled membership.
			registry.loadToggles(this.options.getToggles())
			const inventory = this.getInventorySnapshot(registry)
			const activeSkills = this.options.getActiveSkills()
			const effectiveTools = this.selectEffectiveTools(registry, inventory.tools, inventory.enabledTools)
			const promptVisibleSpecs = this.buildPromptVisibleSpecs(effectiveTools, context)
			const nativeTools = DiracToolSet.convertSpecsToNativeTools(promptVisibleSpecs, context)
			const dynamicSubagentToolNames = new Set(
				promptVisibleSpecs
					.filter((spec) => spec.id === DiracDefaultTool.USE_SUBAGENTS && spec.name !== DiracDefaultTool.USE_SUBAGENTS)
					.map((spec) => spec.name),
			)
			const coordinator = this.buildCoordinator(effectiveTools)
			this.validateInventoryCoordinator(effectiveTools, coordinator)
			const executableToolNames = new Set([...effectiveTools.map((tool) => tool.spec.name), ...dynamicSubagentToolNames])

			const snapshot: ToolRequestSnapshot = {
				inventoryVersion: inventory.version,
				requestId: request.requestId,
				configurationRevision: request.configurationRevision,
				promptVisibleSpecs,
				inventoryEnabledTools: effectiveTools,
				activeSkillIds: activeSkills.map((skill) => skill.name),
				nativeTools,
				coordinator,
				executableToolNames,
				dynamicSubagentToolNames,
			}

			validateToolRequestSnapshot(snapshot)
			return snapshot
		}

		return this.withRegistry(this.options.getToggles(), captureSnapshot)
	}

	/**
	 * Names of the tools the next request will execute, for text built before its snapshot
	 * (environment details, resume notices). Same selection as getSnapshotForRequest, without
	 * building handlers; skills activated by that request itself are not yet included.
	 */
	async getExecutableToolNames(toggles: Record<string, boolean>): Promise<Set<string>> {
		return this.withRegistry(toggles, (registry) => {
			registry.loadToggles(toggles)
			const taskId = this.options.getTaskId()
			const workspaceRoot = this.options.getWorkspaceRoot()
			const enabledTools = registry
				.getEnabledTools(taskId, workspaceRoot)
				.filter((tool) => this.options.isToolAvailable?.(tool) ?? true)
			const tools = this.selectEffectiveTools(registry, registry.getAllTools(taskId, workspaceRoot), enabledTools)
			return new Set(tools.map((tool) => tool.spec.name))
		})
	}

	private withRegistry<T>(toggles: Record<string, boolean>, capture: (registry: ToolRegistry) => T): Promise<T> {
		if (this.inventoryDirty) {
			return refreshToolRegistryForWorkspace(
				{ workspaceRoot: this.options.getWorkspaceRoot(), includeUserTools: true, toggles },
				capture,
			)
		}
		return ToolRegistry.withExclusiveAccess(capture)
	}

	private selectEffectiveTools(
		registry: ToolRegistry,
		tools: readonly DiscoveredTool[],
		enabledTools: readonly DiscoveredTool[],
	): DiscoveredTool[] {
		const skillTools = registry.resolveSkillDependencyTools(
			this.options.getActiveSkills(),
			this.options.getTaskId(),
			this.options.getWorkspaceRoot(),
		)
		const selectedConfiguredTools = applyToolSelectionPolicy(tools, enabledTools, this.options.getSelectionPolicy())
		return this.mergeTools(selectedConfiguredTools, skillTools).filter((tool) => this.options.isToolAvailable?.(tool) ?? true)
	}

	private getInventorySnapshot(registry: ToolRegistry): ToolInventorySnapshot {
		const registryVersion = registry.getVersion()
		if (!this.inventoryDirty && !this.togglesDirty && this.inventorySnapshot && registryVersion === this.cachedRegistryVersion) {
			return this.inventorySnapshot
		}

		// Detach the inventory before releasing the process-global registry lock.
		// Tool definitions are immutable runtime descriptors; copying the arrays is
		// sufficient to prevent later per-Task toggle loads from changing membership.
		const ownerTaskId = this.options.getTaskId()
		const workspaceRoot = this.options.getWorkspaceRoot()
		const tools = [...registry.getAllTools(ownerTaskId, workspaceRoot)]
		const enabledTools = [...registry.getEnabledTools(ownerTaskId, workspaceRoot)].filter(
			(tool) => this.options.isToolAvailable?.(tool) ?? true,
		)
		const coordinator = this.buildCoordinator(enabledTools)
		this.validateInventoryCoordinator(enabledTools, coordinator)
		const executableToolNames = new Set(enabledTools.map((tool) => tool.spec.name))

		this.inventoryVersion += 1
		this.inventorySnapshot = {
			version: this.inventoryVersion,
			tools,
			enabledTools,
			coordinator,
			executableToolNames,
			createdAt: Date.now(),
		}

		this.inventoryDirty = false
		this.cachedRegistryVersion = registry.getVersion()
		this.togglesDirty = false

		const toolIds = enabledTools.map((t) => `${t.id}(${t.source})`).join(", ")
		Logger.info(`[ToolSnapshotManager] Inventory rebuilt (v${this.inventoryVersion}): [${toolIds}]`)

		return this.inventorySnapshot
	}

	private mergeTools(baseTools: DiscoveredTool[], skillTools: DiscoveredTool[]): DiscoveredTool[] {
		const tools = new Map(baseTools.map((tool) => [tool.id, tool]))
		for (const tool of skillTools) tools.set(tool.id, tool)
		return [...tools.values()]
	}

	private buildCoordinator(enabledTools: DiscoveredTool[]): ToolExecutorCoordinator {
		const coordinator = new ToolExecutorCoordinator(
			this.options.environmentFactory ?? new SurfaceToolEnvironmentFactory(),
		)
		const config = this.options.createTaskConfig(coordinator)

		for (const tool of enabledTools) {
			coordinator.registerModularTool(tool.factory(config))
		}

		return coordinator
	}

	private validateInventoryCoordinator(enabledTools: DiscoveredTool[], coordinator: ToolExecutorCoordinator): void {
		for (const tool of enabledTools) {
			if (!coordinator.has(tool.spec.name)) {
				throw new Error(`Enabled tool '${tool.spec.name}' was not registered in coordinator.`)
			}
		}
	}

	private buildPromptVisibleSpecs(enabledTools: DiscoveredTool[], context: SystemPromptContext) {
		const contextFilteredSpecs = enabledTools
			.map((tool) => tool.spec)
			.filter((spec) => !spec.contextRequirements || spec.contextRequirements(context))

		return DiracToolSet.withDynamicSubagentToolSpecs(contextFilteredSpecs, context)
	}
}
