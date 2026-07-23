---
name: build-fighting-game
description: Build or extend a competitive brawler MVP with four selectable fighters, Duel and Arena rule sets, light/heavy/special attacks, guard, cooldowns, deterministic hit and knockback resolution, damage-percent stocks, combat feedback, and a Warline-compatible result. Use for Brawl work or when a selected project's genre is fighting game, brawler, platform fighter, arena fighter, versus fighter, or combat arena.
---

# Build a Fighting Game

Build a compact competitive brawler on the Ship Shit engine. The canonical game
is Brawl. Use `blueprint.json` with the Build Plan engine to match the selected
project's genre, identify required asset classes, and order the MVP worklist.

Keep the first playable slice focused on complete local matches. Online
rollback, tournament systems, campaign progression, large rosters, equipment,
and cosmetics are follow-up work.

## MVP Contract

- Four selectable fighters, each with a pose/animation sheet and data-defined
  movement, guard, light, heavy, special, hit, KO, and victory states.
- A fighter-select screen that assigns two fighters and starts either rule set.
- Duel: one-versus-one combat ending when a fighter is knocked out.
- Arena: damage-percent knockback, ring-outs, and a finite stock count.
- Light, heavy, and special attacks with explicit startup, active, recovery,
  cooldown, hitbox, damage, and knockback data.
- Guard with deterministic block, release, and hit interactions.
- Hit flash, impact feedback, and bounded camera shake driven by combat events.
- A deterministic result screen and Warline-compatible result record.
- Clean rematch and fighter-select reset paths with no leaked combat state.

## Required Asset Classes

- **Sprites:** four fighter pose/animation sheets, attack and guard poses, Duel
  arena, Arena stage, spawn points, and ring-out bounds.
- **UI:** fighter select, mode select, Duel health/KO state, Arena damage
  percent/stocks, attack cooldowns, guard state, round state, and results.
- **VFX:** light/heavy/special trails and impacts, guard contact, hit flash,
  camera shake, KO, ring-out, stock loss, and victory.
- **Music/SFX:** one fight loop plus movement, light/heavy/special, guard,
  impact, KO, ring-out, stock, select, and result cues.

Preserve faction readability. Scourge fighters must read as parasitic host
takeover, with toxic green reserved for infection and parasite effects. Keep
Pyre and Warden fighters in black, bone, blood red, hellfire orange, rust, and
gunmetal. Read fighter names, silhouettes, moves, and faction alignment from
the selected project's canon instead of inventing replacements.

## System Shape

- Use imperative Three.js for fighters, stages, hitboxes, hurtboxes, physics,
  and the fixed-step combat loop; keep React in fighter select, HUD, and results.
- Run both rule sets through one combat core. Make health/KO and
  percent/stocks/ring-outs rule adapters, not divergent fighter controllers.
- Keep fighter stats, move frames, cooldowns, hitboxes, hurtboxes, damage,
  knockback, guard behavior, stocks, and stage bounds in data tables.
- Buffer commands and model fighter actions as explicit states. Resolve
  startup, active, recovery, cooldown, interruption, and landing consistently.
- Resolve each attack-target pair once per active window. Route damage, guard,
  hit stun, knockback, KO, ring-out, stock loss, and victory through one
  authoritative combat system.
- Compute Arena knockback from move data and current damage percent with stable
  caps and tie-breakers. Keep physics deterministic for a given input trace.
- Emit hit flash, shake, audio, HUD, and result updates from combat events; do
  not let presentation code decide match outcomes.
- Load promoted assets by manifest/catalog ID. Keep Brawl-specific runtime
  content and Warline integration data in the franchise repository.

## Workflow

1. Run `assetgen build-plan --game brawl --skills-dir .agents/skills` for the
   selected project and confirm the `fighting` blueprint matches.
2. Read the project's fighter roster, move rules, stage rules, canon, and asset
   catalog before naming fighters or attacks.
3. Build the fixed-step fighter controller, input buffer, state machine,
   hitbox/hurtbox model, and deterministic reset.
4. Add light, heavy, special, guard, cooldown, damage, hit stun, and knockback
   from shared fighter data.
5. Add fighter select and Duel health/KO rules.
6. Add Arena damage-percent, ring-out, stock, respawn, and victory rules on the
   same combat core.
7. Connect hit feedback, HUD, results, and the Warline result record through
   combat-state listeners and manifest-backed assets.
8. Run `assetgen check --game brawl`, fix failures, then re-run Build Plan until
   the MVP worklist is clear.

## Verification

- All four fighters can be selected and enter either rule set with the correct
  data, pose sheet, spawn, and clean initial state.
- Light, heavy, and special moves respect startup/active/recovery frames and
  cooldowns; one active window cannot hit the same target twice.
- Guard blocks only eligible attacks and cannot leave a fighter stuck in guard
  or recovery.
- Duel ends exactly once on KO and produces the expected winner and result.
- Arena knockback scales with damage percent; ring-outs consume one stock,
  respawn safely, and end the match when the final stock is lost.
- Hit flash and camera shake fire once per confirmed hit and never affect
  combat calculations.
- Rematch and fighter-select reset clear timers, inputs, hit state, stocks,
  percent, cooldowns, effects, and listeners.
- Build Plan matches `fighting` and marks the blueprint's MVP asset classes.

## Related Skills

- **shipshit-engine:** GameContext/GameSystems, fixed-step gameplay, collision,
  input, and HUD listener conventions.
- **game-asset-pipeline:** manifest-backed asset loading and promotion.
