import { ApiConfigurationError } from "@core/api/ApiConfigurationError"
import { Boolean } from "@shared/proto/dirac/common"
import { PlanActMode, TogglePlanActModeRequest } from "@shared/proto/dirac/state"
import { ShowMessageType } from "@shared/proto/host/window"
import { Mode } from "@shared/storage/types"
import { HostProvider } from "@/hosts/host-provider"
import { getErrorMessage } from "@/shared/errors"
import { Logger } from "@/shared/services/Logger"
import { Controller } from ".."

/**
 * Toggles between Plan and Act modes
 * @param controller The controller instance
 * @param request The request containing the chat settings and optional chat content
 * @returns An empty response
 */
export async function togglePlanActModeProto(controller: Controller, request: TogglePlanActModeRequest): Promise<Boolean> {
	try {
		let mode: Mode
		if (request.mode === PlanActMode.PLAN) {
			mode = "plan"
		} else if (request.mode === PlanActMode.ACT) {
			mode = "act"
		} else {
			throw new Error(`Invalid mode value: ${request.mode}`)
		}
		const chatContent = request.chatContent

		// Call the existing controller implementation
		const sentMessage = await controller.togglePlanActMode(mode, chatContent)

		return Boolean.create({
			value: sentMessage,
		})
	} catch (error) {
		Logger.error("Failed to toggle Plan/Act mode:", error)
		// The webview only logs a rejected toggle, so tell the user why the mode did not change.
		const target = request.mode === PlanActMode.PLAN ? "Plan" : request.mode === PlanActMode.ACT ? "Act" : "Plan/Act"
		const reason = error instanceof ApiConfigurationError ? error.toDisplayMessage() : getErrorMessage(error)
		HostProvider.window.showMessage({
			type: ShowMessageType.ERROR,
			message: `Could not switch to ${target} mode: ${reason}`,
		})
		throw error
	}
}
