import * as assert from "assert"
import { after, afterEach, before, describe, it } from "mocha"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import sinon from "sinon"
import { pathToFileURL } from "url"
import { Logger } from "@/shared/services/Logger"
import { callTextExtractionFunctions, extractTextFromFile, processFilesIntoText } from "../extract-text"

describe("extract-text", () => {
	describe("extractTextFromFile", () => {
		it("reads text from a local file", async () => {
			const tempFile = path.join(os.tmpdir(), `dirac-extract-test-${Date.now()}.txt`)
			await fs.writeFile(tempFile, "hello world")
			try {
				const content = await extractTextFromFile(tempFile)
				assert.strictEqual(content, "hello world")
			} finally {
				await fs.unlink(tempFile).catch(() => {})
			}
		})
	})

	describe("PDF extraction", () => {
		/** A minimal valid PDF, one line of Helvetica text per page. */
		function buildPdf(pages: string[]): Buffer {
			const objects = [
				"<< /Type /Catalog /Pages 2 0 R >>",
				`<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
				"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
			]
			for (const [i, text] of pages.entries()) {
				const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
				objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`)
				objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
			}
			let out = "%PDF-1.4\n"
			const offsets: number[] = []
			for (const [i, body] of objects.entries()) {
				offsets.push(out.length)
				out += `${i + 1} 0 obj\n${body}\nendobj\n`
			}
			const xref = out.length
			out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
			out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")
			out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
			return Buffer.from(out, "latin1")
		}

		it("marks each page, and a range-reading caller gets the text untruncated", async () => {
			const tempFile = path.join(os.tmpdir(), `dirac-extract-test-${Date.now()}.pdf`)
			await fs.writeFile(tempFile, buildPdf(["first page", "second page"]))
			try {
				const text = await callTextExtractionFunctions(tempFile, false)
				const lines = text.split(/\r?\n/)
				const first = lines.indexOf("[page 1]")
				const second = lines.indexOf("[page 2]")
				assert.ok(first >= 0 && second > first, text)
				assert.strictEqual(lines[first + 1], "first page")
				assert.strictEqual(lines[second + 1], "second page")
			} finally {
				await fs.unlink(tempFile).catch(() => {})
			}
		})

		it("truncates by default and not when a caller selects a range", async () => {
			const tempFile = path.join(os.tmpdir(), `dirac-extract-test-${Date.now()}.txt`)
			await fs.writeFile(tempFile, "x".repeat(500 * 1024))
			try {
				assert.ok((await callTextExtractionFunctions(tempFile)).length < 450 * 1024)
				assert.strictEqual((await callTextExtractionFunctions(tempFile, false)).length, 500 * 1024)
			} finally {
				await fs.unlink(tempFile).catch(() => {})
			}
		})
	})

	describe("processFilesIntoText", () => {
		let tempFile: string
		let fileUrl: string

		before(async () => {
			tempFile = path.join(os.tmpdir(), `dirac-extract-test-${Date.now()}.txt`)
			await fs.writeFile(tempFile, "hello world")
			fileUrl = pathToFileURL(tempFile).href
		})

		after(async () => {
			await fs.unlink(tempFile).catch(() => {})
		})

		afterEach(() => {
			sinon.restore()
		})

		it("resolves file:// URIs to a local path", async () => {
			const result = await processFilesIntoText([fileUrl])
			assert.ok(result.includes("hello world"))
			assert.ok(result.includes(tempFile.replace(/\\/g, "/")))
		})

		it("warns and skips space:// URIs", async () => {
			const warnStub = sinon.stub(Logger, "warn")
			const spaceUri = "space://1788434544580-1rccxfssm/Find%20PR-FEEDBACK-STATUS.md"
			const result = await processFilesIntoText([spaceUri])
			assert.ok(result.includes("Space resource unavailable"))
			assert.ok(result.includes(spaceUri))
			assert.ok(warnStub.calledOnce)
		})

		it("warns and skips unsupported URI schemes", async () => {
			const warnStub = sinon.stub(Logger, "warn")
			const result = await processFilesIntoText(["foo://bar/baz.txt"])
			assert.ok(result.includes('Unsupported URI scheme "foo"'))
			assert.ok(warnStub.calledOnce)
		})

		it("logs error for missing local files", async () => {
			const errorStub = sinon.stub(Logger, "error")
			const missing = path.join(os.tmpdir(), `dirac-extract-missing-${Date.now()}.txt`)
			const result = await processFilesIntoText([missing])
			assert.ok(result.includes("Error fetching content"))
			assert.ok(result.includes("File not found"))
			assert.ok(errorStub.calledOnce)
		})
	})
})
