import {
	ActionButton,
	DiracMessage,
	DiracMessageType,
	isFinalStatus,
	TaskStatus,
	UIActionButton,
	UIActionButtonType,
	UIActionState,
} from "@shared/ExtensionMessage"
import { isBusyTaskStatus } from "@shared/taskStatusProjection"
import { DiracDefaultTool, READ_ONLY_TOOLS } from "@shared/tools"
import { DiracAskResponse } from "@shared/WebviewMessage"
import { TaskState } from "../TaskState"

export function projectUIActionState(
	state: TaskState | undefined,
	messages: readonly DiracMessage[] | ((id: string) => DiracMessage | undefined),
	maxConsecutiveMistakes: number,
): UIActionState {
	const uiState: UIActionState = {
		globalButtons: [],
		cardButtons: [],
		sendingDisabled: state?.status === TaskStatus.CANCELLING,
	}

	// Active card interactions must take precedence over busy task states.
	// Tools can create a waiting card before the task status is projected as AWAITING_USER_INPUT.
	if (state?.waitingCardIds && state.waitingCardIds.length > 0) {
		const activeCardMessage = state.waitingCardIds
			.map((cardId) =>
				typeof messages === "function" ? messages(cardId) : messages.find((message) => message.id === cardId),
			)
			.find(
				(message) =>
					message?.content.type === DiracMessageType.CARD &&
					!isFinalStatus(message.content.card.status) &&
					(message.content.card.requireApproval ||
						message.content.card.requireFeedback ||
						(message.content.card.actions?.length ?? 0) > 0),
			)
		if (activeCardMessage?.content.type === DiracMessageType.CARD) {
			const card = activeCardMessage.content.card
			uiState.activeCardId = activeCardMessage.id
			uiState.cardButtons =
				card.actions?.map(mapCardActionToUIButton) ||
				(card.requireApproval
					? [
						{ label: "Accept", action: UIActionButtonType.APPROVE, primary: true },
						{ label: "Reject", action: UIActionButtonType.REJECT, style: "secondary" },
					]
					: [])
			// Cards with their own actions (API retry) are not tool steps.
			if (card.requireApproval && !card.actions?.length) uiState.chainPosition = projectChainPosition(state)
			return uiState
		}
	}
	// 1. Terminal Success State
	if (state?.status === TaskStatus.COMPLETED) {
		uiState.globalButtons.push({
			label: "Start New Task",
			action: UIActionButtonType.NEW_TASK,
			primary: true,
		})
		return uiState
	}

	// 2. Active Streaming State
	// Active card interactions were handled above, so every remaining busy state is cancellable.
	const isBusy = isBusyTaskStatus(state?.status)

	if (isBusy) {
		uiState.globalButtons.push({
			label: "Cancel",
			action: UIActionButtonType.CANCEL,
			style: "secondary",
		})
		return uiState
	}

	// 2b. Cancelled State (task was aborted, awaiting resume)
	if (state?.status === TaskStatus.CANCELLED) {
		uiState.globalButtons.push({
			label: "Resume",
			action: UIActionButtonType.APPROVE,
			primary: true,
		})
		return uiState
	}

	// 3. Error Recovery State (Mistake Limit)

	if (state && state.consecutiveMistakeCount >= maxConsecutiveMistakes) {
		uiState.globalButtons.push(
			{ label: "Proceed Anyways", action: UIActionButtonType.PROCEED, primary: true },
			{ label: "Start New Task", action: UIActionButtonType.NEW_TASK, style: "secondary" },
		)
		return uiState
	}

	return uiState
}

// Calls that never ask for a step's permission: read-only tools, and the turn-ending respond / new_task.
const UNCOUNTED_TOOLS: readonly string[] = [...READ_ONLY_TOOLS, DiracDefaultTool.RESPOND, DiracDefaultTool.NEW_TASK]

// Position of the executing tool call among the message's counted calls.
// Omitted for a lone call once the stream is complete: there is no chain to skip.
function projectChainPosition(state: TaskState): UIActionState["chainPosition"] {
	const active = state.activeToolBlockIndex
	if (active === undefined) return undefined
	const counted = (i: number) => {
		const block = state.assistantMessageContent[i]
		return block?.type === "tool_use" && !UNCOUNTED_TOOLS.includes(block.name)
	}
	let index = 0
	let total = 0
	for (let i = 0; i < state.assistantMessageContent.length; i++) {
		if (!counted(i)) continue
		total++
		if (i <= active) index++
	}
	const streaming = !state.didCompleteReadingStream
	if (!counted(active) || (total < 2 && !streaming)) return undefined
	return { index, total, streaming }
}

function mapCardActionToUIButton(action: ActionButton): UIActionButton {
	return {
		label: action.label,
		action:
			action.value === DiracAskResponse.APPROVE
				? UIActionButtonType.APPROVE
				: action.value === DiracAskResponse.REJECT
					? UIActionButtonType.REJECT
					: UIActionButtonType.UTILITY,
		value: action.value,
		primary: action.primary,
		style: action.style,
	}
}
