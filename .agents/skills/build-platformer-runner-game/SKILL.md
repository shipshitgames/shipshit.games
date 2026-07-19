---
name: build-platformer-runner-game
description: Build or extend a side-on platformer-runner MVP with coyote-time jump physics, seeded course generation, spike/bar/gap hazards, a speed-ember chain, a beacon finish, speed/time/score HUD, and one courier sprite set. Use for Redline work or when a selected project's genre is platformer runner, courier runner, courier platformer, side-on runner, side-scrolling runner, or autorunner.
---

# Build a Platformer Runner Game

Build a compact side-on courier run on the Ship Shit engine. The canonical game
is Redline. Use `blueprint.json` with the Build Plan engine to match the selected
project's genre, identify required asset classes, and order the MVP worklist.

Keep the first playable slice deterministic and finishable. Endless generation,
branching routes, combat, progression, multiple couriers, and live-service
leaderboards are follow-up work.

## MVP Contract

- One side-on courier route generated from a known seed.
- One courier with run, jump, fall, landing, hit, and finish states.
- Tunable jump physics with coyote time and buffered jump input.
- Spike, overhead-bar, and gap hazards with readable anticipation distances.
- A speed-ember chain that rewards maintaining pace.
- A beacon finish that ends the run and freezes the final result.
- HUD for speed, elapsed time, score, ember-chain state, and finish result.
- Deterministic restart from the same seed.

## Required Asset Classes

- **Sprites:** one courier animation set, course tiles, spike and bar hazards,
  gap edges, speed embers, and the finish beacon.
- **UI:** speed, timer, score, ember-chain meter, run state, and finish result.
- **VFX:** jump/land feedback, speed trail, ember pickup/chain feedback, hazard
  hit, and beacon finish.
- **Music/SFX:** one run loop plus jump, land, ember, hazard, and finish cues.

Keep the courier silhouette readable at route speed. Preserve the selected
project's design tokens and faction palette; do not copy Redline-specific
assets or canon into another project.

## System Shape

- Use imperative Three.js for the route and gameplay loop; keep React in the HUD
  and menus.
- Run movement and collision on a fixed step. Store gravity, jump impulse,
  coyote time, jump buffer, run speed, and speed thresholds in data.
- Generate course segments from a seeded random source and validate that every
  emitted obstacle sequence is traversable under the configured physics.
- Keep hazards, embers, checkpoints, and the finish beacon as explicit course
  records rather than render-object side effects.
- Route run state, score, ember-chain changes, failure, finish, and reset through
  authoritative systems.
- Load promoted assets by manifest/catalog ID. Keep generated drafts outside
  player-facing paths until promotion.

## Workflow

1. Run `assetgen build-plan --game redline` for the selected project and confirm
   the `platformer-runner` blueprint matches.
2. Read the project's design, course rules, and asset catalog before adding
   mechanics or content.
3. Build the fixed-step courier controller and deterministic reset.
4. Add seeded course segments and prove spike, bar, and gap sequences are
   traversable.
5. Add speed embers, chain scoring, the beacon finish, and final result state.
6. Connect the HUD, VFX, and audio through state listeners and manifest-backed
   assets.
7. Run `assetgen check --game redline`, fix failures, then re-run Build Plan
   until the MVP worklist is clear.

## Verification

- Coyote-time and buffered jumps behave consistently across supported frame
  rates.
- The same seed produces the same course, hazard order, ember placement, and
  finish result inputs.
- Every generated MVP course is traversable using the configured jump envelope.
- Hazards fail or penalize the run once, without duplicate collision effects.
- Ember chains update score and HUD state deterministically.
- Crossing the beacon finishes the run exactly once; restart clears all state.
- Build Plan matches `platformer-runner` and marks the blueprint's MVP asset
  classes.

## Related Skills

- **shipshit-engine:** GameContext/GameSystems, imperative loop, and HUD listener
  conventions.
- **game-asset-pipeline:** manifest-backed asset loading and promotion.
