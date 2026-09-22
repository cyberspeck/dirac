export const spec = {
    id: "count_text",
    name: "count_text",
    description:
        "Zählt Zeichen (mit und ohne Leerzeichen), Wörter und Zeilen in einer oder mehreren Dateien. " +
        "Zählt den Rohtext der Datei, einschließlich Markdown-Syntax, Überschriften und Literaturverzeichnis. " +
        "Bei mehreren Dateien wird zusätzlich eine Summe ausgegeben.",
    parameters: [
        {
            name: "paths",
            type: "string",
            required: true,
            instruction:
                "Ein Dateipfad oder mehrere, getrennt durch Komma oder Zeilenumbruch. Relativ zum Arbeitsverzeichnis.",
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

export function parsePaths(value: string): string[] {
    return value
        .split(/[,\n]/u)
        .map((p) => p.trim())
        .filter(Boolean)
}

function formatRow(label: string, c: Counts): string {
    return `${label}: ${c.words} Wörter, ${c.charsWithSpaces} Zeichen (mit Leerzeichen), ${c.charsWithoutSpaces} Zeichen (ohne Leerzeichen), ${c.lines} Zeilen`
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
            const paths = parsePaths(String(args?.paths ?? ""))
            if (paths.length === 0) {
                return "Fehler: paths fehlt."
            }

            const lines: string[] = []
            const total: Counts = { charsWithSpaces: 0, charsWithoutSpaces: 0, words: 0, lines: 0 }
            let counted = 0

            for (const requested of paths) {
                const { absolutePath, displayPath } = await env.workspace.resolvePath(requested)

                const info = await env.workspace.getFileInfo(absolutePath)
                if (!info?.exists) {
                    lines.push(`${displayPath}: Datei nicht gefunden.`)
                    continue
                }
                if (!info.isFile) {
                    lines.push(`${displayPath}: kein reguläre Datei (Verzeichnis?).`)
                    continue
                }
                if (typeof info.size === "number" && info.size > MAX_BYTES) {
                    lines.push(`${displayPath}: übersprungen, Datei ist grösser als ${MAX_BYTES} Bytes.`)
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
                lines.push(formatRow(`Summe (${counted} Dateien)`, total))
            }
            return lines.join("\n")
        },
    }
}
