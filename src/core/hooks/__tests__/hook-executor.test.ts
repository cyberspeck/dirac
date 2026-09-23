import { afterEach, describe, it } from "mocha"
import "should"
import sinon from "sinon"
import { CardStatus, DiracMessageType } from "@shared/ExtensionMessage"
import { executeHook, hookCardText } from "../hook-executor"
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
		card.card.body.should.equal("Done.")
	})

	// What the script prints goes into its card; the JSON response and blank lines are protocol and
	// never reach the chat as loose "[workspace stdout <path>]" lines.
	it("shows the script's own message in the card and nothing else in the chat", async () => {
		const card = { type: DiracMessageType.CARD, card: { id: "c1", status: CardStatus.RUNNING, body: "" } }
		const chat: string[] = []
		sinon.stub(HookFactory.prototype, "hasHook").resolves(true)
		sinon.stub(HookFactory.prototype, "getHookInfo").resolves({ scriptPaths: ["/ws/.diracrules/hooks/TaskComplete"] } as any)
		sinon.stub(HookFactory.prototype, "createWithStreaming").callsFake(async (_name: any, stream: any) => ({
			run: async () => {
				await stream("Notes saved (1 file).", "stdout", { source: "workspace" })
				await stream('{"cancel":false,"contextModification":"","errorMessage":""}', "stdout", { source: "workspace" })
				await stream("", "stdout", { source: "workspace" })
				return { cancel: false, contextModification: "", errorMessage: "" }
			},
		}) as any)

		await executeHook({
			hookName: "TaskComplete",
			hookInput: {} as any,
			isCancellable: false,
			messenger: { createCard: async () => ({ id: "c1" }), upsertText: async (s: string) => void chat.push(s) } as any,
			messageStateHandler: {
				findMessageIndexById: () => 0,
				getDiracMessages: () => [{ content: card }],
				updateDiracMessage: async () => {},
			} as any,
			taskId: "t1",
			hooksEnabled: true,
		})

		card.card.body.should.equal("Notes saved (1 file).")
		card.card.status.should.equal(CardStatus.SUCCESS)
		chat.should.be.empty()
	})

	it("names the failure when the script printed nothing", () => {
		hookCardText({ status: "failed", exitCode: 2 }, []).should.equal("Failed (exit 2).")
		hookCardText({ status: "failed", error: { message: "timed out" } }, ["partial"]).should.equal("partial\ntimed out")
		hookCardText({ status: "running" }, []).should.equal("Running…")
	})
})
