// MAPS generator core (issue #18): seed/edit engine-schema ArenaMap layouts,
// validate their geometry (no out-of-bounds / overlap / sliver, clear spawn),
// render a top-down SVG preview, and emit a typed `data/maps.ts` module.
//
// Pure: every export takes data and returns data (no fs, no network, no clock,
// no Math.random — generation is seeded). I/O lives in the command wrapper
// (src/commands/maps.ts) and the desktop store (apps/desktop/src/main/maps.ts).
//
// The target schema is the in-repo canonical @shipshitgames/engine ArenaMap,
// mirrored locally in ./maps-types.ts so assetgen stays free of `three`.

import type {
  ArenaMap,
  BreachArenaOptions,
  BreachArenaResult,
  BreachRoom,
  CircleMapObstacle,
  ColorToken,
  MapBounds,
  MapLight,
  MapObstacle,
  MapValidationIssue,
  MapValidationOptions,
  MapValidationResult,
  RectMapObstacle,
  SpawnPoint,
} from "./maps-types.ts";

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------

/** mulberry32 — a tiny, fast, deterministic PRNG. Same seed → same stream, so
 * generated layouts are reproducible and `--check` is stable. Returns [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface BoundsExtent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Resolve a {@link MapBounds} spec to its axis-aligned extent on the XZ plane. */
export function boundsExtent(bounds: MapBounds): BoundsExtent {
  return bounds.kind === "square"
    ? { minX: -bounds.half, maxX: bounds.half, minZ: -bounds.half, maxZ: bounds.half }
    : { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ };
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function withinExtent(x: number, z: number, ext: BoundsExtent): boolean {
  return x >= ext.minX && x <= ext.maxX && z >= ext.minZ && z <= ext.maxZ;
}

/** Is the obstacle fully contained within the bounds (no part outside)? */
export function obstacleInsideBounds(obstacle: MapObstacle, ext: BoundsExtent): boolean {
  if (obstacle.kind === "circle") {
    return (
      obstacle.x - obstacle.radius >= ext.minX &&
      obstacle.x + obstacle.radius <= ext.maxX &&
      obstacle.z - obstacle.radius >= ext.minZ &&
      obstacle.z + obstacle.radius <= ext.maxZ
    );
  }
  const hx = obstacle.width / 2;
  const hz = obstacle.depth / 2;
  return (
    obstacle.x - hx >= ext.minX &&
    obstacle.x + hx <= ext.maxX &&
    obstacle.z - hz >= ext.minZ &&
    obstacle.z + hz <= ext.maxZ
  );
}

/** Do two obstacles overlap, treating `gap` as a required clear margin between
 * them? rect-vs-rect (AABB), circle-vs-circle (centre distance), and
 * rect-vs-circle (nearest-point) are handled. Strict `<` so flush edges pass. */
export function obstaclesOverlap(a: MapObstacle, b: MapObstacle, gap = 0): boolean {
  if (a.kind === "rect" && b.kind === "rect") {
    return (
      Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
      Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + gap
    );
  }
  if (a.kind === "circle" && b.kind === "circle") {
    return Math.hypot(a.x - b.x, a.z - b.z) < a.radius + b.radius + gap;
  }
  const rect = (a.kind === "rect" ? a : b) as RectMapObstacle;
  const circle = (a.kind === "circle" ? a : b) as CircleMapObstacle;
  const nearestX = clamp(circle.x, rect.x - rect.width / 2, rect.x + rect.width / 2);
  const nearestZ = clamp(circle.z, rect.z - rect.depth / 2, rect.z + rect.depth / 2);
  return Math.hypot(circle.x - nearestX, circle.z - nearestZ) < circle.radius + gap;
}

/** Is (x, z) inside the obstacle, inflated by `margin`? Mirrors the engine's
 * `pointInObstacle`. Used for spawn clearance. */
export function pointBlocked(obstacle: MapObstacle, x: number, z: number, margin = 0): boolean {
  if (obstacle.kind === "circle") {
    return Math.hypot(x - obstacle.x, z - obstacle.z) <= obstacle.radius + margin;
  }
  return (
    Math.abs(x - obstacle.x) <= obstacle.width / 2 + margin &&
    Math.abs(z - obstacle.z) <= obstacle.depth / 2 + margin
  );
}

/** Is (x, z) inside the bounds and clear of every blocking obstacle by `radius`?
 * Uses the same predicate as the validator's spawn-clearance check, so a point
 * this returns true for will not trip a `spawn-blocked` issue. */
function spawnIsClear(
  obstacles: readonly MapObstacle[],
  x: number,
  z: number,
  ext: BoundsExtent,
  radius: number,
): boolean {
  if (!withinExtent(x, z, ext)) return false;
  for (const obstacle of obstacles) {
    if (obstacle.blocksMovement === false) continue;
    if (pointBlocked(obstacle, x, z, radius)) return false;
  }
  return true;
}

function readSpawn(map: ArenaMap): SpawnPoint | undefined {
  const raw = (map.metadata as Record<string, unknown> | undefined)?.spawn;
  if (raw && typeof raw === "object") {
    const { x, z } = raw as Record<string, unknown>;
    if (typeof x === "number" && typeof z === "number") return { x, z };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const DEFAULT_MIN_SIZE = 0.5;
const DEFAULT_SPAWN_RADIUS = 1;

/** Geometric validator the PRD asks for: structural checks (mirroring the
 * engine's validateArenaMap), unique ids, fully-in-bounds, no pairwise overlap,
 * no slivers, and a clear spawn. Returns every issue rather than throwing. */
export function validateMapLayout(map: ArenaMap, opts: MapValidationOptions = {}): MapValidationResult {
  const issues: MapValidationIssue[] = [];
  const minSize = opts.minObstacleSize ?? DEFAULT_MIN_SIZE;
  const ext = boundsExtent(map.bounds);

  if (!map.id) issues.push({ code: "structure", message: "map id is required" });
  if (map.bounds.kind === "square" && map.bounds.half <= 0) {
    issues.push({ code: "structure", message: "square bounds half must be > 0" });
  }
  if (map.bounds.kind === "rect" && (ext.minX >= ext.maxX || ext.minZ >= ext.maxZ)) {
    issues.push({ code: "structure", message: "rect bounds require minX < maxX and minZ < maxZ" });
  }
  // `bounds` is a sealed union, but guard the unknown-kind case explicitly: a
  // hand-authored or future-schema map with an unrecognised kind would otherwise
  // resolve to an all-undefined extent and slip through every check below.
  const boundsKind = (map.bounds as { kind: string }).kind;
  if (boundsKind !== "square" && boundsKind !== "rect") {
    issues.push({ code: "structure", message: `unknown bounds kind "${boundsKind}"` });
  }

  const obstacles = map.obstacles ?? [];
  const seen = new Set<string>();
  for (const obstacle of obstacles) {
    if (!obstacle.id) {
      issues.push({ code: "structure", message: "obstacle id is required" });
      continue;
    }
    if (seen.has(obstacle.id)) {
      issues.push({ code: "duplicate-id", message: `duplicate obstacle id "${obstacle.id}"`, obstacleId: obstacle.id });
    }
    seen.add(obstacle.id);

    if (obstacle.kind === "rect") {
      if (obstacle.width <= 0 || obstacle.depth <= 0) {
        issues.push({ code: "structure", message: `obstacle "${obstacle.id}" has non-positive dimensions`, obstacleId: obstacle.id });
      } else if (obstacle.width < minSize || obstacle.depth < minSize) {
        issues.push({ code: "sliver", message: `obstacle "${obstacle.id}" is thinner than ${minSize}m`, obstacleId: obstacle.id });
      }
    } else if (obstacle.radius <= 0) {
      issues.push({ code: "structure", message: `obstacle "${obstacle.id}" has non-positive radius`, obstacleId: obstacle.id });
    } else if (obstacle.radius * 2 < minSize) {
      issues.push({ code: "sliver", message: `obstacle "${obstacle.id}" diameter is below ${minSize}m`, obstacleId: obstacle.id });
    }

    if (!obstacleInsideBounds(obstacle, ext)) {
      issues.push({ code: "out-of-bounds", message: `obstacle "${obstacle.id}" extends outside bounds`, obstacleId: obstacle.id });
    }
  }

  for (let i = 0; i < obstacles.length; i++) {
    for (let j = i + 1; j < obstacles.length; j++) {
      const a = obstacles[i]!;
      const b = obstacles[j]!;
      if (obstaclesOverlap(a, b)) {
        issues.push({ code: "overlap", message: `obstacles "${a.id}" and "${b.id}" overlap`, obstacleId: a.id });
      }
    }
  }

  const spawn = opts.spawn ?? readSpawn(map);
  if (spawn) {
    const radius = opts.spawnRadius ?? DEFAULT_SPAWN_RADIUS;
    // An out-of-bounds spawn is reported once; only an in-bounds spawn is checked
    // against obstacle clearance, so a spawn outside the arena can't ALSO be
    // double-reported as blocked by whatever obstacle happens to sit near it.
    if (!withinExtent(spawn.x, spawn.z, ext)) {
      issues.push({ code: "spawn-blocked", message: `spawn (${spawn.x}, ${spawn.z}) is outside bounds` });
    } else {
      for (const obstacle of obstacles) {
        if (obstacle.blocksMovement === false) continue;
        if (pointBlocked(obstacle, spawn.x, spawn.z, radius)) {
          issues.push({ code: "spawn-blocked", message: `spawn (${spawn.x}, ${spawn.z}) is blocked by obstacle "${obstacle.id}"`, obstacleId: obstacle.id });
        }
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Breach-arena seeding
// ---------------------------------------------------------------------------

const DEFAULT_HALF = 24;
const WALL_THICKNESS = 1.2;
const DEFAULT_SPAWN_R = 2.5;
const COVER_GAP = 0.8;
const PLACE_ATTEMPTS = 40;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Find the in-bounds point nearest each room's centre that is clear of every
 * blocking obstacle by `radius`, scanning rooms in order. Returns undefined only
 * when no room has any clear interior point (an over-constrained arena). */
function findClearSpawn(
  rooms: readonly BreachRoom[],
  obstacles: readonly MapObstacle[],
  ext: BoundsExtent,
  radius: number,
): SpawnPoint | undefined {
  const STEPS = 12;
  for (const room of rooms) {
    const x0 = room.x - room.width / 2;
    const z0 = room.z - room.depth / 2;
    let best: SpawnPoint | undefined;
    let bestDist = Infinity;
    for (let iz = 1; iz < STEPS; iz++) {
      for (let ix = 1; ix < STEPS; ix++) {
        const x = round(x0 + (room.width * ix) / STEPS);
        const z = round(z0 + (room.depth * iz) / STEPS);
        if (!spawnIsClear(obstacles, x, z, ext, radius)) continue;
        const dist = (x - room.x) ** 2 + (z - room.z) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = { x, z };
        }
      }
    }
    if (best) return best;
  }
  return undefined;
}

const TIER_LIGHTS: ColorToken[] = ["#ff7a3c", "#7cff9b", "#5fa8ff", "#ff5f8f"];

/**
 * Seed a multi-room / multi-level breach arena targeting the engine ArenaMap
 * schema. Rooms are laid out on a grid, partitioned by non-overlapping interior
 * walls with door gaps, and scattered with cover via rejection sampling that
 * respects bounds, prior obstacles, and spawn clearance. A point light is placed
 * per room (tinted by level). The engine schema has no spawn/room concepts, so
 * those ride in `metadata` for the game layer to interpret.
 *
 * When no explicit spawn is supplied, the spawn is relocated to the nearest
 * clear cell of the first room so the result passes {@link validateMapLayout}
 * for the returned spawn — provided the spawn radius can physically fit a room
 * (covered by unit tests across seeds, room counts, and arena sizes). A spawn
 * radius too large for the arena (or an explicit spawn the caller forces into
 * geometry) can still fail validation, which the validator reports rather than
 * silently accepting.
 */
export function seedBreachArena(opts: BreachArenaOptions): BreachArenaResult {
  const id = opts.id;
  const seed = opts.seed ?? 1;
  const rng = mulberry32(seed);
  const half = opts.half ?? DEFAULT_HALF;
  const levels = Math.max(1, Math.floor(opts.levels ?? 1));
  const roomCount = Math.max(1, Math.floor(opts.rooms ?? 4));
  const minSize = opts.minObstacleSize ?? DEFAULT_MIN_SIZE;
  const spawnRadius = opts.spawnRadius ?? DEFAULT_SPAWN_R;
  const coverPerRoom = Math.max(0, Math.floor(opts.coverPerRoom ?? 3));

  const cols = Math.ceil(Math.sqrt(roomCount));
  const rows = Math.ceil(roomCount / cols);
  const ext: BoundsExtent = { minX: -half, maxX: half, minZ: -half, maxZ: half };
  const cellW = (2 * half) / cols;
  const cellD = (2 * half) / rows;

  // --- rooms (logical grid; carried in metadata) ---
  const rooms: BreachRoom[] = [];
  for (let index = 0, r = 0; r < rows && index < roomCount; r++) {
    for (let c = 0; c < cols && index < roomCount; c++, index++) {
      rooms.push({
        id: `${id}-room-${index}`,
        level: index % levels,
        x: round(ext.minX + cellW * (c + 0.5)),
        z: round(ext.minZ + cellD * (r + 0.5)),
        width: round(cellW),
        depth: round(cellD),
      });
    }
  }

  const spawnExplicit = opts.spawn !== undefined;
  let spawn: SpawnPoint = opts.spawn ?? { x: rooms[0]!.x, z: rooms[0]!.z };
  const obstacles: MapObstacle[] = [];

  // --- interior partition walls ---
  // Segments are inset from the perpendicular wall lines (band edges) by more
  // than half a wall thickness, so vertical and horizontal walls never overlap.
  const inset = WALL_THICKNESS / 2 + 0.6;
  const doorGap = clamp(Math.min(cellW, cellD) * 0.4, 3, 8);

  function pushWall(prefix: string, x: number, z: number, width: number, depth: number): void {
    if (width < minSize || depth < minSize) return; // skip slivers
    obstacles.push({
      kind: "rect",
      id: `${id}-${prefix}-${obstacles.length}`,
      x: round(x),
      z: round(z),
      width: round(width),
      depth: round(depth),
      height: 3,
      blocksMovement: true,
      tags: ["wall"],
    });
  }

  // Vertical interior walls (column boundaries), only when columns are wide enough.
  if (cellW > WALL_THICKNESS * 2) {
    for (let c = 1; c < cols; c++) {
      const lineX = ext.minX + cellW * c;
      for (let r = 0; r < rows; r++) {
        const top = ext.minZ + cellD * r + inset;
        const bottom = ext.minZ + cellD * (r + 1) - inset;
        const doorZ = ext.minZ + cellD * (r + 0.5);
        addSplitWall("vwall", lineX, top, bottom, doorZ, doorGap, /* vertical */ true);
      }
    }
  }
  // Horizontal interior walls (row boundaries).
  if (cellD > WALL_THICKNESS * 2) {
    for (let r = 1; r < rows; r++) {
      const lineZ = ext.minZ + cellD * r;
      for (let c = 0; c < cols; c++) {
        const left = ext.minX + cellW * c + inset;
        const right = ext.minX + cellW * (c + 1) - inset;
        const doorX = ext.minX + cellW * (c + 0.5);
        addSplitWall("hwall", lineZ, left, right, doorX, doorGap, /* vertical */ false);
      }
    }
  }

  // Add the two wall segments flanking a centred door gap along one axis.
  function addSplitWall(
    prefix: string,
    line: number,
    lo: number,
    hi: number,
    door: number,
    gap: number,
    vertical: boolean,
  ): void {
    const lower = { from: lo, to: door - gap / 2 };
    const upper = { from: door + gap / 2, to: hi };
    for (const seg of [lower, upper]) {
      const length = seg.to - seg.from;
      if (length < minSize) continue;
      const center = (seg.from + seg.to) / 2;
      if (vertical) pushWall(prefix, line, center, WALL_THICKNESS, length);
      else pushWall(prefix, center, line, length, WALL_THICKNESS);
    }
  }

  // Resolve the auto spawn to a point clear of the interior walls before placing
  // cover. In small arenas the room-0 centre can sit inside a flanking wall's
  // clearance disk, so scan for the nearest clear interior point. An explicit
  // caller spawn is respected as-is (the caller owns its validity).
  if (!spawnExplicit && !spawnIsClear(obstacles, spawn.x, spawn.z, ext, spawnRadius)) {
    spawn = findClearSpawn(rooms, obstacles, ext, spawnRadius) ?? spawn;
  }

  // --- scattered cover (rejection-sampled so the map always validates) ---
  for (const room of rooms) {
    const marginX = WALL_THICKNESS + 1;
    const marginZ = WALL_THICKNESS + 1;
    const spanX = room.width / 2 - marginX;
    const spanZ = room.depth / 2 - marginZ;
    if (spanX <= minSize || spanZ <= minSize) continue;

    for (let n = 0; n < coverPerRoom; n++) {
      for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
        const cx = room.x + (rng() * 2 - 1) * spanX;
        const cz = room.z + (rng() * 2 - 1) * spanZ;
        const circle = rng() < 0.45;
        const candidate: MapObstacle = circle
          ? {
              kind: "circle",
              id: `${id}-cover-${obstacles.length}`,
              x: round(cx),
              z: round(cz),
              radius: round(0.8 + rng() * 1.4),
              height: 2,
              blocksMovement: true,
              tags: ["cover"],
            }
          : {
              kind: "rect",
              id: `${id}-cover-${obstacles.length}`,
              x: round(cx),
              z: round(cz),
              width: round(1.2 + rng() * 2.4),
              depth: round(1.2 + rng() * 2.4),
              height: 2,
              blocksMovement: true,
              tags: ["cover"],
            };

        if (!obstacleInsideBounds(candidate, ext)) continue;
        if (pointBlocked(candidate, spawn.x, spawn.z, spawnRadius + 0.5)) continue;
        if (obstacles.some((existing) => obstaclesOverlap(existing, candidate, COVER_GAP))) continue;
        obstacles.push(candidate);
        break;
      }
    }
  }

  // --- lights (ambient + directional key + per-room point) ---
  const lights: MapLight[] = [
    { kind: "ambient", id: `${id}-ambient`, color: "#1a1410", intensity: 0.35 },
    {
      kind: "directional",
      id: `${id}-key`,
      color: "#ff7a3c",
      intensity: 0.9,
      position: [round(half * 0.6), round(half), round(half * 0.4)],
      target: [0, 0, 0],
    },
    ...rooms.map(
      (room): MapLight => ({
        kind: "point",
        id: `${room.id}-light`,
        color: TIER_LIGHTS[room.level % TIER_LIGHTS.length]!,
        intensity: round(0.6 + room.level * 0.2),
        position: [room.x, round(6 + room.level * 2), room.z],
        distance: round(Math.max(cellW, cellD)),
        decay: 2,
      }),
    ),
  ];

  const map: ArenaMap = {
    id,
    name: opts.name ?? `${id} breach arena`,
    bounds: { kind: "square", half },
    theme: {
      id: `${id}-breach`,
      skyColor: "#070707",
      groundColor: "#15110c",
      fog: { color: "#070707", near: round(half * 0.5), far: round(half * 2.4), kind: "linear" },
    },
    obstacles,
    lights,
    metadata: {
      generator: "breach-arena",
      seed,
      spawn: { x: spawn.x, z: spawn.z },
      spawnRadius,
      levels,
      rooms: rooms.map((room) => ({
        id: room.id,
        level: room.level,
        x: room.x,
        z: room.z,
        width: room.width,
        depth: room.depth,
      })),
    },
  };

  return { map, spawn, rooms };
}

// ---------------------------------------------------------------------------
// Top-down SVG preview
// ---------------------------------------------------------------------------

export interface SvgPreviewOptions {
  /** Square canvas size in pixels (default 512). */
  size?: number;
  /** Padding in pixels around the arena (default 16). */
  padding?: number;
  /** Spawn point to mark; falls back to `map.metadata.spawn`. */
  spawn?: SpawnPoint;
}

/** Convert a {@link ColorToken} to a CSS color string. */
export function colorToCss(token: ColorToken | undefined, fallback: string): string {
  if (typeof token === "number") return `#${(token & 0xffffff).toString(16).padStart(6, "0")}`;
  if (typeof token === "string" && token.trim()) return token.trim();
  return fallback;
}

function px(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render a deterministic top-down (XZ-plane) SVG preview of the layout. */
export function renderTopDownSvg(map: ArenaMap, opts: SvgPreviewOptions = {}): string {
  const size = opts.size ?? 512;
  const pad = opts.padding ?? 16;
  const ext = boundsExtent(map.bounds);
  const worldW = ext.maxX - ext.minX;
  const worldD = ext.maxZ - ext.minZ;
  const scale = (size - pad * 2) / Math.max(worldW, worldD, 1);
  const toX = (x: number): number => pad + (x - ext.minX) * scale;
  const toY = (z: number): number => pad + (z - ext.minZ) * scale;

  const ground = colorToCss(map.theme?.groundColor, "#15110c");
  const sky = colorToCss(map.theme?.skyColor, "#070707");
  const accent = colorToCss(map.theme?.fog?.color, "#ff7a3c");

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${escapeXml(map.name ?? map.id)} top-down preview">`,
  );
  lines.push(`<rect x="0" y="0" width="${size}" height="${size}" fill="${sky}" />`);
  lines.push(
    `<rect x="${px(toX(ext.minX))}" y="${px(toY(ext.minZ))}" width="${px(worldW * scale)}" height="${px(worldD * scale)}" fill="${ground}" stroke="#ff7a3c" stroke-width="2" />`,
  );

  const metaRooms = (map.metadata as Record<string, unknown> | undefined)?.rooms;
  if (Array.isArray(metaRooms)) {
    for (const raw of metaRooms) {
      const room = raw as { x?: number; z?: number; width?: number; depth?: number };
      if (typeof room.x !== "number" || typeof room.z !== "number" || typeof room.width !== "number" || typeof room.depth !== "number") continue;
      lines.push(
        `<rect x="${px(toX(room.x - room.width / 2))}" y="${px(toY(room.z - room.depth / 2))}" width="${px(room.width * scale)}" height="${px(room.depth * scale)}" fill="none" stroke="#3a342c" stroke-width="1" stroke-dasharray="4 4" />`,
      );
    }
  }

  for (const obstacle of map.obstacles ?? []) {
    const fill = obstacle.tags?.includes("wall") ? "#2a2620" : "#4a4136";
    if (obstacle.kind === "circle") {
      lines.push(
        `<circle cx="${px(toX(obstacle.x))}" cy="${px(toY(obstacle.z))}" r="${px(obstacle.radius * scale)}" fill="${fill}" stroke="#0a0a0a" stroke-width="1" />`,
      );
    } else {
      lines.push(
        `<rect x="${px(toX(obstacle.x - obstacle.width / 2))}" y="${px(toY(obstacle.z - obstacle.depth / 2))}" width="${px(obstacle.width * scale)}" height="${px(obstacle.depth * scale)}" fill="${fill}" stroke="#0a0a0a" stroke-width="1" />`,
      );
    }
  }

  const spawn = opts.spawn ?? readSpawn(map);
  if (spawn) {
    lines.push(
      `<circle cx="${px(toX(spawn.x))}" cy="${px(toY(spawn.z))}" r="6" fill="#4cff8f" stroke="#0a0a0a" stroke-width="1.5" />`,
    );
  }

  // Accent the most-recent room light positions as small markers.
  for (const light of map.lights ?? []) {
    if (light.kind !== "point" || !light.position) continue;
    lines.push(
      `<circle cx="${px(toX(light.position[0]))}" cy="${px(toY(light.position[2]))}" r="3" fill="${colorToCss(light.color, accent)}" opacity="0.8" />`,
    );
  }

  lines.push("</svg>");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Codegen: emit a typed data/maps.ts module
// ---------------------------------------------------------------------------

export interface MapsModuleOptions {
  /** Module specifier the generated file imports ArenaMap from. */
  engineImport?: string;
  /** Override the exported const name (default derived from the map id). */
  constName?: string;
}

/** Turn an arbitrary id into a safe JS identifier (`breach-alpha` → `breachAlpha`). */
export function toIdentifier(id: string): string {
  const words = id.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const camel = words
    .map((word, i) => (i === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("");
  if (!camel) return "arenaMap";
  return /^[a-zA-Z_$]/.test(camel) ? camel : `map${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
}

/** Build the generated `data/maps.ts` module text for an ArenaMap. Pure +
 * deterministic. The emitted file `import type`s ArenaMap from the engine so it
 * is checked against the canonical schema in the consuming game (the type-only
 * import is erased at runtime, so it never pulls `three` into assetgen). */
export function buildMapsModule(map: ArenaMap, opts: MapsModuleOptions = {}): string {
  const engine = opts.engineImport ?? "@shipshitgames/engine";
  const constName = opts.constName ?? `${toIdentifier(map.id)}Map`;
  const out: string[] = [];
  out.push(`// GENERATED by \`assetgen maps --id ${map.id}\` — do not edit by hand.`);
  out.push(`// ArenaMap layout for "${map.id}" typed against @shipshitgames/engine. Regenerate to change.`);
  out.push(`import type { ArenaMap } from "${engine}";`);
  out.push("");
  out.push(`export const ${constName}: ArenaMap = ${JSON.stringify(map, null, 2)};`);
  out.push("");
  out.push(`export default ${constName};`);
  out.push("");
  return out.join("\n");
}
