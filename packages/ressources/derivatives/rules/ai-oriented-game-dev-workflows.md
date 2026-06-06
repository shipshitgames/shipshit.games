# AI Oriented Game Dev Workflows

Status: candidate
Kind: rule

## Sources

- `QPZCMd5REP8`: Vibe Coding 2D Games with Claude Code & Agent Skills (Full Tutorial)
- `fu7NZ3t3sLM`: Ditch Unity: How I Vibe Code 3D Games With AI - Full Tutorial (Codex CLI, Claude Code, Cursor)
- `EkNfythQNRg`: Claude Code UNLOCKED: The secret workflow Anthropic does not want you to know (Inc. Kimi K2 + Groq)

Captions were captured for analysis with `yt-dlp` on 2026-06-05, but raw
caption text is not committed here. The transcript files in
`transcripts/ai-oriented-dev/` are provenance placeholders until raw transcript
rights are confirmed.

## Core Pattern

The repeated unlock is not "ask the model to make a game." The unlock is:

1. Give the agent a narrow game-building skill.
2. Convert messy assets into a canonical JSON index.
3. Make the agent plan a vertical slice before building.
4. Verify with a browser or simulator that can see and play the result.
5. Feed every recurring failure back into the skill.

This maps cleanly to Ship Shit Games: build durable skills and tools around
asset indexing, game harnesses, visual testing, and repeatable production loops.

## 2D Game Workflow

Use this for Phaser-style 2D prototypes, pixel platformers, RTS experiments, and
asset-pack driven games.

- Put web-served game assets under a predictable `public/assets/<pack>/` tree.
- Inspect every asset pack before coding: sprite sheets, animation rows, tile
  sets, parallax background layers, decorations, props, and static objects.
- Generate an `assets.json` or `assets.index.json` before building gameplay.
  This index should name frame dimensions, animation ranges, tile-set sizes,
  background layers, and decoration paths.
- Do not trust the first generated index. Manually verify frame ranges,
  especially when sprite sheets contain blank frames, non-square cells, or
  row/column padding.
- If a target scene mockup exists, feed it to the agent. If not, generate one
  from the tile set and visual references before asking for implementation.
- Build in layers: background first, ground/tile layer second, player third,
  controls fourth, then combat/props/polish.
- Use plan mode for implementation prompts. One-shot demos are fine for show,
  but production should move in small verifiable slices.
- Add parallax and infinite scrolling only after the base static scene works.
- Use Playwright or an equivalent browser harness to press keys, capture
  screenshots, and confirm movement/animation states.
- Treat screenshot testing as a visual loop, not a final judge. The agent can
  misread a screenshot if earlier bugs cause misleading movement or offsets.
- When a visual bug recurs, update the skill itself. Examples: sprite-sheet
  frame sizing, row bleed, idle/run/jump state transitions, ground offsets, and
  screenshot-based validation.

## 3D Game Workflow

Use this for Three.js prototypes, 3D character import, interactive scenes, and
mobile/web 3D experiments.

- Start from a clean concept image with front and back views. A-pose or T-pose
  references are easier to rig than expressive action poses.
- Split front/back references into separate files before sending to image-to-3D
  tools.
- Generate or import a model, texture it, then reduce polygon count aggressively
  for web/mobile. The video target was roughly low-poly/mobile friendly.
- Rig only after mesh simplification. High-poly models create avoidable rigging
  and runtime problems.
- Add only the animations required for the vertical slice first: idle, walk, run
  is enough for model validation.
- Export model and animation assets into a stable folder structure.
- Generate an `assets.index.json` for the 3D model before building the scene.
  It should record model path, skeleton/mesh information, animation names,
  durations, looping behavior, and state tags.
- Treat the JSON index as the canonical source. If animation playback is wrong,
  fix the index and rerun the scene rather than asking the model to rediscover
  the GLB/GLTF every time.
- Use a Three.js builder skill to handle lighting, camera defaults, model
  orientation, animation mixer setup, and common coordinate-system mistakes.
- Build a model viewer before building a game scene. Include orbit camera and
  buttons to switch animation states.
- For mobile, plan with Capacitor or the target shell from the start. Do not add
  mobile deployment after the scene is already brittle.
- For point-and-click or adventure scenes, treat navigation meshes and hotspots
  as editor data. Build a simple level editor early instead of hard-coding every
  walkable area, dialogue trigger, and audio cue.

## Claude Code Model Routing Workflow

Use this when we need cheaper/faster agent runs or fallback providers.

- Keep the default trusted model path for high-risk repo edits.
- Add router-based model access only as an explicit toolchain mode with clear
  environment isolation.
- Prefer a wrapper command over manually exporting environment variables in
  every terminal.
- If using a router, store provider configs outside committed files unless they
  are secret-free templates.
- Separate provider concerns: direct provider endpoints are simple, OpenRouter
  gives provider/model breadth, Groq-style inference can provide speed, and a
  router can normalize request format.
- Use transformers/adapters per provider. Some endpoints need cache-control,
  model slug, or max-token transformations to behave correctly.
- Expect occasional "continue" nudges after tool calls with router setups.
  Build monitors or retry policies around that rather than treating it as a
  mysterious agent failure.
- Benchmark provider routes with the same task before adopting them. Track total
  duration, output quality, tool-call reliability, and recovery behavior.
- Route cheap/background tasks separately from hard reasoning tasks. Repo
  analysis, file summarization, and non-critical refactors can often use a
  smaller or cheaper model.

## What We Should Build Next

- `asset-indexer`: a CLI command that scans a 2D or 3D asset folder and writes
  `assets.index.json` with sprite frames, tile sets, parallax layers, GLB
  animations, skeleton metadata, and static props.
- `playwright-game-tester` skill: open a local game, press keys, capture
  screenshots, check canvas pixels, and report visual/gameplay regressions.
- `phaser-game-builder` skill: if we decide Phaser belongs in the studio stack,
  encode the 2D build loop above as a reusable skill.
- `three-scene-builder` skill: adapt the 3D workflow to our existing
  `@shipshitgames/engine` package instead of making one-off Three.js scenes.
- Desktop Resources pane: ingest URL, create transcript resource record,
  distill process notes, and promote notes into skills/apps/tools.
- Model-router templates: secret-free examples for direct provider, OpenRouter,
  and high-speed inference routes, with warnings about when not to use them.

## Guardrails

- Never let the agent repeatedly inspect binary assets when a canonical index
  already exists.
- Never skip visual verification for gameplay. A successful typecheck does not
  mean a playable game.
- Never start with a full game prompt. Ask for a vertical slice with explicit
  layers and controls.
- Never treat skills as static. Update them whenever a repeatable failure shows
  up.
- Never commit provider API keys, raw private configs, or unclear-rights raw
  transcripts.

## Ship Shit Games Translation

For this repo, the practical process should be:

1. Drop or generate assets into a bounded input folder.
2. Run a repo-owned asset indexer.
3. Ask an agent skill to plan the smallest playable slice.
4. Build the slice with `@shipshitgames/engine` or an approved game framework.
5. Start a local server and verify with Playwright/browser screenshots.
6. Capture every recurring fix as a skill update or package-level tool.
7. Promote only durable patterns into `.agents/skills` or app surfaces.
