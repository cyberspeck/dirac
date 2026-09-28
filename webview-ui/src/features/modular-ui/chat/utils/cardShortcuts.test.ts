import { describe, expect, it } from "vitest"
import { waitingCardShortcut } from "./cardShortcuts"

function key(init: KeyboardEventInit, target?: HTMLElement) {
	const event = new KeyboardEvent("keydown", init)
	if (target) Object.defineProperty(event, "target", { value: target })
	return event
}

function textArea(value: string) {
	const element = document.createElement("textarea")
	element.value = value
	return element
}

describe("waitingCardShortcut", () => {
	it("uses Cmd on macOS and Ctrl elsewhere", () => {
		expect(waitingCardShortcut(key({ key: "Enter", metaKey: true }), true)).toBe("approve")
		expect(waitingCardShortcut(key({ key: "Enter", ctrlKey: true }), true)).toBeUndefined()
		expect(waitingCardShortcut(key({ key: "Enter", ctrlKey: true }), false)).toBe("approve")
		expect(waitingCardShortcut(key({ key: "Enter", metaKey: true }), false)).toBeUndefined()
	})

	it("ignores plain keys, extra modifiers, repeats and other keys", () => {
		expect(waitingCardShortcut(key({ key: "Enter" }), true)).toBeUndefined()
		expect(waitingCardShortcut(key({ key: "Enter", metaKey: true, shiftKey: true }), true)).toBeUndefined()
		expect(waitingCardShortcut(key({ key: "Enter", metaKey: true, altKey: true }), true)).toBeUndefined()
		expect(waitingCardShortcut(key({ key: "Enter", metaKey: true, repeat: true }), true)).toBeUndefined()
		expect(waitingCardShortcut(key({ key: "a", metaKey: true }), true)).toBeUndefined()
	})

	it("accepts even while the input holds a note", () => {
		expect(waitingCardShortcut(key({ key: "Enter", metaKey: true }, textArea("reply text")), true)).toBe("approve")
	})

	it("rejects only when there is no text for Backspace to delete", () => {
		expect(waitingCardShortcut(key({ key: "Backspace", metaKey: true }, textArea("")), true)).toBe("reject")
		expect(waitingCardShortcut(key({ key: "Backspace", metaKey: true }, document.createElement("div")), true)).toBe("reject")
		expect(waitingCardShortcut(key({ key: "Backspace", metaKey: true }, textArea("reply text")), true)).toBeUndefined()
		expect(waitingCardShortcut(key({ key: "Backspace", ctrlKey: true }, textArea("reply text")), false)).toBeUndefined()
	})
})
