/**
 * @shipshitgames/warline — pure reducers for the living world (spec §4 effects, §5).
 *
 * Every function clones the input WorldState and returns a new one; the input is
 * treated as frozen. No Date.now() inside — callers pass `now`.
 */

import type {
  Breach,
  Faction,
  Lane,
  OperationResult,
  Region,
  ResourceBag,
  WarEvent,
  WorldState,
} from "./types";
import { ECON, FEED_MAX, TICK } from "./types";
import { clamp, createInitialWorld } from "./map";
import { GAME_OPERATIONS } from "./operations";

export interface ApplyResult {
  state: WorldState;
  event: WarEvent;
  credited: Partial<ResourceBag>;
}

const HUMAN_FACTIONS: Faction[] = ["pyre", "wardens"];

function isHuman(f: Faction): boolean {
  return f === "pyre" || f === "wardens";
}

/**
 * Pure, deterministic event id (spec §5). The server may swap in a uuid; tests
 * rely on this counter-ish shape staying stable.
 */
export function makeEventId(state: WorldState, now: number): string {
  return `e${state.tick}-${state.feed.length}-${now}`;
}

/**
 * Operation magnitude (spec §5): victory ~0.6..1.4, defeat ~0.2.
 */
export function magnitude(result: OperationResult): number {
  const base = result.outcome === "victory" ? 1 : 0.35;
  const scale =
    0.6 + (Math.min(Math.max(result.score, 0), 4000) / 4000) * 0.8;
  return base * scale;
}

// ---- internal clone (deep enough: every mutated array/object copied) ----
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

// ---- credit resources into the shared pool ----
function credit(state: WorldState, bag: Partial<ResourceBag>): void {
  for (const k of Object.keys(bag) as (keyof ResourceBag)[]) {
    const v = bag[k];
    if (v) state.resources[k] += v;
  }
}

// ---- clamp every per-entity field to [0,100] ----
function clampWorld(state: WorldState): void {
  for (const r of state.regions) {
    r.pressure = clamp(r.pressure, 0, 100);
    r.defense = clamp(r.defense, 0, 100);
  }
  for (const b of state.breaches) {
    b.intensity = clamp(b.intensity, 0, 100);
  }
  for (const l of state.lanes) {
    l.flow = clamp(l.flow, 0, 100);
  }
}

// ---- push a feed event, newest-first, capped ----
function pushEvent(state: WorldState, event: WarEvent): void {
  state.feed.unshift(event);
  if (state.feed.length > FEED_MAX) {
    state.feed.length = FEED_MAX;
  }
}

// ---- target resolution helpers (spec §4 default-target column) ----
function hottestActiveBreach(state: WorldState): Breach | undefined {
  let best: Breach | undefined;
  for (const b of state.breaches) {
    if (!b.active) continue;
    if (!best || b.intensity > best.intensity) best = b;
  }
  return best;
}

function highestPressureRegion(state: WorldState): Region | undefined {
  let best: Region | undefined;
  for (const r of state.regions) {
    if (!best || r.pressure > best.pressure) best = r;
  }
  return best;
}

function laneEndpoints(
  state: WorldState,
  lane: Lane,
): { a: Region | undefined; b: Region | undefined } {
  return {
    a: state.regions.find((r) => r.id === lane.from),
    b: state.regions.find((r) => r.id === lane.to),
  };
}

/** Highest-flow lane bordering a human region whose control is scourge/neutral. */
function bestHoldLane(state: WorldState): Lane | undefined {
  let best: Lane | undefined;
  for (const lane of state.lanes) {
    if (lane.control !== "scourge" && lane.control !== "neutral") continue;
    const { a, b } = laneEndpoints(state, lane);
    const bordersHuman =
      (a !== undefined && isHuman(a.faction)) ||
      (b !== undefined && isHuman(b.faction));
    if (!bordersHuman) continue;
    if (!best || lane.flow > best.flow) best = lane;
  }
  return best;
}

/** A neutral region adjacent to `faction`'s territory. */
function contestableRegion(
  state: WorldState,
  faction: Faction,
): Region | undefined {
  for (const r of state.regions) {
    if (r.faction !== "neutral") continue;
    const adjacentToFaction = state.lanes.some((lane) => {
      if (lane.from === r.id) {
        const other = state.regions.find((x) => x.id === lane.to);
        return other?.faction === faction;
      }
      if (lane.to === r.id) {
        const other = state.regions.find((x) => x.id === lane.from);
        return other?.faction === faction;
      }
      return false;
    });
    if (adjacentToFaction) return r;
  }
  return undefined;
}

/**
 * Apply a game OperationResult to the front (spec §4). Resolves the target by
 * `targetId` else the per-game default rule, applies the effect, clamps, credits
 * resources, and pushes a newest-first WarEvent.
 */
export function applyOperation(
  state: WorldState,
  result: OperationResult,
  now: number,
): ApplyResult {
  const next = cloneWorld(state);
  const m = magnitude(result);
  const victory = result.outcome === "victory";
  const meta = GAME_OPERATIONS[result.game];
  const credited: Partial<ResourceBag> = {};
  let sealed = false;
  let text = "";

  // Explicit target lookups (may be undefined; default rules below fall back).
  const targetId = result.targetId;
  const findRegion = (id?: string) =>
    id ? next.regions.find((r) => r.id === id) : undefined;
  const findLane = (id?: string) =>
    id ? next.lanes.find((l) => l.id === id) : undefined;
  const findBreach = (id?: string) =>
    id ? next.breaches.find((b) => b.id === id) : undefined;

  switch (meta.kind) {
    case "purge-breach": {
      const breach = findBreach(targetId) ?? hottestActiveBreach(next);
      if (breach) {
        const region = next.regions.find((r) => r.id === breach.regionId);
        if (victory) {
          breach.intensity -= 22 * m;
          if (region) region.pressure -= 14 * m;
          if (breach.intensity <= 0) {
            breach.intensity = 0;
            breach.active = false;
            sealed = true;
            credited.intel = (credited.intel ?? 0) + 120;
          }
          credited.biomass = (credited.biomass ?? 0) + 60 * m;
          credited.intel = (credited.intel ?? 0) + 25 * m;
        }
        text = victory
          ? sealed
            ? `${result.faction} sealed ${breach.name}.`
            : `${result.faction} purged ${breach.name}.`
          : `${result.faction}'s purge of ${breach.name} faltered.`;
      } else {
        text = `${result.faction} found no breach to purge.`;
      }
      break;
    }

    case "hold-lane": {
      const lane = findLane(targetId) ?? bestHoldLane(next);
      if (lane) {
        if (victory) {
          lane.flow -= 20 * m;
          const { a, b } = laneEndpoints(next, lane);
          if (a && isHuman(a.faction)) a.defense += 8 * m;
          if (b && isHuman(b.faction)) b.defense += 8 * m;
          credited.scrap = (credited.scrap ?? 0) + 70 * m;
          credited.fuel = (credited.fuel ?? 0) + 20 * m;
        } else {
          lane.flow += 8;
        }
        text = victory
          ? `${result.faction} held ${lane.name}.`
          : `${result.faction} lost ground on ${lane.name}.`;
      } else {
        text = `${result.faction} had no lane to hold.`;
      }
      break;
    }

    case "contest-territory": {
      const region =
        findRegion(targetId) ?? contestableRegion(next, result.faction);
      if (region && victory) {
        region.faction = result.faction;
        region.revealed = true;
        credited.intel = (credited.intel ?? 0) + 50 * m;
        text = `${result.faction} claimed ${region.name}.`;
      } else if (region) {
        text = `${result.faction}'s push on ${region.name} stalled.`;
      } else {
        text = `${result.faction} found no territory to contest.`;
      }
      break;
    }

    case "orbital-intercept": {
      if (victory) {
        for (const b of next.breaches) {
          if (b.active) b.intensity -= 8 * m;
        }
        const hot = highestPressureRegion(next);
        if (hot) hot.pressure -= 18 * m;
        credited.fuel = (credited.fuel ?? 0) + 55 * m;
        credited.intel = (credited.intel ?? 0) + 15 * m;
        text = `${result.faction} ran an orbital intercept.`;
      } else {
        text = `${result.faction}'s intercept missed.`;
      }
      break;
    }

    case "run-logistics": {
      if (victory) {
        next.pactArmy += 6 * m;
        credited.scrap = (credited.scrap ?? 0) + 90 * m;
        credited.fuel = (credited.fuel ?? 0) + 70 * m;
        text = `${result.faction} delivered war logistics.`;
      } else {
        text = `${result.faction}'s convoy was scattered.`;
      }
      break;
    }

    case "sabotage": {
      const breach = findBreach(targetId) ?? hottestActiveBreach(next);
      if (breach) {
        if (victory) {
          breach.intensity -= 30 * m;
          breach.sabotaged += 4;
          const region = next.regions.find((r) => r.id === breach.regionId);
          if (region) region.defense += 4 * m;
          credited.biomass = (credited.biomass ?? 0) + 50 * m;
        }
        text = victory
          ? `${result.faction} sabotaged ${breach.name}.`
          : `${result.faction}'s sabotage of ${breach.name} failed.`;
      } else {
        text = `${result.faction} found no breach to sabotage.`;
      }
      break;
    }
  }

  // Defeats still get a small recon trickle (spec §4).
  if (!victory) {
    credited.intel = (credited.intel ?? 0) + 8;
  }

  credit(next, credited);
  if (next.pactArmy < 0) next.pactArmy = 0;
  clampWorld(next);

  const event: WarEvent = {
    id: makeEventId(state, now),
    t: next.tick,
    at: now,
    kind: meta.kind,
    faction: result.faction,
    game: result.game,
    text,
    ...(sealed ? { sealed: true } : {}),
  };
  pushEvent(next, event);
  next.updatedAt = now;

  return { state: next, event, credited };
}

/**
 * One step of the living world (spec §5). Pressure spreads, breaches pump,
 * regions can fall, the Scourge can recede, and the passive economy ticks.
 */
export function tick(state: WorldState, now: number): WorldState {
  const next = cloneWorld(state);

  // 1. advance the clock.
  next.tick += 1;
  next.updatedAt = now;

  // 2. Breach output: pump pressure into the breach's region, decay sabotage,
  //    regrow intensity toward 100.
  for (const b of next.breaches) {
    if (b.active) {
      const region = next.regions.find((r) => r.id === b.regionId);
      if (region) {
        const sabFactor = b.sabotaged > 0 ? 0.5 : 1;
        const mitigate = 1 - region.defense / TICK.defenseMitigate;
        region.pressure +=
          b.intensity * TICK.breachToPressure * sabFactor * mitigate;
      }
      const regenFactor = b.sabotaged > 0 ? 0 : 1;
      b.intensity += TICK.intensityRegen * regenFactor;
    }
    if (b.sabotaged > 0) b.sabotaged -= 1;
  }

  // 3. Lane spread: transfer pressure from the higher endpoint to the lower.
  for (const lane of next.lanes) {
    const a = next.regions.find((r) => r.id === lane.from);
    const b = next.regions.find((r) => r.id === lane.to);
    if (!a || !b) continue;
    const hi = a.pressure >= b.pressure ? a : b;
    const lo = hi === a ? b : a;
    const xfer = (hi.pressure - lo.pressure) * (lane.flow / 100) * TICK.laneSpread;
    lo.pressure += xfer;
  }

  // 4. Defense decay on every human region.
  for (const r of next.regions) {
    if (isHuman(r.faction)) {
      r.defense = Math.max(0, r.defense - TICK.defenseDecay);
    }
  }

  // 5. Falls: any human region at/above the threshold falls to the Scourge.
  for (const r of next.regions) {
    if (isHuman(r.faction) && r.pressure >= TICK.fallThreshold) {
      const prev = r.faction;
      r.faction = "scourge";
      r.defense = 0;
      r.revealed = true;
      pushEvent(next, {
        id: makeEventId(next, now),
        t: next.tick,
        at: now,
        kind: "fall",
        faction: prev,
        text: `${r.name} has fallen to the Scourge.`,
      });
    }
  }

  // 6. Reconquest sanity: a quiet scourge region with a human neighbor recedes.
  for (const r of next.regions) {
    if (r.faction !== "scourge") continue;
    if (r.pressure > 25) continue;
    const hasHumanNeighbor = next.lanes.some((lane) => {
      if (lane.from === r.id) {
        const other = next.regions.find((x) => x.id === lane.to);
        return other ? isHuman(other.faction) : false;
      }
      if (lane.to === r.id) {
        const other = next.regions.find((x) => x.id === lane.from);
        return other ? isHuman(other.faction) : false;
      }
      return false;
    });
    if (hasHumanNeighbor) {
      r.faction = "neutral";
      pushEvent(next, {
        id: makeEventId(next, now),
        t: next.tick,
        at: now,
        kind: "system",
        faction: "neutral",
        text: `The Scourge has receded from ${r.name}.`,
      });
    }
  }

  // 7. Passive economy.
  let human = 0;
  let scourge = 0;
  for (const r of next.regions) {
    if (isHuman(r.faction)) human += 1;
    else if (r.faction === "scourge") scourge += 1;
  }
  next.resources.scrap += ECON.scrapPerHuman * human;
  next.resources.fuel += ECON.fuelPerHuman * human;
  next.resources.intel += ECON.intelPerHuman * human;
  next.resources.biomass += ECON.biomassPerScourge * scourge;

  // 8. Final clamp of all per-entity fields.
  clampWorld(next);

  return next;
}

/**
 * Reset to a fresh world (spec §5). Epoch increments off the previous epoch and
 * a `reset` event is seeded into the feed.
 */
export function resetWorld(now: number, prevEpoch?: number): WorldState {
  const next = createInitialWorld(now);
  next.epoch = (prevEpoch ?? 0) + 1;
  const event: WarEvent = {
    id: makeEventId(next, now),
    t: next.tick,
    at: now,
    kind: "reset",
    faction: "neutral",
    text: `The war has reset. Epoch ${next.epoch} begins.`,
  };
  pushEvent(next, event);
  next.updatedAt = now;
  return next;
}

// Re-export for downstream convenience (kept here so reducer is self-contained).
export { HUMAN_FACTIONS };
