import type { UIActionState } from "@shared/ExtensionMessage"

type ChainPosition = NonNullable<UIActionState["chainPosition"]>

export const SKIP_REST_LABEL = "Skip rest"
export const SKIP_REST_TOOLTIP =
	"Declines this and the remaining steps and sends your text to the model. Steps you already accepted stay."
export const APPROVAL_PLACEHOLDER = "Note for this step — then Accept or Reject. Enter skips the rest and sends it to the model."

/** Skip rest exists only in a chain: two or more steps, or the model is still writing more. */
export const isSkipRestAvailable = (position?: ChainPosition): boolean =>
	!!position && (position.total >= 2 || position.streaming)

export const formatStepCounter = (position: ChainPosition): string =>
	position.streaming ? `Step ${position.index} · model still writing` : `Step ${position.index} of ${position.total}`
