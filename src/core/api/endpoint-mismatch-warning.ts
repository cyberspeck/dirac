import { Logger } from "@/shared/services/Logger"
import type { EndpointDiagnostics } from "./endpoint-diagnostics"

const warnedProfileMismatches = new Set<string>()

/**
 * Warn once per extension session per distinct mismatch. The handler is rebuilt per request,
 * so there is no stable per-task hook to dedupe on.
 */
export function warnOnProfileMismatch(diag: EndpointDiagnostics | undefined): void {
	const mismatch = diag?.profileMismatch
	if (!mismatch) {
		return
	}
	const key = `${mismatch.profileName}|${mismatch.profileUrl}|${mismatch.fieldUrl}`
	if (warnedProfileMismatches.has(key)) {
		return
	}
	warnedProfileMismatches.add(key)
	Logger.warn(
		`OpenAI-compatible profile "${mismatch.profileName}" uses ${mismatch.profileUrl} but the Base URL field shows ${mismatch.fieldUrl}; requests go to the profile URL.`,
	)
}

export function __resetProfileMismatchWarningsForTest(): void {
	warnedProfileMismatches.clear()
}
