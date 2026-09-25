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

	it("closes the review tab by the label VS Code gives it ('Review Dirac Edits (N files)')", async () => {
		const reviewTab = { label: "Review Dirac Edits (1 file)", input: undefined }
		;(vscode.window.tabGroups as any).all = [{ tabs: [reviewTab] }]

		await TabManager.closeReviewTabs()

		sinon.assert.calledOnceWithExactly(closeStub, [reviewTab])
	})

	it("leaves other tabs alone", async () => {
		const reviewTab = { label: "Review Dirac Edits (3 files)", input: {} }
		const localized = { label: "Review Dirac Edits (3 Dateien)", input: {} }
		const otherTab = { label: "Review Dirac Edits notes.md", input: {} }
		const lookalike = { label: "Review Dirac Edits (draft).md", input: {} }
		;(vscode.window.tabGroups as any).all = [{ tabs: [reviewTab, localized, otherTab, lookalike] }]

		await TabManager.closeReviewTabs()

		const closedTabs = closeStub.firstCall.args[0]
		assert.deepEqual(closedTabs, [reviewTab, localized])
	})

	it("does nothing when no review tab is open", async () => {
		;(vscode.window.tabGroups as any).all = [{ tabs: [{ label: "some-file.ts", input: {} }] }]

		await TabManager.closeReviewTabs()

		sinon.assert.notCalled(closeStub)
	})
})
