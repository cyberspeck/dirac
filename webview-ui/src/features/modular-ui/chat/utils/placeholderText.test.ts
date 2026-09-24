import { describe, expect, it } from "vitest"
import { InteractionState } from "../context/InteractionStateContext"
import { CardStatus } from "@shared/ExtensionMessage"
import { getPlaceholderText, isWaitingPermissionCard } from "./placeholderText"

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

describe("isWaitingPermissionCard", () => {
	const waiting = { requireApproval: true, status: CardStatus.WAITING_FOR_INPUT }

	it("is true for a waiting Accept/Reject card", () => {
		expect(isWaitingPermissionCard(waiting)).toBe(true)
	})

	it("is false for a card with its own actions (API retry), so it keeps the normal placeholder", () => {
		const retry = {
			...waiting,
			actions: [
				{ label: "Retry", value: "approve", primary: true },
				{ label: "Cancel", value: "reject" },
			],
		}
		expect(isWaitingPermissionCard(retry)).toBe(false)
	})

	it("is false once the card is final", () => {
		expect(isWaitingPermissionCard({ ...waiting, status: CardStatus.SUCCESS })).toBe(false)
	})
})
