# Running Dirac with a local model

This build is tested with a 27B-class model served locally. The advice below follows from how the
request is assembled; it applies to any OpenAI-compatible server.

## Connect

Pick the **OpenAI Compatible** provider and point the base URL at the server's OpenAI endpoint
(Ollama: `http://localhost:11434/v1`). A custom URL makes Dirac treat the model as tool-capable,
whatever its model info says.

## Set the Context Window explicitly

An unknown model gets `openAiModelInfoSaneDefaults`, whose `contextWindow` is 256,000 tokens, and the
**Context Window** field shows that number when you have not typed one. Condensing starts when the
previous request used `max(contextWindow - 40,000, 80% of contextWindow)` tokens
(`getContextWindowInfo`). With the default that is 216,000 tokens, far past what a local server
actually holds. The server then drops the start of the conversation on its own, and neither you nor
Dirac is told.

Enter the context length the server really runs with (for Ollama, the model's configured context,
not its advertised maximum). Condensing then happens before the server truncates.

## Keep the prompt prefix stable

Local servers reuse work for a prompt prefix they have already seen. Everything up to the first
change is reused; everything after it is recomputed. On a long conversation that is the difference
between seconds and minutes per turn.

`buildApiRequestParams` rebuilds the system prompt on **every request**, from:

- `.diracrules` (file or directory) and the global rules,
- the workspace `AGENTS.md`, `.cursorrules` and `.windsurfrules`,
- the content of `.diracignore` (unless YOLO mode is on),
- the preferred-language setting,
- the definitions of all enabled tools,
- conditional rules, which switch on and off with the files the conversation touches.

Per-turn material comes after the prefix and does not invalidate it: the `environment_details`
block (`EnvironmentManager.getEnvironmentDetails`: workspace roots, recently edited files on the
first turn, the mode notice) and tool results.

So:

- **Keep frequently edited files out of `.diracrules`.** Any change there, however small, makes the
  next request recompute the whole conversation. Put notes that change often in ordinary files the
  model reads when it needs them.
- **Change tool toggles between tasks, not during one.** The tool list is part of the prefix.
- **Enable fewer tools for small models.** Every enabled tool's definition is sent with every
  request, and a small model chooses better among few tools than among many. Disable what the task
  does not need.

## Diagnose with prompt artifacts

Settings → General → **Prompt metadata artifacts** (`writePromptMetadataEnabled`) writes each
request to Markdown under `.dirac-prompt-artifacts/` in the workspace (or the directory set in
`writePromptMetadataDirectory`, which must stay inside the workspace; the `DIRAC_PROMPT_ARTIFACT_DIR`
environment variable overrides both). Per request you get:

- `task-<id>-debug-NNN.md`: the system prompt, tool definitions and conversation as sent,
- `task-<id>-debug-NNN-response.md`: what the model returned, with token counts, including cache
  reads when the server reports them, stop reason and any error.

Diff two consecutive prompt files to see what changed in the prefix. The directory gets its own
`.gitignore`, so the dumps are not committed. They contain your files' content; delete them when
done.
