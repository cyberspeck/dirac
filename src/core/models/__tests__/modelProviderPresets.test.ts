import { strict as assert } from "node:assert"
import type { StateManager } from "@core/storage/StateManager"
import type { ApiConfiguration } from "@shared/api"
import { describe, it } from "mocha"
import { recordSuccessfulModelProviderPreset } from "../modelProviderPresets"

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
