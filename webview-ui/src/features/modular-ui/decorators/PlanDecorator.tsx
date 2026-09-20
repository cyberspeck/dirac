import { Card } from "@shared/ExtensionMessage"
import { DiracIcon } from "@shared/icons"
import { CopyButton } from "@/shared/ui/CopyButton"
import { CardDecorator } from "./types"

export const PlanDecorator: CardDecorator = {
	id: "plan",
	shouldApply: (card: Card) => card.icon === DiracIcon.PLAN,
	renderHeaderActions: (card: Card) => {
		if (!card.body) return null

		// Proposed plans are the card users most often want to lift out of the chat, but cards
		// render through ModularCard rather than ModularMarkdown, so they never got the copy
		// affordance ordinary messages have. Same shape as TerminalDecorator's.
		return <CopyButton ariaLabel="Copy plan" className="opacity-60 hover:opacity-100" textToCopy={card.body} />
	},
}
