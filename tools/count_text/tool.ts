export const spec = {
    id: "count_text",
    name: "count_text",
    description:
        "Counts characters (with and without spaces), words and lines in one or more files. " +
        "Counts the raw file text, including Markdown syntax, headings and the bibliography. " +
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
export function countText(raw: string): Counts {
    const text = raw.normalize("NFC")
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

            const lines: string[] = []
            const total: Counts = { charsWithSpaces: 0, charsWithoutSpaces: 0, words: 0, lines: 0 }
            let counted = 0

            for (const requested of paths) {
                const { absolutePath, displayPath } = await env.workspace.resolvePath(requested)

                const info = await env.workspace.getFileInfo(absolutePath)
                if (!info?.exists) {
                    lines.push(`${displayPath}: file not found.`)
                    continue
                }
                if (!info.isFile) {
                    lines.push(`${displayPath}: not a regular file (a directory?).`)
                    continue
                }
                if (typeof info.size === "number" && info.size > MAX_BYTES) {
                    lines.push(`${displayPath}: skipped, the file is larger than ${MAX_BYTES} bytes.`)
                    continue
                }

                const content = await env.workspace.readFile(absolutePath)
                const c = countText(typeof content === "string" ? content : String(content ?? ""))

                lines.push(formatRow(displayPath, c))
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
