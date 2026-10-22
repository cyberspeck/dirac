import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { DiracError } from "../DiracError"

const diag = { endpoint: "https://192.0.2.28:11444/v1" }

describe("DiracError diagnostics", () => {
	it("exposes the cause code from the nested cause", () => {
		const error = new DiracError({ message: "Connection error.", cause: { code: "ECONNREFUSED" } })
		assert.equal(error.causeCode, "ECONNREFUSED")
	})

	it("appends the endpoint and cause line to the display message", () => {
		const error = new DiracError({ message: "Connection error.", cause: { code: "ECONNREFUSED" } })
		assert.equal(
			error.toDiagnosticDisplayMessage(diag),
			"Connection error.\n\nEndpoint: https://192.0.2.28:11444/v1 · cause: ECONNREFUSED",
		)
	})

	it("equals the plain display message when there is no diagnostics and no code", () => {
		const error = new DiracError({ message: "Something broke." })
		assert.equal(error.causeCode, undefined)
		assert.equal(error.toDiagnosticDisplayMessage(), error.toDisplayMessage())
	})

	it("shows only the cause when there are no endpoint diagnostics", () => {
		const error = new DiracError({ message: "Connection error.", cause: { code: "ECONNREFUSED" } })
		assert.equal(error.toDiagnosticDisplayMessage(), "Connection error.\n\nCause: ECONNREFUSED")
	})

	it("keeps the auth hint and then appends the line", () => {
		const error = new DiracError({ message: "Unauthorized", status: 401 })
		assert.equal(
			error.toDiagnosticDisplayMessage(diag),
			`${error.toDisplayMessage()}\n\nEndpoint: https://192.0.2.28:11444/v1`,
		)
		assert.ok(error.toDiagnosticDisplayMessage(diag).includes("Please verify your API key configuration."))
	})
})
