import { CardStatus, type DiracMessage, DiracMessageType } from "@shared/ExtensionMessage"
import { DiracAskResponse } from "@shared/WebviewMessage"
import { act, fireEvent, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useChatStore } from "@/features/chat/store/chatStore"
import type { ChatState } from "../types/chatTypes"
import ActionButtons from "./ActionButtons"

const card: DiracMessage = {
	id: "card-1",
	ts: 1,
	content: {
		type: DiracMessageType.CARD,
		card: { id: "card-1", header: "Edit file", status: CardStatus.WAITING_FOR_INPUT, renderType: "text", requireApproval: true },
	},
}

function setup(inputValue: string, isHidden = false) {
	const uiActionState = { globalButtons: [], cardButtons: [], sendingDisabled: false, activeCardId: "card-1" }
	useChatStore.setState({ diracMessages: [card], messageIndexById: new Map([["card-1", 0]]), uiActionState })
	const executeButtonAction = vi.fn().mockResolvedValue(undefined)
	const chatState = { inputValue, selectedImages: [], selectedFiles: [], setSendingDisabled: vi.fn(), uiActionState } as unknown as ChatState
	const onInputKeyDown = vi.fn()
	const { container } = render(
		<>
			<textarea onChange={() => {}} onKeyDown={onInputKeyDown} value={inputValue} />
			<ActionButtons
				chatState={chatState}
				isHidden={isHidden}
				messageHandlers={{ executeButtonAction, handleSendMessage: vi.fn(), handleTaskCloseButtonClick: vi.fn(), startNewTask: vi.fn() }}
				scrollBehavior={{ scrollToBottomSmooth: vi.fn(), scrollToTop: vi.fn(), showScrollToBottom: false }}
				task={card}
			/>
		</>,
	)
	return { textarea: container.querySelector("textarea")!, executeButtonAction, onInputKeyDown }
}

describe("ActionButtons waiting card shortcuts", () => {
	it("Ctrl+Enter accepts with the note instead of reaching the input's Enter handler", async () => {
		const { textarea, executeButtonAction, onInputKeyDown } = setup("reply text")
		await act(async () => {
			fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true })
		})
		expect(executeButtonAction).toHaveBeenCalledWith(DiracAskResponse.APPROVE, undefined, "reply text", [], [], "card-1")
		expect(onInputKeyDown).not.toHaveBeenCalled()
	})

	it("Ctrl+Backspace rejects from an empty input", async () => {
		const empty = setup("")
		await act(async () => {
			fireEvent.keyDown(empty.textarea, { key: "Backspace", ctrlKey: true })
		})
		expect(empty.executeButtonAction).toHaveBeenCalledWith(DiracAskResponse.REJECT, undefined, "", [], [], "card-1")
	})

	it("leaves Ctrl+Backspace to the input while it holds text", async () => {
		const typed = setup("reply text")
		await act(async () => {
			fireEvent.keyDown(typed.textarea, { key: "Backspace", ctrlKey: true })
		})
		expect(typed.executeButtonAction).not.toHaveBeenCalled()
		expect(typed.onInputKeyDown).toHaveBeenCalled()
	})

	it("stays off while the chat view is hidden", async () => {
		const hidden = setup("", true)
		await act(async () => {
			fireEvent.keyDown(hidden.textarea, { key: "Enter", ctrlKey: true })
		})
		expect(hidden.executeButtonAction).not.toHaveBeenCalled()
	})
})
