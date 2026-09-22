import type { UtilityPermissionRequest } from "@core/permissions/UtilityPermissionDecisionService"
import { resolveWorkspacePath } from "@core/workspace"
import { CardStatus, isFinalStatus } from "@shared/ExtensionMessage"
import { DiracIcon } from "@shared/icons"
import { DiracAskResponse } from "@shared/WebviewMessage"
import type { CardParams, ICardHandle, IEditorTrait, IInteractionTrait, IUITrait } from "../../interfaces/IToolEnvironment"
import type { TaskConfig } from "../../types/TaskConfig"
import { ApprovedPermissionCardHandle } from "../ApprovedPermissionCardHandle"
import { CardHandle } from "../CardHandle"

// Builds the UI trait — text streaming and card creation.
export function buildUiTrait(
	config: TaskConfig,
	createCardFn: (params: CardParams) => Promise<ICardHandle>,
	createManualInteractionCardFn: (params: CardParams) => Promise<ICardHandle>,
): IUITrait {
	return {
		createCard: createCardFn,
		createManualInteractionCard: createManualInteractionCardFn,
		upsertText: async (text: string, isReasoning?: boolean, role?: "user" | "assistant") => {
			const visibleText = config.agentIdentity && role !== "user" ? `**${config.agentIdentity.name}:** ${text}` : text
			await config.taskMessenger.upsertText(visibleText, isReasoning, undefined, undefined, role, config.agentIdentity)
		},
		streamText: async (type: "markdown" | "reasoning") => {
			return await config.taskMessenger.streamText(type)
		},
		publishState: async () => await config.callbacks.postStateToWebview(),
	}
}

export function buildInteractionTrait(
	config: TaskConfig,
	createCardFn: (params: CardParams) => Promise<ICardHandle>,
	getEditor?: () => IEditorTrait,
): IInteractionTrait {
	return {
		askPermission: async (message, preview) => {
			const card = await createCardFn({
				header: "Permission Request",
				body: message,
				requireApproval: true,
				permissionRequestKind: preview?.manualOnly ? "manual_tool" : "tool",
				collapsed: false,
				...(preview?.diffs ? { diffs: preview.diffs, renderType: "diff" } : {}),
				...(preview?.locations ? { locations: preview.locations } : {}),
				...(preview?.category ? { permissionCategory: preview.category } : {}),
				...(preview?.rawInput ? { rawInput: preview.rawInput } : {}),
			})
			// A card's diffs are never rendered in the chat (F-016); the builtins show theirs in the VS Code
			// diff editor instead (WriteToFileTool.ts:180-190). Do the same for every caller, and only when a
			// human will actually answer — an auto-approved card must not flash an editor open.
			const editor = getEditor?.()
			const reviewFiles =
				editor && preview?.diffs?.length && card.requiresUserInteraction !== false
					? preview.diffs.map((d) => {
							const resolved = resolveWorkspacePath(config, d.path, "InteractionTrait.askPermission")
							const absolutePath = typeof resolved === "string" ? resolved : resolved.absolutePath
							return { absolutePath, displayPath: d.path, content: d.newText, originalContent: d.oldText }
						})
					: undefined
			let result: Awaited<ReturnType<ICardHandle["waitForInteraction"]>>
			try {
				if (reviewFiles) {
					await editor!.showReview(reviewFiles)
					await editor!.scrollToFirstDiff()
				}
				result = await card.waitForInteraction()
			} finally {
				if (reviewFiles) await editor!.hideReview()
			}
			// Finalize here, not in the tool. ToolExecutorCoordinator throws
			// "left nonterminal card(s)" on any card still WAITING_FOR_INPUT when the tool
			// returns, and a custom tool has no reason to know that — every custom tool that
			// asked for permission and was answered by hand hit it (2026-09-22, F-015).
			// Mirrors WriteToFileTool.ts:209-218: a message instead of an answer is SKIPPED.
			if (!isFinalStatus(card.status)) {
				if (result.action === DiracAskResponse.MESSAGE) {
					await card.finalize(CardStatus.SKIPPED)
				} else {
					await card.finalize(result.action === DiracAskResponse.APPROVE ? CardStatus.SUCCESS : CardStatus.CANCELLED)
				}
			}
			return {
				approved: result.action === DiracAskResponse.APPROVE,
				action: result.action,
				value: result.value,
				text: result.text,
				images: result.images as string[] | undefined,
				files: result.files as string[] | undefined,
				userEdits: result.userEdits,
				card,
			}
		},
	}
}

// Resolves explicitly classified tool permissions before falling back to the displayed-card path.
export async function createCardFromMessenger(
	config: TaskConfig,
	params: CardParams,
	tracker: CardHandle[],
): Promise<ICardHandle> {
	const { permissionRequestKind, permissionCategory, ...cardParams } = params
	if (permissionRequestKind === undefined) {
		return createDisplayedCardFromMessenger(config, cardParams, tracker)
	}

	const isAutoApproved = () => isUnrestrictedToolApproval(config)
	if (isAutoApproved()) {
		return new ApprovedPermissionCardHandle(cardParams)
	}
	if (permissionRequestKind === "manual_tool") {
		return createDisplayedCardFromMessenger(config, cardParams, tracker, false, isAutoApproved)
	}

	// A tool outside the DiracDefaultTool enum cannot be classified by shouldAutoApproveTool, so it
	// declares which checkbox governs it instead. Checked before the Utility model: an explicit
	// user setting should not be second-guessed by a model.
	if (permissionCategory) {
		const paths = (cardParams.locations ?? []).map((location) => location.path)
		if (await config.autoApprover.shouldAutoApproveCategory(permissionCategory, paths)) {
			// Publish the approval, as the Utility path does. An auto-approved write that leaves no
			// card at all is a change the user was never shown.
			await publishPermissionApprovalCard(
				config,
				cardParams,
				tracker,
				createUtilityPermissionRequest(config, cardParams),
				permissionCategory === "edit"
					? 'Auto-approved by the "Edit project files" setting.'
					: 'Auto-approved by the "Read project files" setting.',
			)
			return new ApprovedPermissionCardHandle(cardParams)
		}
	}

	const binding = config.permissionDecisionBinding
	if (!binding) return createDisplayedCardFromMessenger(config, cardParams, tracker, true, isAutoApproved)

	const request = createUtilityPermissionRequest(config, cardParams)
	const decision = await binding.service.decide(request, config.taskState.abortSignal)
	if (isAutoApproved()) {
		return new ApprovedPermissionCardHandle(cardParams)
	}

	const currentBinding = config.permissionDecisionBinding
	if (!currentBinding || currentBinding.configurationRevision !== binding.configurationRevision) {
		return createDisplayedCardFromMessenger(config, cardParams, tracker, true, isAutoApproved)
	}
	if (decision.decision === "escalate") {
		return createDisplayedCardFromMessenger(config, cardParams, tracker, true, isAutoApproved)
	}
	await publishPermissionApprovalCard(config, cardParams, tracker, request, decision.reason)
	return new ApprovedPermissionCardHandle(cardParams)
}

function isUnrestrictedToolApproval(config: TaskConfig): boolean {
	return config.autoApprover.isUnrestrictedAutoApprove()
}

function createUtilityPermissionRequest(config: TaskConfig, params: CardParams): UtilityPermissionRequest {
	const toolName = config.toolUse?.name ?? params.toolName ?? "unknown"
	const includesResolvedDiffs = toolName === "edit_file" || toolName === "edit_ast"
	return {
		toolCall: {
			name: toolName,
			arguments: structuredClone(config.toolUse?.params ?? {}),
		},
		permission: {
			header: params.header,
			...(params.locations ? { locations: structuredClone(params.locations) } : {}),
			...(includesResolvedDiffs && params.diffs ? { diffs: structuredClone(params.diffs) } : {}),
		},
		runtime: {
			cwd: config.cwd,
			mode: config.mode,
			isSubagent: config.isSubagentExecution,
		},
	}
}

async function publishPermissionApprovalCard(
	config: TaskConfig,
	params: CardParams,
	tracker: CardHandle[],
	request: UtilityPermissionRequest,
	reason: string,
): Promise<void> {
	// Name the tool in the header and keep the original request in the body. Without them the
	// row reads "Auto Approved · Permission Request" and expands to a reason — the user is never
	// told which tool ran or what it asked for (maintainer, 2026-09-22).
	const requestBody = params.body?.trim()
	await createDisplayedCardFromMessenger(
		config,
		{
			header: `Auto Approved · ${request.toolCall.name}`,
			toolName: "permission_approval",
			icon: DiracIcon.PERMISSION_APPROVAL,
			status: CardStatus.SUCCESS,
			renderType: "markdown",
			body: `${requestBody ? `${requestBody}\n\n` : ""}**Result:** Auto Approved\n\n**Reason:** ${reason}`,
			rawInput: { tool: request.toolCall.name },
			rawOutput: { decision: "approve", reason, approvedTool: request.toolCall.name },
			locations: params.locations,
			collapsed: true,
		},
		tracker,
		false,
	)
}
/** Creates a displayed interaction that bypasses every automatic approval policy. */
export async function createManualInteractionCardFromMessenger(
	config: TaskConfig,
	params: CardParams,
	tracker: CardHandle[],
): Promise<ICardHandle> {
	const { permissionRequestKind: _permissionRequestKind, ...cardParams } = params
	return createDisplayedCardFromMessenger(config, cardParams, tracker, false)
}

// Creates a card via taskMessenger and wraps the protocol handle in a CardHandle.
async function createDisplayedCardFromMessenger(
	config: TaskConfig,
	params: CardParams,
	tracker: CardHandle[],
	allowYoloAutoApproval = true,
	isAutoApproved?: () => boolean,
): Promise<ICardHandle> {
	const autoApprovedAction =
		params.requireApproval && ((allowYoloAutoApproval && config.yoloModeToggled) || isAutoApproved?.())
			? (params.actions?.find((candidate) => candidate.primary)?.value ?? DiracAskResponse.APPROVE)
			: undefined
	const liveAutoApprovedAction = isAutoApproved
		? () =>
			isAutoApproved()
				? (params.actions?.find((candidate) => candidate.primary)?.value ?? DiracAskResponse.APPROVE)
				: undefined
		: undefined
	const displayedParams = autoApprovedAction
		? {
			...params,
			status: params.status === CardStatus.WAITING_FOR_INPUT ? CardStatus.RUNNING : params.status,
			requireApproval: false,
			requireFeedback: false,
			feedbackPlaceholder: undefined,
			actions: undefined,
		}
		: params
	const messengerParams = !autoApprovedAction && isAutoApproved ? { ...displayedParams, isAutoApproved } : displayedParams
	const handle = await config.taskMessenger.createCard(messengerParams)
	const adapterHandle = new CardHandle(handle, autoApprovedAction, liveAutoApprovedAction)
	tracker.push(adapterHandle)
	return adapterHandle
}
