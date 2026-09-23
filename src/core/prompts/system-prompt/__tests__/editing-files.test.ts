import "should"
import { describe, it } from "mocha"
import { getDelimiter } from "../../../../utils/line-hashing"
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

	it("is byte-identical to the pre-toggle text by default and when every flag is explicitly enabled", () => {
		// The section as it read before the edit-tool toggles existed (f06aad1a).
		const delimiter = getDelimiter()
		const before = `## EDITING FILES

- Use \`edit_ast\` for indexed symbol renames or whole-definition replacements, \`edit_file\` for partial edits, \`write_to_file\` for new or deliberately overwritten complete files, and \`execute_command\` only for mechanical bulk transformations.
- \`edit_file\` requires current complete \`ANCHOR${delimiter}CONTENT\` coordinates from \`read_file\`, \`search_files\`, or \`inspect_ast\` with \`include_anchors: true\`. Copy them verbatim, use the smallest range, keep anchors out of replacement text, reread after an anchor failure, and batch only non-overlapping edits.
`
		const allEnabled = getEditingFilesInstructions({
			executeCommandEnabled: true,
			editFileEnabled: true,
			editAstEnabled: true,
			inspectAstEnabled: true,
		})
		allEnabled.should.equal(before)
		getEditingFilesInstructions().should.equal(before)
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

	it("does not teach write_to_file when it is disabled", () => {
		const section = getEditingFilesInstructions({ writeToFileEnabled: false })
		section.should.not.match(/\bwrite_to_file\b/)
		section.should.containEql("edit_file")
	})

	it("is empty, heading included, when no editing tool is available", () => {
		getEditingFilesInstructions({
			executeCommandEnabled: true,
			editFileEnabled: false,
			editAstEnabled: false,
			inspectAstEnabled: false,
			writeToFileEnabled: false,
		}).should.equal("")
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
