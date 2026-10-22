import { afterEach, beforeEach, describe, it } from "mocha"
import "should"
import sinon from "sinon"
import { Logger } from "@/shared/services/Logger"
import {
	__resetProfileMismatchWarningsForTest,
	buildOpenAiEndpointDiagnostics,
	formatEndpointDiagnostics,
	sanitizeEndpoint,
	warnOnProfileMismatch,
} from "../endpoint-diagnostics"

describe("endpoint diagnostics", () => {
	describe("sanitizeEndpoint", () => {
		it("strips userinfo, query, hash and trailing slash from a parsable URL", () => {
			sanitizeEndpoint("https://user:secret@192.0.2.10:11444/v1/?key=abc#x").should.equal("https://192.0.2.10:11444/v1")
		})

		it("trims surrounding whitespace and the trailing slash", () => {
			sanitizeEndpoint(" https://192.0.2.10:11444/v1/ ").should.equal("https://192.0.2.10:11444/v1")
		})

		it("makes a best effort on a URL without scheme", () => {
			sanitizeEndpoint("user:pw@192.0.2.10:11434/v1?k=1").should.equal("192.0.2.10:11434/v1")
		})

		it("drops userinfo before cutting the query or hash in the fallback", () => {
			for (const input of ["user:p#w@192.0.2.10:11434/v1", "user:p?w@192.0.2.10:11434/v1?k=1"]) {
				const out = sanitizeEndpoint(input)
				out.should.equal("192.0.2.10:11434/v1")
				out.should.not.containEql("user")
				out.should.not.containEql("p")
				out.should.not.containEql("w")
			}
		})

		it("drops userinfo containing a slash in the fallback", () => {
			sanitizeEndpoint("user:p/w@192.0.2.10:11434/v1").should.equal("192.0.2.10:11434/v1")
			const out = sanitizeEndpoint("https://user:p/w@192.0.2.10:11434/v1")
			out.should.not.containEql("user")
			out.should.not.containEql("p/w")
			out.should.endWith("192.0.2.10:11434/v1")
		})

		it("returns an empty string for blank or missing input", () => {
			sanitizeEndpoint("").should.equal("")
			sanitizeEndpoint("   ").should.equal("")
			sanitizeEndpoint(undefined).should.equal("")
		})
	})

	describe("buildOpenAiEndpointDiagnostics", () => {
		const profile = (baseUrl: string) => ({ name: "p1", baseUrl })

		it("reports no mismatch when only a trailing slash differs", () => {
			const diag = buildOpenAiEndpointDiagnostics({
				profile: profile("https://192.0.2.10:11444/v1/"),
				fieldUrl: "https://192.0.2.10:11444/v1",
				resolvedUrl: "https://192.0.2.10:11444/v1/",
			})
			diag!.should.eql({ endpoint: "https://192.0.2.10:11444/v1" })
		})

		it("reports a mismatch with sanitised URLs and the profile name", () => {
			const diag = buildOpenAiEndpointDiagnostics({
				profile: profile("https://user:secret@192.0.2.28:11444/v1?key=abc"),
				fieldUrl: "https://192.0.2.22:11444/v1",
				resolvedUrl: "https://user:secret@192.0.2.28:11444/v1?key=abc",
			})
			diag!.should.eql({
				endpoint: "https://192.0.2.28:11444/v1",
				profileMismatch: {
					profileName: "p1",
					profileUrl: "https://192.0.2.28:11444/v1",
					fieldUrl: "https://192.0.2.22:11444/v1",
				},
			})
		})

		it("returns only the endpoint when there is no profile", () => {
			buildOpenAiEndpointDiagnostics({
				fieldUrl: "https://192.0.2.22:11444/v1",
				resolvedUrl: "https://192.0.2.22:11444/v1",
			})!.should.eql({ endpoint: "https://192.0.2.22:11444/v1" })
		})

		it("does not flag a mismatch when the field is blank", () => {
			buildOpenAiEndpointDiagnostics({
				profile: profile("https://192.0.2.28:11444/v1"),
				fieldUrl: "  ",
				resolvedUrl: "https://192.0.2.28:11444/v1",
			})!.should.eql({ endpoint: "https://192.0.2.28:11444/v1" })
		})

		it("returns undefined when the resolved URL is blank", () => {
			;(buildOpenAiEndpointDiagnostics({ resolvedUrl: "" }) === undefined).should.be.true()
			;(buildOpenAiEndpointDiagnostics({ resolvedUrl: undefined }) === undefined).should.be.true()
		})
	})

	describe("formatEndpointDiagnostics", () => {
		it("formats the endpoint with a cause code", () => {
			formatEndpointDiagnostics({ endpoint: "https://192.0.2.28:11444/v1" }, "ECONNREFUSED").should.equal(
				"Endpoint: https://192.0.2.28:11444/v1 · cause: ECONNREFUSED",
			)
		})

		it("adds a second line on a mismatch", () => {
			formatEndpointDiagnostics(
				{
					endpoint: "https://192.0.2.28:11444/v1",
					profileMismatch: {
						profileName: "p1",
						profileUrl: "https://192.0.2.28:11444/v1",
						fieldUrl: "https://192.0.2.22:11444/v1",
					},
				},
				"ECONNREFUSED",
			).should.equal(
				'Endpoint: https://192.0.2.28:11444/v1 · cause: ECONNREFUSED\nSaved configuration "p1" uses https://192.0.2.28:11444/v1; the Base URL field shows https://192.0.2.22:11444/v1. Re-save the configuration.',
			)
		})

		it("formats the endpoint alone without a cause code", () => {
			formatEndpointDiagnostics({ endpoint: "https://192.0.2.28:11444/v1" }).should.equal(
				"Endpoint: https://192.0.2.28:11444/v1",
			)
		})

		it("formats a cause code alone", () => {
			formatEndpointDiagnostics(undefined, "ETIMEDOUT").should.equal("Cause: ETIMEDOUT")
		})

		it("returns an empty string when there is nothing to show", () => {
			formatEndpointDiagnostics(undefined, undefined).should.equal("")
		})
	})

	describe("warnOnProfileMismatch", () => {
		let warn: sinon.SinonStub
		const mismatch = (fieldUrl: string) => ({
			endpoint: "https://192.0.2.28:11444/v1",
			profileMismatch: { profileName: "p1", profileUrl: "https://192.0.2.28:11444/v1", fieldUrl },
		})

		beforeEach(() => {
			__resetProfileMismatchWarningsForTest()
			warn = sinon.stub(Logger, "warn")
		})

		afterEach(() => {
			warn.restore()
			__resetProfileMismatchWarningsForTest()
		})

		it("logs once per distinct mismatch", () => {
			warnOnProfileMismatch(mismatch("https://192.0.2.22:11444/v1"))
			warnOnProfileMismatch(mismatch("https://192.0.2.22:11444/v1"))
			warn.callCount.should.equal(1)
			warnOnProfileMismatch(mismatch("https://192.0.2.23:11444/v1"))
			warn.callCount.should.equal(2)
		})

		it("logs the profile name and sanitised URLs only", () => {
			warnOnProfileMismatch(mismatch("https://192.0.2.22:11444/v1"))
			const message = String(warn.firstCall.args[0])
			message.should.containEql("p1")
			message.should.containEql("https://192.0.2.28:11444/v1")
			message.should.containEql("https://192.0.2.22:11444/v1")
		})

		it("does nothing without a mismatch", () => {
			warnOnProfileMismatch(undefined)
			warnOnProfileMismatch({ endpoint: "https://192.0.2.28:11444/v1" })
			warn.callCount.should.equal(0)
		})
	})
})
