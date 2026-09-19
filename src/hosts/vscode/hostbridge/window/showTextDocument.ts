import * as vscode from "vscode"
import { ShowTextDocumentRequest, TextEditorInfo } from "@/shared/proto/host/window"
import { arePathsEqual } from "@/utils/path"

export function buildShowOptions(opts: {
	line?: number
	preview?: boolean
	preserveFocus?: boolean
	viewColumn?: vscode.ViewColumn
}): vscode.TextDocumentShowOptions {
	const options: vscode.TextDocumentShowOptions = {
		preview: opts.preview,
		preserveFocus: opts.preserveFocus,
		viewColumn: opts.viewColumn,
	}
	if (opts.line !== undefined) {
		const zeroBased = Math.max(0, opts.line - 1)
		const position = new vscode.Position(zeroBased, 0)
		options.selection = new vscode.Range(position, position)
	}
	return options
}

export async function showTextDocument(request: ShowTextDocumentRequest): Promise<TextEditorInfo> {
	// Convert file path to URI
	const uri = vscode.Uri.file(request.path)

	// Check if the document is already open in a tab group that's not in the active editor's column.
	//  If it is, then close it (if not dirty) so that we don't duplicate tabs
	try {
		for (const group of vscode.window.tabGroups.all) {
			const existingTab = group.tabs.find(
				(tab) => tab.input instanceof vscode.TabInputText && arePathsEqual(tab.input.uri.fsPath, uri.fsPath),
			)
			if (existingTab) {
				const activeColumn = vscode.window.activeTextEditor?.viewColumn
				const tabColumn = vscode.window.tabGroups.all.find((group) => group.tabs.includes(existingTab))?.viewColumn
				if (activeColumn && activeColumn !== tabColumn && !existingTab.isDirty) {
					await vscode.window.tabGroups.close(existingTab)
				}
				break
			}
		}
	} catch {} // not essential, sometimes tab operations fail

	const options = buildShowOptions({
		line: request.options?.line,
		preview: request.options?.preview,
		preserveFocus: request.options?.preserveFocus,
		viewColumn: request.options?.viewColumn,
	})

	const editor = await vscode.window.showTextDocument(uri, options)

	return TextEditorInfo.create({
		documentPath: editor.document.uri.fsPath,
		viewColumn: editor.viewColumn,
		isActive: vscode.window.activeTextEditor === editor,
	})
}
