import { describe, expect, it } from "vitest"
import { InteractionState } from "../context/InteractionStateContext"
import { getPlaceholderText } from "./placeholderText"

describe("getPlaceholderText", () => {
	it("explains note, Accept/Reject and Enter while a permission card waits", () => {
		expect(
			getPlaceholderText({ hasTask: true, interactionState: InteractionState.AWAITING_RESPONSE, awaitingApproval: true }),
		).toBe("Note for this step — then Accept or Reject. Enter skips the rest and sends it to the model.")
	})

	it("keeps the plain prompt for other waiting cards", () => {
		expect(
			getPlaceholderText({ hasTask: true, interactionState: InteractionState.AWAITING_RESPONSE, awaitingApproval: false }),
		).toBe("Type a message...")
	})
})
