import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { TaskStatus } from "@shared/ExtensionMessage"
import { DiracAskResponse, SKIP_REST_VALUE } from "@shared/WebviewMessage"
import { TaskState } from "../TaskState"
import { submitCardResponse } from "../TaskUserInput"

function context() {
	const taskState = new TaskState()
	taskState.status = TaskStatus.AWAITING_USER_INPUT
	taskState.waitingCardIds = ["card-1"]
	return { taskState }
}

describe("submitCardResponse — Skip rest", () => {
	it("sets didRejectTool for MESSAGE with SKIP_REST_VALUE and no text", async () => {
		const ctx = context()

		await submitCardResponse(ctx, { cardId: "card-1", response: DiracAskResponse.MESSAGE, value: SKIP_REST_VALUE })

		assert.equal(ctx.taskState.didRejectTool, true)
	})

	it("still sets didRejectTool for MESSAGE with text", async () => {
		const ctx = context()

		await submitCardResponse(ctx, { cardId: "card-1", response: DiracAskResponse.MESSAGE, text: "explain" })

		assert.equal(ctx.taskState.didRejectTool, true)
	})

	it("sets didRejectTool for an images-only MESSAGE with no text", async () => {
		const ctx = context()

		await submitCardResponse(ctx, {
			cardId: "card-1",
			response: DiracAskResponse.MESSAGE,
			images: ["screenshot.png"],
		})

		assert.equal(ctx.taskState.didRejectTool, true)
	})

	it("sets didRejectTool for a files-only MESSAGE with no text", async () => {
		const ctx = context()

		await submitCardResponse(ctx, {
			cardId: "card-1",
			response: DiracAskResponse.MESSAGE,
			files: ["notes.txt"],
		})

		assert.equal(ctx.taskState.didRejectTool, true)
	})

	it("does not set didRejectTool for MESSAGE with neither text nor SKIP_REST_VALUE", async () => {
		const ctx = context()

		await submitCardResponse(ctx, { cardId: "card-1", response: DiracAskResponse.MESSAGE })

		assert.equal(ctx.taskState.didRejectTool, false)
	})
})
