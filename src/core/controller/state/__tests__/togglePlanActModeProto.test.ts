import { strict as assert } from "node:assert"
import { ApiConfigurationError, ApiConfigurationErrorCode } from "@core/api/ApiConfigurationError"
import { PlanActMode, TogglePlanActModeRequest } from "@shared/proto/dirac/state"
import { ShowMessageType } from "@shared/proto/host/window"
import { afterEach, beforeEach, describe, it } from "mocha"
import * as sinon from "sinon"
import { HostProvider } from "@/hosts/host-provider"
import { Logger } from "@/shared/services/Logger"
import type { Controller } from "../.."
import { togglePlanActModeProto } from "../togglePlanActModeProto"

describe("togglePlanActModeProto", () => {
	const sandbox = sinon.createSandbox()
	let showMessage: sinon.SinonSpy

	beforeEach(() => {
		showMessage = sinon.spy()
		sandbox.stub(HostProvider, "window").get(() => ({ showMessage }) as unknown as typeof HostProvider.window)
		sandbox.stub(Logger, "error")
	})

	afterEach(() => sandbox.restore())

	it("shows why the mode could not be switched and still rejects", async () => {
		const error = new ApiConfigurationError(
			ApiConfigurationErrorCode.ProfileMissing,
			"OpenAI-compatible profile not found: gone",
			"Select an available profile before retrying.",
		)
		const controller = { togglePlanActMode: sinon.stub().rejects(error) } as unknown as Controller

		await assert.rejects(
			togglePlanActModeProto(controller, TogglePlanActModeRequest.create({ mode: PlanActMode.ACT })),
			error,
		)

		sinon.assert.calledOnceWithExactly(showMessage, {
			type: ShowMessageType.ERROR,
			message:
				"Could not switch to Act mode: OpenAI-compatible profile not found: gone Select an available profile before retrying.",
		})
	})
})
