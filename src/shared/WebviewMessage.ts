export interface WebviewMessage {
	type: "grpc_request" | "grpc_request_cancel"
	grpc_request?: GrpcRequest
	grpc_request_cancel?: GrpcCancel
}

export type GrpcRequest = {
	service: string
	method: string
	message: any // JSON serialized protobuf message
	request_id: string // For correlating requests and responses
	is_streaming: boolean // Whether this is a streaming request
}

export type GrpcCancel = {
	request_id: string // ID of the request to cancel
}

export enum DiracAskResponse {
	APPROVE = "approve",
	REJECT = "reject",
	MESSAGE = "message",
	EDIT = "edit",
	VIEW = "view",
	UNDO = "undo",
}

// Sent as `responseType: MESSAGE, value: SKIP_REST_VALUE` (empty text) to decline the current
// tool call and every remaining call in the turn, then hand the turn back to the model.
export const SKIP_REST_VALUE = "skip_rest"

export type DiracCheckpointRestore = "task" | "workspace" | "taskAndWorkspace"

export type TaskFeedbackType = "thumbs_up" | "thumbs_down"
