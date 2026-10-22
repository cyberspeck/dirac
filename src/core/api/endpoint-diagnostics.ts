/**
 * Diagnostics describing which endpoint an OpenAI-compatible handler talks to.
 * All URLs are already sanitised (origin + pathname only).
 */
export interface EndpointDiagnostics {
	endpoint: string
	profileMismatch?: { profileName: string; profileUrl: string; fieldUrl: string }
}

/**
 * Reduce a URL to `origin + pathname` without a trailing slash, so it is safe to show or log.
 * Unparsable input gets a best-effort cleanup: query, hash and userinfo are dropped.
 * Never throws.
 */
export function sanitizeEndpoint(url: string | undefined): string {
	const trimmed = (url ?? "").trim()
	if (!trimmed) {
		return ""
	}
	try {
		const parsed = new URL(trimmed)
		// Only trust origin for http(s)/ws(s). A scheme-less "host:port/path" parses with the host as scheme
		// and an opaque origin, and "blob:https://user:pw@host/x" has an origin that still carries userinfo.
		if (/^(https?|wss?):$/.test(parsed.protocol) && parsed.origin !== "null") {
			return (parsed.origin + parsed.pathname).replace(/\/+$/, "")
		}
	} catch {
		// fall through to the best-effort cleanup
	}
	// Drop userinfo first, up to the last "@" anywhere: a password may itself contain "?", "#" or "/".
	// Over-redacting (for example losing a scheme prefix) is acceptable, leaking userinfo is not.
	let result = trimmed
	const at = result.lastIndexOf("@")
	if (at >= 0) {
		result = result.slice(at + 1)
	}
	const cut = result.search(/[?#]/)
	if (cut >= 0) {
		result = result.slice(0, cut)
	}
	return result.replace(/\/+$/, "")
}

export function buildOpenAiEndpointDiagnostics(args: {
	profile?: { name: string; baseUrl: string }
	fieldUrl?: string
	resolvedUrl?: string
}): EndpointDiagnostics | undefined {
	const endpoint = sanitizeEndpoint(args.resolvedUrl)
	if (!endpoint) {
		return undefined
	}
	const diagnostics: EndpointDiagnostics = { endpoint }
	const fieldUrl = sanitizeEndpoint(args.fieldUrl)
	if (args.profile && fieldUrl) {
		const profileUrl = sanitizeEndpoint(args.profile.baseUrl)
		if (profileUrl !== fieldUrl) {
			diagnostics.profileMismatch = { profileName: args.profile.name, profileUrl, fieldUrl }
		}
	}
	return diagnostics
}

export function formatEndpointDiagnostics(diag: EndpointDiagnostics | undefined, causeCode?: string): string {
	const lines: string[] = []
	if (diag?.endpoint) {
		lines.push(`Endpoint: ${diag.endpoint}${causeCode ? ` · cause: ${causeCode}` : ""}`)
	} else if (causeCode) {
		lines.push(`Cause: ${causeCode}`)
	}
	if (diag?.profileMismatch) {
		const { profileName, profileUrl, fieldUrl } = diag.profileMismatch
		lines.push(
			`Saved configuration "${profileName}" uses ${profileUrl}; the Base URL field shows ${fieldUrl}. Re-save the configuration.`,
		)
	}
	return lines.join("\n")
}
