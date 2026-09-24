import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { DiracDefaultTool } from "@shared/tools"
import { TaskState } from "../TaskState"
import { ToolExecutor } from "../ToolExecutor"
import { ToolResultPusher } from "../tools/runtime/ToolResultPusher"

function fakeExecutor(taskState: TaskState) {
	return {
		taskState,
		coordinator: { has: () => true },
		resultPusher: new ToolResultPusher(taskState),
		asToolConfig: () => ({}),
	}
}

function block(id: string) {
	return { type: "tool_use" as const, id, name: DiracDefaultTool.RESPOND, params: {} }
}

describe("ToolExecutor — skip the rest of the turn", () => {
	it("pushes a tool_result (not a text block) for a complete later call", async () => {
		const taskState = new TaskState()
		taskState.didRejectTool = true
		const executor = fakeExecutor(taskState)

		const handled = await (ToolExecutor.prototype as any).execute.call(executor, block("call-1"), true)

		assert.equal(handled, true)
		assert.deepEqual(taskState.userMessageContent, [
			{ type: "tool_result", tool_use_id: "call-1", content: "Not run — the user skipped the rest of this turn." },
		])
		assert.equal(taskState.turnOutcomes.skipped, 1)
	})

	it("pushes the same tool_result for an incomplete later call", async () => {
		const taskState = new TaskState()
		taskState.didRejectTool = true
		const executor = fakeExecutor(taskState)

		const handled = await (ToolExecutor.prototype as any).execute.call(executor, block("call-2"), false)

		assert.equal(handled, true)
		assert.deepEqual(taskState.userMessageContent, [
			{ type: "tool_result", tool_use_id: "call-2", content: "Not run — the user skipped the rest of this turn." },
		])
		assert.equal(taskState.turnOutcomes.skipped, 1)
	})
})
