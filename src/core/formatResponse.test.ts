/**
 * Tests for formatResponse — verifies the moved module exports the same API.
 * Focuses on edge cases: null/undefined inputs, empty strings, missing params.
 */
import { describe, it } from "mocha"
import "should"
import { LegacyResponseTool, RESPOND_TOOL_NAME } from "@shared/responseTool"
import { formatResponse } from "./formatResponse"

const withEditFile = new Set(["edit_file", "write_to_file", "execute_command"])
const withoutEditFile = new Set(["write_to_file", "execute_command"])
const writeOnly = new Set(["write_to_file"])

describe("formatResponse", () => {
	describe("toolError", () => {
		it("wraps error message in error tags", () => {
			formatResponse.toolError("boom").should.containEql("<error>")
			formatResponse.toolError("boom").should.containEql("boom")
			formatResponse.toolError("boom").should.containEql("</error>")
		})
		it("handles undefined error", () => {
			formatResponse.toolError(undefined).should.containEql("<error>")
		})
		it("handles empty string error", () => {
			formatResponse.toolError("").should.containEql("<error>")
		})
	})

	describe("toolDenied", () => {
		it("returns the plain decline message", () => {
			formatResponse.toolDenied().should.equal("The user declined this.")
		})
	})

	describe("userNote", () => {
		it("wraps the note verbatim, quotes and newlines unescaped", () => {
			formatResponse.userNote('a "b"\nc').should.equal(' The user wrote: "a "b"\nc"')
		})
	})

	describe("toolDeniedWithFeedback", () => {
		it("includes the feedback", () => {
			const result = formatResponse.toolDeniedWithFeedback("my feedback")
			result.should.containEql("my feedback")
			result.should.containEql("<feedback>")
		})
		it("handles empty feedback", () => {
			formatResponse.toolDeniedWithFeedback("").should.containEql("<feedback>")
		})
	})

	describe("missingToolParameterError", () => {
		it("includes parameter name and example", () => {
			const result = formatResponse.missingToolParameterError("path", "src/index.ts")
			result.should.containEql("path")
			result.should.containEql("src/index.ts")
		})
		it("handles missing example", () => {
			const result = formatResponse.missingToolParameterError("path")
			result.should.containEql("path")
		})
		it("handles empty parameter name", () => {
			formatResponse.missingToolParameterError("").should.be.a.String()
		})
	})

	describe("imageBlocks", () => {
		it("returns empty array for undefined", () => {
			formatResponse.imageBlocks(undefined).should.deepEqual([])
		})
		it("returns empty array for empty array", () => {
			formatResponse.imageBlocks([]).should.deepEqual([])
		})
		it("converts base64 strings to image blocks", () => {
			const blocks = formatResponse.imageBlocks(["data:image/png;base64,iVBORw0KGgo="])
			blocks.should.have.length(1)
			blocks[0].should.have.property("type", "image")
		})
	})

	describe("formatFilesList", () => {
		it("handles empty results", () => {
			const result = formatResponse.formatFilesList("/test", [], false)
			result.should.be.a.String()
		})
	})

	describe("createPrettyPatch", () => {
		it("generates a diff patch", () => {
			const patch = formatResponse.createPrettyPatch("test.ts", "old\n", "new\n")
			patch.should.containEql("-old")
		})
		it("handles undefined old content", () => {
			const patch = formatResponse.createPrettyPatch("test.ts", undefined, "new\n")
			patch.should.be.a.String()
		})
	})

	describe("noToolsUsed", () => {
		it("requires another tool-calling turn through the consolidated response contract", () => {
			for (const nativeToolCalls of [true, false]) {
				const reminder = formatResponse.noToolsUsed(nativeToolCalls)
				reminder.should.containEql("every response MUST include at least one tool call")
				reminder.should.containEql(`Use '${RESPOND_TOOL_NAME}'`)
				reminder.should.not.containEql(LegacyResponseTool.COMPLETE)
			}
		})
	})

	describe("tooManyMistakes", () => {
		it("returns a string without feedback", () => {
			formatResponse.tooManyMistakes().should.be.a.String()
		})
		it("includes feedback when provided", () => {
			formatResponse.tooManyMistakes("my feedback").should.containEql("my feedback")
		})
	})

	describe("writeToFileMissingContentError", () => {
		it("is byte-identical to the pre-change text when edit_file is enabled, at every failure tier", () => {
			formatResponse.writeToFileMissingContentError("a.ts", 1, withEditFile).should.equal(
				`Failed to write to 'a.ts': The 'content' parameter was empty. This typically happens when the file content is too large to generate in a single response, or when output token limits are reached before the content parameter is fully written.\n\n` +
					`Suggestions:\n` +
					`- If the file is large, try breaking down the task into smaller steps. Write a skeleton first, then fill in sections using edit_file.\n` +
					`- If the file already exists, prefer edit_file to make targeted edits instead of rewriting the entire file.\n` +
					`- Ensure the 'content' parameter contains the complete file content before closing the tool tag.\n\n`,
			)
			formatResponse.writeToFileMissingContentError("a.ts", 2, withEditFile).should.equal(
				`Failed to write to 'a.ts': The 'content' parameter was empty. This typically happens when the file content is too large to generate in a single response, or when output token limits are reached before the content parameter is fully written.\n\n` +
					`This is your 2nd failed attempt. The file content is likely too large to generate in one response. You must use a different strategy:\n\n` +
					`Recommended approaches:\n` +
					`1. **Use write_to_file with a minimal skeleton** (just the structure — imports, class/function signatures, no implementations), then use edit_file to fill in each section incrementally\n` +
					`2. **Use edit_file with smaller chunks** — if the file already exists, make targeted edits instead of rewriting the entire file\n` +
					`3. **Break the task into smaller steps** — write one function or section at a time\n\n` +
					`Do NOT attempt to write the full file content in a single write_to_file call again.`,
			)
			formatResponse.writeToFileMissingContentError("a.ts", 3, withEditFile).should.equal(
				`Failed to write to 'a.ts': The 'content' parameter was empty. This typically happens when the file content is too large to generate in a single response, or when output token limits are reached before the content parameter is fully written.\n\n` +
					`CRITICAL: You have failed to write this file 3 times in a row. You MUST change your approach — do NOT retry write_to_file for this file again.\n\n` +
					`Required action — choose ONE of these strategies:\n` +
					`1. **Create an empty file first, then use edit_file** to add content in small sections (recommended)\n` +
					`2. **Break the file into multiple smaller files** if architecturally appropriate\n` +
					`3. **Write a minimal skeleton** using write_to_file (just imports, class/function signatures, no implementations), then use edit_file to fill in each section one at a time\n\n` +
					`Each edit_file call should target a specific part of the file.`,
			)
		})

		it("never names edit_file and never forbids write_to_file outright when edit_file is disabled, at every failure tier", () => {
			for (const consecutiveFailures of [1, 2, 3]) {
				const message = formatResponse.writeToFileMissingContentError("a.ts", consecutiveFailures, withoutEditFile)
				message.should.not.match(/\bedit_file\b/)
				message.should.containEql("write_to_file")
				message.should.not.match(/do NOT retry write_to_file/)
			}
		})

		it("never advises several write_to_file calls on the same path when edit_file is disabled, since each one overwrites", () => {
			for (const tools of [withoutEditFile, writeOnly]) {
				for (const consecutiveFailures of [1, 2, 3]) {
					const message = formatResponse.writeToFileMissingContentError("a.ts", consecutiveFailures, tools)
					message.should.not.match(/skeleton|remaining section|additional write_to_file/i)
					message.should.containEql("smaller files")
					message.should.containEql("replaces the whole file")
				}
			}
		})

		it("offers appending with execute_command only when execute_command is in the request", () => {
			for (const consecutiveFailures of [1, 2, 3]) {
				formatResponse
					.writeToFileMissingContentError("a.ts", consecutiveFailures, withoutEditFile)
					.should.containEql("execute_command")
				formatResponse
					.writeToFileMissingContentError("a.ts", consecutiveFailures, writeOnly)
					.should.not.containEql("execute_command")
			}
		})
	})

	describe("fileContextWarning", () => {
		it("keeps the include_anchors/edit_file clause when edit_file is enabled", () => {
			formatResponse.fileContextWarning(["/a.ts"], true).should.containEql("include_anchors: true for edit_file coordinates")
		})

		it("drops the include_anchors/edit_file clause when edit_file is disabled", () => {
			const warning = formatResponse.fileContextWarning(["/a.ts"], false)
			warning.should.not.match(/\bedit_file\b/)
			warning.should.not.containEql("include_anchors")
			warning.should.containEql("Read the current state before modifying these files")
		})
	})
})
