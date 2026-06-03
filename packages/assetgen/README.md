# @shipshit/assetgen

DOOM-grade asset generation for Ship Shit Games. One pipeline:
**prompt + `DESIGN.md` DOOM-suffix → provider → trim/optimize `.webp` → `assets.json`.**

This is the engine behind the desktop studio's generators (board #1 + #5). It runs from the
CLI today; the Electron studio will wrap it with a UI later.

## Use

```bash
# Real generation (bring your own key):
OPENAI_API_KEY=sk-... bun packages/assetgen/src/cli.ts \
  --id swarm-husk --game scourge-survivors --kind sprite \
  --prompt "a rotting bio-husk of the Scourge, lunging" \
  --repo ../games/scourge-survivors

# Or use your authed Codex CLI as the generator:
bun packages/assetgen/src/cli.ts --provider codex --id ... --prompt "..." --repo ...

# Pipeline dry-run (no key, placeholder image):
bun packages/assetgen/src/cli.ts --provider mock --dry-run --id test --prompt "x"
```

## Providers
- `openai` — **gpt-image-2** (default; `--model` to override), transparent PNG
- `fal` — FLUX
- `codex` — delegates to the local authed `codex` CLI (no key wiring needed)
- `mock` — offline placeholder for testing the pipeline

## Keys (shipcode-style)
No raw env vars required. Keys resolve from the **macOS keychain** first (env var as
fallback). Store one with:

```bash
security add-generic-password -a shipshit -s shipshit-openai -w <OPENAI_KEY>
security add-generic-password -a shipshit -s shipshit-fal    -w <FAL_KEY>
```

The `codex` provider rides codex's own keychain auth — nothing to store.

## Style
Every prompt is suffixed with the DOOM canon from `lore/DESIGN.md` and framed per game
(FPS billboard / TD top-down / MOBA isometric / shared). Output is trimmed, optionally
sized, encoded to `.webp`, and upserted into the target game's `src/assets/assets.json`.
When `--repo` is omitted, the CLI prefers the studio layout: `./games/<game>` or
`../games/<game>`.

> TODO (board): background-removal step (rembg) for non-transparent providers; the
> per-game variant matrix (issue #6); wire into the Electron studio UI.
