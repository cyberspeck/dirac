# Findings ledger

Running list of defects and follow-ups found while running this fork against small
local models. Lives here, not in a downstream repo, so a fresh clone of
`local-model-patches` carries the worklist with the code and it survives upstream syncs.

Conventions:

- Every row cites a commit or a `file:line`. No row without evidence.
- A row reaches `fixed` only when a test covers it — red without the fix, green with it.
- `upstream` tracks whether it has been reported to `dirac-run/dirac`; most have not.
- Severity is about user impact here, not upstream's priorities.

## Open

| ID | Sev | Area | Symptom | Evidence | Upstream |
|----|-----|------|---------|----------|----------|
| F-017 | low | ui | An auto-approved permission published `Auto Approved · Permission Request`, and expanding it showed only the reason — neither the tool that ran nor what it asked for. The tool's own request text was discarded at `publishPermissionApprovalCard`. Now the header names the tool and the body keeps the request | fixed; 2 tests in `SurfaceAdapter.test.ts` | no |
| F-018 | low | ui | A finished Thinking row collapses to a strip showing only the word "Thinking", so a turn's reasoning reads as "little bars" and nobody clicks them. **Not a rendering bug** — verified against `~/.dirac/data/tasks/<id>/ui_messages.jsonl`: the reasoning is captured and persisted in full (167/1024/626 chars across one turn's three rows). The collapsed header now previews the first line | fixed in `ThinkingRow.tsx`; 2 tests | no |
| F-019 | low | editor | Edits the user makes in the review diff editor are never reported back: `TaskState.askResponseUserEdits` is declared and cleared but never assigned, so `waitForInteraction().userEdits` is always undefined and `WriteToFileTool.ts:231` always writes the model's content. Whether the review editor is editable at all is untraced | `src/core/task/TaskState.ts:55`, `TaskMessenger.ts:266,317,325` | no |
| F-004 | ? | editor | CRLF handling in diff/apply never traced — literal `\n` comparisons may misbehave on Windows | unexamined, not cleared | no |
| F-005 | low | permissions | `picomatch(rule.pattern, { dot: true })` without `windows: true`; backslash paths may not match globs like `src/*.ts` | `src/core/permissions/PermissionRuleEvaluator.ts:19` | no |
| F-006 | low | ignore | `controlPaths` set uses `path.normalize` without case folding, unlike `arePathsEqual` elsewhere | `src/shared/ignore/DiracIgnorePolicy.ts:158,183,198` | no |
| F-007 | low | paths | raw `===` path comparisons bypass the `arePathsEqual` helper | `FileContextTracker.ts:130,135`, `WorkspaceResolver.ts:193`, `WorkspacePathAdapter.ts:59`, `DiffContentProvider.ts:33`, `CheckpointTracker.ts:434` | no |
| F-008 | low | search | `filePath.startsWith(workspacePath + sep)` guards separators but is still case-sensitive | `src/services/search/file-search.ts:120` | no |
| F-009 | n/a | packaging | rename so the build is distinguishable from upstream Dirac in VS Code — `name`/`publisher` form the extension ID, so this also touches command IDs, view containers, config keys and possibly state keys | deferred by maintainer 2026-09-22 | n/a |
| F-011 | n/a | tools | `count_text` counts raw file text; a Markdown-rendered mode (excluding frontmatter, syntax, bibliography) would match what a word-count requirement actually measures | requested by maintainer 2026-09-22 | n/a |
| F-013 | med | diagnostics | `diagnostics_scan` reports `No diagnostics issues found.` for a file whose LTeX+ warnings are visible in the Problems panel. Severity is not the cause (warnings are accepted at both filter sites). Candidates: the 2 s poll window vs a cold language server, and `convertToFileDiagnostics` rewriting `filePath` relative to the workspace folder while the formatter matches cwd-relative `displayPath`. Worse than the miss: an unfinished scan is indistinguishable from a clean file | `diagnostics_scan/index.ts:95,184`, `DiagnosticFormatter.ts:37`, `hostbridge/workspace/getDiagnostics.ts:33` | no |
| F-010 | low | tooling | `npm run test:unit` fails on Node 26 — mocha's bundled yargs uses `require` in ESM scope. Use an LTS node (22.x verified) | pre-existing, unrelated to our patches | no |

## Fixed

| ID | Sev | Area | Symptom | Fix | Upstream |
|----|-----|------|---------|-----|----------|
| F-023 | med | prompt | F-020's gating read the settings toggles (`ToolRegistry.isEnabled`), not the tool list the request actually sends: invocation policy, task profile and CLI `--disable-tool`/`--only-tools` were ignored, and on a task's first request the registry was still empty, so EDITING FILES and the resume notice dropped `edit_file` guidance even when it was sent. The `edit_file`-off retry advice for `write_to_file` said to add each section with another `write_to_file` call — which overwrites the file each time | `ToolSnapshotManager.getExecutableToolNames` previews the request snapshot's membership (builtins only, no user-tool scan or approval prompt) for EnvironmentManager and LifecycleManager; `WriteToFileTool` passes `activeToolSnapshot.executableToolNames`. Retry advice now says to split into smaller files (append with `execute_command` when sent) and warns that a second write erases the file. EDITING FILES names `write_to_file` and each anchor source only when sent; `upsert_tool` builder text no longer requires `edit_file`; `search_files` keeps the `inspect_ast` hint alone. Tests in `EnvironmentManager.test.ts`, `ToolSnapshotManager.test.ts`, `formatResponse.test.ts`, `editing-files.test.ts` (commits “fix(prompt): editing guidance follows the request's tool list (F-020)” … “fix(prompt): EDITING FILES names only anchor sources that are sent”) | no |
| F-021 | med | hooks | An unapproved workspace hook was skipped silently, and its card still showed a green tick (`completed` → `CardStatus.SUCCESS`); on Windows the notice named the script file (`PreToolUse.ps1`) | commit c2fcbd38 “fix(hooks): say when a workspace hook is skipped as unapproved” adds the notice; `HookOutput.skipped` (host-set, forced false for script output) now maps to `CardStatus.SKIPPED`, a combined run stays completed if any hook ran, and the notice names the hook. Tests in `hook-factory.test.ts` and `hook-executor.test.ts` (commits “fix(hooks): name the hook, not its script file, in the skip notice”, “fix(hooks): show an unapproved workspace hook as skipped, not done”, “test(hooks): pin the host-only skipped flag and its combined-hook merge”) | no |
| F-014 | med | tooling | `npm run test:unit` stopped at 925 passing / 2 failing. **Not a suite defect**: inside the macOS agent sandbox `fs.watch` fails with EMFILE, the logger guard turns that into an `afterEach` failure, and mocha aborts. Outside the sandbox the full run completes (2026-09-23, commit “fix(respond): complete in Plan Mode is presented as the plan (T-012)” and later: 2461 passing / 3 pending / 78 failing, vs 79 failing at the pin) | run the suite unsandboxed; no code change | n/a |
| F-020 | med | prompt | Tool definitions name disabled builtins: with `edit_file` off, `read_file` and `search_files` still offer `include_anchors` "required by edit_file" and `read_file` says "Prefer inspect_ast". A local model set `include_anchors` six times in one task hoping for line numbers, and got edit coordinates instead. The EDITING FILES guidance appended to Act-mode environment details (`EnvironmentManager.ts`) also unconditionally named `edit_ast`, `edit_file` and ANCHOR coordinates, and `search_files`' "Prefer AST tools over this" didn't name `inspect_ast`/`edit_ast` so `withoutHiddenToolMentions` couldn't drop it. Two more spots in `formatResponse.ts` did the same: `writeToFileMissingContentError` (79-102) told the model to use `edit_file` on every failure and, after 3 failures, forbade retrying `write_to_file` — leaving no usable tool when `edit_file` is off — and `fileContextWarning` (293) told the model to pass `include_anchors: true` "for edit_file coordinates", a parameter the filter had already stripped | `DiracToolSet.withoutHiddenToolMentions`, applied in `convertSpecsToNativeTools` (main and subagent paths): drops each description sentence and optional parameter naming a hidden builtin. `getEditingFilesInstructions` (`sections/editing-files.ts`) now takes `editFileEnabled`/`editAstEnabled`/`inspectAstEnabled` flags, wired from `ToolRegistry.isEnabled` in `EnvironmentManager.ts`, and omits each disabled tool's clause (still teaches `write_to_file` when all are off). `search_files`' description now names `inspect_ast`/`edit_ast` explicitly so the existing filter drops the sentence when they're hidden. `formatResponse.writeToFileMissingContentError` and `fileContextWarning` now read `ToolRegistry.getInstance().isEnabled("edit_file")` directly and branch: with `edit_file` off, failure guidance points only at `write_to_file` (skeleton first, then further `write_to_file` calls per section/file — never forbidding `write_to_file` itself), and the anchors clause is dropped. Tests in `editing-files.test.ts`, `EnvironmentManager.test.ts`, `DiracToolSet.test.ts` and `formatResponse.test.ts` (commits "fix(prompts): stop teaching edit tools that are toggled off", "fix(prompts): stop pointing tool errors at a disabled edit_file") | no |
| F-016 | med | ui | A card's `diffs` are never rendered in the chat (`DiffDecorator.tsx` draws only an "open file" button), so a custom tool's edit was approved from its find/replace text alone | not in the webview: `askPermission` opens the VS Code diff editor from `preview.diffs` while a human decides and closes it after, as the builtins do (`UiTraitBuilder.ts`); never for an auto-approved card. 2 tests in `SurfaceAdapter.test.ts` | no |
| F-015 | high | permissions | Every custom tool whose permission request was answered **by hand** failed with `Tool 'x' left nonterminal card(s): <id> (waiting_for_input)` — the write itself succeeded, so the model was told its edit failed when it had not. `buildInteractionTrait.askPermission` created the card and waited on it but never finalized it, and `ToolExecutorCoordinator.ts:211` asserts every created card is terminal. Invisible whenever the category auto-approved (that path returns an already-final `ApprovedPermissionCardHandle`), which is why the permission-category work shipped with it | finalized in the trait, not per tool (`UiTraitBuilder.ts:47-60`), 3 tests in `SurfaceAdapter.test.ts` | no |
| F-001 | high | prompt-artifacts | no artifacts written on Windows; directory created but left empty. Containment guard compared a realpath'd artifact dir against a merely `path.resolve`'d cwd with case-sensitive `startsWith`. Also broke under a symlinked `/tmp` on macOS | commit “fix(prompt-artifacts): compare cwd and artifact dir in the same resolved form” | no |
| F-002 | med | paths | `format()` treated in-workspace files as external. `!path.startsWith(cwd)` had no separator guard, so `/a/proj-evil` passed a `/a/proj` check, and it missed Windows drive-letter case | commit “fix(paths): use isLocatedInPath for workspace containment in format()” | no |
| F-012 | low | checkpoints | "Failed to add at least one file(s) to checkpoints shadow git" discarded the underlying error in three bare catch blocks, leaving an unactionable message. `CheckpointAddResult` now carries git's message and `describeAddFailure` states the consequence and a next step | (this session) | no |
| F-003 | high | ignore | `.diracignore` silently not enforced for absolute paths. Any argument containing `:` was classified as a PowerShell parameter (so every `C:\...` path), and a leading `/` was treated as a flag on all platforms (so every absolute POSIX path) | commit “fix(ignore): classify absolute paths as file arguments, not flags” | no |

## Already upstream

| Area | Change | Upstream |
|------|--------|----------|
| openai | surface Ollama's `delta.reasoning` as reasoning | dirac-run/dirac#227 |
| openai | honour `reasoning_effort: "none"` instead of omitting the field | dirac-run/dirac#228 |
| reasoning | emit a patch when reasoning is finalized by a tool call | dirac-run/dirac#229 |

## Wanted, not broken

Candidate tools and the research behind them are kept with the custom tools, which are
maintained outside this repository.

## Running the tests

Node 26 does not work (F-010). With an LTS node, and **outside any sandbox** (F-014):

```sh
TS_NODE_PROJECT=./tsconfig.unit-test.json ./node_modules/.bin/mocha \
  --node-option no-experimental-strip-types "src/**/__tests__/*.ts" "src/**/*.test.ts"
```
