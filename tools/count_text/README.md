# count_text

Counts characters (with and without spaces), words and lines in one or more files.

The model cannot count reliably by reading a file, and `wc` is unavailable when
`execute_command` is disabled — which is the posture this fork is built for.

## Install

Workspace tools are loaded from `<workspaceRoot>/.dirac/tools/<id>/`. Copy, do not
symlink: the loader's compile cache is content-addressed against what is on disk.

```sh
mkdir -p "$WORKSPACE/.dirac/tools/count_text"
cp dirac-tool.json tool.ts "$WORKSPACE/.dirac/tools/count_text/"
```

Custom tools default to **disabled** (`ToolRegistry.isEnabledTool`: `override ?? tool.source === "builtin"`).
Enable it in VS Code under Settings → Tools before it is offered to the model. Enabling is not enough.
The tool code must also be approved once, when the tool is discovered with its toggle on; the
approval is keyed to the workspace location, the tool path and a hash of `dirac-tool.json` and
`tool.ts`, so moving the workspace or editing either file asks again. In Restricted Mode the tool
does not load.

## Counting rules

- **Code points, not UTF-16 units**, after NFC normalisation. "Ü" counts as one character
  whether the file stores it composed or decomposed (NFD, which macOS filesystems and some
  editors produce). `"Übung".length` would over-count the decomposed form.
- **CRLF is one line break**, so Windows-authored files do not report double.
- **Empty or whitespace-only input is 0 words**, not 1.
- Counts **raw file text**, including frontmatter, Markdown syntax and the bibliography.
  A rendered-text mode is a known gap — see `FINDINGS.md` F-011.

## Portability

Uses only `env.workspace.resolvePath` / `getFileInfo` / `readFile`. No subprocess, no shell
quoting, no platform-specific paths — works on Windows, macOS and Linux unchanged.

## Tests

```sh
node --experimental-strip-types smoke.mjs   # LTS node; see AGENTS.md on Node 26
```
