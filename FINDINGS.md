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
| F-016 | med | ui | A card's `diffs` are **never rendered**. `DiffDecorator.tsx:10` matches `renderType: "diff"` but only draws an "open file" button; nothing in `webview-ui/src` reads `card.diffs` for display. Builtin edit tools show their diff through the VS Code diff editor (`env.editor.showReview`, `WriteToFileTool.ts:191`), not in the chat, so a card that carries diffs and nothing else shows the user nothing | `webview-ui/src/features/modular-ui/decorators/DiffDecorator.tsx:14` — sole consumer | no |
| F-004 | ? | editor | CRLF handling in diff/apply never traced — literal `\n` comparisons may misbehave on Windows | unexamined, not cleared | no |
| F-005 | low | permissions | `picomatch(rule.pattern, { dot: true })` without `windows: true`; backslash paths may not match globs like `src/*.ts` | `src/core/permissions/PermissionRuleEvaluator.ts:19` | no |
| F-006 | low | ignore | `controlPaths` set uses `path.normalize` without case folding, unlike `arePathsEqual` elsewhere | `src/shared/ignore/DiracIgnorePolicy.ts:158,183,198` | no |
| F-007 | low | paths | raw `===` path comparisons bypass the `arePathsEqual` helper | `FileContextTracker.ts:130,135`, `WorkspaceResolver.ts:193`, `WorkspacePathAdapter.ts:59`, `DiffContentProvider.ts:33`, `CheckpointTracker.ts:434` | no |
| F-008 | low | search | `filePath.startsWith(workspacePath + sep)` guards separators but is still case-sensitive | `src/services/search/file-search.ts:120` | no |
| F-009 | n/a | packaging | rename so the build is distinguishable from upstream Dirac in VS Code — `name`/`publisher` form the extension ID, so this also touches command IDs, view containers, config keys and possibly state keys | deferred by maintainer 2026-09-22 | n/a |
| F-011 | n/a | tools | `count_text` counts raw file text; a Markdown-rendered mode (excluding frontmatter, syntax, bibliography) would match what a word-count requirement actually measures | requested by maintainer 2026-09-22 | n/a |
| F-013 | med | diagnostics | `diagnostics_scan` reports `No diagnostics issues found.` for a file whose LTeX+ warnings are visible in the Problems panel. Severity is not the cause (warnings are accepted at both filter sites). Candidates: the 2 s poll window vs a cold language server, and `convertToFileDiagnostics` rewriting `filePath` relative to the workspace folder while the formatter matches cwd-relative `displayPath`. Worse than the miss: an unfinished scan is indistinguishable from a clean file | `diagnostics_scan/index.ts:95,184`, `DiagnosticFormatter.ts:37`, `hostbridge/workspace/getDiagnostics.ts:33` | no |
| F-010 | low | tooling | `npm run test:unit` fails on Node 26 — mocha's bundled yargs uses `require` in ESM scope. Use an LTS node (22.x verified) | pre-existing, unrelated to our patches | no |
| F-014 | med | tooling | `npm run test:unit` **stops early**: a failing `afterEach` ("initTask creates a Task on controller.task") aborts the run at 925 passing / 2 failing in ~1 s. The 2438 / 3 / 80 baseline recorded on 2026-09-21 does not reproduce, so any comparison against it is meaningless — and a real regression in the untouched ~1500 tests would be invisible. Measured identical (925/2) at commit “fix(task): give each prompt-debug artifact its own file” and at HEAD on 2026-09-22 | run under Node 22.23.2 | no |

## Fixed

| ID | Sev | Area | Symptom | Fix | Upstream |
|----|-----|------|---------|-----|----------|
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

Candidate tools and the research behind them live in `tools/BACKLOG.md` — user stories ranked
for both the writing and coding use cases, the citation-encoding recommendation, and a survey
of what existing VS Code writing extensions already do.

## Running the tests

Node 26 does not work (F-010). With an LTS node:

```sh
TS_NODE_PROJECT=./tsconfig.unit-test.json ./node_modules/.bin/mocha \
  --node-option no-experimental-strip-types "src/**/__tests__/*.ts" "src/**/*.test.ts"
```
