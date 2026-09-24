import { strict as assert } from "node:assert"
import type { StateManager } from "@core/storage/StateManager"
import type { ApiConfiguration } from "@shared/api"
import { describe, it } from "mocha"
import { recordSavedOpenAiCompatibleProfileChanges, recordSuccessfulModelProviderPreset } from "../modelProviderPresets"

function fakeStateManager(apiConfiguration: ApiConfiguration, globals: Record<string, unknown>) {
	const state = { apiConfiguration, globals: { modelProviderPresets: [], ...globals } as Record<string, unknown> }
	const stateManager = {
		getApiConfiguration: () => state.apiConfiguration,
		setApiConfiguration: (updates: Partial<ApiConfiguration>) => {
			state.apiConfiguration = { ...state.apiConfiguration, ...updates }
		},
		getGlobalSettingsKey: (key: string) => state.globals[key],
		setGlobalState: (key: string, value: unknown) => {
			state.globals[key] = value
		},
	} as unknown as StateManager
	return { state, stateManager }
}

const modelInfo = { supportsPromptCache: false }

describe("recordSuccessfulModelProviderPreset", () => {
	it("names the new OpenAI-compatible profile in both modes when they share a model", () => {
		const { state, stateManager } = fakeStateManager(
			{ openAiBaseUrl: "http://localhost:1234/v1" },
			{ planActSeparateModelsSetting: false },
		)
		recordSuccessfulModelProviderPreset(stateManager, "openai", "m", modelInfo, "plan")

		const name = state.apiConfiguration.openAiCompatibleProfiles?.[0]?.name
		assert.ok(name)
		assert.equal(state.apiConfiguration.planModeOpenAiProfileName, name)
		assert.equal(state.apiConfiguration.actModeOpenAiProfileName, name)
	})

	it("names the new profile only in the current mode when Plan and Act are separate", () => {
		const { state, stateManager } = fakeStateManager(
			{ openAiBaseUrl: "http://localhost:1234/v1", actModeOpenAiProfileName: "other" },
			{ planActSeparateModelsSetting: true },
		)
		recordSuccessfulModelProviderPreset(stateManager, "openai", "m", modelInfo, "plan")

		assert.equal(state.apiConfiguration.planModeOpenAiProfileName, state.apiConfiguration.openAiCompatibleProfiles?.[0]?.name)
		assert.equal(state.apiConfiguration.actModeOpenAiProfileName, "other")
	})
})

describe("recordSavedOpenAiCompatibleProfileChanges", () => {
	it("clears a Plan or Act profile name that no saved profile has", () => {
		const kept = { name: "kept", baseUrl: "http://localhost:1234/v1", modelId: "m", modelInfo }
		const { state, stateManager } = fakeStateManager(
			{ openAiCompatibleProfiles: [kept], planModeOpenAiProfileName: "kept", actModeOpenAiProfileName: "deleted" },
			{},
		)
		recordSavedOpenAiCompatibleProfileChanges(stateManager, [kept, { ...kept, name: "deleted" }])

		assert.equal(state.apiConfiguration.planModeOpenAiProfileName, "kept")
		assert.ok("actModeOpenAiProfileName" in state.apiConfiguration)
		assert.equal(state.apiConfiguration.actModeOpenAiProfileName, undefined)
	})
})
