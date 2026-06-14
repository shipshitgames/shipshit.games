// Local mirror of the @shipshitgames/engine ArenaMap schema
// (packages/engine/src/world/map.ts + bounds.ts), duplicated field-for-field so
// assetgen carries ZERO `three`/engine dependency. The engine modules begin with
// `import type * as THREE from 'three'`, which tsc would follow if assetgen imported
// engine directly — pulling in `three`/`@types/three`, neither of which assetgen
// depends on. So we mirror the shapes here for generation + validation, and the
// emitted map module (see buildMapsModule) re-imports `ArenaMap` as `import type`
// from '@shipshitgames/engine' so the generated file is checked against the
// canonical engine types in the consuming game.

export type ColorToken = number | string;

export interface MapFog {
  color: ColorToken;
  near?: number;
  far?: number;
  density?: number;
  kind?: "linear" | "exponential";
}

export interface MapTheme {
  id: string;
  skyColor?: ColorToken;
  groundColor?: ColorToken;
  fog?: MapFog;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface RectMapObstacle {
  kind: "rect";
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height?: number;
  blocksMovement?: boolean;
  tags?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
}

export interface CircleMapObstacle {
  kind: "circle";
  id: string;
  x: number;
  z: number;
  radius: number;
  height?: number;
  blocksMovement?: boolean;
  tags?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
}

export type MapObstacle = RectMapObstacle | CircleMapObstacle;

export interface MapLight {
  kind: "ambient" | "directional" | "point";
  id: string;
  color: ColorToken;
  intensity: number;
  position?: readonly [x: number, y: number, z: number];
  target?: readonly [x: number, y: number, z: number];
  distance?: number;
  decay?: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export type MapBounds =
  | { kind: "square"; half: number }
  | { kind: "rect"; minX: number; maxX: number; minZ: number; maxZ: number };

export interface ArenaMap {
  id: string;
  name?: string;
  bounds: MapBounds;
  theme?: MapTheme;
  obstacles?: readonly MapObstacle[];
  lights?: readonly MapLight[];
  metadata?: Readonly<Record<string, unknown>>;
}

// --- generator-level shapes (NOT part of the engine ArenaMap schema) ---

/** A spawn point. The engine ArenaMap carries no spawn field, so the generator
 * tracks it separately and round-trips it through `metadata.spawn`. */
export interface SpawnPoint {
  x: number;
  z: number;
}

export type MapValidationCode =
  | "structure"
  | "duplicate-id"
  | "out-of-bounds"
  | "overlap"
  | "sliver"
  | "spawn-blocked";

export interface MapValidationIssue {
  code: MapValidationCode;
  message: string;
  obstacleId?: string;
}

export interface MapValidationResult {
  ok: boolean;
  issues: MapValidationIssue[];
}

export interface MapValidationOptions {
  /** Spawn point to clearance-check; falls back to `map.metadata.spawn`. */
  spawn?: SpawnPoint;
  /** Required clear radius around the spawn (metres). */
  spawnRadius?: number;
  /** Reject any obstacle whose smallest dimension is below this (metres). */
  minObstacleSize?: number;
}

export interface BreachRoom {
  id: string;
  level: number;
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface BreachArenaOptions {
  id: string;
  name?: string;
  /** Deterministic RNG seed (same seed → identical layout). */
  seed?: number;
  /** Number of breach rooms to partition the arena into. */
  rooms?: number;
  /** Number of vertical tiers; rooms are assigned round-robin across levels. */
  levels?: number;
  /** Half-extent of the (square) arena in metres. */
  half?: number;
  /** Spawn point; defaults to the centre of room 0. */
  spawn?: SpawnPoint;
  /** Clear radius enforced around the spawn. */
  spawnRadius?: number;
  /** Target cover pieces scattered per room. */
  coverPerRoom?: number;
  /** Minimum obstacle dimension (sliver threshold). */
  minObstacleSize?: number;
}

export interface BreachArenaResult {
  map: ArenaMap;
  spawn: SpawnPoint;
  rooms: BreachRoom[];
}
