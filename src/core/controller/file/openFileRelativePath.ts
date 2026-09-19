import { workspaceResolver } from "@core/workspace"
import { openFile as openFileIntegration } from "@integrations/misc/open-file"
import { Empty, OpenFileAtLineRequest } from "@shared/proto/dirac/common"
import { getWorkspacePath } from "@utils/path"
import { Logger } from "@/shared/services/Logger"
import { Controller } from ".."

/**
 * Opens a file in the editor by a relative path
 * @param controller The controller instance
 * @param request The request message containing the relative file path and an optional 1-based line
 * @returns Empty response
 */
export async function openFileRelativePath(_controller: Controller, request: OpenFileAtLineRequest): Promise<Empty> {
	const workspacePath = await getWorkspacePath()

	if (!workspacePath) {
		Logger.error("Error in openFileRelativePath: No workspace path available")
		return Empty.create()
	}

	if (request.path) {
		// Resolve the relative path to absolute path
		const resolvedPath = workspaceResolver.resolveWorkspacePath(
			workspacePath,
			request.path,
			"Controller.openFileRelativePath",
		)
		const absolutePath = typeof resolvedPath === "string" ? resolvedPath : resolvedPath.absolutePath

		// Open the file using the existing integration
		openFileIntegration(absolutePath, false, false, request.line)
	}

	return Empty.create()
}
