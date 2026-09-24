import { CardStatus, type DiracMessage, DiracMessageType } from "@shared/ExtensionMessage"
import { DiracAskResponse } from "@shared/WebviewMessage"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useChatStore } from "@/features/chat/store/chatStore"
import { MessageRenderer } from "./VirtuosoItemRenderer"

const cardMessage: DiracMessage = {
	id: "card-1",
	ts: 1,
	content: {
		type: DiracMessageType.CARD,
		card: {
			id: "card-1",
			header: "Edit file",
			status: CardStatus.WAITING_FOR_INPUT,
			renderType: "text",
			requireApproval: true,
		},
	},
}

describe("MessageRenderer card buttons", () => {
	it.each([
		["Accept", DiracAskResponse.APPROVE],
		["Reject", DiracAskResponse.REJECT],
	])("%s sends the text in the input box as the note", (label, response) => {
		useChatStore.setState({ diracMessages: [cardMessage], messageIndexById: new Map([["card-1", 0]]) })
		const executeButtonAction = vi.fn().mockResolvedValue(undefined)
		render(
			<MessageRenderer
				activeCardId="card-1"
				expandedRows={{}}
				getInput={() => ({ text: "ok", images: ["img"], files: ["f.txt"] })}
				isLastMessage={true}
				messageHandlers={{
					executeButtonAction,
					handleSendMessage: vi.fn(),
					handleTaskCloseButtonClick: vi.fn(),
					startNewTask: vi.fn(),
				}}
				messageId="card-1"
				onSetQuote={vi.fn()}
				onToggleExpand={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: label }))

		expect(executeButtonAction).toHaveBeenCalledWith(response, undefined, "ok", ["img"], ["f.txt"], "card-1")
	})
})
