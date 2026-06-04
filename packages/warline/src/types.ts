/**
 * @shipshitgames/warline — core types & constants (spec §1, §2).
 *
 * Pure data shapes for the shared "War for the Lanes" front. No runtime deps.
 */

// ---- factions ----
export type HumanFaction = "pyre" | "wardens";
export type Faction = HumanFaction | "scourge" | "neutral";

// ---- resources ----
export type ResourceKind = "scrap" | "biomass" | "fuel" | "intel";
export type ResourceBag = Record<ResourceKind, number>;

// ---- games & operations ----
export type GameSlug =
  | "scourge-survivors"
  | "deadlane"
  | "pactfall"
  | "starblight"
  | "redline"
  | "rothulk";

export type OperationKind =
  | "purge-breach" // scourge-survivors
  | "hold-lane" // deadlane
  | "contest-territory" // pactfall
  | "orbital-intercept" // starblight
  | "run-logistics" // redline
  | "sabotage"; // rothulk

// ---- world primitives ----
export interface Region {
  id: string;
  name: string;
  faction: Faction; // current controller
  pressure: number; // 0..100 Scourge corruption
  defense: number; // 0..100 fortification (mitigates pressure gain)
  x: number; // 0..100 map coord
  y: number; // 0..100 map coord
  breachId?: string; // present if a breach sits here
  revealed: boolean; // fog: human regions start true, others false; recon reveals
}

export interface Breach {
  id: string;
  name: string;
  regionId: string;
  intensity: number; // 0..100 how hard it pumps
  active: boolean; // false once sealed
  sabotaged: number; // ticks remaining of halved output (0 = normal)
}

export interface Lane {
  id: string;
  name: string;
  from: string; // region id
  to: string; // region id
  flow: number; // 0..100 Scourge flow (spread rate along this lane)
  control: Faction; // who holds the lane
}

export interface WarEvent {
  id: string; // caller-supplied unique id (server uses crypto/uuid; tests use a counter)
  t: number; // tick number
  at: number; // ms epoch
  kind:
    | OperationKind
    | "command"
    | "tick"
    | "fall"
    | "seal"
    | "reset"
    | "system";
  faction: Faction;
  game?: GameSlug;
  text: string;
  sealed?: boolean; // a breach was sealed
}

export interface WorldState {
  schema: number; // SCHEMA_VERSION
  epoch: number; // server-reset counter
  tick: number; // tick counter (advances each tick())
  startedAt: number; // ms epoch the (current epoch's) war began
  updatedAt: number; // ms epoch of last mutation
  resources: ResourceBag; // shared Pact war pool
  pactArmy: number; // mustered army strength
  regions: Region[];
  lanes: Lane[];
  breaches: Breach[];
  feed: WarEvent[]; // newest first, capped at FEED_MAX
}

// ---- game -> meta contract ----
export interface OperationResult {
  game: GameSlug;
  faction: HumanFaction; // who ran the op
  outcome: "victory" | "defeat";
  score: number; // >= 0; magnitude (game score / wave / tier)
  targetId?: string; // optional explicit region/lane/breach id; else server picks
  player?: string; // optional handle
  nonce?: string; // optional idempotency key
}

// ---- build / spend / raise-army loop ----
export type Command =
  | { kind: "fortify"; regionId: string; faction: HumanFaction; player?: string }
  | { kind: "muster"; faction: HumanFaction; player?: string }
  | { kind: "deploy"; regionId: string; faction: HumanFaction; player?: string }
  | { kind: "recon"; regionId: string; faction: HumanFaction; player?: string };

export type CommandKind = Command["kind"];

export interface Summary {
  regionsTotal: number;
  regionsHuman: number;
  regionsScourge: number;
  regionsNeutral: number;
  control: { pyre: number; wardens: number; scourge: number; neutral: number }; // region counts
  frontControlPct: number; // 0..100 = human / (human+scourge) regions
  threat: number; // 0..100 mean pressure on human+neutral regions, weighted by breaches
  activeBreaches: number;
  army: number;
  resources: ResourceBag;
}

// ============================================================================
// Constants (spec §2)
// ============================================================================

export const SCHEMA_VERSION = 1;

export const RESOURCE_KINDS: ResourceKind[] = [
  "scrap",
  "biomass",
  "fuel",
  "intel",
];

export const FEED_MAX = 60;
export const TICK_MS = 15000; // server alarm + local store interval

// passive economy per tick
export const ECON = {
  scrapPerHuman: 4,
  fuelPerHuman: 2,
  intelPerHuman: 1,
  biomassPerScourge: 2,
} as const;

// tick dynamics
export const TICK = {
  breachToPressure: 0.05, // region.pressure += intensity * this (×0.5 if sabotaged)
  defenseMitigate: 200, // effective gain ×= (1 - defense/this)
  laneSpread: 0.06, // pressure transferred along a lane ∝ flow * this
  defenseDecay: 1, // defense -= this per tick (floor 0)
  intensityRegen: 1.5, // breach.intensity climbs back toward 100 by this (×0 if sabotaged)
  fallThreshold: 100, // human region falls to scourge at/above this pressure
} as const;

export const COMMAND_COSTS: Record<
  CommandKind,
  Partial<ResourceBag> & { army?: number }
> = {
  fortify: { scrap: 120, fuel: 40 },
  muster: { biomass: 80, scrap: 60 },
  deploy: { fuel: 60, army: 40 },
  recon: { intel: 50 },
};

export const COMMAND_EFFECT = {
  fortifyDefense: 18,
  fortifyPressure: -6,
  musterArmy: 25,
  deployPressure: -35,
  deployFlipAtPressure: 50,
  deployCaptureDefense: 20,
} as const;
