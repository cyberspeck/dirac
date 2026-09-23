# Writing a workspace tool

A workspace tool is TypeScript that runs inside the extension host with the extension's rights. The
rules below exist because of that: nothing stops the code once it runs, so the gates sit before it
runs. `tools/count_text/` is the worked example throughout.

## Layout and manifest

Dirac scans `<workspace>/.dirac/tools/<id>/` for a `dirac-tool.json` next to a `tool.ts`
(`ToolDiscoveryService.scanWorkspaceTools`). `UserToolLoader` rejects the manifest unless:

- `schemaVersion` is `1`, `createdBy` is `"dirac"`, `entry` is `"tool.ts"`;
- `scope` is `"workspace"` (it must match where the tool was found);
- `id` and `name` are snake_case, and equal `spec.id` and `spec.name` in `tool.ts`.

Optional `description` and `parameters` describe the tool before its code is approved; until
then only the manifest is read, never the code.

Keep the tool in one file. It is transpiled with `ts.transpileModule` (no type check) into a cache
directory and imported from there, so relative imports do not resolve. Node built-ins do.

## The tool.ts contract

Export `spec` (id, name, a non-empty `description`, `parameters`) and `create()`, which returns an
`IDiracTool`: `spec()`, `supportedSurfaces()` (usually `["all"]`) and
`processCall(args, env)`, which returns the text the model sees.

`env` is the `IToolEnvironment` every built-in tool gets, and the only interface a tool should use.
Prefer `env.workspace` (`resolvePath`, `getFileInfo`, `readFile`, `writeFile`, …) over `fs`: it
resolves paths the way the built-ins do and works on every platform.

## Permissions

The tool owns its permission check; the coordinator does not ask for it. Before a call with side
effects, call `env.interaction.askPermission(message, preview)` and stop unless `approved`:

- `preview.category`: `"read"` or `"edit"`, which picks the auto-approve checkbox that governs the
  prompt (`AutoApprove.shouldAutoApproveCategory`). It declares intent; it does not enforce it.
- `preview.locations`: the absolute paths the call touches. Without them the checkbox never
  auto-approves the call, and it never auto-approves an edit outside the workspace (YOLO and
  approve-all still do).
- `preview.diffs`: `{ path, oldText, newText }` per file. When a person answers, they review the
  change in the VS Code diff editor, like a built-in edit.

The interaction trait finalizes the permission card for you.

## .diracignore

`env.workspace` does not apply `.diracignore`; each built-in checks it at its call site, and a
custom tool must do the same. `count_text` checks
`env.config.services.diracIgnoreController.validateAccess(absolutePath)` before reading each file.

## Enabling and approval

- Custom tools are **disabled by default** (`ToolRegistry.isEnabledTool`: a missing toggle means
  enabled only for built-ins). Enable the tool under Settings → Tools.
- With the toggle on, discovery asks once to trust the code (`approvedWorkspaceCode`). The grant
  is keyed to the workspace location, the tool's path and a SHA-256 of `dirac-tool.json` plus
  `tool.ts`. Moving the workspace or editing either file asks again. The approved bytes are what
  gets loaded, so a file swapped while the dialog was open is not run.
- The prompt appears only in the VS Code extension. In Restricted Mode (an untrusted workspace) the
  tool does not load, even with an earlier grant.
- The compile cache is content-addressed, so copy the tool into the workspace; do not symlink it.

## Smoke test

Export the pure logic and test it with plain `node:assert`, calling `create().processCall(args, env)`
with a fake `env` that implements only the `env.workspace` methods the tool uses. See
`tools/count_text/smoke.mjs`; run it with `node --experimental-strip-types smoke.mjs` on an LTS
Node. This tests the logic without loading the extension. Check approval and the toggle once by hand
in VS Code.
