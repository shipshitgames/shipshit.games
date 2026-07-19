---
name: build-space-shooter-game
description: Build or extend a top-down space-shooter survivor MVP with a mouse-follow ship, five enemy archetypes, five auto-fire weapons, XP-gem magnet collection, level-up drafts, a three-phase boss, drydock meta-progression, a run timer, and a parallax starfield. Use for Starblight work or when a selected project's genre is space shooter, arcade space shooter, top-down ship survivor, orbital shooter, ship survivor, or space survivors.
---

# Build a Space Shooter Game

Build a compact top-down ship-survivor run on the Ship Shit engine. The
canonical game is Starblight. Use `blueprint.json` with the Build Plan engine to
match the selected project's genre, identify required asset classes, and order
the MVP worklist.

Keep the first playable slice focused on one complete run. Manual aiming,
multiplayer, ship rosters, branching campaigns, procedural galaxies, and
live-service progression are follow-up work.

## MVP Contract

- One player ship that smoothly follows a mouse or pointer target inside the
  combat bounds.
- Five readable enemy roles: formation swarmer, charger, ranged attacker,
  mine-layer, and support or spawner.
- Five data-driven auto-fire weapon roles: forward shot, seeking salvo,
  orbiting weapon, piercing line, and proximity burst.
- XP gems with a tunable pickup radius and an upgradeable magnet radius.
- A level-up draft that pauses combat, presents distinct upgrades, applies one
  choice exactly once, and resumes the same run.
- One boss with three explicit phases and threshold-driven transitions.
- A run timer and deterministic victory, defeat, restart, and cleanup states.
- A drydock meta-shop that spends earned run currency on persistent upgrades.
- A layered parallax starfield that remains visually subordinate to combat.

Map the enemy and weapon roles to names already defined by the selected
project. Do not invent competing canon when project data exists.

## Required Asset Classes

- **Sprites:** player ship, five enemy roles, five weapon/projectile families,
  XP gem, run-currency pickup, three-phase boss, and drydock upgrade icons.
- **UI:** hull/health, XP and level, run timer, weapon loadout, level-up draft,
  boss phase/health, results, and drydock shop.
- **VFX:** movement trail, weapon fire and impact, XP magnet collection,
  level-up, enemy death, boss phase transitions, victory, and defeat.
- **Music/SFX:** one run loop plus ship, weapon, pickup, level-up, boss,
  victory, defeat, and drydock cues.

Preserve parasite readability. Scourge craft must read as conquered ships or
orbital matter under host takeover: invasive seams, tendrils, breach cores,
black chitin, and toxic-green infection consuming metal or flesh. Keep pilot
ships in black, bone, blood red, hellfire orange, rust, and gunmetal. Reserve
toxic green for Scourge infection and breach telemetry.

## System Shape

- Use imperative Three.js for ships, projectiles, enemies, pickups, and the
  fixed-step gameplay loop; keep React in the HUD, draft, results, and drydock.
- Keep movement, spawn curves, enemy roles, weapon cadence, damage, XP,
  upgrades, boss thresholds, rewards, and drydock prices in data tables.
- Make auto-fire targeting deterministic for a given run seed. Define stable
  tie-breakers when multiple targets have equal priority or distance.
- Resolve XP pickup and magnet attraction through one authoritative system so a
  gem cannot grant XP twice.
- Pause simulation-owned timers and attacks while the level-up draft is open.
  UI animation may continue independently.
- Model boss phases as explicit states. Cross each threshold once and cancel
  attacks or timers owned by the previous phase.
- Separate run state from persistent drydock state. Restart clears every run
  entity and timer without erasing purchased upgrades.
- Load promoted assets by manifest/catalog ID. Keep generated drafts and
  Starblight-specific runtime content in the franchise repository.

## Workflow

1. Run `assetgen build-plan --game starblight --skills-dir .agents/skills` for
   the selected project and confirm the `space-shooter` blueprint matches.
2. Read the project's design, canon, progression rules, and asset catalog before
   naming enemies, weapons, pilots, or upgrades.
3. Build the fixed-step run state, pointer-follow controller, combat bounds,
   starfield, timer, and deterministic reset.
4. Add the five enemy roles and five auto-fire weapon roles from data.
5. Add XP gems, magnet collection, level-up thresholds, and the paused
   three-choice draft.
6. Add the three-phase boss, victory/defeat, rewards, and results state.
7. Add the persistent drydock purchase loop and apply upgrades at run start.
8. Connect HUD, VFX, and audio through state listeners and manifest-backed
   assets.
9. Run `assetgen check --game starblight`, fix failures, then re-run Build Plan
   until the MVP worklist is clear.

## Verification

- Pointer input produces bounded, frame-rate-stable ship movement.
- The five enemy roles spawn and attack through distinct data-driven behaviors.
- The five weapon roles auto-fire with deterministic target selection and
  cannot damage the same target twice from one hit.
- XP gems grant XP once; entering magnet range attracts them without teleport
  or duplicate collection.
- Level-up freezes gameplay, applies one chosen upgrade, and resumes without
  advancing the run timer.
- Boss phase thresholds transition once in order and leave no previous-phase
  attacks or timers alive.
- Victory, defeat, and restart clear enemies, projectiles, pickups, drafts,
  boss state, and transient listeners.
- Drydock purchases persist across runs, reject insufficient currency, and
  apply the purchased upgrade once at the next run start.
- Build Plan matches `space-shooter` and marks the blueprint's MVP asset
  classes.

## Related Skills

- **shipshit-engine:** GameContext/GameSystems, fixed-step gameplay, pooling,
  and HUD listener conventions.
- **game-asset-pipeline:** manifest-backed asset loading and promotion.
