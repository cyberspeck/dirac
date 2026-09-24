import { type Card, type ExtensionState, isFinalStatus } from "@shared/ExtensionMessage"
import { InteractionState } from "../context/InteractionStateContext"
import { APPROVAL_PLACEHOLDER } from "./stepChain"

/** A tool permission card (Accept/Reject) that still waits; cards with their own actions (API retry) are not. */
export const isWaitingPermissionCard = (card: Pick<Card, "requireApproval" | "actions" | "status">): boolean =>
	!!card.requireApproval && !card.actions?.length && !isFinalStatus(card.status)

export function getPlaceholderText(params: {
	goal?: ExtensionState["goal"]
	hasTask: boolean
	interactionState: InteractionState
	/** A permission card (Accept/Reject) waits. */
	awaitingApproval: boolean
}): string {
	const { goal, hasTask, interactionState, awaitingApproval } = params
	if (goal?.followUpActive) return "Steer this follow-up…"
	if (goal?.status === "working") return "Steer this Goal…"
	if (goal?.status === "waiting") return "Steer this Goal while requests await a response…"
	if (goal?.status === "paused") return "Ask a follow-up (Goal stays paused)…"
	if (goal?.status === "blocked") return "Ask a follow-up (Goal stays blocked)…"
	if (goal?.status === "achieved" || goal?.status === "stopped") return "Ask a follow-up…"
	if (!hasTask) return "Type your task here..."
	if (awaitingApproval) return APPROVAL_PLACEHOLDER
	if (interactionState === InteractionState.RUNNING) return "Send guidance for the next turn without interrupting…"
	return "Type a message..."
}
