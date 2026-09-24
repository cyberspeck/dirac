import { CardStatus, type DiracMessage, DiracMessageType, TaskStatus, type UIActionState } from "@shared/ExtensionMessage"
import { DiracAskResponse, SKIP_REST_VALUE } from "@shared/WebviewMessage"
import { act, renderHook } from "@testing-library/react"
import type React from "react"
import { describe, expect, it, vi } from "vitest"
import { useChatStore } from "@/features/chat/store/chatStore"
import { InteractionStateProvider } from "../context/InteractionStateContext"
import type { ChatState } from "../types/chatTypes"
import { useMessageHandlers } from "./useMessageHandlers"

const taskServiceMocks = vi.hoisted(() => ({ askResponse: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/shared/api/grpc-client", () => ({ TaskServiceClient: taskServiceMocks }))

const cardMessage: DiracMessage = {
	id: "card-1",
	ts: 1,
	content: {
		type: DiracMessageType.CARD,
		card: { id: "card-1", header: "Edit", status: CardStatus.WAITING_FOR_INPUT, renderType: "text", requireApproval: true },
	},
}

function sendEmpty(chainPosition?: UIActionState["chainPosition"]) {
	taskServiceMocks.askResponse.mockClear()
	const uiActionState: UIActionState = {
		globalButtons: [],
		cardButtons: [],
		sendingDisabled: false,
		activeCardId: "card-1",
		chainPosition,
	}
	useChatStore.setState({
		diracMessages: [cardMessage],
		messageIndexById: new Map([["card-1", 0]]),
		taskMessage: { id: "task", ts: 0, content: { type: DiracMessageType.MARKDOWN, content: "task" } },
		taskStatus: TaskStatus.AWAITING_USER_INPUT,
		uiActionState,
		goal: undefined,
	})
	const chatState = {
		uiActionState,
		activeQuote: null,
		setInputValue: vi.fn(),
		setActiveQuote: vi.fn(),
		setSelectedImages: vi.fn(),
		setSelectedFiles: vi.fn(),
		setSendingDisabled: vi.fn(),
	} as unknown as ChatState
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<InteractionStateProvider>{children}</InteractionStateProvider>
	)
	const { result } = renderHook(() => useMessageHandlers(chatState), { wrapper })
	return act(() => result.current.handleSendMessage("", [], []))
}

describe("useMessageHandlers empty send while a permission card waits", () => {
	it("skips the rest when the card is in a chain", async () => {
		await sendEmpty({ index: 1, total: 2, streaming: false })

		expect(taskServiceMocks.askResponse).toHaveBeenCalledWith(
			expect.objectContaining({
				cardId: "card-1",
				responseType: DiracAskResponse.MESSAGE,
				text: "",
				value: SKIP_REST_VALUE,
			}),
		)
	})

	it("sends nothing outside a chain", async () => {
		await sendEmpty(undefined)

		expect(taskServiceMocks.askResponse).not.toHaveBeenCalled()
	})
})
