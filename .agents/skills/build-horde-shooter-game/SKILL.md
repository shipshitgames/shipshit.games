---
name: build-horde-shooter-game
description: Blueprint for taking a first-person / arena horde-shooter ("survivors") game to a playable MVP — the required asset classes, the minimum viable slice, and the generate→check→re-plan loop the Build Plan engine drives. Example game: Scourge Survivors.
license: MIT
compatibility: Requires the assetgen CLI and a project selected via the registry (ASSETGEN_IP / ASSETGEN_PROJECT_ROOT) or --root.
metadata:
  version: "1.0.0"
  gameType: horde-shooter
  tags: "blueprint, game-type, horde-shooter, survivors, assetgen, build-plan"
  author: Ship Shit Games
when_to_use: "building a horde shooter / survivors game, scourge-survivors, what does a wave-survivor game need, MVP for a bullet-heaven, build-plan picked the horde-shooter blueprint"
disable-model-invocation: true
---

# Build a Horde-Shooter Game

The framework for a first-person / arena **horde-shooter** ("survivors") game — the
asset classes it needs, the minimum slice to reach a playable MVP, and how the
Build Plan engine (`assetgen build-plan`) uses this blueprint to tell the agent
what to make next. The reference implementation is **Scourge Survivors**.

The machine-readable companion is `blueprint.json` in this directory — the engine
reads it to match a game's genre, score gap coverage, and tag MVP work. Keep the
two in sync: this file is the human/agent framework, `blueprint.json` is the data.

## Contract

Inputs:

- A selected project + game (`assetgen build-plan --game <slug>` with `--ip`/`--root`).
- The game's `DESIGN.md` (genre + core loop) and the shared `assets-catalog.json`.

Outputs:

- An MVP-ordered worklist of asset tasks (what to generate/fix next), plus
  blueprint coverage (which required classes still have gaps).

Delegates To:

- `assetgen build-plan` — produces the plan.
- `assetgen generate` — makes each asset.
- `assetgen check --game <slug>` — validates the result; feeds the next plan.

## Required asset classes

A horde-shooter is asset-dense but front-loadable. Classes (★ = MVP):

- ★ **Sprites** — 1 playable operator (front-facing), 3 enemy archetypes
  (melee / ranged / flying, ~3 anim frames each), 1 boss. Later: more enemies,
  weapon-tier sheets, pickups/gems.
- ★ **UI** — health bar, ammo, XP bar, wave counter, upgrade cards. Later: main
  menu, pause, game-over/results, shop/drydock.
- ★ **VFX** — kill-pop particles, damage flash, screen shake.
- ★ **Music/SFX** — one gameplay loop + pistol / sniper / hit-impact SFX. Later:
  menu + boss themes. (SFX classify under the `music` bucket in the gap map.)

## MVP slice (first playable)

1. 1 playable operator (front-facing FPS sprite).
2. 3 enemy archetypes (melee / ranged / flying), waves 1–10.
3. Auto-fire weapons (pistol + sniper, tier-1).
4. Kill → XP → level-up draft (1-of-3 upgrade pick).
5. HUD: health, ammo, XP bar, wave counter, upgrade cards.
6. 1 gameplay music loop + pistol / sniper / hit SFX.
7. VFX: kill-pop, damage flash, screen shake.

## Workflow (the build loop)

### 1. Plan
`assetgen build-plan --game <slug> --json` (the engine selects this blueprint by
genre). Read the `worklist` — MVP-first, sprites before music before UI before VFX.

### 2. Generate
Take the top worklist item and run `assetgen generate` for it (operator and enemy
sprites first). Generation always runs in the studio; renders are written into the
selected project's `packages/assets`.

### 3. Check
`assetgen check --game <slug>` to validate the new asset resolves, is licensed, and
isn't an orphan. Fix any `broken` items the next plan surfaces.

### 4. Re-plan
Re-run `build-plan`; the rendered variant drops out of the gap and the next MVP
item rises. Repeat until `summary.mvpTasks` is 0 — that's the playable slice.

## Related Skills

- **build-space-shooter-game** — top-down sibling (Starblight); shares the
  survivor loop with a different camera and a 3-phase boss.
- Other `build-<type>-game` blueprints — one per game type the studio ships.
