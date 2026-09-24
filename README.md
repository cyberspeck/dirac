# Dirac — local-model build

> **This is a modified build, not the upstream extension.** This branch (`master`)
> is a modified version of Dirac (Copyright Dirac Delta Labs), which is itself derived from Cline
> (Copyright Cline Bot Inc.). Both are licensed under the Apache License 2.0; see `LICENSE`, which
> carries both copyright notices. Files have been changed relative to upstream Dirac — the changes
> are listed in `FINDINGS.md` and in this branch's commit history. This build is not produced,
> endorsed or supported by Dirac Delta Labs or Cline Bot Inc. "Dirac" and "Cline" are the names of
> their respective projects and are not licensed to this fork (Apache-2.0 §6).

<!-- BUILD-STAMP:START -->
**Build:** `ea76b335` on `master`, 2026-09-23.
<!-- BUILD-STAMP:END -->

## What this build is for

An agent that works on **your files, with a model running on your own machine**. Nothing is sent
to a hosted provider, because there is no provider: it talks to Ollama on localhost.

It is built for long documents in Markdown — a manuscript, a report, a set of notes — and it works the
same way on code. Its tools read, outline, search, count and edit files. That is the whole surface,
deliberately: the shell and the browser are switched off, so the agent cannot run commands on your
machine or reach the network on its own.

It drives a **small** model (27B-class), which is the constraint everything else follows from. Small
models are poor at reproducing long passages verbatim and easily confused by a large menu of tools,
so the tools here are few, deterministic, and shaped so the model never has to retype text it is not
changing.

## What it does

- **Reads and navigates without loading everything.** `read_file` takes a line range, so a long
  manuscript is navigable for a few hundred tokens once its outline is known.
- **Edits surgically.** A custom tool's edit is shown as a full diff before writing, and approved
  like a builtin's. `edit_file` and `write_to_file` remain for whole-block work. The outline, search
  and pattern-replace tools this build is used with are custom workspace tools maintained outside
  this repository; `tools/count_text/` is kept here.
- **Counts words**, because a word-count requirement is a real requirement.
- **Runs hooks you approve.** A workspace hook such as `TaskComplete` (for example, one that commits
  each finished task to git) runs only once you have approved it; an unapproved one is shown as skipped.
- **Extends itself.** `/new-tool <description>` compiles, validates and smoke-tests a new workspace
  tool; enable it in the **Tools** tab. Tools are plain TypeScript in `.dirac/tools/`.

## Reviewing edits

A single reply can bring several edits in a row. When it does, each card shows `Step i of n` (or
`Step i · model still writing` while more are still arriving); a single edit shows no counter.
Accept or Reject each one; type a note first and it goes to the model along with your decision.
Cancel ends the task; steps already accepted stay applied.

While a step of a multi-step reply waits, the send button below the box turns into `Skip rest`
and works even with an empty box: it declines this step and every remaining one in the turn, and
sends whatever you typed (or nothing) to the model, which answers before doing anything else.
While any card waits, pressing Enter with text in the box does the same. On a question card,
typing a reply and sending it just answers the question. Once the last step in a turn is decided,
the review tab closes.

To get an earlier version of a file back, right-click it in VS Code's Explorer and choose
**Open Timeline**, which lists earlier saves and lets you open or restore one.

## Why `tools/count_text` ships here

A language model cannot count words — it estimates, confidently, and where a text has a word limit that
estimate is a wrong answer that looks right. `count_text` turns counting into a deterministic tool call:
characters and words per file or per heading section, with comment lines left out. It is also a small,
complete example of a workspace tool. Install it like any workspace
tool (see [its README](tools/count_text/README.md)).

## What it is not

Not a hosted coding agent, and the upstream claims about API cost savings do not apply — there is no
API bill to save. It does not use hosted models, and the tools that would let it reach the network
are disabled by default in this build.

## Install and run

Package the extension and install the `.vsix`:

```sh
npm install
npm run package
npx vsce package --allow-package-secrets sendgrid --out dist/dirac.vsix
code --install-extension dist/dirac.vsix
```

You also need [Ollama](https://ollama.com) with a model pulled, and the extension pointed at
`http://localhost:11434`.

## Where things are

| | |
|---|---|
| This fork | <https://github.com/cyberspeck/dirac> |
| Upstream Dirac | <https://github.com/dirac-run/dirac> |
| Cline, which Dirac forked | <https://github.com/cline/cline> |
| Known defects in this build | [`FINDINGS.md`](FINDINGS.md) |
| Fork conventions, build and patch rules | [`AGENTS.md`](AGENTS.md) |
| Running with a local model | [`docs/local-models.md`](docs/local-models.md) |
| Writing a workspace tool | [`docs/custom-tools.md`](docs/custom-tools.md) |

## Development

```sh
npm install
npm run compile
npm run lint
```

Unit and integration test commands are documented in [`package.json`](package.json); note that
Node 26 does not work (see `FINDINGS.md` F-010).

## License

Apache License 2.0 — see [`LICENSE`](LICENSE).

## Acknowledgments

Upstream Dirac is built by [Max Trivedi](https://www.linkedin.com/in/max-trivedi-49993aab/) at
[Dirac Delta Labs](https://dirac.run), and is a fork of [Cline](https://github.com/cline/cline).
This build is a small set of patches on top of their work.
