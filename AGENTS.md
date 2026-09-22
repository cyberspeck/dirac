# Dirac Agent Guide

This is the codebase of our coding agent Dirac. It supports cli and vscode extension.

## Codebase Structure

- `src/core/task/` : Task execution loop and state
- `src/core/task/tools/modules/` : Tool implementations
- `src/core/task/tools/interfaces/IToolEnvironment.ts` : Tool↔environment contract
- `src/core/task/tools/ToolExecutorCoordinator.ts` : Tool dispatch
- `src/core/prompts/` : System prompt templates
- `src/core/controller/` : Extension coordination and state
- `src/core/context/` : Context gathering
- `src/core/api/providers/` : Per-provider API handlers (anthropic, gemini, openai, bedrock…)
- `src/core/api/transform/` : Provider stream → internal `ApiStream`
- `src/shared/api.ts` : Model IDs, pricing, capability flags
- `src/integrations/` : Terminal, Editor, Browser, and external service integrations
- `src/services/` : Shared services (logging, telemetry, tree-sitter, ripgrep, search, etc.)
- `src/shared/` : Cross-component types and utilities
- `webview-ui/` : React frontend (`Card` is the UI primitive for tools)
- `cli/` : TypeScript/Ink CLI
- `proto/dirac/` : Protobuf definitions


## Tooling

Tools are self-contained units dispatched by `ToolExecutorCoordinator`. Once called, a tool owns its lifecycle: it creates one or more `Card`s via `createCard`, updates their status via the card handle, and sets a final status before exiting. The only way a tool interacts with the environment is through `IToolEnvironment`. How cards are rendered is the UI's concern, not the tool's.

## Must Follow Engineering Principles

1. Layered architecture is a hard boundary. Task loop orchestrates, tools execute, UI renders, API handlers handler API providers. No layer knows the internals of another. Tool-specific logic belongs in the tool module, not in the coordinator or task loop. Never EVER mix the layers.
2. No defensive programming, it does more harm than good to swallow failures.
3. Every function should have single responsibility. 
4. No spaghetti control flow. Linear over nested. Early returns over deep conditionals. State transitions happen in one place.
5. Tools are hermetically sealed. A tool's only interface with the environment is IToolEnvironment. Tools do not import each other. Shared behavior is explicit, not implicit coupling.
6. Names are contracts. A function or file name should make its behavior predictable before you open it. Vague names (handle, process, manage) are rejected at review.
8. No cargo-cult patterns. Don't add abstraction, indirection, or boilerplate because it feels right. Every layer of indirection needs a reason. Premature generalization is complexity debt.

> Legacy code may violate these. Flag violations and propose fixes when you encounter them.

## Dev Flow
## 🛠️ Dev Flow
- Setup: `npm run install:all`
- Protobufs: `npm run protos` (Required before build)
- Compile: `npm run compile` for backend, `npm run cli:build` for cli, `npm run build:webview` for webview
- Test: `npm test` (do not run tests automatically, only if user asked)
- Lint: `npm run lint`

## Note on grep/search
Skip these when grepping or searching - generated/binary content only:
`node_modules/`, `dist/`, `build/`, `.git/`, `out/`, `src/generated/`, `src/shared/proto/`
---

# Fork guide (`local-model-patches`)

Everything above is upstream Dirac's guide and still applies. This section is fork-local:
keep it when merging upstream, and do not expect upstream to know about it.

## What this fork is for

Driving Dirac with **small local models** (Ollama / OpenAI-compatible endpoints) as an agent
that finds, reads and edits files — with `execute_command` and `browser_action` disabled.
Changes that only make sense for frontier models with a shell are out of scope here.

Windows is a first-class target. It is where most of the defects found so far only appear.

## Licence obligations — do not break these

Apache-2.0, inherited twice: Cline Bot Inc. → Dirac Delta Labs → this fork.

- `LICENSE` carries **both** upstream copyright lines. Never remove or "tidy" them. Add, don't replace.
- §4(b) requires modified files to announce that they changed. That is the notice at the top of
  `README.md` — it must survive, because a vsix or tarball carries no commit history.
- §6 does not license the names. "Dirac" and "Cline", and their logos, are not ours to use as
  product identity. This is the real constraint behind the pending rename (`FINDINGS.md` F-009),
  and it gets stricter the wider a build is distributed.

## Versioning

`<upstream version>-local.<N>` — e.g. `0.5.13-local.2`.

Track upstream's number and **reset the suffix on every upstream sync**: syncing to Dirac 0.5.14
means the next release is `0.5.14-local.1`, not `-local.4`. The suffix counts our releases against
one upstream base, so it answers "how far have we drifted from this base", which is the question
that matters during a merge.

## Releases

A release marks a **verified state, not a batch of commits**. Cut one when:

- a fix has been confirmed working on the platform it targets (not just green unit tests), or
- the build goes to someone who cannot build from source, or
- you want a rollback point before something risky (the F-009 rename changes the extension ID;
  settings may not survive it).

Do not cut for green tests alone, docs, or elapsed time — the branch already serves anyone who builds.

**Published releases are immutable.** Never replace an uploaded asset: the tag names a specific
build, and swapping the binary means two people holding "the same version" have different software.
Found a problem after publishing? Edit the notes to record it, and fix it in the next release.

## Tool-surface changes

Adding, removing or reshaping a model-facing tool — including how it is approved — requires an
independent subagent review **before and after** the change. Protocol, brief contents and report
requirements: `tools/REVIEW-PROTOCOL.md`. The candidate list and the rulings it produces live in
`tools/BACKLOG.md`.

## Findings ledger

`FINDINGS.md` is the cross-session worklist. Two rules make it worth having:

- every row cites a commit or a `file:line` — no row without evidence;
- a row moves to `fixed` only when a test covers it, **red without the fix, green with it**. Verify
  this by stashing the source change and re-running; a test that cannot fail proves nothing.

## Recurring defect class: path comparison

Three separate bugs here came from comparing path **strings**. Before writing one, use the helpers
in `src/utils/path.ts`:

- `arePathsEqual(a, b)` — lowercases on win32
- `isLocatedInPath(dir, p)` — `path.relative` based; handles `\\?\` long paths and cross-drive

Never `startsWith(cwd)` for containment. It matches sibling directories sharing a prefix
(`/a/proj` accepts `/a/proj-evil`) and is case-sensitive, so it rejects Windows paths that differ
only in drive-letter case. If one side of a comparison has been through `fs.realpath`, put the
other side through it too — a realpath'd path and a `path.resolve`'d one disagree under a
symlinked parent (`/tmp` → `/private/tmp` on macOS) as readily as on Windows.

`path.win32.relative` *is* case-insensitive, so relative-based containment needs no special-casing.

## Running tests

**Node 26 does not work** — mocha's bundled yargs uses `require` in ESM scope and the runner dies
before any test loads. Use an LTS node (22.x verified). This is environmental, not a fork defect
(`FINDINGS.md` F-010).

Per the upstream guide, only run tests when asked. Scoped run:

```sh
TS_NODE_PROJECT=./tsconfig.unit-test.json ./node_modules/.bin/mocha \
  --node-option no-experimental-strip-types "src/path/to/__tests__/*.ts"
```

## Branches and remotes

- `local-model-patches` on the `fork` remote — the full patch set. This branch.
- `fix/*` branches — single changes proposed upstream, kept separate so they stay reviewable.
- `master` tracks `origin` (`dirac-run/dirac`) and stays clean.

A change that is upstream-contributable should land on a `fix/*` branch too, not only here.
