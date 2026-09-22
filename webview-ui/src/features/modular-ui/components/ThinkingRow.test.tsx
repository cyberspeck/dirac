import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ThinkingRow } from "../../modular-ui/components/ThinkingRow"

describe("ThinkingRow", () => {
	it("renders streaming title styling and expanded reasoning content", () => {
		render(
			<ThinkingRow
				isExpanded={true}
				isStreaming={true}
				isVisible={true}
				reasoningContent="Inspecting files..."
				showTitle={true}
				title="Thinking..."
			/>,
		)

		const title = screen.getByText("Thinking...")
		expect(title).toBeInTheDocument()
		expect(title).toHaveClass("animate-shimmer")

		// Lightbulb should reflect streaming state
		const bulb = title.closest('[role="button"]')?.querySelector("svg")
		expect(bulb).toBeTruthy()
		expect(bulb).toHaveClass("text-warning/80", "animate-bulb-glow")
		expect(screen.getByText("Inspecting files...")).toBeInTheDocument()
	})

	it("previews the first line of reasoning when collapsed", () => {
		render(
			<ThinkingRow
				isExpanded={false}
				isStreaming={false}
				isVisible={true}
				reasoningContent={"\n  The user wants all headings from the manual.\nSecond line."}
				showTitle={true}
			/>,
		)

		expect(screen.getByText("The user wants all headings from the manual.")).toBeInTheDocument()
		expect(screen.queryByText("Second line.")).not.toBeInTheDocument()
	})

	it("shows no preview while streaming, where the expanded text is already live", () => {
		render(
			<ThinkingRow
				isExpanded={false}
				isStreaming={true}
				isVisible={true}
				reasoningContent="Inspecting files..."
				showTitle={true}
			/>,
		)

		expect(screen.queryByText("Inspecting files...")).not.toBeInTheDocument()
	})

	it("calls onToggle when header is clicked", () => {
		const onToggle = vi.fn()

		render(
			<ThinkingRow
				isExpanded={false}
				isVisible={true}
				onToggle={onToggle}
				reasoningContent="some reasoning"
				showTitle={true}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: /Thinking/i }))
		expect(onToggle).toHaveBeenCalledTimes(1)
	})
	it("renders summarized reasoning steps as Markdown", () => {
		render(
			<ThinkingRow
				isExpanded={true}
				isVisible={true}
				reasoningContent="**Planning layout restoration**\n\n**Refining spacing**"
				showTitle={true}
			/>,
		)

		expect(screen.getByText("Planning layout restoration").tagName).toBe("STRONG")
		expect(screen.getByText("Refining spacing").tagName).toBe("STRONG")
		expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument()
	})
})
