import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { DiracDefaultTool, type DiracToolSpec } from "@shared/tools"
import { ToolExecutorCoordinator } from "../ToolExecutorCoordinator"
import type { IDiracTool } from "../interfaces/IDiracTool"
import type { IToolEnvironment } from "../interfaces/IToolEnvironment"
import { createMockTaskConfig } from "./helpers/mockTaskConfig"

class StubTool implements IDiracTool<unknown, any> {
	constructor(private readonly result: unknown) {}

	spec(): DiracToolSpec {
		return { id: DiracDefaultTool.RESPOND, name: DiracDefaultTool.RESPOND, description: "test", parameters: [] }
	}

	supportedSurfaces() {
		return ["all" as const]
	}

	async processCall(_args: unknown, _env: IToolEnvironment): Promise<any> {
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
		taskState.pendingCardNote = "anders"
		const coordinator = new ToolExecutorCoordinator()
		coordinator.registerModularTool(new StubTool("The user declined this."))

		const result = await coordinator.execute(config, block())

		assert.equal(result, 'The user declined this. The user wrote: "anders"')
		assert.equal(taskState.pendingCardNote, undefined)
	})

	it("appends the pending card note as an extra text block for an array result", async () => {
		const { config, taskState } = createMockTaskConfig()
		taskState.pendingCardNote = "anders"
		const coordinator = new ToolExecutorCoordinator()
		coordinator.registerModularTool(new StubTool([{ type: "text", text: "ok" }]))

		const result = await coordinator.execute(config, block())

		assert.deepEqual(result, [
			{ type: "text", text: "ok" },
			{ type: "text", text: 'The user wrote: "anders"' },
		])
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
