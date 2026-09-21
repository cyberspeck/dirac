import "should"
import sinon from "sinon"
import { AssistantStreamManager } from "../AssistantStreamManager"

// Regression test for the phantom empty "Thinking" row: AssistantStreamManager
// is constructed once per Task and previously had no way to be resynced with
// per-turn state (resetStreamingState() reset everything else but not this
// manager). If a turn's reasoning is finalized by a path other than
// pauseForToolCall() (e.g. finalizePendingReasoningMessage), currentMode stays
// "reasoning" and activeStream keeps pointing at the closed row, so the next
// turn's first reasoning chunk silently appends to a stale handle instead of
// opening a new one.
describe("AssistantStreamManager", () => {
	function createMessenger() {
		const handles: any[] = []
		return {
			handles,
			streamText: sinon.stub().callsFake(async (type: "markdown" | "reasoning") => {
				const handle = { id: `stream-${handles.length}`, type, append: sinon.stub().resolves(), close: sinon.stub().resolves() }
				handles.push(handle)
				return handle
			}),
		}
	}

	it("reset() clears mode without closing the active stream handle", async () => {
		const messenger = createMessenger()
		const manager = new AssistantStreamManager(messenger as any)

		await manager.handleChunk("thinking...", "reasoning")
		const firstHandle = messenger.handles[0]

		manager.reset()

		sinon.assert.notCalled(firstHandle.close)
	})

	it("a turn boundary reset makes the next reasoning chunk open a NEW stream instead of appending to the stale one", async () => {
		const messenger = createMessenger()
		const manager = new AssistantStreamManager(messenger as any)

		// Turn 1: reasoning finalized by a path other than pauseForToolCall()
		// (simulating finalizePendingReasoningMessage) — activeStream/currentMode
		// are left dangling.
		await manager.handleChunk("turn 1 reasoning", "reasoning")

		// Turn boundary: resetStreamingState() runs.
		manager.reset()

		// Turn 2: a new reasoning chunk arrives.
		await manager.handleChunk("turn 2 reasoning", "reasoning")

		messenger.streamText.callCount.should.equal(2)
		const [firstHandle, secondHandle] = messenger.handles
		sinon.assert.calledWith(secondHandle.append, "turn 2 reasoning")
		// The stale first handle must not have received the new turn's content.
		sinon.assert.neverCalledWith(firstHandle.append, "turn 2 reasoning")
	})
})
