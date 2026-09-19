import "should"
import { describe, it } from "mocha"
import { buildShowOptions } from "../showTextDocument"

describe("buildShowOptions", () => {
	it("selects the requested line when one is supplied", () => {
		const options = buildShowOptions({ line: 42, preview: false })
		options.selection!.start.line.should.equal(41)
		options.selection!.end.line.should.equal(41)
	})

	it("omits a selection when no line is supplied", () => {
		buildShowOptions({ preview: false }).should.not.have.property("selection")
	})

	it("clamps a non-positive line to the first line", () => {
		buildShowOptions({ line: 0, preview: false }).selection!.start.line.should.equal(0)
	})
})
