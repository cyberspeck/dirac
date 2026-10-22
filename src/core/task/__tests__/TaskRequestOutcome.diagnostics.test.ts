import { strict as assert } from "node:assert"
import { afterEach, beforeEach, describe, it } from "mocha"
import sinon from "sinon"
import { Logger } from "@shared/services/Logger"
import { DiracAskResponse } from "@shared/WebviewMessage"
import { handleApiRequestError, type TaskRequestOutcomeContext } from "../TaskRequestOutcome"
import { TaskState } from "../TaskState"

const SENTINEL = "SENTINEL_PROMPT_7f3a"
const API_KEY = "sk-test-123"

interface CardInput {
	header?: string
	body?: string
}

function makeCtx(api: any, cards: CardInput[]): TaskRequestOutcomeContext {
	const taskState = new TaskState()
	taskState.apiErrorRetryAttempts = 3 // retries exhausted: go straight to the final cards
	return {
		taskState,
		messageStateHandler: {
			getDiracMessages: () => [],
			getLatestApiStatusMessage: () => undefined,
			findMessageIndexById: () => -1,
			patchApiStatusById: async () => {},
			saveDiracMessagesAndUpdateHistory: async () => {},
		} as any,
		taskMessenger: {
			createCard: async (card: CardInput) => {
				cards.push(card)
				return {
					update: async () => {},
					finalize: async () => {},
					waitForInteraction: async () => ({ response: DiracAskResponse.REJECT }),
				}
			},
			upsertText: async () => {},
		} as any,
		api,
		taskId: "task-1",
		mode: "act",
		executionProfile: "standalone" as any,
		postStateToWebview: async () => {},
		abortTask: async () => {},
		handleContextWindowExceededError: async () => {},
		reinitExistingTaskFromId: async () => {},
		attemptApiRequest: (() => {}) as any,
		recursivelyMakeDiracRequests: async () => true,
		handleEmptyAssistantResponse: async () => false,
	}
}

function params(error: unknown) {
	return {
		error,
		previousApiReqIndex: 0,
		lastApiReqIndex: 0,
		model: { id: "m1", info: {} },
		providerId: "openai",
		metricsManager: {} as any,
	}
}

const mismatchDiag = {
	endpoint: "https://192.0.2.28:11444/v1",
	profileMismatch: {
		profileName: "p1",
		profileUrl: "https://192.0.2.28:11444/v1",
		fieldUrl: "https://198.51.100.7:11434/v1",
	},
}

describe("handleApiRequestError diagnostics", () => {
	let errorLog: sinon.SinonStub

	beforeEach(() => {
		errorLog = sinon.stub(Logger, "error")
	})
	afterEach(() => {
		sinon.restore()
	})

	it("names endpoint, cause and profile mismatch on the failed-request card only", async () => {
		const cards: CardInput[] = []
		const ctx = makeCtx({ getEndpointDiagnostics: () => mismatchDiag }, cards)
		await handleApiRequestError(ctx, params({ message: "Connection error.", cause: { code: "ECONNREFUSED" } }))

		const failed = cards.find((c) => c.header === "API Request Failed")
		assert.ok(failed?.body?.includes("Endpoint: https://192.0.2.28:11444/v1 · cause: ECONNREFUSED"), failed?.body)
		assert.ok(failed?.body?.includes('Saved configuration "p1"'), failed?.body)
		const exhausted = cards.find((c) => c.header === "API Error (Retries Exhausted)")
		assert.ok(exhausted, "retries exhausted card present")
		assert.ok(!exhausted.body?.includes("Endpoint:"), exhausted.body)
	})

	it("uses a cause-only line for handlers without endpoint diagnostics", async () => {
		const cards: CardInput[] = []
		const ctx = makeCtx({}, cards)
		await handleApiRequestError(ctx, params({ message: "Connection error.", cause: { code: "ECONNREFUSED" } }))

		const failed = cards.find((c) => c.header === "API Request Failed")
		assert.ok(failed?.body?.includes("Cause: ECONNREFUSED"), failed?.body)
		assert.ok(!failed?.body?.includes("Endpoint:"), failed?.body)
	})

	it("adds the line to the authentication card as well", async () => {
		const cards: CardInput[] = []
		const ctx = makeCtx({ getEndpointDiagnostics: () => mismatchDiag }, cards)
		await handleApiRequestError(ctx, params({ message: "Unauthorized", status: 401, code: "invalid_api_key" }))

		const auth = cards.find((c) => c.header === "API Error (Authentication)")
		assert.ok(auth?.body?.includes("Endpoint: https://192.0.2.28:11444/v1 · cause: invalid_api_key"), auth?.body)
	})

	it("logs one line per failed attempt with the endpoint and no request content", async () => {
		const cards: CardInput[] = []
		const ctx = makeCtx(
			{
				getEndpointDiagnostics: () => ({
					...mismatchDiag,
					// a sanitised URL never carries credentials; the logger must not add any either
					endpoint: "https://192.0.2.28:11444/v1",
				}),
				options: { openAiApiKey: API_KEY },
			},
			cards,
		)
		const error = Object.assign(new Error(`Connection error. secret ${SENTINEL}`), {
			status: 502,
			code: "ECONNREFUSED",
			request_id: "req_1",
			details: { echoed: SENTINEL },
			request: { messages: [{ role: "user", content: SENTINEL }], headers: { authorization: `Bearer ${API_KEY}` } },
		})
		// message text must not reach the log, so keep the sentinel out of the message in the card assertions
		await handleApiRequestError(ctx, params(error))

		const calls = errorLog.getCalls().map((c) => c.args)
		const flattened = JSON.stringify(calls)
		assert.ok(!flattened.includes(SENTINEL), flattened)
		assert.ok(!flattened.includes("secret"), flattened)
		assert.ok(!flattened.includes(API_KEY), flattened)
		const matching = calls.filter((args) => /^\[API\] request failed provider=openai /.test(String(args[0])))
		assert.equal(matching.length, 1)
		assert.equal(
			matching[0][0],
			"[API] request failed provider=openai model=m1 endpoint=https://192.0.2.28:11444/v1 status=502 code=ECONNREFUSED request_id=req_1 mismatch=p1",
		)
		assert.equal(matching[0].length, 1)
	})

	it("logs dashes for missing fields", async () => {
		const cards: CardInput[] = []
		const ctx = makeCtx({}, cards)
		await handleApiRequestError(ctx, params({ message: "boom" }))

		const lines = errorLog.getCalls().map((c) => String(c.args[0]))
		assert.deepEqual(lines, ["[API] request failed provider=openai model=m1 endpoint=- status=- code=- request_id=-"])
	})
})
