import { CardStatus, type Card } from "@shared/ExtensionMessage"
import { DiracAskResponse } from "@shared/WebviewMessage"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CardActions } from "./CardActions"

const card: Card = {
	id: "card",
	header: "Edit file",
	status: CardStatus.WAITING_FOR_INPUT,
	renderType: "diff",
	requireApproval: true,
}

describe("CardActions", () => {
	it("labels the approve button Accept", () => {
		const onAction = vi.fn()
		render(<CardActions card={card} isActive={true} onAction={onAction} />)

		fireEvent.click(screen.getByRole("button", { name: "Accept" }))

		expect(onAction).toHaveBeenCalledWith(DiracAskResponse.APPROVE)
	})
})
