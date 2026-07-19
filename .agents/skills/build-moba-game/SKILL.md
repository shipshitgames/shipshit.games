---
name: build-moba-game
description: Build or extend a lane-based MOBA MVP with an isometric arena, one player champion, one AI champion, minion waves, Q/W/E abilities, towers, a neutral objective, base-destruction victory, and combat HUD. Use for Pactfall work or when a selected project's design genre is MOBA, lane MOBA, lane PvP, or isometric champion arena.
---

# Build a MOBA Game

Build a compact one-lane PvP arena on the Ship Shit engine. The canonical game is
Pactfall. Use `blueprint.json` with the Build Plan engine to match the selected
project's genre, identify required asset classes, and order the MVP worklist.

Keep the first playable slice local and deterministic: one player champion
against one AI champion. Networked PvP, multiple lanes, item shops, champion
rosters, matchmaking, and ranked systems are follow-up work.

## MVP Contract

- One isometric lane with a base and two towers per team.
- One player-controlled Pyre champion and one AI-controlled Warden champion.
- Timed Pyre and Warden minion waves that advance, acquire targets, and fight.
- Auto-attacks plus three champion abilities: Q, W, and E.
- Health, mana, cooldowns, death, respawn, and deterministic target priority.
- One Scourge neutral objective that grants a temporary team buff when defeated.
- Tower gating: the base cannot take damage until its lane towers fall.
- Victory when the opposing base is destroyed.
- HUD for health, mana, Q/W/E cooldowns, lane state, and victory/defeat.

## Required Asset Classes

- **Sprites/models:** both champions, both minion squads, four towers, two
  bases, and the Scourge neutral objective.
- **UI:** health, mana, Q/W/E cooldowns, lane overview, target feedback, and
  victory/defeat.
- **VFX:** attack impacts, ability telegraphs, dash/slow effects, death bursts,
  neutral-buff feedback, and tower destruction.
- **Music/SFX:** one gameplay loop plus ability, impact, death, objective, and
  tower-destruction cues.

Preserve faction readability. Toxic green belongs to the Scourge parasite and
its objective effects. Pyre and Warden assets stay in black, bone, blood red,
hellfire orange, rust, and gunmetal.

## System Shape

- Use imperative Three.js for the arena and gameplay loop; keep React in the
  HUD and menus.
- Use an orthographic isometric camera and a lane/navigation model with
  explicit team ownership and objective order.
- Keep champion stats, abilities, cooldowns, mana costs, minion waves, tower
  stats, targeting priorities, and neutral buffs in data tables.
- Route damage, death, respawn, objective destruction, and victory through
  single authoritative systems. Do not let render entities own match rules.
- Make AI consume the same movement, targeting, attack, and ability commands as
  the player where possible.
- Keep fixed-step or seeded simulation seams so local AI behavior and tests are
  reproducible.

## Workflow

1. Run `assetgen build-plan --game pactfall` for the selected project and
   confirm the `moba` blueprint matches.
2. Read the project's design and asset catalog; do not invent champions,
   abilities, factions, or canon that the project has already defined.
3. Build the arena, lane, camera, collision, and command model before combat.
4. Add champion movement, auto-attacks, health/mana, and Q/W/E from data.
5. Add minion waves, target priority, towers, bases, and tower gating.
6. Add the AI champion, Scourge objective, team buff, respawn, and win state.
7. Connect HUD/VFX/audio through state listeners and manifest-backed assets.
8. Run `assetgen check --game pactfall`, fix failures, then re-run Build Plan
   until the MVP worklist is clear.

## Verification

- A player can move, auto-attack, cast Q/W/E, spend mana, and observe cooldowns.
- Minions spawn for both teams, advance down-lane, and follow stable target
  priority.
- Towers protect the base in sequence; destroying the enemy base ends the match.
- The AI champion can contest the lane without using a separate combat path.
- Defeating the Scourge objective applies and expires the documented buff.
- Match reset produces a clean initial state with no leaked timers or entities.
- Build Plan matches `moba` and marks the blueprint's MVP asset classes.

## Related Skills

- **shipshit-engine:** GameContext/GameSystems, imperative loop, and HUD listener
  conventions.
- **isometric-3d:** orthographic camera, tile/world transforms, selection, and
  pathfinding foundations.
- **game-asset-pipeline:** manifest-backed asset loading and promotion.
