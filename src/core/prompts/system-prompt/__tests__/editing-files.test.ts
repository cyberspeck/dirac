import "should"
import { describe, it } from "mocha"
import { getEditingFilesInstructions } from "../sections/editing-files"

describe("getEditingFilesInstructions", () => {
	it("omits the execute_command clause when the shell tool is disabled", () => {
		const section = getEditingFilesInstructions({ executeCommandEnabled: false })
		section.should.not.containEql("execute_command")
		section.should.containEql("edit_file")
	})

	it("keeps the execute_command clause when the shell tool is enabled", () => {
		getEditingFilesInstructions({ executeCommandEnabled: true }).should.containEql("execute_command")
	})
})
