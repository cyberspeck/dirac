import "should"
import { CardStatus, DiracMessage, DiracMessageType, TaskStatus, UIActionButtonType } from "@shared/ExtensionMessage"
import { DiracAskResponse } from "@shared/WebviewMessage"
import { TaskState } from "../TaskState"
import { projectUIActionState } from "./ui-projector"

describe("projectUIActionState", () => {
	it("shows only Start New Task for a completed task", () => {
		const state = new TaskState()
		state.status = TaskStatus.COMPLETED

		const uiState = projectUIActionState(state, [], 3)

		uiState.globalButtons.should.deepEqual([
			{
				label: "Start New Task",
				action: UIActionButtonType.NEW_TASK,
				primary: true,
			},
		])
		uiState.cardButtons.should.deepEqual([])
	})

	it("keeps Resume for a cancelled task", () => {
		const state = new TaskState()
		state.status = TaskStatus.CANCELLED

		const uiState = projectUIActionState(state, [], 3)

		uiState.globalButtons.should.deepEqual([
			{
				label: "Resume",
				action: UIActionButtonType.APPROVE,
				primary: true,
			},
		])
	})

	it("enables steering input while a task is busy", () => {
		const state = new TaskState()
		state.status = TaskStatus.EXECUTING_TOOL

		projectUIActionState(state, [], 3).sendingDisabled.should.equal(false)
	})

	it("only disables sending during cancellation", () => {
		const cancelling = new TaskState()
		cancelling.status = TaskStatus.CANCELLING
		projectUIActionState(cancelling, [], 3).sendingDisabled.should.equal(true)

		const awaitingCard = new TaskState()
		awaitingCard.status = TaskStatus.AWAITING_USER_INPUT
		awaitingCard.waitingCardIds = ["card-1"]
		const messages: DiracMessage[] = [
			{
				id: "card-1",
				ts: 1,
				content: {
					type: DiracMessageType.CARD,
					card: {
						id: "card-1",
						header: "Proposed Plan",
						status: CardStatus.WAITING_FOR_INPUT,
						renderType: "markdown" as const,
						requireFeedback: true,
						body: "1. Implement the fix",
					},
				},
			},
		]

		const uiState = projectUIActionState(awaitingCard, messages, 3)

		uiState.sendingDisabled.should.equal(false)
		uiState.activeCardId!.should.equal("card-1")
	})

	it("does not let a stale plan-response flag hide busy controls", () => {
		const state = new TaskState()
		state.status = TaskStatus.BUILDING_TOOL_CALL
		state.isAwaitingPlanResponse = true

		const uiState = projectUIActionState(state, [], 3)

		uiState.sendingDisabled.should.equal(false)
		uiState.globalButtons.should.deepEqual([
			{
				label: "Cancel",
				action: UIActionButtonType.CANCEL,
				style: "secondary",
			},
		])
	})

	it("skips stale terminal card ids when projecting the active interaction", () => {
		const state = new TaskState()
		state.status = TaskStatus.EXECUTING_TOOL
		state.waitingCardIds = ["stale", "active"]
		const messages: DiracMessage[] = [
			{
				id: "stale",
				ts: 1,
				content: {
					type: DiracMessageType.CARD,
					card: {
						id: "stale",
						header: "Resolved",
						status: CardStatus.SUCCESS,
						renderType: "text",
						requireApproval: true,
					},
				},
			},
			{
				id: "active",
				ts: 2,
				content: {
					type: DiracMessageType.CARD,
					card: {
						id: "active",
						header: "Approve",
						status: CardStatus.WAITING_FOR_INPUT,
						renderType: "text",
						requireApproval: true,
					},
				},
			},
		]

		projectUIActionState(state, messages, 3).activeCardId!.should.equal("active")
	})

	describe("chain position", () => {
		const tool = (name: string) => ({ type: "tool_use" as const, name, params: {} })
		function permissionState(names: string[], activeToolBlockIndex: number, streamDone: boolean): TaskState {
			const state = new TaskState()
			state.status = TaskStatus.AWAITING_USER_INPUT
			state.waitingCardIds = ["card-1"]
			state.assistantMessageContent = [{ type: "text", content: "Plan" }, ...names.map(tool)]
			state.activeToolBlockIndex = activeToolBlockIndex
			state.didCompleteReadingStream = streamDone
			return state
		}
		function card(overrides: Record<string, unknown> = { requireApproval: true }): DiracMessage[] {
			return [
				{
					id: "card-1",
					ts: 1,
					content: {
						type: DiracMessageType.CARD,
						card: {
							id: "card-1",
							header: "Edit",
							status: CardStatus.WAITING_FOR_INPUT,
							renderType: "text",
							...overrides,
						},
					},
				},
			]
		}

		it("counts only non-read-only tool calls, 1-based, for a permission card", () => {
			const state = permissionState(["read_file", "write_to_file", "edit_file"], 2, true)
			projectUIActionState(state, card(), 3).chainPosition!.should.deepEqual({ index: 1, total: 2, streaming: false })
		})

		it("is absent for a single counted call once the stream is complete", () => {
			const state = permissionState(["read_file", "write_to_file"], 2, true)
			;(projectUIActionState(state, card(), 3).chainPosition === undefined).should.be.true()
		})

		it("reports a single call while the model is still writing", () => {
			const state = permissionState(["write_to_file"], 1, false)
			projectUIActionState(state, card(), 3).chainPosition!.should.deepEqual({ index: 1, total: 1, streaming: true })
		})

		it("is absent for cards without requireApproval", () => {
			const state = permissionState(["write_to_file", "edit_file"], 1, true)
			const messages = card({ requireFeedback: true })
			;(projectUIActionState(state, messages, 3).chainPosition === undefined).should.be.true()
		})

		it("does not count respond or new_task: an edit followed by respond is a single step", () => {
			const complete = permissionState(["edit_file", "respond"], 1, true)
			;(projectUIActionState(complete, card(), 3).chainPosition === undefined).should.be.true()
			const handoff = permissionState(["edit_file", "new_task"], 1, true)
			;(projectUIActionState(handoff, card(), 3).chainPosition === undefined).should.be.true()
		})

		it("is absent for a card with its own actions (API retry)", () => {
			const state = permissionState(["write_to_file", "edit_file"], 1, true)
			const messages = card({
				requireApproval: true,
				actions: [
					{ label: "Retry", value: DiracAskResponse.APPROVE, primary: true },
					{ label: "Cancel", value: DiracAskResponse.REJECT },
				],
			})
			;(projectUIActionState(state, messages, 3).chainPosition === undefined).should.be.true()
		})

		it("labels the approve button Accept", () => {
			const state = permissionState(["write_to_file"], 1, true)
			projectUIActionState(state, card(), 3).cardButtons[0].label.should.equal("Accept")
		})
	})
})
