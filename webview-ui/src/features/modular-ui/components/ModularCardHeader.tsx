import { Card, CardStatus, isFinalStatus } from "@shared/ExtensionMessage"
import { readSubagentCardData } from "@shared/subagents"
import { OpenFileAtLineRequest } from "@shared/proto/dirac/common"
import { extractFirstPath } from "@shared/string"
import { cn } from "@/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { FileServiceClient } from "@/shared/api/grpc-client"
import { ChevronDownIcon, ChevronRightIcon, ExternalLinkIcon } from "lucide-react"
import { DynamicIcon } from "lucide-react/dynamic"
import { CARD_DECORATORS } from "../decorators"
import { CardStatusIcon } from "./CardStatusIcon"
import { SubagentAvatar } from "./SubagentAvatar"
import { getStatusTextColorClass } from "../utils/cardUtils"
import React, { useEffect, useMemo, useState } from "react"

interface ModularCardHeaderProps {
	card: Card
	contentId: string
	isCollapsed: boolean
	onToggleCollapse: () => void
	onAction?: (value: string) => void
}

export const ModularCardHeader: React.FC<ModularCardHeaderProps> = ({
	card,
	contentId,
	isCollapsed,
	onToggleCollapse,
	onAction,
}) => {
	const { header, icon, status } = card
	const isTerminal = isFinalStatus(status)
	const subagentData = readSubagentCardData(card)
	const isSubagentCard = subagentData !== undefined
	const [currentTime, setCurrentTime] = useState(() => Date.now())
	const filePath = getCardFilePath(card)
	const decorators = useMemo(() => CARD_DECORATORS.filter((decorator) => decorator.shouldApply(card)), [card])
	const iconSizeClass = "size-3.5"
	const elapsedTime = getSubagentCardElapsedTime(card, currentTime)

	useEffect(() => {
		if (!isSubagentCard || isTerminal || card.startTime === undefined) return

		setCurrentTime(Date.now())
		const timer = setInterval(() => setCurrentTime(Date.now()), 1_000)
		return () => clearInterval(timer)
	}, [card.startTime, isSubagentCard, isTerminal])

	return (
		<div
			data-terminal={isTerminal}
			className={cn(
				"modular-card-header flex min-w-0 items-center gap-1.5 text-base leading-5",
				isCollapsed ? "px-1.5 py-1" : "px-2.5 py-1.5",
				isTerminal && "opacity-70",
			)}>
			<button
				aria-controls={contentId}
				aria-expanded={!isCollapsed}
				className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-sm bg-transparent px-1 text-left text-inherit hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-ring"
				onClick={onToggleCollapse}
				title={isCollapsed ? `Expand ${header}` : `Collapse ${header}`}
				type="button">
				{subagentData && <SubagentAvatar agentId={subagentData.id} agentName={subagentData.name} />}

				<span className="shrink-0 leading-none" aria-hidden="true">
					{icon ? (
						<DynamicIcon name={icon as any} className={cn(iconSizeClass, getStatusTextColorClass(status))} />
					) : (
						<CardStatusIcon status={status} className={iconSizeClass} />
					)}
				</span>

				<span className={cn("min-w-0 flex-1 font-medium", isCollapsed ? "truncate" : "break-all whitespace-normal")}>
					{header}
				</span>

				{elapsedTime && (
					<span aria-label={`Subagent runtime ${elapsedTime}`} className="shrink-0 font-mono text-xs font-normal text-muted-foreground">
						{elapsedTime}
					</span>
				)}

				{status === CardStatus.WAITING_FOR_INPUT && (
					<Badge variant="warning" className="shrink-0 px-1.5 py-0 text-xs leading-4">
						Awaiting Input
					</Badge>
				)}

				<span className="shrink-0 opacity-60 leading-none" aria-hidden="true">
					{isCollapsed ? <ChevronRightIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
				</span>
			</button>

			{filePath && !decorators.some((decorator) => decorator.renderHeaderActions) && (
				<button
					aria-label={`Open ${filePath}`}
					className="shrink-0 rounded-sm p-1 opacity-60 transition-opacity hover:bg-foreground/10 hover:opacity-100 focus-visible:opacity-100"
					onClick={() =>
						FileServiceClient.openFileRelativePath(
							OpenFileAtLineRequest.create({ path: filePath, line: card.locations?.[0]?.line }),
						)
					}
					title={`Open ${filePath}`}
					type="button">
					<ExternalLinkIcon className="size-2.5" />
				</button>
			)}

			{decorators.map((decorator) => (
				<React.Fragment key={decorator.id}>{decorator.renderHeaderActions?.(card, onAction)}</React.Fragment>
			))}
		</div>
	)
}
export function getCardFilePath(card: Card): string | undefined {
	return card.locations?.[0]?.path ?? extractFirstPath(card.header) ?? undefined
}


export function getSubagentCardElapsedTime(card: Card, now = Date.now()): string | undefined {
	if (!readSubagentCardData(card) || card.startTime === undefined) return undefined

	const stopTime = isFinalStatus(card.status) ? (card.endTime ?? now) : now
	const elapsedSeconds = Math.max(0, Math.floor((stopTime - card.startTime) / 1_000))
	const minutes = Math.floor(elapsedSeconds / 60)
	const seconds = elapsedSeconds % 60
	return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}
