import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ModularChatTextArea } from "./ModularChatTextArea"

vi.mock("@/features/dirac-rules/components/DiracRulesToggleModal", () => ({
	default: () => null,
}))

function renderTextArea({ inputValue = "", skipRest = false } = {}) {
	const onSend = vi.fn()
	render(
		<ModularChatTextArea
			activeModelProviderPresetId={undefined}
			fastModeEnabled={false}
			fastModeSupported={false}
			inputValue={inputValue}
			isActivatingModelPreset={false}
			isUpdatingFastMode={false}
			isUpdatingReasoningEffort={false}
			mode="act"
			modelDisplayName="model"
			modelProviderPresets={[]}
			onFastModeToggle={vi.fn()}
			onModelButtonClick={vi.fn()}
			onModelProviderPresetSelect={vi.fn()}
			onReasoningEffortSelect={vi.fn()}
			onSend={onSend}
			reasoningEffort="medium"
			reasoningEffortOptions={[]}
			selectedFiles={[]}
			selectedImages={[]}
			setInputValue={vi.fn()}
			setSelectedFiles={vi.fn()}
			setSelectedImages={vi.fn()}
			skipRest={skipRest}
			supportsReasoningEffort={false}
		/>,
	)
	return { onSend, button: screen.getByTestId("send-button") }
}

describe("ModularChatTextArea send button", () => {
	it("becomes Skip rest in a chain and works with an empty box", () => {
		const { onSend, button } = renderTextArea({ skipRest: true })

		expect(button).toHaveTextContent("Skip rest")
		expect(button).toHaveAttribute(
			"title",
			"Declines this and the remaining steps and sends your text to the model. Steps you already accepted stay.",
		)
		expect(button).toHaveAttribute("aria-disabled", "false")
		fireEvent.click(button)
		expect(onSend).toHaveBeenCalledTimes(1)
	})

	it("stays disabled with an empty box outside a chain", () => {
		const { onSend, button } = renderTextArea()

		expect(button).not.toHaveTextContent("Skip rest")
		expect(button).toHaveAttribute("aria-disabled", "true")
		fireEvent.click(button)
		expect(onSend).not.toHaveBeenCalled()
	})

	it("sends typed text outside a chain", () => {
		const { onSend, button } = renderTextArea({ inputValue: "hello" })

		fireEvent.click(button)
		expect(onSend).toHaveBeenCalledTimes(1)
	})

	it("does not skip the rest on Enter with an empty box", () => {
		const { onSend } = renderTextArea({ skipRest: true })

		fireEvent.keyDown(screen.getByTestId("chat-input"), { key: "Enter" })
		expect(onSend).not.toHaveBeenCalled()
	})
})
