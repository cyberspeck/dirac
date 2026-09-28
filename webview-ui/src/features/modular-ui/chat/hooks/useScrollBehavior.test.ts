import { act, renderHook } from "@testing-library/react"
import type React from "react"
import type { VirtuosoHandle } from "react-virtuoso"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useScrollBehavior } from "./useScrollBehavior"
import { useChatStore } from "@/features/chat/store/chatStore"

describe("useScrollBehavior handleListHeightChanged", () => {
	beforeEach(() => {
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
			cb(0)
			return 0
		})
	})
	afterEach(() => vi.restoreAllMocks())

	function setup() {
		const { result } = renderHook(() => useScrollBehavior([], [], [], {}, vi.fn()))
		const handle = { scrollToIndex: vi.fn(), autoscrollToBottom: vi.fn() }
		;(result.current.virtuosoRef as React.MutableRefObject<VirtuosoHandle | null>).current =
			handle as unknown as VirtuosoHandle
		return { result, handle }
	}

	it("re-anchors to the end of the last row on every height change while following", () => {
		const { result, handle } = setup()
		act(() => result.current.handleListHeightChanged(500))
		act(() => result.current.handleListHeightChanged(510))
		act(() => result.current.handleListHeightChanged(505))
		expect(handle.scrollToIndex).toHaveBeenCalledTimes(3)
		expect(handle.scrollToIndex).toHaveBeenLastCalledWith({ index: "LAST", align: "end", behavior: "auto" })
		expect(handle.autoscrollToBottom).not.toHaveBeenCalled()
	})

	it("does not scroll after the user scrolled up", () => {
		const { result, handle } = setup()
		act(() => result.current.handleScrollWheel({ deltaY: -10, currentTarget: document.body } as unknown as React.WheelEvent))
		act(() => result.current.handleListHeightChanged(800))
		expect(handle.scrollToIndex).not.toHaveBeenCalled()
	})
})

describe("useScrollBehavior waiting card", () => {
	beforeEach(() => {
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
			cb(0)
			return 0
		})
		useChatStore.setState({ uiActionState: undefined })
	})
	afterEach(() => vi.restoreAllMocks())

	function setup(rendered: string[]) {
		const { result } = renderHook(() => useScrollBehavior([], rendered, rendered, {}, vi.fn()))
		const handle = { scrollToIndex: vi.fn() }
		;(result.current.virtuosoRef as React.MutableRefObject<VirtuosoHandle | null>).current =
			handle as unknown as VirtuosoHandle
		const wait = (activeCardId: string) =>
			act(() =>
				useChatStore.setState({ uiActionState: { globalButtons: [], cardButtons: [], sendingDisabled: false, activeCardId } }),
			)
		return { result, handle, wait }
	}

	it("scrolls to the end of a waiting card that other rows follow, once", () => {
		const { result, handle, wait } = setup(["first", "card", "later-card"])
		wait("card")
		expect(handle.scrollToIndex).toHaveBeenCalledTimes(1)
		expect(handle.scrollToIndex).toHaveBeenLastCalledWith({ index: 1, align: "end", behavior: "auto" })
		expect(result.current.isFollowingRef.current).toBe(false)
		wait("card")
		expect(handle.scrollToIndex).toHaveBeenCalledTimes(1)
	})

	it("scrolls to the bottom and keeps following when the waiting card is last", () => {
		const { result, handle, wait } = setup(["first", "card"])
		act(() => result.current.handleScrollWheel({ deltaY: -10, currentTarget: document.body } as unknown as React.WheelEvent))
		wait("card")
		expect(handle.scrollToIndex).toHaveBeenLastCalledWith({ index: "LAST", align: "end", behavior: "auto" })
		expect(result.current.isFollowingRef.current).toBe(true)
	})
})
