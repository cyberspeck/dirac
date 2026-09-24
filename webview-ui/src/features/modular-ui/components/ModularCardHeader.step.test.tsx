import { CardStatus, type Card } from "@shared/ExtensionMessage"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useChatStore } from "@/features/chat/store/chatStore"
import { ModularCardHeader } from "./ModularCardHeader"

const card: Card = { id: "card-1", header: "Edit file", status: CardStatus.WAITING_FOR_INPUT, renderType: "text" }

function renderWith(chainPosition?: { index: number; total: number; streaming: boolean }, activeCardId = "card-1") {
	useChatStore.setState({
		uiActionState: { globalButtons: [], cardButtons: [], sendingDisabled: false, activeCardId, chainPosition },
	})
	return render(<ModularCardHeader card={card} contentId="c" isCollapsed={false} onToggleCollapse={vi.fn()} />)
}

describe("ModularCardHeader step counter", () => {
	it("shows the step among the total once the model finished", () => {
		renderWith({ index: 2, total: 3, streaming: false })
		expect(screen.getByText("Step 2 of 3")).toBeInTheDocument()
	})

	it("shows the step without a total while the model is still writing", () => {
		renderWith({ index: 1, total: 1, streaming: true })
		expect(screen.getByText("Step 1 · model still writing")).toBeInTheDocument()
	})

	it("shows no counter on other cards or without a chain", () => {
		renderWith({ index: 2, total: 3, streaming: false }, "other-card")
		expect(screen.queryByText(/^Step /)).toBeNull()
		renderWith(undefined)
		expect(screen.queryByText(/^Step /)).toBeNull()
	})
})
