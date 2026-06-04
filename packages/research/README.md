# @shipshitgames/research

Turn a YouTube game-dev tutorial into a reusable **build ruleset**.

`URL → transcript → LLM distill → rules markdown`. Same shape as
[`@shipshitgames/assetgen`](../assetgen): a headless CLI you can run from the terminal or
drive from the desktop Studio cockpit (the **Research** pane) over IPC with a streaming log.

## Run

```bash
# from the repo root
bun packages/research/src/cli.ts --url "https://www.youtube.com/watch?v=…" --out rules.md

# offline transcript test (no model) — proves extraction
bun packages/research/src/cli.ts --url "<url>" --provider mock --out /tmp/rules.md

# already have the transcript? skip the network
bun packages/research/src/cli.ts --transcript-file transcript.txt --title "…" --out rules.md
```

### Flags

| flag | default | meaning |
|---|---|---|
| `--url` | — | YouTube URL, `youtu.be/…`, `/shorts/…`, or a bare 11-char id |
| `--transcript-file` | — | use a local transcript instead of fetching (offline / re-distill) |
| `--out` | `rules.generated.md` | where to write the ruleset |
| `--provider` | `codex` | `codex` (local CLI, your subscription, no key) or `mock` (offline stub) |
| `--title` | (auto) | override the video title |

## Transcript engine

1. **yt-dlp** (primary) — handles the visitor/PoToken handshake YouTube now requires for
   timed-text. Set `RESEARCH_YT_DLP` to point at a specific binary; otherwise it's found on
   `PATH`.
2. **Watch-page scrape** (fallback) — zero deps, but YouTube returns empty timed-text on
   PoToken-gated videos, so yt-dlp is recommended for reliability.

Install yt-dlp: `brew install yt-dlp` (or `pipx install yt-dlp`).

## Distillation

`--provider codex` shells out to the local `codex` CLI (same bet as assetgen's image
providers) to distill the transcript into a fixed-section ruleset. `--provider mock` emits a
deterministic stub so the pipeline and the desktop pane run with no model.
