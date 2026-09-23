import { strict as assert } from "node:assert"
import { edit_ast_spec } from "@core/task/tools/modules/edit_ast/EditAstTool"
import { edit_file_spec } from "@core/task/tools/modules/edit_file/EditFileTool"
import { inspect_ast_spec } from "@core/task/tools/modules/inspect_ast/InspectAstTool"
import { read_file_spec } from "@core/task/tools/modules/read_file/ReadFileTool"
import { search_files_spec } from "@core/task/tools/modules/search_files"
import { use_subagents_spec } from "@core/task/tools/modules/use_subagents/UseSubagentsTool"
import { AgentConfigLoader } from "@core/task/tools/subagent/AgentConfigLoader"
import { afterEach, describe, it } from "mocha"
import sinon from "sinon"
import { DiracToolSet } from "../registry/DiracToolSet"
import type { SystemPromptContext } from "../types"

const baseContext: SystemPromptContext = {
	providerInfo: {
		providerId: "openai",
		model: { id: "primary-model", info: { supportsPromptCache: false } },
		mode: "act",
	},
	ide: "Test IDE",
	subagentsEnabled: true,
}

function genericSubagentProperties(context: SystemPromptContext): Record<string, unknown> {
	const [spec] = DiracToolSet.withDynamicSubagentToolSpecs([use_subagents_spec], context)
	const parameter = spec.parameters?.find((candidate) => candidate.name === "subagents")
	return parameter?.items?.properties ?? {}
}

describe("DiracToolSet Utility subagent routing", () => {
	afterEach(() => sinon.restore())

	it("does not mention Utility routing when no Utility model is configured", () => {
		sinon.stub(AgentConfigLoader, "getInstance").returns({
			getAllCachedConfigsWithToolNames: () => [],
		} as unknown as AgentConfigLoader)

		const properties = genericSubagentProperties(baseContext)

		assert.equal("use_utility_model" in properties, false)
		assert.doesNotMatch(JSON.stringify(properties), /utility/i)
	})

	it("adds Utility routing to the generic subagent schema when configured", () => {
		sinon.stub(AgentConfigLoader, "getInstance").returns({
			getAllCachedConfigsWithToolNames: () => [],
		} as unknown as AgentConfigLoader)

		const properties = genericSubagentProperties({ ...baseContext, utilityModelConfigured: true })

		assert.deepEqual(properties.use_utility_model, {
			type: "boolean",
			description: "Run this subagent using the configured Utility model. Default: false.",
		})
	})

	it("adds Utility routing to configured-agent tools only when configured", () => {
		sinon.stub(AgentConfigLoader, "getInstance").returns({
			getAllCachedConfigsWithToolNames: () => [
				{
					toolName: "subagent_reviewer",
					config: {
						name: "reviewer",
						description: "Reviews code",
						tools: [],
						systemPrompt: "Review the code.",
					},
				},
			],
		} as unknown as AgentConfigLoader)

		const unavailable = DiracToolSet.getDynamicSubagentToolSpecs(baseContext)[0]
		const available = DiracToolSet.getDynamicSubagentToolSpecs({ ...baseContext, utilityModelConfigured: true })[0]

		assert.equal(
			unavailable.parameters?.some((parameter) => parameter.name === "use_utility_model"),
			false,
		)
		assert.equal(
			available.parameters?.some((parameter) => parameter.name === "use_utility_model"),
			true,
		)
	})

	it("preserves Utility routing in provider-native schemas", () => {
		sinon.stub(AgentConfigLoader, "getInstance").returns({
			getAllCachedConfigsWithToolNames: () => [],
		} as unknown as AgentConfigLoader)
		const strictOpenAIContext: SystemPromptContext = {
			...baseContext,
			utilityModelConfigured: true,
			providerInfo: {
				...baseContext.providerInfo,
				model: {
					...baseContext.providerInfo.model,
					info: { ...baseContext.providerInfo.model.info, supportsStrictTools: true },
				},
			},
		}
		const anthropicContext: SystemPromptContext = {
			...strictOpenAIContext,
			providerInfo: { ...strictOpenAIContext.providerInfo, providerId: "anthropic" },
		}
		const [strictOpenAISpec] = DiracToolSet.withDynamicSubagentToolSpecs([use_subagents_spec], strictOpenAIContext)
		const [anthropicSpec] = DiracToolSet.withDynamicSubagentToolSpecs([use_subagents_spec], anthropicContext)

		const [strictOpenAITool] = DiracToolSet.convertSpecsToNativeTools([strictOpenAISpec], strictOpenAIContext)
		const [anthropicTool] = DiracToolSet.convertSpecsToNativeTools([anthropicSpec], anthropicContext)
		const strictItems = (strictOpenAITool as any).function.parameters.properties.subagents.items
		const anthropicItems = (anthropicTool as any).input_schema.properties.subagents.items

		assert.equal((strictOpenAITool as any).function.strict, true)
		assert.deepEqual(strictItems.properties.use_utility_model.type, ["boolean", "null"])
		assert.equal(strictItems.required.includes("use_utility_model"), true)
		assert.deepEqual(anthropicItems.properties.use_utility_model, {
			type: "boolean",
			description: "Run this subagent using the configured Utility model. Default: false.",
		})
		assert.deepEqual(anthropicItems.required, ["task_title", "prompt"])
	})
})

describe("DiracToolSet hidden-tool mentions", () => {
	const names = (specs: ReturnType<typeof DiracToolSet.withoutHiddenToolMentions>) =>
		JSON.stringify(specs.map((spec) => [spec.description, spec.parameters?.map((p) => [p.name, p.instruction])]))

	it("drops sentences and optional parameters that name a disabled builtin", () => {
		const specs = DiracToolSet.withoutHiddenToolMentions([read_file_spec, search_files_spec], baseContext)

		assert.doesNotMatch(names(specs), /\bedit_file\b|\binspect_ast\b/)
		for (const spec of specs) {
			assert.equal(spec.parameters?.some((p) => p.name === "include_anchors"), false, spec.name)
		}
		// What remains still describes the tool.
		assert.match(specs[0].description, /line ranges/)
		assert.ok(specs[0].parameters?.some((p) => p.name === "start_line"))
	})

	it("drops the AST-preference sentence from search_files when inspect_ast and edit_ast are hidden", () => {
		const shown = DiracToolSet.withoutHiddenToolMentions(
			[read_file_spec, search_files_spec, inspect_ast_spec, edit_ast_spec],
			baseContext,
		)
		const shownSearch = shown.find((spec) => spec.name === "search_files")!
		assert.match(shownSearch.description, /\binspect_ast\b/)

		const hidden = DiracToolSet.withoutHiddenToolMentions([read_file_spec, search_files_spec], baseContext)
		const hiddenSearch = hidden.find((spec) => spec.name === "search_files")!
		assert.doesNotMatch(hiddenSearch.description, /\binspect_ast\b|\bedit_ast\b/)
		assert.match(hiddenSearch.description, /Regex search across files/)
	})

	it("keeps the inspect_ast preference in search_files when only edit_ast is hidden", () => {
		const specs = DiracToolSet.withoutHiddenToolMentions([read_file_spec, search_files_spec, inspect_ast_spec], baseContext)
		const search = specs.find((spec) => spec.name === "search_files")!
		assert.match(search.description, /Prefer `inspect_ast` over this/)
		assert.doesNotMatch(search.description, /\bedit_ast\b/)
	})

	it("leaves a spec alone when the tools it names are shown", () => {
		const [read] = DiracToolSet.withoutHiddenToolMentions(
			[read_file_spec, edit_file_spec, inspect_ast_spec, search_files_spec],
			baseContext,
		)

		assert.equal(read, read_file_spec)
	})
})
