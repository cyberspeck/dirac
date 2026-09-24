import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { DiracDefaultTool } from "@shared/tools"
import { TaskState } from "../TaskState"
import { processStreamResult, type TaskRequestOutcomeContext } from "../TaskRequestOutcome"

function toolUseBlock(name: string) {
	return { type: "tool_use" as const, name, params: {} }
}

function baseParams() {
	return {
		assistantHasContent: true,
		userContent: [],
		metricsManager: {} as any,
		modelInfo: {} as any,
		providerId: "test-provider",
		model: { id: "test-model" },
	}
}

function baseCtx(taskState: TaskState): TaskRequestOutcomeContext {
	return {
		taskState,
		messageStateHandler: {} as any,
		taskMessenger: {} as any,
		api: {} as any,
		taskId: "task-1",
		executionProfile: {} as any,
		postStateToWebview: async () => {},
		abortTask: async () => {},
		handleContextWindowExceededError: async () => {},
		reinitExistingTaskFromId: async () => {},
		attemptApiRequest: (() => {}) as any,
		recursivelyMakeDiracRequests: async () => true,
		handleEmptyAssistantResponse: async () => false,
	}
}

describe("processStreamResult — turn summary", () => {
	it("appends the turn summary when a skip happened and the message had >= 2 tool calls", async () => {
		const taskState = new TaskState()
		taskState.userMessageContentReady = true
		taskState.didRejectTool = true
		taskState.assistantMessageContent = [
			toolUseBlock(DiracDefaultTool.RESPOND),
			toolUseBlock(DiracDefaultTool.RESPOND),
		] as any
		taskState.turnOutcomes = { applied: 1, declined: 1, skipped: 2 }

		await processStreamResult(baseCtx(taskState), baseParams())

		assert.deepEqual(taskState.userMessageContent.at(-1), {
			type: "text",
			text: "This turn: applied 1; declined 1; skipped 2.",
		})
	})

	it("does not append a summary when no skip happened", async () => {
		const taskState = new TaskState()
		taskState.userMessageContentReady = true
		taskState.didRejectTool = false
		taskState.assistantMessageContent = [
			toolUseBlock(DiracDefaultTool.RESPOND),
			toolUseBlock(DiracDefaultTool.RESPOND),
		] as any
		taskState.turnOutcomes = { applied: 2, declined: 0, skipped: 0 }

		await processStreamResult(baseCtx(taskState), baseParams())

		assert.ok(
			!taskState.userMessageContent.some((block: any) => typeof block.text === "string" && block.text.startsWith("This turn:")),
		)
	})

	it("does not append a summary when the message had fewer than 2 tool calls", async () => {
		const taskState = new TaskState()
		taskState.userMessageContentReady = true
		taskState.didRejectTool = true
		taskState.assistantMessageContent = [toolUseBlock(DiracDefaultTool.RESPOND)] as any
		taskState.turnOutcomes = { applied: 0, declined: 0, skipped: 1 }

		await processStreamResult(baseCtx(taskState), baseParams())

		assert.ok(
			!taskState.userMessageContent.some((block: any) => typeof block.text === "string" && block.text.startsWith("This turn:")),
		)
	})
})
