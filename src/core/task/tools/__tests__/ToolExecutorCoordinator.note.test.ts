import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { DiracDefaultTool, type DiracToolSpec } from "@shared/tools"
import { ToolExecutorCoordinator } from "../ToolExecutorCoordinator"
import type { IDiracTool } from "../interfaces/IDiracTool"
import type { IToolEnvironment } from "../interfaces/IToolEnvironment"
import { createMockTaskConfig } from "./helpers/mockTaskConfig"

class StubTool implements IDiracTool<unknown, any> {
	/** note: what the user typed on this call's card (set while the call runs, as TaskMessenger does). */
	constructor(
		private readonly result: unknown,
		private readonly note?: string,
		private readonly error?: Error,
	) {}

	spec(): DiracToolSpec {
		return { id: DiracDefaultTool.RESPOND, name: DiracDefaultTool.RESPOND, description: "test", parameters: [] }
	}

	supportedSurfaces() {
		return ["all" as const]
	}

	async processCall(_args: unknown, env: IToolEnvironment): Promise<any> {
		if (this.note) env.config.taskState.pendingCardNote = this.note
		if (this.error) throw this.error
		return this.result
	}
}

function block() {
	return {
		type: "tool_use" as const,
		name: DiracDefaultTool.RESPOND,
		params: {},
	}
}

describe("ToolExecutorCoordinator note appending", () => {
	it("appends the pending card note to a string result and clears it", async () => {
		const { config, taskState } = createMockTaskConfig()
		const coordinator = new ToolExecutorCoordinator()
		coordinator.registerModularTool(new StubTool("The user declined this.", "anders"))

		const result = await coordinator.execute(config, block())

		assert.equal(result, 'The user declined this. The user wrote: "anders"')
		assert.equal(taskState.pendingCardNote, undefined)
	})

	it("appends the pending card note as an extra text block for an array result", async () => {
		const { config, taskState } = createMockTaskConfig()
		const coordinator = new ToolExecutorCoordinator()
		coordinator.registerModularTool(new StubTool([{ type: "text", text: "ok" }], "anders"))

		const result = await coordinator.execute(config, block())

		assert.deepEqual(result, [
			{ type: "text", text: "ok" },
			{ type: "text", text: 'The user wrote: "anders"' },
		])
		assert.equal(taskState.pendingCardNote, undefined)
	})

	it("appends the note to the error result when the tool throws after the approval, and not to the next call", async () => {
		const { config, taskState } = createMockTaskConfig()
		const failing = new ToolExecutorCoordinator()
		failing.registerModularTool(new StubTool(undefined, "anders", new Error("disk full")))

		const failed = await failing.execute(config, block())

		assert.equal(failed, 'Execution failed: disk full The user wrote: "anders"')
		assert.equal(taskState.pendingCardNote, undefined)

		const next = new ToolExecutorCoordinator()
		next.registerModularTool(new StubTool("done"))
		assert.equal(await next.execute(config, block()), "done")
	})

	it("does not append a note left over from before the call", async () => {
		const { config, taskState } = createMockTaskConfig()
		taskState.pendingCardNote = "stale"
		const coordinator = new ToolExecutorCoordinator()
		coordinator.registerModularTool(new StubTool("done"))

		assert.equal(await coordinator.execute(config, block()), "done")
		assert.equal(taskState.pendingCardNote, undefined)
	})

	it("does nothing when there is no pending card note", async () => {
		const { config, taskState } = createMockTaskConfig()
		const coordinator = new ToolExecutorCoordinator()
		coordinator.registerModularTool(new StubTool("done"))

		const result = await coordinator.execute(config, block())

		assert.equal(result, "done")
		assert.equal(taskState.pendingCardNote, undefined)
	})
})
