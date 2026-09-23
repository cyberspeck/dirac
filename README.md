# Dirac — local-model build

> **This is a modified build, not the upstream extension.** This branch (`v0515-public`)
> is a modified version of Dirac (Copyright Dirac Delta Labs), which is itself derived from Cline
> (Copyright Cline Bot Inc.). Both are licensed under the Apache License 2.0; see `LICENSE`, which
> carries both copyright notices. Files have been changed relative to upstream Dirac — the changes
> are listed in `FINDINGS.md` and in this branch's commit history. This build is not produced,
> endorsed or supported by Dirac Delta Labs or Cline Bot Inc. "Dirac" and "Cline" are the names of
> their respective projects and are not licensed to this fork (Apache-2.0 §6).

<!-- BUILD-STAMP:START -->
**Build:** `5ac252bc` on `v0515-public`, 2026-09-23.
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
- **Commits your work for you.** Every completed task is auto-committed to git, so an edit you did
  not want is always one `git revert` away. This is what makes it safe to let it write at all.
- **Extends itself.** `/new-tool <description>` compiles, validates and smoke-tests a new workspace
  tool; enable it in the **Tools** tab. Tools are plain TypeScript in `.dirac/tools/`.

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
