import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { DiracDefaultTool, type DiracToolSpec } from "@shared/tools"
import { ToolExecutorCoordinator } from "../ToolExecutorCoordinator"
import type { IDiracTool } from "../interfaces/IDiracTool"
import type { IToolEnvironment } from "../interfaces/IToolEnvironment"
import { ToolSkippedByUserMessage } from "../types/ToolSkippedByUserMessage"
import { createMockTaskConfig } from "./helpers/mockTaskConfig"

class SkippingTool implements IDiracTool<unknown, any> {
	constructor(private readonly error: ToolSkippedByUserMessage) {}

	spec(): DiracToolSpec {
		return { id: DiracDefaultTool.RESPOND, name: DiracDefaultTool.RESPOND, description: "test", parameters: [] }
	}

	supportedSurfaces() {
		return ["all" as const]
	}

	async processCall(_args: unknown, _env: IToolEnvironment): Promise<any> {
		throw this.error
	}
}

function block() {
	return {
		type: "tool_use" as const,
		name: DiracDefaultTool.RESPOND,
		params: {},
	}
}

describe("ToolExecutorCoordinator ToolSkippedByUserMessage handling", () => {
	it("declines with a note and does not set pendingUserMessage, so no duplicate <feedback>", async () => {
		const { config, taskState } = createMockTaskConfig()
		const coordinator = new ToolExecutorCoordinator()
		coordinator.registerModularTool(new SkippingTool(new ToolSkippedByUserMessage("warte, erklär")))

		const result = await coordinator.execute(config, block())

		assert.equal(
			result,
			'Not applied — the user declined this and wrote: "warte, erklär" Answer the user now, then continue only if still wanted.',
		)
		assert.equal(taskState.pendingUserMessage, undefined)
	})

	it("declines the current call plus the rest of the turn on an empty message", async () => {
		const { config, taskState } = createMockTaskConfig()
		const coordinator = new ToolExecutorCoordinator()
		coordinator.registerModularTool(new SkippingTool(new ToolSkippedByUserMessage("")))

		const result = await coordinator.execute(config, block())

		assert.equal(result, "Not applied — the user skipped this and the remaining steps.")
		assert.equal(taskState.pendingUserMessage, undefined)
	})

	it("still forwards attached images via pendingUserImages", async () => {
		const { config, taskState } = createMockTaskConfig()
		const coordinator = new ToolExecutorCoordinator()
		coordinator.registerModularTool(new SkippingTool(new ToolSkippedByUserMessage("", ["shot.png"])))

		await coordinator.execute(config, block())

		assert.deepEqual(taskState.pendingUserImages, ["shot.png"])
	})
})
