import assert from "node:assert/strict"
import { countText, create, parsePaths } from "./tool.ts"

// Fake workspace: a path map, resolved and read without touching disk.
function fakeEnv(files) {
    return {
        workspace: {
            resolvePath: async (p) => ({ absolutePath: p, displayPath: p }),
            getFileInfo: async (p) =>
                p in files
                    ? { exists: true, isFile: true, size: Buffer.byteLength(files[p]) }
                    : { exists: false, isFile: false, size: 0 },
            readFile: async (p) => files[p],
        },
    }
}

// countText: the arithmetic itself.
{
    const c = countText("Hallo Welt\nzweite Zeile")
    assert.equal(c.words, 4)
    assert.equal(c.lines, 2)
    assert.equal(c.charsWithSpaces, 23)
    assert.equal(c.charsWithoutSpaces, 20) // 2 spaces + 1 newline removed
}

// Empty and whitespace-only files count as zero words, not one.
{
    assert.equal(countText("").words, 0)
    assert.equal(countText("   \n  ").words, 0)
    assert.equal(countText("").lines, 0)
}

// Umlauts count as one character whether the file is NFC or NFD encoded.
{
    const nfc = countText("Übung")
    const nfd = countText("Übung")
    assert.equal(nfc.charsWithSpaces, 5)
    assert.equal(nfd.charsWithSpaces, 5, "decomposed umlaut must not count double")
    assert.equal(nfc.words, 1)
}

// CRLF line endings must not inflate the line count (Windows-authored files).
{
    assert.equal(countText("a\r\nb\r\nc").lines, 3)
}

// Leading/trailing whitespace must not produce phantom words.
{
    assert.equal(countText("  ein  zwei  ").words, 2)
}

// parsePaths accepts commas, newlines and stray whitespace.
{
    assert.deepEqual(parsePaths("a.md, b.md\n c.md "), ["a.md", "b.md", "c.md"])
    assert.deepEqual(parsePaths("  "), [])
}

// processCall: single file, no total row.
{
    const tool = create()
    const out = await tool.processCall({ paths: "a.md" }, fakeEnv({ "a.md": "eins zwei drei" }))
    assert.match(out, /a\.md: 3 words/)
    assert.ok(!out.includes("Summe"), "single file must not emit a total row")
}

// processCall: several files sum, and a missing file is reported without aborting the rest.
{
    const tool = create()
    const out = await tool.processCall(
        { paths: "a.md, fehlt.md, b.md" },
        fakeEnv({ "a.md": "eins zwei", "b.md": "drei" }),
    )
    assert.match(out, /fehlt\.md: file not found/)
    assert.match(out, /Total \(2 files\): 3 words/)
}

// Missing argument is an error, not a crash.
{
    const tool = create()
    assert.match(await tool.processCall({}, fakeEnv({})), /^Error/)
}

console.log("count_text smoke: all assertions passed")
