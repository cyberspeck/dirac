import { ITextStreamHandle } from "@shared/ExtensionMessage"
import { TaskMessenger } from "./TaskMessenger"

export class AssistantStreamManager {
	private activeStream?: ITextStreamHandle
	private currentMode: "none" | "text" | "reasoning" = "none"

	constructor(private messenger: TaskMessenger) {}

	/**
	 * Processes a chunk of content.
	 * If the type changes (e.g., text -> reasoning), it automatically
	 * starts a new stream.
	 */
	async handleChunk(content: string, type: "text" | "reasoning") {
		if (this.currentMode !== type) {
			await this.pauseForToolCall() // Ensure previous stream is closed
			this.activeStream = await this.messenger.streamText(type === "text" ? "markdown" : "reasoning")
			this.currentMode = type
		}
		if (this.activeStream) {
			await this.activeStream.append(content)
		}
	}

	/**
	 * Explicitly closes any active stream.
	 * Called before tool execution or at the end of a response.
	 */
	async pauseForToolCall() {
		if (this.activeStream) {
			await this.activeStream.close()
			this.activeStream = undefined
			this.currentMode = "none"
		}
	}

	/**
	 * Clears internal state at a turn boundary WITHOUT closing the handle.
	 *
	 * Unlike pauseForToolCall(), this does not call activeStream.close() or touch
	 * the messenger — the stream may already have been finalized by another path
	 * (e.g. finalizePendingReasoningMessage closing a reasoning row when a tool
	 * call ends the turn). Re-closing here would re-enter the messenger with a
	 * stale stream id, which is the bug this method exists to avoid, not a fix
	 * for it. Just drop the reference so the next chunk starts a fresh stream.
	 */
	reset() {
		this.activeStream = undefined
		this.currentMode = "none"
	}
}
