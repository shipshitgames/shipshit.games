/**
 * @shipshitgames/warline — fixed starting front + map helpers (spec §3).
 */

import type { Breach, Lane, Region, WorldState } from "./types";
import { SCHEMA_VERSION } from "./types";

/** Clamp a number into the inclusive range [lo, hi]. */
export function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

// Source-of-truth map tables (spec §3). Cloned fresh by createInitialWorld.
const REGION_SEED: Region[] = [
  { id: "spire", name: "The Spire", faction: "wardens", pressure: 8, defense: 60, x: 14, y: 20, revealed: true },
  { id: "ashgate", name: "Ashgate", faction: "wardens", pressure: 14, defense: 50, x: 22, y: 48, revealed: true },
  { id: "pyregate", name: "The Pyre Gate", faction: "pyre", pressure: 10, defense: 45, x: 12, y: 76, revealed: true },
  { id: "ashreach", name: "Ash Reach", faction: "pyre", pressure: 18, defense: 35, x: 30, y: 78, revealed: true },
  { id: "rustmarch", name: "Rustmarch", faction: "neutral", pressure: 38, defense: 18, x: 44, y: 32, revealed: true },
  { id: "hollowlanes", name: "The Hollow Lanes", faction: "neutral", pressure: 46, defense: 14, x: 48, y: 60, revealed: true },
  { id: "skyhook", name: "The Skyhook (Orbital Ring)", faction: "neutral", pressure: 30, defense: 20, x: 56, y: 12, revealed: true },
  { id: "maw", name: "The Maw", faction: "scourge", pressure: 92, defense: 0, x: 82, y: 28, breachId: "breach-primus", revealed: false },
  { id: "cinder", name: "Cinder Flats", faction: "scourge", pressure: 84, defense: 0, x: 86, y: 60, breachId: "breach-cinder", revealed: false },
  { id: "perdition", name: "Perdition", faction: "scourge", pressure: 96, defense: 0, x: 74, y: 82, breachId: "breach-perdition", revealed: false },
];

const BREACH_SEED: Breach[] = [
  { id: "breach-primus", name: "Breach Primus", regionId: "maw", intensity: 80, active: true, sabotaged: 0 },
  { id: "breach-cinder", name: "The Cinder Breach", regionId: "cinder", intensity: 70, active: true, sabotaged: 0 },
  { id: "breach-perdition", name: "The Choir Node", regionId: "perdition", intensity: 92, active: true, sabotaged: 0 },
];

const LANE_SEED: Lane[] = [
  { id: "l-spire-ashgate", name: "Spire Causeway", from: "spire", to: "ashgate", flow: 30, control: "wardens" },
  { id: "l-ashgate-pyregate", name: "Wardwalk", from: "ashgate", to: "pyregate", flow: 28, control: "wardens" },
  { id: "l-pyregate-ashreach", name: "Pyre Road", from: "pyregate", to: "ashreach", flow: 26, control: "pyre" },
  { id: "l-spire-rustmarch", name: "North Front", from: "spire", to: "rustmarch", flow: 52, control: "neutral" },
  { id: "l-ashgate-hollow", name: "Foundry Front", from: "ashgate", to: "hollowlanes", flow: 58, control: "neutral" },
  { id: "l-ashreach-hollow", name: "Ash Front", from: "ashreach", to: "hollowlanes", flow: 50, control: "pyre" },
  { id: "l-rust-hollow", name: "Midspan", from: "rustmarch", to: "hollowlanes", flow: 44, control: "neutral" },
  { id: "l-rust-skyhook", name: "Skyhook Tether", from: "rustmarch", to: "skyhook", flow: 36, control: "neutral" },
  { id: "l-rust-maw", name: "The Maw Lane", from: "rustmarch", to: "maw", flow: 72, control: "scourge" },
  { id: "l-hollow-cinder", name: "Cinder Lane", from: "hollowlanes", to: "cinder", flow: 74, control: "scourge" },
  { id: "l-hollow-perdition", name: "Choir Lane", from: "hollowlanes", to: "perdition", flow: 70, control: "scourge" },
  { id: "l-skyhook-maw", name: "Orbital Descent", from: "skyhook", to: "maw", flow: 48, control: "scourge" },
  { id: "l-maw-cinder", name: "Scourge Spine N", from: "maw", to: "cinder", flow: 60, control: "scourge" },
  { id: "l-cinder-perdition", name: "Scourge Spine S", from: "cinder", to: "perdition", flow: 58, control: "scourge" },
];

/**
 * Build the fixed starting world (spec §3). Returns a fresh, deeply-cloned
 * state so callers may safely mutate clones in the reducers.
 */
export function createInitialWorld(now: number): WorldState {
  return {
    schema: SCHEMA_VERSION,
    epoch: 1,
    tick: 0,
    startedAt: now,
    updatedAt: now,
    resources: { scrap: 500, biomass: 200, fuel: 300, intel: 150 },
    pactArmy: 0,
    regions: REGION_SEED.map((r) => ({ ...r })),
    lanes: LANE_SEED.map((l) => ({ ...l })),
    breaches: BREACH_SEED.map((b) => ({ ...b })),
    feed: [],
  };
}

/** Find a region by id (undefined if missing). */
export function regionById(
  state: WorldState,
  id: string,
): Region | undefined {
  return state.regions.find((r) => r.id === id);
}

/** Find a lane by id (undefined if missing). */
export function laneById(state: WorldState, id: string): Lane | undefined {
  return state.lanes.find((l) => l.id === id);
}

/** Find a breach by id (undefined if missing). */
export function breachById(
  state: WorldState,
  id: string,
): Breach | undefined {
  return state.breaches.find((b) => b.id === id);
}

/** Regions exactly one lane away from `regionId`. */
export function neighborsOf(state: WorldState, regionId: string): Region[] {
  const ids = new Set<string>();
  for (const lane of state.lanes) {
    if (lane.from === regionId) ids.add(lane.to);
    else if (lane.to === regionId) ids.add(lane.from);
  }
  const out: Region[] = [];
  for (const id of ids) {
    const r = regionById(state, id);
    if (r) out.push(r);
  }
  return out;
}
