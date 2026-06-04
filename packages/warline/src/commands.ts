/**
 * @shipshitgames/warline — build / spend / raise-army commands (spec §6).
 *
 * Open (unauthenticated) shared-front actions. Pure + immutable: clone, validate
 * against COMMAND_COSTS, deduct, apply effect, push a `command` event.
 */

import type {
  Command,
  CommandKind,
  Region,
  ResourceKind,
  WarEvent,
  WorldState,
} from "./types";
import { COMMAND_COSTS, COMMAND_EFFECT, FEED_MAX } from "./types";
import { clamp } from "./map";
import { makeEventId } from "./reducer";

export interface CommandResult {
  ok: boolean;
  state: WorldState;
  error?: string;
  event?: WarEvent;
}

function cloneWorld(state: WorldState): WorldState {
  return {
    ...state,
    resources: { ...state.resources },
    regions: state.regions.map((r) => ({ ...r })),
    lanes: state.lanes.map((l) => ({ ...l })),
    breaches: state.breaches.map((b) => ({ ...b })),
    feed: state.feed.slice(),
  };
}

function pushEvent(state: WorldState, event: WarEvent): void {
  state.feed.unshift(event);
  if (state.feed.length > FEED_MAX) {
    state.feed.length = FEED_MAX;
  }
}

/** Whether the shared pool (and army, for deploy) can pay for `kind`. */
export function canAfford(state: WorldState, kind: CommandKind): boolean {
  const cost = COMMAND_COSTS[kind];
  for (const k of Object.keys(cost) as (keyof typeof cost)[]) {
    const need = cost[k] ?? 0;
    if (k === "army") {
      if (state.pactArmy < need) return false;
    } else {
      if (state.resources[k as ResourceKind] < need) return false;
    }
  }
  return true;
}

function deduct(state: WorldState, kind: CommandKind): void {
  const cost = COMMAND_COSTS[kind];
  for (const k of Object.keys(cost) as (keyof typeof cost)[]) {
    const need = cost[k] ?? 0;
    if (k === "army") {
      state.pactArmy -= need;
    } else {
      state.resources[k as ResourceKind] -= need;
    }
  }
}

function isHuman(faction: Region["faction"]): boolean {
  return faction === "pyre" || faction === "wardens";
}

/**
 * Apply a build / muster / deploy / recon command (spec §6). Returns
 * `{ ok:false, state }` (state unchanged) on shortfall or invalid target.
 */
export function applyCommand(
  state: WorldState,
  cmd: Command,
  now: number,
): CommandResult {
  if (!canAfford(state, cmd.kind)) {
    return { ok: false, state, error: "insufficient resources" };
  }

  const next = cloneWorld(state);
  let text = "";

  switch (cmd.kind) {
    case "fortify": {
      const region = next.regions.find((r) => r.id === cmd.regionId);
      if (!region) {
        return { ok: false, state, error: "no such region" };
      }
      if (!isHuman(region.faction)) {
        return { ok: false, state, error: "region not human-controlled" };
      }
      deduct(next, cmd.kind);
      region.defense = clamp(
        region.defense + COMMAND_EFFECT.fortifyDefense,
        0,
        100,
      );
      region.pressure = clamp(
        region.pressure + COMMAND_EFFECT.fortifyPressure,
        0,
        100,
      );
      text = `${cmd.faction} fortified ${region.name}.`;
      break;
    }

    case "muster": {
      deduct(next, cmd.kind);
      next.pactArmy += COMMAND_EFFECT.musterArmy;
      text = `${cmd.faction} mustered fresh troops.`;
      break;
    }

    case "deploy": {
      const region = next.regions.find((r) => r.id === cmd.regionId);
      if (!region) {
        return { ok: false, state, error: "no such region" };
      }
      deduct(next, cmd.kind);
      region.pressure = clamp(
        region.pressure + COMMAND_EFFECT.deployPressure,
        0,
        100,
      );
      if (
        region.faction === "scourge" &&
        region.pressure <= COMMAND_EFFECT.deployFlipAtPressure
      ) {
        region.faction = cmd.faction;
        region.defense = COMMAND_EFFECT.deployCaptureDefense;
        region.revealed = true;
        text = `${cmd.faction} recaptured ${region.name}.`;
      } else if (region.faction === "neutral") {
        region.faction = cmd.faction;
        text = `${cmd.faction} deployed into ${region.name}.`;
      } else {
        text = `${cmd.faction} deployed to ${region.name}.`;
      }
      break;
    }

    case "recon": {
      const region = next.regions.find((r) => r.id === cmd.regionId);
      if (!region) {
        return { ok: false, state, error: "no such region" };
      }
      deduct(next, cmd.kind);
      region.revealed = true;
      text = `${cmd.faction} reconned ${region.name}.`;
      break;
    }
  }

  const event: WarEvent = {
    id: makeEventId(state, now),
    t: next.tick,
    at: now,
    kind: "command",
    faction: cmd.faction,
    text,
  };
  pushEvent(next, event);
  next.updatedAt = now;

  return { ok: true, state: next, event };
}
