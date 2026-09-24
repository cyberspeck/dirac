import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "mocha"
import * as sinon from "sinon"
import * as vscode from "vscode"
import { TabManager } from "../TabManager"

describe("TabManager.closeReviewTabs", () => {
	let closeStub: sinon.SinonStub

	beforeEach(() => {
		closeStub = sinon.stub().resolves()
		;(vscode.window.tabGroups as any).close = closeStub
	})

	afterEach(() => {
		sinon.restore()
		;(vscode.window.tabGroups as any).all = []
		delete (vscode.window.tabGroups as any).close
	})

	it("closes a tab labelled 'Review Dirac Edits' whatever its input type", async () => {
		const reviewTab = { label: "Review Dirac Edits", input: { constructor: { name: "TabInputTextMultiDiff" } } }
		;(vscode.window.tabGroups as any).all = [{ tabs: [reviewTab] }]

		await TabManager.closeReviewTabs()

		sinon.assert.calledOnceWithExactly(closeStub, [reviewTab])
	})

	it("leaves other tabs alone", async () => {
		const reviewTab = { label: "Review Dirac Edits", input: {} }
		const otherTab = { label: "some-file.ts", input: {} }
		;(vscode.window.tabGroups as any).all = [{ tabs: [reviewTab, otherTab] }]

		await TabManager.closeReviewTabs()

		const closedTabs = closeStub.firstCall.args[0]
		assert.deepEqual(closedTabs, [reviewTab])
	})

	it("does nothing when no review tab is open", async () => {
		;(vscode.window.tabGroups as any).all = [{ tabs: [{ label: "some-file.ts", input: {} }] }]

		await TabManager.closeReviewTabs()

		sinon.assert.notCalled(closeStub)
	})
})
