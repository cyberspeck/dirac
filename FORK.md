# Fork guide

`AGENTS.md` is upstream Dirac's guide, kept byte-identical to the upstream base so rebases do not
conflict on it; it still applies. This file is fork-local: upstream does not know about it.

## What this fork is for

Driving Dirac with **small local models** (Ollama / OpenAI-compatible endpoints) as a writing
assistant that finds, reads and edits files — with `execute_command` and `browser_action` disabled.
The target use: long-form German academic prose, a corpus of Markdown notes plus PDF sources,
models running locally on macOS and Windows, and an end user who is not technical and will not
read logs or fix configuration. Changes that only make sense for frontier models with a shell are
out of scope here.

Windows is a first-class target. It is where most of the defects found so far only appear.

## Conventions

- **Identity.** Every commit's author *and* committer is
  `cyberspeck <20340757+cyberspeck@users.noreply.github.com>`. No `Co-Authored-By` trailers.
- **Privacy lint before every push:** `python3 scripts/privacy-lint.py` (scans commit messages and
  added lines in `v0.5.15..HEAD`; also refuses trailers and changes under `tools/` outside
  `tools/count_text/`). The terms list lives outside the tracked tree at
  `.git/info/private-terms`, one case-insensitive regex per line; the script exits 2 if it is
  missing. Never put example terms in a tracked file.
- **No private content** — no user names, manuscript topics or paths of a downstream deployment in
  any tracked file. `CLAUDE.local.md` (untracked) carries that context where a session needs it.
- **Tests:** `scripts/run-unit.sh` for a full run, compared against `test-baselines/` (see the
  README there).

## Licence obligations — do not break these

Apache-2.0, inherited twice: Cline Bot Inc. → Dirac Delta Labs → this fork.

- `LICENSE` carries **both** upstream copyright lines. Never remove or "tidy" them. Add, don't replace.
- §4(b) requires modified files to announce that they changed. That is the notice at the top of
  `README.md` — it must survive, because a vsix or tarball carries no commit history.
- §6 does not license the names. "Dirac" and "Cline", and their logos, are not ours to use as
  product identity. This is the real constraint behind the pending rename (`FINDINGS.md` F-009),
  and it gets stricter the wider a build is distributed.

## Versioning

`<upstream version>-local.<N>` — e.g. `0.5.15-local.1`.

Track upstream's number and **reset the suffix on every upstream sync**: syncing to Dirac 0.5.16
means the next release is `0.5.16-local.1`, not a continued count. The suffix counts our releases
against one upstream base, so it answers "how far have we drifted from this base", which is the
question that matters during a merge.

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
requirements, the candidate list and the rulings it produces are kept with the custom tools,
which are maintained outside this repository. `tools/count_text/` is the one tool kept here.

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
(`FINDINGS.md` F-010). Run the suite **outside any agent sandbox**: inside the macOS sandbox
`fs.watch` fails with EMFILE and the logger guard turns that into failures (F-014).

Per the upstream guide, only run tests when asked. Full run: `scripts/run-unit.sh` (per-file
parallel, writes `tmp/unit-run/failing.txt` to diff against `test-baselines/`). Scoped run:

```sh
TS_NODE_PROJECT=./tsconfig.unit-test.json ./node_modules/.bin/mocha \
  --node-option no-experimental-strip-types "src/path/to/__tests__/*.ts"
```

## Branches and remotes

- Remote `origin` → this fork, `cyberspeck/dirac`. Remote `upstream` → `dirac-run/dirac`; read it
  as `upstream/master`, no local copy.
- `master` — the fork's one long-lived branch: the full patch set on an upstream release tag.
- `fix/*` — one change proposed upstream, branched from `upstream/master`. Delete it once the PR
  is merged or dropped; branches do not accumulate.
- Nothing is pushed without the maintainer's go. `scripts/pre-push` runs the privacy lint on every
  pushed ref (range: everything not in `upstream/master`) and refuses the push on any hit. Install
  it once per clone: `ln -s ../../scripts/pre-push .git/hooks/pre-push`.
