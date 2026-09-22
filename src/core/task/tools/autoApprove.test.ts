import assert from "node:assert/strict"
import { SETTINGS_DEFAULTS, type Settings } from "@shared/storage/state-keys"
import { DiracDefaultTool } from "@shared/tools"
import { afterEach, describe, it } from "mocha"
import sinon from "sinon"
import { HostProvider } from "@/hosts/host-provider"
import { AutoApprove } from "./autoApprove"

function settings(): Settings {
	return structuredClone(SETTINGS_DEFAULTS) as Settings
}

function commandPermissionController(result: { allowed: boolean; reason: string; matchedPattern?: string }) {
	return { validateTool: sinon.stub().returns(result) }
}

function stubWorkspace(workspacePath = "/workspace"): void {
	sinon.stub(HostProvider, "workspace").value({
		getWorkspacePaths: sinon.stub().callsFake(async () => ({ paths: [workspacePath] })),
	})
}

describe("AutoApprove.resolveToolPathPermission", () => {
	afterEach(() => sinon.restore())

	it("keeps external writes manual-only in unrestricted mode", async () => {
		stubWorkspace()
		const currentSettings = settings()
		currentSettings.yoloModeToggled = true
		const permissions = commandPermissionController({ allowed: true, reason: "no_config" })
		const autoApprove = new AutoApprove(permissions as any, currentSettings, false)

		assert.equal(await autoApprove.resolveToolPathPermission(DiracDefaultTool.FILE_NEW, "/outside/file.ts"), "manual_only")
		sinon.assert.notCalled(permissions.validateTool)
	})

	it("keeps explicit deny rules manual-only in unrestricted mode", async () => {
		const currentSettings = settings()
		currentSettings.autoApproveAllToggled = true
		const permissions = commandPermissionController({ allowed: false, reason: "denied" })
		const autoApprove = new AutoApprove(permissions as any, currentSettings, false)

		assert.equal(await autoApprove.resolveToolPathPermission(DiracDefaultTool.BASH, undefined), "manual_only")
	})

	it("marks residual local writes as Utility-eligible", async () => {
		stubWorkspace()
		const permissions = commandPermissionController({ allowed: true, reason: "no_config" })
		const autoApprove = new AutoApprove(permissions as any, settings(), false)

		assert.equal(await autoApprove.resolveToolPathPermission(DiracDefaultTool.EDIT_FILE, "src/index.ts"), "utility_eligible")
	})

	it("auto-approves local writes matched by an explicit allow rule", async () => {
		stubWorkspace()
		const permissions = commandPermissionController({
			allowed: true,
			reason: "allowed",
			matchedPattern: "src/**",
		})
		const autoApprove = new AutoApprove(permissions as any, settings(), false)

		assert.equal(await autoApprove.resolveToolPathPermission(DiracDefaultTool.EDIT_FILE, "src/index.ts"), "auto_approve")
	})

	it("preserves legacy YOLO approval for external writes", async () => {
		stubWorkspace()
		const currentSettings = settings()
		currentSettings.yoloModeToggled = true
		const permissions = commandPermissionController({ allowed: false, reason: "denied" })
		const autoApprove = new AutoApprove(permissions as any, currentSettings, false)

		assert.equal(await autoApprove.shouldAutoApproveToolWithPath(DiracDefaultTool.FILE_NEW, "/outside/file.ts"), true)
		sinon.assert.notCalled(permissions.validateTool)
	})

	it("preserves legacy Auto-Approve-All precedence over permission rules", async () => {
		const currentSettings = settings()
		currentSettings.autoApproveAllToggled = true
		const permissions = commandPermissionController({ allowed: false, reason: "denied" })
		const autoApprove = new AutoApprove(permissions as any, currentSettings, false)

		assert.equal(await autoApprove.shouldAutoApproveToolWithPath(DiracDefaultTool.BASH, undefined), true)
		sinon.assert.notCalled(permissions.validateTool)
	})

	it("preserves the legacy external-write prompt outside unrestricted modes", async () => {
		stubWorkspace()
		const permissions = commandPermissionController({ allowed: true, reason: "allowed", matchedPattern: "**" })
		const autoApprove = new AutoApprove(permissions as any, settings(), false)

		assert.equal(await autoApprove.shouldAutoApproveToolWithPath(DiracDefaultTool.FILE_NEW, "/outside/file.ts"), false)
		sinon.assert.notCalled(permissions.validateTool)
	})
})

describe("AutoApprove.shouldAutoApproveCategory", () => {
	afterEach(() => sinon.restore())

	it("governs a declared edit with the editFiles checkbox", async () => {
		stubWorkspace()
		const currentSettings = settings()
		currentSettings.autoApprovalSettings.actions.editFiles = false
		currentSettings.autoApprovalSettings.actions.readFiles = true
		const autoApprove = new AutoApprove(commandPermissionController({ allowed: true, reason: "no_config" }) as any, currentSettings, false)

		assert.equal(await autoApprove.shouldAutoApproveCategory("edit", ["src/index.ts"]), false)
		assert.equal(await autoApprove.shouldAutoApproveCategory("read", ["src/index.ts"]), true)
	})

	it("never auto-approves an edit outside the workspace, as WRITE_TOOLS already does not", async () => {
		stubWorkspace()
		const currentSettings = settings()
		currentSettings.autoApprovalSettings.actions.editFiles = true
		currentSettings.autoApprovalSettings.actions.editFilesExternally = true
		const autoApprove = new AutoApprove(commandPermissionController({ allowed: true, reason: "no_config" }) as any, currentSettings, false)

		assert.equal(await autoApprove.shouldAutoApproveCategory("edit", ["/outside/file.md"]), false)
	})

	it("requires readFilesExternally for a read outside the workspace", async () => {
		stubWorkspace()
		const currentSettings = settings()
		currentSettings.autoApprovalSettings.actions.readFiles = true
		currentSettings.autoApprovalSettings.actions.readFilesExternally = false
		const autoApprove = new AutoApprove(commandPermissionController({ allowed: true, reason: "no_config" }) as any, currentSettings, false)

		assert.equal(await autoApprove.shouldAutoApproveCategory("read", ["/outside/file.md"]), false)
		currentSettings.autoApprovalSettings.actions.readFilesExternally = true
		assert.equal(await autoApprove.shouldAutoApproveCategory("read", ["/outside/file.md"]), true)
	})

	it("refuses when no path was declared, because an undeclared location is unknown", async () => {
		stubWorkspace()
		const currentSettings = settings()
		currentSettings.autoApprovalSettings.actions.editFiles = true
		const autoApprove = new AutoApprove(commandPermissionController({ allowed: true, reason: "no_config" }) as any, currentSettings, false)

		assert.equal(await autoApprove.shouldAutoApproveCategory("edit"), false)
	})
})
