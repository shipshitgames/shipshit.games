---
name: build-strategy-campaign-game
description: Build or extend a persistent strategy-campaign MVP with a 3D portal lobby, portal bays, five PBR texture sets, an SVG war map, regions/lanes/breaches, four resources, Fortify/Muster/Deploy/Recon commands, a deterministic local tick loop, a PartyKit-ready live seam, and accessible faction coding. Use for Warline work or when a selected project's genre is strategy campaign, strategy hub, persistent strategy front, campaign strategy, war-map strategy, or grand-strategy hub.
---

# Build a Strategy Campaign Game

Build a persistent war-front meta-layer on the Ship Shit engine. The canonical
game is Warline. Use `blueprint.json` with the Build Plan engine to match the
selected project's genre, identify required asset classes, and order the MVP
worklist.

Keep the first playable slice focused on one readable front and one shared rule
set. Multiple theaters, diplomacy, deep research trees, live-service seasons,
and autonomous faction simulation are follow-up work.

## MVP Contract

- One imperative Three.js portal lobby with operation bays and five
  manifest-backed PBR texture sets.
- One SVG war map with stable region, lane, and breach IDs.
- Four project-defined resources with explicit income, cost, capacity, and
  insufficient-resource states.
- Four data-driven commands: Fortify, Muster, Deploy, and Recon.
- One deterministic local tick loop with versioned save/load and bounded
  offline catch-up.
- One live transport seam ready for PartyKit without a second campaign rules
  implementation.
- Faction-coded map, command, portal, and status feedback. Color is never the
  only faction or state signal.
- Operation results from selected games can update the front through explicit,
  idempotent contracts.

Read the selected project's canon and design before naming resources, regions,
factions, operations, or portal bays. Do not copy Warline-specific content into
another project.

## Required Asset Classes

- **Models/materials:** portal-lobby shell, operation bays, map table, breach
  indicators, and five PBR texture sets.
- **UI:** SVG map, region/lane/breach states, four resource counters, command
  controls, order preview, tick clock, local/live status, faction legend, and
  operation result.
- **VFX:** portal activation, command acknowledgement, lane pressure,
  fortification, breach escalation, recon reveal, and front-state changes.
- **Music/SFX:** one strategy loop plus portal, tick, Fortify, Muster, Deploy,
  Recon, resource, alert, and result cues.

Preserve faction readability. Reserve toxic green for Scourge infection,
captured territory, and breach pressure. Keep Pyre and Warden surfaces in
black, bone, blood red, hellfire orange, rust, and gunmetal. Pair faction color
with labels, icons, patterns, or silhouettes for accessible state reading.

## System Shape

- Use imperative Three.js for the portal lobby and world-space map table; keep
  React in the SVG map, command controls, resource HUD, and status overlays.
- Keep resources, regions, lanes, breaches, factions, commands, costs, income,
  and tick phases in versioned data. Render objects must not own campaign rules.
- Route Fortify, Muster, Deploy, and Recon through one command validator and
  reducer. Give every accepted command an idempotency key so retries cannot
  spend resources or apply orders twice.
- Resolve ticks in a documented, deterministic order from a seed and campaign
  snapshot. Validate queued commands before spending resources, then resolve
  the front, income/upkeep, alerts, and the next persisted snapshot.
- Keep local and live modes behind the same campaign interface. Local mode owns
  the clock and persistence; live mode sends typed game messages through the
  engine PartyKit seam and accepts server-authoritative snapshots.
- Use only non-reserved `GameMessage.t` values for Warline payloads. Treat the
  network layer as transport, not an alternate simulation.
- Bound offline catch-up by elapsed time and tick count. Persist the last
  completed tick before scheduling the next one.
- Consume operation results once by stable operation/result ID. Reject stale,
  unknown, malformed, or duplicate reports without changing the front.
- Load promoted assets by manifest/catalog ID. Keep Warline-specific runtime
  content in the franchise repository.

## Workflow

1. Run `assetgen build-plan --game <selected-game-slug> --skills-dir
.agents/skills` for the selected project (`warline` for the canonical game)
   and confirm the `strategy-campaign` blueprint matches.
2. Read the project's design, canon, operation contracts, map schema, resource
   rules, and asset catalog before defining campaign content.
3. Build the versioned campaign state, command validator/reducer, deterministic
   tick phases, persistence, migrations, and idempotent operation ingestion.
4. Build the SVG map from stable region/lane/breach data and add accessible
   faction/state encoding.
5. Add the four resources and Fortify/Muster/Deploy/Recon command flows with
   cost previews, validation, acknowledgement, and failure feedback.
6. Add the Three.js portal lobby, portal-bay selection, five PBR texture sets,
   and transitions that preserve the active campaign snapshot.
7. Add the local clock, save/load, restart, and bounded offline catch-up.
8. Add the PartyKit-ready adapter around the same commands, reducer inputs, and
   snapshots; keep live activation optional.
9. Connect UI, VFX, and audio through state listeners and manifest-backed
   assets. Run `assetgen check --game warline`, then re-run Build Plan until the
   MVP worklist is clear.

## Verification

- Build Plan matches `strategy-campaign` for both `Strategy Hub` and `Strategy
Campaign` genre labels and marks the blueprint's MVP asset classes.
- The same initial snapshot, seed, commands, and tick count produce the same
  resources, orders, lanes, breaches, and alerts.
- Fortify, Muster, Deploy, and Recon validate their preconditions, spend each
  resource at most once, and change only their documented campaign state.
- Save/reload and bounded offline catch-up neither skip nor double-apply ticks,
  commands, income, or operation results.
- SVG region, lane, and breach IDs remain stable; every faction/state color has
  a label, icon, pattern, or shape counterpart.
- Portal-lobby and war-map transitions preserve the selected operation and
  campaign snapshot without leaked render objects, listeners, or timers.
- Local and live adapters drive the same command and tick contracts; malformed,
  stale, reserved-type, and duplicate network messages are ignored safely.
- Reset clears transient commands, timers, alerts, and transport listeners
  without erasing an explicitly retained campaign save.

## Related Skills

- **shipshit-engine:** GameContext/GameSystems, imperative lifecycle, and the
  PartyKit transport seam.
- **isometric-3d:** portal-lobby camera, PBR materials, selection, and world/UI
  projection foundations.
- **game-asset-pipeline:** manifest-backed asset loading and promotion.
