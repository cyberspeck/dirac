import {
	type ResponseArguments,
	ResponseOperation,
	ResponseShapeError,
	validateResponseShape,
} from "@shared/responseTool"
import type { IToolEnvironment } from "../../interfaces/IToolEnvironment"

export class ResponseArgumentsError extends Error {
	constructor(message: string, env: IToolEnvironment) {
		super(message)
		env.orchestration.setTaskState("consecutiveMistakeCount", env.orchestration.getTaskState("consecutiveMistakeCount") + 1)
	}
}

export function validateResponseArguments(args: unknown, env: IToolEnvironment): ResponseArguments {
	let request: ResponseArguments
	try {
		request = validateResponseShape(args)
	} catch (error) {
		if (error instanceof ResponseShapeError) throw new ResponseArgumentsError(error.message, env)
		throw error
	}
	// `complete` in Plan Mode is the model's final answer with the wrong verb. Rejecting it made the model
	// regenerate the whole answer as `plan`: two full generations for one reply. Both take only `text`,
	// so the remap loses nothing. The reverse stays rejected: `plan` in Act Mode remapped to `complete`
	// would present a proposal as finished work.
	if (request.operation === ResponseOperation.COMPLETE && env.config.mode === "plan" && !env.config.isSubagentExecution) {
		request = { ...request, operation: ResponseOperation.PLAN }
	}
	validateMode(request.operation, env)

	if (request.operation !== ResponseOperation.PROGRESS) env.orchestration.setTaskState("consecutiveMistakeCount", 0)
	return request
}

function validateMode(operation: ResponseOperation, env: IToolEnvironment): void {
	if (env.config.isSubagentExecution) return
	if (operation === ResponseOperation.PLAN && env.config.mode !== "plan") {
		throw new ResponseArgumentsError("The 'plan' response operation is available only in Plan Mode.", env)
	}
}
