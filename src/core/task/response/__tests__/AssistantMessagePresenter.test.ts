import "should"
import { AssistantMessagePresenter } from "../AssistantMessagePresenter"
import { TaskState } from "../../TaskState"

describe("AssistantMessagePresenter", () => {
	it("records the content index of the tool block it executes", async () => {
		const taskState = new TaskState()
		taskState.assistantMessageContent = [
			{ type: "text", content: "Plan", isComplete: true },
			{ type: "tool_use", name: "write_to_file", params: {}, isComplete: true } as any,
			{ type: "tool_use", name: "edit_file", params: {}, isComplete: true } as any,
		]
		taskState.didCompleteReadingStream = true
		const seen: (number | undefined)[] = []
		const presenter = new AssistantMessagePresenter({
			taskState,
			postStateToWebview: async () => {},
			assistantStreamManager: { handleChunk: async () => {}, pauseForToolCall: async () => {} },
			toolExecutor: { executeTool: async () => seen.push(taskState.activeToolBlockIndex) },
		} as any)

		await presenter.present()

		seen.should.deepEqual([1, 2])
	})
})
