import { CardStatus, DiracMessageType, type HookOutputStreamMeta } from "@shared/ExtensionMessage"
import type { HookOutput } from "@shared/proto/dirac/hooks"
import { Logger } from "@/shared/services/Logger"
import { MessageStateHandler } from "../task/message-state"
import { HookExecutionError } from "./HookError"
import type { HookModelInputContext, Hooks } from "./hook-factory"

import { HookFactory } from "./hook-factory"

import { ITaskMessenger } from "@shared/ExtensionMessage"

export interface HookExecutionOptions<Name extends keyof Hooks = any> {
	hookName: Name
	hookInput: Hooks[Name]
	isCancellable: boolean
	messenger: ITaskMessenger

	setActiveHookExecution?: (execution: {
		hookName: string
		toolName: string | undefined
		messageId: string

		abortController: AbortController
	}) => Promise<void>
	clearActiveHookExecution?: () => Promise<void>
	messageStateHandler: MessageStateHandler
	taskId: string
	hooksEnabled: boolean
	model?: HookModelInputContext
	toolName?: string // Optional tool name for PreToolUse/PostToolUse hooks
	pendingToolInfo?: any // Optional metadata about pending tool execution for PreToolUse
}

export interface HookExecutionResult {
	cancel?: boolean
	contextModification?: string
	errorMessage?: string
	wasCancelled: boolean
}

function fromHookOutput(output: HookOutput): HookExecutionResult {
	// HookOutput is protobuf-generated, so fields are defaulted (e.g. ""). Treat empty
	// strings as “unset” in the hook executor API.
	const contextModification = output.contextModification?.trim() ? output.contextModification : undefined
	const errorMessage = output.errorMessage?.trim() ? output.errorMessage : undefined

	return {
		cancel: output.cancel,
		contextModification,
		errorMessage,
		wasCancelled: false,
	}
}

/**
 * Executes a hook with standardized error handling, status tracking, and cleanup.
 * This consolidates the common pattern used across all hook execution sites.
 */
export async function executeHook<Name extends keyof Hooks>(options: HookExecutionOptions<Name>): Promise<HookExecutionResult> {
	const {
		hookName,
		hookInput,
		isCancellable,
		messenger,

		setActiveHookExecution,
		clearActiveHookExecution,
		messageStateHandler,
		taskId,
		hooksEnabled,
	} = options

	// Early return if hooks are disabled
	if (!hooksEnabled) {
		return {
			wasCancelled: false,
		}
	}

	// Check if the hook exists
	const hookFactory = new HookFactory()
	const hasHook = await hookFactory.hasHook(hookName)

	if (!hasHook) {
		return { wasCancelled: false }
	}

	let hookMessageId: string | undefined
	const abortController = new AbortController()
	// What the script printed for the user: every output line except blank ones and the JSON response.
	const shown: string[] = []

	// Declare hookInfo with empty default - populated inside try block.
	// If getHookInfo throws, error handlers will use the empty default.
	let hookInfo: { scriptPaths: string[] } = { scriptPaths: [] }

	try {
		// Get hook info including script paths
		hookInfo = await hookFactory.getHookInfo(hookName)

		// Show hook execution indicator and capture timestamp
		const hookMetadata = {
			hookName,
			...(options.toolName && { toolName: options.toolName }),
			status: "running",
			scriptPaths: hookInfo.scriptPaths,
			...(options.pendingToolInfo && { pendingToolInfo: options.pendingToolInfo }),
		}
		const cardHandle = await messenger.createCard({
			header: `${hookName} Hook`,
			status: CardStatus.RUNNING,
			body: hookCardText(hookMetadata, shown),
		})
		hookMessageId = cardHandle.id

		// Reorder messages immediately so hook UI appears above tool UI
		// This must happen right after creating the hook message, before the hook runs
		if (hookName === "PreToolUse") {
			await reorderHookAndToolMessages(messageStateHandler)
		}

		// Track active hook execution for cancellation (only if cancellable and message was created)
		if (isCancellable && hookMessageId !== undefined && setActiveHookExecution) {
			await setActiveHookExecution({
				hookName,
				toolName: options.toolName,
				messageId: hookMessageId,
				abortController,
			})
		}

		// Output goes into the hook's card, not into the chat as loose "[workspace stdout <path>]" lines.
		// The JSON response and blank lines are protocol; anything else the script prints is its message
		// to the user. The source prefix is kept only when several scripts run for one hook.
		const streamCallback = async (line: string, stream: "stdout" | "stderr", meta?: HookOutputStreamMeta) => {
			if (!line.trim() || isHookResponseLine(line)) return
			const source = hookInfo.scriptPaths.length > 1 && meta?.source ? `[${meta.source}] ` : ""
			shown.push(`${source}${stream === "stderr" ? "stderr: " : ""}${line}`)
			if (hookMessageId !== undefined) {
				await updateHookMessage(messageStateHandler, hookMessageId, { ...hookMetadata }, shown)
			}
		}

		// Create and execute hook
		const hook = await hookFactory.createWithStreaming(
			hookName,
			streamCallback,
			isCancellable ? abortController.signal : undefined,
			taskId,
			options.toolName,
		)

		const result = await hook.run({
			taskId,
			...hookInput,
			model: options.model,
		})

		Logger.log(`[${hookName} Hook]`, result)

		// Check if hook wants to cancel
		if (result.cancel === true) {
			// Update hook status to cancelled
			if (hookMessageId !== undefined) {
				await updateHookMessage(messageStateHandler, hookMessageId, {
					hookName,
					...(options.toolName && { toolName: options.toolName }),
					status: "cancelled",
					exitCode: 130,
					hasJsonResponse: true,
					scriptPaths: hookInfo.scriptPaths,
				}, shown)
			}

			return fromHookOutput(result)
		}

		// Clear active hook execution after successful completion (only if cancellable)
		if (isCancellable && clearActiveHookExecution) {
			await clearActiveHookExecution()
		}

		// Update hook status to completed, or skipped if no script ran (only if not cancelled)
		if (hookMessageId !== undefined) {
			await updateHookMessage(messageStateHandler, hookMessageId, {
				hookName,
				...(options.toolName && { toolName: options.toolName }),
				status: result.skipped ? "skipped" : "completed",
				exitCode: 0,
				hasJsonResponse: true,
				scriptPaths: hookInfo.scriptPaths,
			}, shown)
		}

		// NoOp hooks return proto defaults; preserve the minimal legacy return shape. Checked only
		// after the card is finalized: returning before that left every no-op hook's card "running".
		if (result.cancel === false && result.contextModification === "" && result.errorMessage === "") {
			return { wasCancelled: false }
		}

		return fromHookOutput(result)
	} catch (hookError) {
		// Clear active hook execution (only if cancellable)
		if (isCancellable && clearActiveHookExecution) {
			await clearActiveHookExecution()
		}

		// Check if this was a user cancellation via abort controller
		if (abortController.signal.aborted) {
			// Update hook status to cancelled
			if (hookMessageId !== undefined) {
				await updateHookMessage(messageStateHandler, hookMessageId, {
					hookName,
					status: "cancelled",
					exitCode: 130,
					scriptPaths: hookInfo.scriptPaths,
				}, shown)
			}

			return {
				cancel: true,
				wasCancelled: true,
			}
		}

		// Update hook status to failed for actual errors
		// Extract structured error info if available
		const isStructuredError = HookExecutionError.isHookError(hookError)
		const errorInfo = isStructuredError ? hookError.errorInfo : null

		if (hookMessageId !== undefined) {
			await updateHookMessage(messageStateHandler, hookMessageId, {
				hookName,
				status: "failed",
				exitCode: errorInfo?.exitCode ?? 1,
				scriptPaths: hookInfo.scriptPaths,
				...(errorInfo && {
					error: {
						type: errorInfo.type,
						message: errorInfo.message,
						details: errorInfo.details,
						scriptPath: errorInfo.scriptPath,
					},
				}),
			}, shown)
		}

		// Log error for non-cancellable hooks or unexpected errors
		Logger.error(`${hookName} hook failed:`, hookError)

		// Return safe defaults for all fields to avoid undefined property access
		return {
			cancel: false,
			contextModification: undefined,
			errorMessage: undefined,
			wasCancelled: false,
		}
	}
}

/** True for the line that carries the hook's JSON response ({ cancel, contextModification, errorMessage }). */
function isHookResponseLine(line: string): boolean {
	try {
		const parsed = JSON.parse(line)
		return !!parsed && typeof parsed === "object" && !Array.isArray(parsed) && "cancel" in parsed
	} catch {
		return false
	}
}

/**
 * The card shows what the script printed; with no output, a plain status. It used to show the raw
 * metadata (hook name, status, script paths as JSON), which reads as a crash dump to a non-developer.
 */
export function hookCardText(metadata: Record<string, any>, shown: string[]): string {
	const error = metadata.status === "failed" ? (metadata.error?.message ?? `Failed (exit ${metadata.exitCode ?? 1}).`) : undefined
	if (shown.length > 0) return error ? `${shown.join("\n")}\n${error}` : shown.join("\n")
	switch (metadata.status) {
		case "completed":
			return "Done."
		case "cancelled":
			return "Cancelled."
		case "skipped":
			return "Skipped."
		case "failed":
			return error as string
		default:
			return "Running…"
	}
}

/**
 * Helper to update hook message status in message state
 */
async function updateHookMessage(
	messageStateHandler: MessageStateHandler,
	hookMessageId: string,
	metadata: Record<string, any>,
	shown: string[],
): Promise<void> {
	const index = messageStateHandler.findMessageIndexById(hookMessageId)
	if (index !== -1) {
		const msg = messageStateHandler.getDiracMessages()[index]
		if (msg.content.type === DiracMessageType.CARD) {
			msg.content.card.body = hookCardText(metadata, shown)
			msg.content.card.status =
				metadata.status === "completed"
					? CardStatus.SUCCESS
					: metadata.status === "failed"
						? CardStatus.ERROR
						: metadata.status === "cancelled"
							? CardStatus.CANCELLED
							: metadata.status === "skipped"
								? CardStatus.SKIPPED
								: CardStatus.RUNNING
			await messageStateHandler.updateDiracMessage(index, msg)
		}
	}
}

/**
 * Reorders hook and tool messages so hook UI appears before tool UI.
 * This is called immediately after a hook message is created.
 */
async function reorderHookAndToolMessages(messageStateHandler: MessageStateHandler): Promise<void> {
	const diracMessages = messageStateHandler.getDiracMessages()

	// Find the most recent tool message (Card with a tool-like header)
	let lastToolMessageIndex = -1
	for (let i = diracMessages.length - 1; i >= 0; i--) {
		const msg = diracMessages[i]
		if (msg.content.type === DiracMessageType.CARD && !msg.content.card.header.startsWith("Hook:")) {
			lastToolMessageIndex = i
			break
		}
	}

	if (lastToolMessageIndex === -1) {
		return // No tool message found, nothing to reorder
	}

	// Check if there are any hook messages after the tool message
	let hasHookMessagesAfterTool = false
	for (let i = lastToolMessageIndex + 1; i < diracMessages.length; i++) {
		const msg = diracMessages[i]
		if (msg.content.type === DiracMessageType.CARD && msg.content.card.header.startsWith("Hook:")) {
			hasHookMessagesAfterTool = true
			break
		}
	}

	if (!hasHookMessagesAfterTool) {
		return // No reordering needed
	}

	// Store the tool message (deep copy to preserve all properties)
	const toolMessage = { ...diracMessages[lastToolMessageIndex] }

	// Delete the tool message at its current position
	await messageStateHandler.deleteDiracMessage(lastToolMessageIndex)

	// Re-add the tool message at the end (after hook messages)
	await messageStateHandler.addToDiracMessages(toolMessage)
}
