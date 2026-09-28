export const spec = {
    id: "count_text",
    name: "count_text",
    description:
        "Counts characters (with and without spaces), words and lines in one or more files. " +
        "Counts the raw file text, including Markdown syntax, headings and the bibliography. " +
        "Comment lines (> TODO: / > AI:) are not counted. " +
        "With several files it also reports a total.",
    parameters: [
        {
            name: "paths",
            type: "array",
            items: { type: "string" },
            required: true,
            instruction: "One or more file paths, relative to the working directory.",
        },
    ],
}

/** Files above this size are reported rather than read — a word count is never worth the memory. */
const MAX_BYTES = 5_000_000

export interface Counts {
    charsWithSpaces: number
    charsWithoutSpaces: number
    words: number
    lines: number
}

/**
 * Count over Unicode code points, not UTF-16 units: `text.length` reports 2 for a single
 * astral character, and German text with umlauts may arrive decomposed (NFD), where "ä" is
 * two code points. Normalising to NFC first makes the count match what the writer sees.
 */
/**
 * Working notes are whole lines by convention, so removing them is a line
 * filter. They are not manuscript text and must not reach a word count that is measured
 * against a length requirement — the alternative is asking the model to count them and
 * subtract, which is exactly the arithmetic a small model gets wrong.
 */
// The colon is required: `\b` alone would drop a quotation that starts with "AI-".
const COMMENT_LINE = /^[ \t]*>[ \t]*(TODO|AI)[ \t]*:.*$/gmu

export function countText(raw: string): Counts {
    const text = raw.normalize("NFC").replace(COMMENT_LINE, "")
    const withoutWhitespace = text.replace(/\s/gu, "")
    const trimmed = text.trim()
    return {
        charsWithSpaces: Array.from(text).length,
        charsWithoutSpaces: Array.from(withoutWhitespace).length,
        words: trimmed === "" ? 0 : trimmed.split(/\s+/u).length,
        lines: text === "" ? 0 : text.split(/\r\n|\r|\n/u).length,
    }
}

/**
 * The spec declares an array, which is what the built-in file tools use and what the model
 * should send. The comma/newline split stays as a fallback: a small model that sends a bare
 * string, or an array that some upstream has flattened to "a.md,b.md", still works. A path
 * containing a comma is the price, and it is not a real one in this workspace.
 */
export function parsePaths(value: unknown): string[] {
    const raw = Array.isArray(value) ? value.join("\n") : String(value ?? "")
    return raw
        .split(/[,\n]/u)
        .map((p) => p.trim())
        .filter(Boolean)
}

function formatRow(label: string, c: Counts): string {
    return `${label}: ${c.words} words, ${c.charsWithSpaces} characters (with spaces), ${c.charsWithoutSpaces} characters (without spaces), ${c.lines} lines`
}

export function create() {
    return {
        spec() {
            return spec
        },
        supportedSurfaces() {
            return ["all"]
        },
        async processCall(args: any, env: any): Promise<string> {
            const paths = parsePaths(args?.paths)
            if (paths.length === 0) {
                return "Error: paths is missing."
            }

            // Check every path first, so one card asks for all readable files.
            const entries: ({ note: string } | { absolutePath: string; displayPath: string })[] = []
            for (const requested of paths) {
                const { absolutePath, displayPath } = await env.workspace.resolvePath(requested)
                // Custom tools get raw fs through env.workspace, which does not apply .diracignore; the
                // built-ins each check it at the call site (WriteToFileTool.ts:114), so this one must too.
                if (env.config?.services?.diracIgnoreController?.validateAccess(absolutePath) === false) {
                    entries.push({ note: `${displayPath}: blocked by .diracignore.` })
                    continue
                }

                const info = await env.workspace.getFileInfo(absolutePath)
                if (!info?.exists) {
                    entries.push({ note: `${displayPath}: file not found.` })
                    continue
                }
                if (!info.isFile) {
                    entries.push({ note: `${displayPath}: not a regular file (a directory?).` })
                    continue
                }
                if (typeof info.size === "number" && info.size > MAX_BYTES) {
                    entries.push({ note: `${displayPath}: skipped, the file is larger than ${MAX_BYTES} bytes.` })
                    continue
                }
                entries.push({ absolutePath, displayPath })
            }

            const files = entries.filter((e): e is { absolutePath: string; displayPath: string } => "absolutePath" in e)
            // A read, so the "read files" setting governs it, like the other workspace read tools.
            if (files.length > 0 && env.interaction?.askPermission) {
                const { approved } = await env.interaction.askPermission(
                    files.length === 1 ? `Count ${files[0].displayPath}?` : `Count ${files.length} files?`,
                    { category: "read", locations: files.map((f) => ({ path: f.absolutePath })) },
                )
                if (!approved) {
                    return "Count declined. The files were NOT read. Do not retry and do not call read_file instead; ask the user."
                }
            }

            const lines: string[] = []
            const total: Counts = { charsWithSpaces: 0, charsWithoutSpaces: 0, words: 0, lines: 0 }
            let counted = 0
            for (const entry of entries) {
                if ("note" in entry) {
                    lines.push(entry.note)
                    continue
                }
                const content = await env.workspace.readFile(entry.absolutePath)
                const c = countText(typeof content === "string" ? content : String(content ?? ""))

                lines.push(formatRow(entry.displayPath, c))
                total.charsWithSpaces += c.charsWithSpaces
                total.charsWithoutSpaces += c.charsWithoutSpaces
                total.words += c.words
                total.lines += c.lines
                counted++
            }

            if (counted > 1) {
                lines.push(formatRow(`Total (${counted} files)`, total))
            }
            return lines.join("\n")
        },
    }
}
