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

	it("is byte-identical to the default when every flag is explicitly enabled", () => {
		const allEnabled = getEditingFilesInstructions({
			executeCommandEnabled: true,
			editFileEnabled: true,
			editAstEnabled: true,
			inspectAstEnabled: true,
		})
		getEditingFilesInstructions().should.equal(allEnabled)
	})

	it("stops naming edit_file, edit_ast and inspect_ast (and ANCHOR coordinates) when all three are disabled, but still teaches write_to_file", () => {
		const section = getEditingFilesInstructions({
			executeCommandEnabled: true,
			editFileEnabled: false,
			editAstEnabled: false,
			inspectAstEnabled: false,
		})
		section.should.not.match(/\bedit_file\b/)
		section.should.not.match(/\bedit_ast\b/)
		section.should.not.match(/\binspect_ast\b/)
		section.should.not.containEql("ANCHOR")
		section.should.containEql("write_to_file")
		section.should.containEql("execute_command")
	})

	it("omits edit_ast from the tool list when it is disabled but edit_file stays", () => {
		const section = getEditingFilesInstructions({ editAstEnabled: false })
		section.should.not.match(/\bedit_ast\b/)
		section.should.containEql("edit_file")
	})

	it("omits inspect_ast from the anchor-source list when it is disabled but edit_file stays", () => {
		const section = getEditingFilesInstructions({ inspectAstEnabled: false })
		section.should.not.match(/\binspect_ast\b/)
		section.should.match(/from `read_file` or `search_files`\./)
	})
})
