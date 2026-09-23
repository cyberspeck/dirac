import { getDelimiter } from "../../../../utils/line-hashing"

const joinOr = (items: string[]): string => {
	if (items.length === 1) return items[0]
	if (items.length === 2) return `${items[0]} or ${items[1]}`
	return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`
}

export const getEditingFilesInstructions = (
	opts: {
		executeCommandEnabled?: boolean
		editFileEnabled?: boolean
		editAstEnabled?: boolean
		inspectAstEnabled?: boolean
		writeToFileEnabled?: boolean
	} = {},
) => {
	const executeCommandEnabled = opts.executeCommandEnabled ?? true
	const editFileEnabled = opts.editFileEnabled ?? true
	const editAstEnabled = opts.editAstEnabled ?? true
	const inspectAstEnabled = opts.inspectAstEnabled ?? true
	const writeToFileEnabled = opts.writeToFileEnabled ?? true
	const delimiter = getDelimiter()
	const bulkClause = executeCommandEnabled ? ", and `execute_command` only for mechanical bulk transformations" : ""

	const tools: string[] = []
	if (editAstEnabled) tools.push("`edit_ast` for indexed symbol renames or whole-definition replacements")
	if (editFileEnabled) tools.push("`edit_file` for partial edits")
	if (writeToFileEnabled) tools.push("`write_to_file` for new or deliberately overwritten complete files")
	if (tools.length === 0) return ""

	const toolsLine = `- Use ${tools.join(", ")}${bulkClause}.`

	if (!editFileEnabled) {
		return `## EDITING FILES

${toolsLine}
`
	}

	const anchorSources = ["`read_file`", "`search_files`"]
	if (inspectAstEnabled) anchorSources.push("`inspect_ast` with `include_anchors: true`")

	return `## EDITING FILES

${toolsLine}
- \`edit_file\` requires current complete \`ANCHOR${delimiter}CONTENT\` coordinates from ${joinOr(anchorSources)}. Copy them verbatim, use the smallest range, keep anchors out of replacement text, reread after an anchor failure, and batch only non-overlapping edits.
`
}
