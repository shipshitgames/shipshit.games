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
  --repo ../scourge-survivors

# Or use your authed Codex CLI as the generator:
bun packages/assetgen/src/cli.ts --provider codex --id ... --prompt "..." --repo ...

# Pipeline dry-run (no key, placeholder image):
bun packages/assetgen/src/cli.ts --provider mock --dry-run --id test --prompt "x"
```

## Providers
- `openai` — gpt-image-1, transparent PNG (`OPENAI_API_KEY`)
- `fal` — FLUX (`FAL_KEY`)
- `codex` — delegates to the local authed `codex` CLI
- `mock` — offline placeholder for testing the pipeline

## Style
Every prompt is suffixed with the DOOM canon from `lore/DESIGN.md` and framed per game
(FPS billboard / TD top-down / MOBA isometric / shared). Output is trimmed, optionally
sized, encoded to `.webp`, and upserted into the target game's `src/assets/assets.json`.

> TODO (board): background-removal step (rembg) for non-transparent providers; the
> per-game variant matrix (issue #6); wire into the Electron studio UI.
