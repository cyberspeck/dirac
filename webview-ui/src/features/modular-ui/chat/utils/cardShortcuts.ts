const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)
const MOD = isMac ? "Cmd" : "Ctrl"

export const APPROVE_SHORTCUT = `${MOD}+Enter`
export const REJECT_SHORTCUT = `${MOD}+Backspace`

/**
 * The waiting permission card button a keydown presses, if any: Cmd (macOS) or Ctrl (elsewhere) with
 * Enter accepts, with Backspace rejects. Cmd/Ctrl+Backspace also deletes text, so it rejects only when
 * the focused field is empty or focus is not in a text field.
 */
export function waitingCardShortcut(event: KeyboardEvent, mac = isMac): "approve" | "reject" | undefined {
	const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
	if (!mod || event.altKey || event.shiftKey || event.repeat || event.isComposing) return undefined
	if (event.key === "Enter") return "approve"
	if (event.key !== "Backspace") return undefined
	const target = event.target as HTMLElement | null
	const hasText = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value !== "" : false
	return hasText || target?.isContentEditable ? undefined : "reject"
}
