import { AskQuestionDecorator } from "./AskQuestionDecorator"
import { DiffDecorator } from "./DiffDecorator"
import { TerminalDecorator } from "./TerminalDecorator"
import { HookDecorator } from "./HookDecorator"
import { SearchDecorator } from "./SearchDecorator"
import { BugReportDecorator } from "./BugReportDecorator"
import { CompletionDecorator } from "./CompletionDecorator"
import { NewTaskDecorator } from "./NewTaskDecorator"
import { PlanDecorator } from "./PlanDecorator"
import { CardDecorator } from "./types"

export const CARD_DECORATORS: CardDecorator[] = [
	AskQuestionDecorator,
	DiffDecorator,
	TerminalDecorator,
	HookDecorator,
	SearchDecorator,
	BugReportDecorator,
	NewTaskDecorator,
	PlanDecorator,
	CompletionDecorator,
]

export * from "./types"
