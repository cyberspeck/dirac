import { AgentConfigLoader } from "@core/task/tools/subagent/AgentConfigLoader"
import { DEFAULT_SUBAGENT_TIMEOUT_SECONDS } from "@core/task/tools/subagent/SubagentExecutionPolicy"
import { SUBAGENT_TASK_TITLE_MAX_CHARS, SUBAGENT_TASK_TITLE_MAX_WORDS } from "@shared/subagents"
import { DiracDefaultTool, type DiracTool, toolUseNames } from "@/shared/tools"
import {
	type DiracToolSpec,
	shouldUseStrictToolSchemas,
	toolSpecFunctionDeclarations,
	toolSpecFunctionDefinition,
	toolSpecInputSchema,
} from "../spec"
import { SystemPromptContext } from "../types"

const UTILITY_MODEL_PARAMETER = {
	name: "use_utility_model",
	required: false,
	type: "boolean" as const,
	instruction: "Run this subagent using the configured Utility model. 'Utility model' is a pre-configured model that is cost effective and fast, but unsuitable for complex tasks. Default: false.",
}

export class DiracToolSet {
	private constructor() {}

	public static getDynamicSubagentToolSpecs(context: SystemPromptContext): DiracToolSpec[] {
		if (context.subagentsEnabled !== true) {
			return []
		}

		const agentConfigs = AgentConfigLoader.getInstance().getAllCachedConfigsWithToolNames()
		return agentConfigs.map(({ toolName, config }) => ({
			id: DiracDefaultTool.USE_SUBAGENTS,
			name: toolName,
			description: `Use the "${config.name}" subagent: ${config.description}`,
			contextRequirements: (ctx) => ctx.subagentsEnabled === true,
			parameters: [
				{
					name: "task_title",
					required: true,
					instruction: `Task header for user observability. No more than ${SUBAGENT_TASK_TITLE_MAX_WORDS} words or ${SUBAGENT_TASK_TITLE_MAX_CHARS} characters.`,
				},
				{
					name: "prompt",
					required: true,
					instruction: "Helpful instruction for the task that the subagent will perform.",
				},
				{
					name: "timeout",
					required: false,
					instruction: `Optional timeout in seconds for the subagent. Default: ${DEFAULT_SUBAGENT_TIMEOUT_SECONDS}.`,
				},
				...(context.utilityModelConfigured ? [UTILITY_MODEL_PARAMETER] : []),
			],
		}))
	}

	public static withDynamicSubagentToolSpecs(registeredTools: DiracToolSpec[], context: SystemPromptContext): DiracToolSpec[] {
		const contextualizedRegisteredTools = registeredTools.map((tool) => DiracToolSet.withUtilityModelParameter(tool, context))
		const hasSubagentDispatcher = contextualizedRegisteredTools.some((tool) => tool.id === DiracDefaultTool.USE_SUBAGENTS)
		if (!hasSubagentDispatcher) {
			return contextualizedRegisteredTools
		}

		const dynamicSubagentTools = DiracToolSet.getDynamicSubagentToolSpecs(context)
		const includesDynamicSubagents = dynamicSubagentTools.length > 0
		const filteredRegistered = includesDynamicSubagents
			? contextualizedRegisteredTools.filter((tool) => tool.id !== DiracDefaultTool.USE_SUBAGENTS)
			: contextualizedRegisteredTools

		return [...filteredRegistered, ...dynamicSubagentTools]
	}

	private static withUtilityModelParameter(tool: DiracToolSpec, context: SystemPromptContext): DiracToolSpec {
		if (
			context.utilityModelConfigured !== true ||
			tool.id !== DiracDefaultTool.USE_SUBAGENTS ||
			tool.name !== DiracDefaultTool.USE_SUBAGENTS
		) {
			return tool
		}

		return {
			...tool,
			parameters: tool.parameters?.map((parameter) => {
				if (parameter.name !== "subagents" || parameter.type !== "array" || !parameter.items?.properties) {
					return parameter
				}

				return {
					...parameter,
					items: {
						...parameter.items,
						properties: {
							...parameter.items.properties,
							use_utility_model: {
								type: "boolean",
								description: UTILITY_MODEL_PARAMETER.instruction,
							},
						},
					},
				}
			}),
		}
	}

	public static convertSpecsToNativeTools(specs: DiracToolSpec[], context: SystemPromptContext): DiracTool[] {
		const enabledTools = DiracToolSet.withoutHiddenToolMentions(
			specs.filter((tool) => typeof tool.description === "string" && tool.description.trim().length > 0),
			context,
		)
		const providerId = context.providerInfo?.providerId || "openai"
		const modelId = context.providerInfo?.model?.id
		const converter = DiracToolSet.getNativeConverter(providerId, modelId)

		return enabledTools.map((tool) => converter(tool, context))
	}

	/**
	 * A builtin tool that is disabled must not be named by the ones that are shown: "set
	 * include_anchors: true ... required by edit_file" with edit_file disabled sends the model
	 * after coordinates for a tool it cannot call. Drops every sentence of a description that
	 * names a hidden builtin, and every optional parameter whose instruction does; a required
	 * parameter keeps its remaining sentences. The system-prompt counterpart is the
	 * execute_command/list_skills filtering in TaskRequestBuilder.
	 */
	public static withoutHiddenToolMentions(specs: DiracToolSpec[], context: SystemPromptContext): DiracToolSpec[] {
		const shown = new Set(specs.map((spec) => spec.name))
		const hidden = toolUseNames.filter((name) => !shown.has(name))
		if (hidden.length === 0) return specs
		const resolve = (instruction: string | ((c: SystemPromptContext) => string)) =>
			typeof instruction === "function" ? instruction(context) : instruction
		const mentions = new RegExp(`\\b(${hidden.join("|")})\\b`)
		const prune = (text: string) =>
			text
				.split(/(?<=[.!?])\s+(?=[A-Z])/)
				.filter((sentence) => !mentions.test(sentence))
				.join(" ")

		return specs.map((spec) => {
			if (!mentions.test(spec.description) && !spec.parameters?.some((p) => mentions.test(resolve(p.instruction)))) {
				return spec
			}
			const parameters = spec.parameters
				?.filter((p) => p.required || !mentions.test(resolve(p.instruction)))
				.map((p) => (mentions.test(resolve(p.instruction)) ? { ...p, instruction: prune(resolve(p.instruction)) } : p))
			return { ...spec, description: prune(spec.description), parameters }
		})
	}

	/**
	 * Get the appropriate native tool converter for the given provider
	 */
	public static getNativeConverter(providerId: string, modelId?: string) {
		switch (providerId) {
			case "minimax":
			case "anthropic":
			case "bedrock":
				return toolSpecInputSchema
			case "gemini":
				return toolSpecFunctionDeclarations
			case "vertex":
				if (modelId?.includes("gemini")) {
					return toolSpecFunctionDeclarations
				}
				return toolSpecInputSchema
			default:
				// Default to OpenAI Compatible converter
				return (tool: DiracToolSpec, ctx: SystemPromptContext) =>
					toolSpecFunctionDefinition(tool, ctx, shouldUseStrictToolSchemas(ctx.providerInfo))
		}
	}
}
