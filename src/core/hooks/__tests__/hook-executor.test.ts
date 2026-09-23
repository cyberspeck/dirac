import { afterEach, describe, it } from "mocha"
import "should"
import sinon from "sinon"
import { CardStatus, DiracMessageType } from "@shared/ExtensionMessage"
import { executeHook } from "../hook-executor"
import { HookFactory } from "../hook-factory"

describe("executeHook card status", () => {
	afterEach(() => sinon.restore())

	// A hook with nothing to report prints the all-default output. Returning on that before the
	// card was updated left it "running" forever, though the script had exited in milliseconds.
	it("finalizes the card of a hook that returns the default output", async () => {
		const card = { type: DiracMessageType.CARD, card: { id: "c1", status: CardStatus.RUNNING, body: "" } }
		const messages = [{ content: card }]
		sinon.stub(HookFactory.prototype, "hasHook").resolves(true)
		sinon.stub(HookFactory.prototype, "getHookInfo").resolves({ scriptPaths: ["/ws/.diracrules/hooks/TaskComplete"] } as any)
		sinon.stub(HookFactory.prototype, "createWithStreaming").resolves({
			run: async () => ({ cancel: false, contextModification: "", errorMessage: "" }),
		} as any)

		const result = await executeHook({
			hookName: "TaskComplete",
			hookInput: {} as any,
			isCancellable: false,
			messenger: { createCard: async () => ({ id: "c1" }), upsertText: async () => {} } as any,
			messageStateHandler: {
				findMessageIndexById: () => 0,
				getDiracMessages: () => messages,
				updateDiracMessage: async () => {},
			} as any,
			taskId: "t1",
			hooksEnabled: true,
		})

		result.should.deepEqual({ wasCancelled: false })
		card.card.status.should.equal(CardStatus.SUCCESS)
	})
})
