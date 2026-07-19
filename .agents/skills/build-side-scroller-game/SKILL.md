---
name: build-side-scroller-game
description: Build or extend a side-scrolling infiltration-platformer MVP with responsive hero physics, static and moving platforms, blob/spitter/charger enemies, stomp combat, acid and spike hazards, infiltrate and escape phases, two authored levels, and lives/HP HUD. Use for Rothulk work or when a selected project's genre is side-scroller, side-scrolling platformer, infiltration platformer, platform infiltration, or side-on action platformer.
---

# Build a Side-Scroller Game

Build a compact side-on infiltration platformer on the Ship Shit engine. The
canonical game is Rothulk. Use `blueprint.json` with the Build Plan engine to
match the selected project's genre, identify required asset classes, and order
the MVP worklist.

Keep the first playable slice authored, responsive, and finishable. Procedural
campaigns, metroidvania progression, large enemy rosters, equipment systems,
and online features are follow-up work.

## MVP Contract

- One hero with responsive run, jump, fall, land, stomp, hit, and death states.
- Tunable acceleration, braking, air control, coyote time, jump buffering, and
  variable jump height.
- Static platforms plus moving platforms with stable rider attachment.
- Three readable enemy archetypes: blob, ranged spitter, and charging enemy.
- Stomp-kill combat with explicit bounce, damage, and invulnerability windows.
- Acid pools and spike hazards with consistent checkpoint/life handling.
- Two authored levels, each with an infiltration phase and a timed or pressured
  escape phase after the objective is triggered.
- HUD for HP, lives, phase, objective state, and level completion.

## Required Asset Classes

- **Sprites:** hero animation set, platform/bio-ship tiles, moving platforms,
  blob/spitter/charger enemies, acid and spike hazards, objective, checkpoint,
  and exit.
- **UI:** HP, lives, phase, objective state, checkpoint feedback, and
  level-complete/game-over states.
- **VFX:** jump/land, stomp hit and bounce, damage/invulnerability, acid splash,
  charge telegraph, objective ignition, and escape pressure.
- **Music/SFX:** one infiltration loop, one escape escalation layer or loop,
  plus movement, stomp, enemy, hazard, objective, checkpoint, and finish cues.

Preserve parasite readability. Scourge enemies and the Rothulk environment must
read as host takeover: invasive seams, tendrils, breach cores, and black chitin
consuming stolen flesh, bone, metal, or machinery. Reserve toxic green for
Scourge infection, acid, and breach telemetry. Keep the Pyre hero in black,
bone, blood red, hellfire orange, rust, and gunmetal.

## System Shape

- Use imperative Three.js for the level and gameplay loop; keep React in the HUD
  and menus.
- Run movement and collision on a fixed step. Keep movement, jump, stomp,
  damage, lives, checkpoints, moving-platform, and escape tuning in data.
- Resolve moving-platform displacement before hero collision so riders remain
  attached without velocity spikes or tunneling.
- Give blob, spitter, and charger behaviors explicit state machines and
  telegraphs. Route them through the same damage/death contract.
- Keep hazards, objectives, checkpoints, exits, and phase transitions as
  authored level records rather than render-object side effects.
- Route HP, lives, respawn, objective activation, escape, completion, and reset
  through authoritative systems.
- Load promoted assets by manifest/catalog ID. Keep Rothulk-specific assets and
  levels in the franchise repository, not this tooling repository.

## Workflow

1. Run `assetgen build-plan --game rothulk --skills-dir .agents/skills` for the
   selected project and confirm the `side-scroller` blueprint matches.
2. Read the project's design, level rules, canon, and asset catalog before
   adding mechanics or content.
3. Build the fixed-step hero controller, collision, checkpoints, HP, lives, and
   deterministic reset.
4. Add static and moving platforms, then validate the jump envelope across
   every required traversal gap.
5. Add blob, spitter, and charger behaviors plus stomp, damage, and hazard
   interactions.
6. Author two levels with objective-triggered infiltration-to-escape phase
   transitions.
7. Connect the HUD, VFX, and audio through state listeners and manifest-backed
   assets.
8. Run `assetgen check --game rothulk`, fix failures, then re-run Build Plan
   until the MVP worklist is clear.

## Verification

- Hero acceleration, coyote time, jump buffering, and variable jump height
  behave consistently across supported frame rates.
- Moving platforms carry the hero without jitter, tunneling, or double-applying
  platform velocity.
- Blob, spitter, and charger telegraphs remain readable and deterministic.
- A stomp damages an eligible enemy once, applies one bounce, and cannot also
  damage the hero in the same contact.
- Acid, spikes, and enemy hits consume HP/lives once and respawn at the latest
  valid checkpoint.
- Triggering the objective switches infiltration to escape exactly once; death,
  restart, and level completion clear phase state.
- Both authored levels are finishable from a clean start.
- Build Plan matches `side-scroller` and marks the blueprint's MVP asset
  classes.

## Related Skills

- **shipshit-engine:** GameContext/GameSystems, fixed-step gameplay, collision,
  and HUD listener conventions.
- **game-asset-pipeline:** manifest-backed asset loading and promotion.
