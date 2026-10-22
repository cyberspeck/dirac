import { afterEach, beforeEach, describe, it } from "mocha"
import "should"
import sinon from "sinon"
import { Logger } from "@/shared/services/Logger"
import { __resetProfileMismatchWarningsForTest, warnOnProfileMismatch } from "../endpoint-mismatch-warning"

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
