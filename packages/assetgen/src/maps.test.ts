import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { ArenaMap, MapObstacle } from "./maps-types.ts";
import {
  boundsExtent,
  buildMapsModule,
  colorToCss,
  mulberry32,
  obstacleInsideBounds,
  obstaclesOverlap,
  pointBlocked,
  renderTopDownSvg,
  seedBreachArena,
  toIdentifier,
  validateMapLayout,
} from "./maps.ts";

function rect(id: string, x: number, z: number, width: number, depth: number): MapObstacle {
  return { kind: "rect", id, x, z, width, depth, blocksMovement: true };
}

function circle(id: string, x: number, z: number, radius: number): MapObstacle {
  return { kind: "circle", id, x, z, radius, blocksMovement: true };
}

describe("mulberry32", () => {
  test("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  test("returns values in [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const n = rng();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  test("different seeds diverge", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("boundsExtent", () => {
  test("expands square bounds symmetrically", () => {
    expect(boundsExtent({ kind: "square", half: 10 })).toEqual({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
  });

  test("passes rect bounds through", () => {
    expect(boundsExtent({ kind: "rect", minX: -2, maxX: 8, minZ: -4, maxZ: 6 })).toEqual({
      minX: -2,
      maxX: 8,
      minZ: -4,
      maxZ: 6,
    });
  });
});

describe("obstacleInsideBounds", () => {
  const ext = boundsExtent({ kind: "square", half: 10 });

  test("accepts a rect fully inside", () => {
    expect(obstacleInsideBounds(rect("a", 0, 0, 4, 4), ext)).toBe(true);
  });

  test("rejects a rect crossing the edge", () => {
    expect(obstacleInsideBounds(rect("a", 9, 0, 4, 4), ext)).toBe(false);
  });

  test("accepts a circle fully inside and rejects one poking out", () => {
    expect(obstacleInsideBounds(circle("c", 0, 0, 3), ext)).toBe(true);
    expect(obstacleInsideBounds(circle("c", 8, 0, 3), ext)).toBe(false);
  });
});

describe("obstaclesOverlap", () => {
  test("rect-vs-rect: overlapping vs flush vs separated", () => {
    expect(obstaclesOverlap(rect("a", 0, 0, 4, 4), rect("b", 2, 0, 4, 4))).toBe(true);
    // flush edges (gap 0) — strict `<` means touching is NOT overlap
    expect(obstaclesOverlap(rect("a", 0, 0, 4, 4), rect("b", 4, 0, 4, 4))).toBe(false);
    expect(obstaclesOverlap(rect("a", 0, 0, 4, 4), rect("b", 8, 0, 4, 4))).toBe(false);
  });

  test("circle-vs-circle uses centre distance", () => {
    expect(obstaclesOverlap(circle("a", 0, 0, 2), circle("b", 3, 0, 2))).toBe(true);
    expect(obstaclesOverlap(circle("a", 0, 0, 2), circle("b", 4, 0, 2))).toBe(false);
  });

  test("rect-vs-circle uses the nearest point", () => {
    expect(obstaclesOverlap(rect("a", 0, 0, 4, 4), circle("b", 3, 0, 2))).toBe(true);
    expect(obstaclesOverlap(rect("a", 0, 0, 4, 4), circle("b", 6, 0, 1))).toBe(false);
  });

  test("a positive gap reports near-misses as overlap across every kind pairing", () => {
    // rect-vs-rect
    expect(obstaclesOverlap(rect("a", 0, 0, 4, 4), rect("b", 4.5, 0, 4, 4))).toBe(false);
    expect(obstaclesOverlap(rect("a", 0, 0, 4, 4), rect("b", 4.5, 0, 4, 4), 1)).toBe(true);
    // circle-vs-circle
    expect(obstaclesOverlap(circle("a", 0, 0, 2), circle("b", 4.5, 0, 2))).toBe(false);
    expect(obstaclesOverlap(circle("a", 0, 0, 2), circle("b", 4.5, 0, 2), 1)).toBe(true);
    // rect-vs-circle (nearest-point): edge gap of 1m clears at gap 0, trips at gap 1.5
    expect(obstaclesOverlap(rect("a", 0, 0, 4, 4), circle("b", 4, 0, 1))).toBe(false);
    expect(obstaclesOverlap(rect("a", 0, 0, 4, 4), circle("b", 4, 0, 1), 1.5)).toBe(true);
    // ordering is symmetric: circle-first must behave identically to rect-first
    expect(obstaclesOverlap(circle("b", 4, 0, 1), rect("a", 0, 0, 4, 4), 1.5)).toBe(true);
  });
});

describe("pointBlocked", () => {
  test("rect inflated by margin", () => {
    expect(pointBlocked(rect("a", 0, 0, 4, 4), 2.5, 0)).toBe(false);
    expect(pointBlocked(rect("a", 0, 0, 4, 4), 2.5, 0, 1)).toBe(true);
  });

  test("circle inflated by margin", () => {
    expect(pointBlocked(circle("a", 0, 0, 2), 2.5, 0)).toBe(false);
    expect(pointBlocked(circle("a", 0, 0, 2), 2.5, 0, 1)).toBe(true);
  });
});

describe("validateMapLayout", () => {
  const bounds = { kind: "square", half: 20 } as const;

  test("a clean map passes", () => {
    const map: ArenaMap = { id: "m", bounds, obstacles: [rect("a", -5, -5, 4, 4), rect("b", 6, 6, 4, 4)] };
    expect(validateMapLayout(map).ok).toBe(true);
  });

  test("flags a missing id as structure", () => {
    const map: ArenaMap = { id: "", bounds };
    const result = validateMapLayout(map);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "structure")).toBe(true);
  });

  test("flags duplicate obstacle ids", () => {
    const map: ArenaMap = { id: "m", bounds, obstacles: [rect("dup", -5, -5, 4, 4), rect("dup", 6, 6, 4, 4)] };
    const result = validateMapLayout(map);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "duplicate-id")).toBe(true);
  });

  test("flags an out-of-bounds obstacle", () => {
    const map: ArenaMap = { id: "m", bounds, obstacles: [rect("a", 19, 0, 6, 6)] };
    const result = validateMapLayout(map);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "out-of-bounds" && i.obstacleId === "a")).toBe(true);
  });

  test("flags overlapping obstacles", () => {
    const map: ArenaMap = { id: "m", bounds, obstacles: [rect("a", 0, 0, 4, 4), rect("b", 1, 0, 4, 4)] };
    const result = validateMapLayout(map);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "overlap")).toBe(true);
  });

  test("flags a sliver below the minimum dimension", () => {
    const map: ArenaMap = { id: "m", bounds, obstacles: [rect("a", 0, 0, 6, 0.2)] };
    const result = validateMapLayout(map);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "sliver" && i.obstacleId === "a")).toBe(true);
  });

  test("flags a spawn blocked by an obstacle", () => {
    const map: ArenaMap = { id: "m", bounds, obstacles: [rect("a", 0, 0, 4, 4)] };
    const result = validateMapLayout(map, { spawn: { x: 0, z: 0 }, spawnRadius: 1 });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "spawn-blocked")).toBe(true);
  });

  test("flags a spawn outside the bounds", () => {
    const map: ArenaMap = { id: "m", bounds };
    const result = validateMapLayout(map, { spawn: { x: 100, z: 0 } });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "spawn-blocked")).toBe(true);
  });

  test("reads the spawn from metadata when none is passed", () => {
    const map: ArenaMap = {
      id: "m",
      bounds,
      obstacles: [rect("a", 0, 0, 4, 4)],
      metadata: { spawn: { x: 0, z: 0 } },
    };
    expect(validateMapLayout(map, { spawnRadius: 1 }).ok).toBe(false);
  });

  test("ignores non-blocking obstacles for spawn clearance", () => {
    const map: ArenaMap = {
      id: "m",
      bounds,
      obstacles: [{ kind: "rect", id: "a", x: 0, z: 0, width: 4, depth: 4, blocksMovement: false }],
    };
    expect(validateMapLayout(map, { spawn: { x: 0, z: 0 }, spawnRadius: 1 }).ok).toBe(true);
  });

  test("flags an unrecognised bounds kind as structure rather than passing silently", () => {
    // A hand-authored / future-schema map with an unknown kind must not slip
    // through with an all-undefined extent; the validator reports it.
    const map = { id: "m", bounds: { kind: "hexagon" } } as unknown as ArenaMap;
    const result = validateMapLayout(map);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "structure" && /unknown bounds kind/.test(i.message))).toBe(true);
  });

  test("collects every issue rather than throwing on the first", () => {
    const map: ArenaMap = {
      id: "",
      bounds,
      obstacles: [rect("dup", 0, 0, 4, 4), rect("dup", 0.5, 0, 4, 4)],
    };
    const result = validateMapLayout(map);
    const codes = new Set(result.issues.map((i) => i.code));
    expect(codes.has("structure")).toBe(true);
    expect(codes.has("duplicate-id")).toBe(true);
    expect(codes.has("overlap")).toBe(true);
  });
});

describe("seedBreachArena", () => {
  test("produces a layout that always validates across seeds, room counts, and arena sizes", () => {
    // Includes small arenas (half 8–12) where the room-0 centre would fall inside
    // a flanking interior wall's clearance disk — the seeder must relocate the
    // auto spawn to a clear point so the layout still validates.
    for (const seed of [1, 2, 7, 42, 99, 1000, 65535]) {
      for (const rooms of [1, 2, 3, 4, 5, 6, 7, 9, 12, 16, 36, 64]) {
        for (const levels of [1, 2, 3]) {
          for (const half of [8, 10, 12, 16, 24, 48]) {
            const spawnRadius = 2.5;
            const { map, spawn } = seedBreachArena({ id: "arena", seed, rooms, levels, half, spawnRadius });
            const result = validateMapLayout(map, { spawn, spawnRadius });
            if (!result.ok) {
              // Surface the offending issues if this ever regresses.
              throw new Error(`seed=${seed} rooms=${rooms} levels=${levels} half=${half}: ${JSON.stringify(result.issues)}`);
            }
            expect(result.ok).toBe(true);
          }
        }
      }
    }
  });

  test("relocates the auto spawn out of a flanking wall in a tight arena", () => {
    // half=8 / rooms=6 puts a vertical interior wall ~2.7m from room-0 centre,
    // inside a 2.5m clearance disk — pre-fix this tripped spawn-blocked.
    const { map, spawn, rooms } = seedBreachArena({ id: "tight", seed: 1, rooms: 6, half: 8, spawnRadius: 2.5 });
    expect(validateMapLayout(map, { spawn, spawnRadius: 2.5 }).ok).toBe(true);
    // the relocated spawn still sits inside room 0
    const room0 = rooms[0]!;
    expect(Math.abs(spawn.x - room0.x)).toBeLessThanOrEqual(room0.width / 2);
    expect(Math.abs(spawn.z - room0.z)).toBeLessThanOrEqual(room0.depth / 2);
  });

  test("respects an explicit caller spawn without relocating it", () => {
    const { spawn } = seedBreachArena({ id: "arena", seed: 1, rooms: 6, half: 8, spawn: { x: 1.5, z: -1.5 } });
    expect(spawn).toEqual({ x: 1.5, z: -1.5 });
  });

  test("is deterministic for a given seed", () => {
    const a = seedBreachArena({ id: "arena", seed: 5, rooms: 4 });
    const b = seedBreachArena({ id: "arena", seed: 5, rooms: 4 });
    expect(JSON.stringify(a.map)).toBe(JSON.stringify(b.map));
  });

  test("different seeds yield different layouts", () => {
    const a = seedBreachArena({ id: "arena", seed: 1, rooms: 4 });
    const b = seedBreachArena({ id: "arena", seed: 2, rooms: 4 });
    expect(JSON.stringify(a.map.obstacles)).not.toBe(JSON.stringify(b.map.obstacles));
  });

  test("carries spawn, rooms, and generator info in metadata", () => {
    const { map, rooms } = seedBreachArena({ id: "arena", seed: 3, rooms: 4, levels: 2 });
    const meta = map.metadata as Record<string, unknown>;
    expect(meta.generator).toBe("breach-arena");
    expect(meta.seed).toBe(3);
    expect(meta.spawn).toBeDefined();
    expect(Array.isArray(meta.rooms)).toBe(true);
    expect((meta.rooms as unknown[]).length).toBe(rooms.length);
    expect(rooms.length).toBe(4);
  });

  test("assigns rooms round-robin across levels", () => {
    const { rooms } = seedBreachArena({ id: "arena", seed: 1, rooms: 6, levels: 3 });
    expect(rooms.map((r) => r.level)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  test("honours an explicit spawn", () => {
    const { spawn } = seedBreachArena({ id: "arena", seed: 1, rooms: 4, spawn: { x: 3, z: -3 } });
    expect(spawn).toEqual({ x: 3, z: -3 });
  });

  test("a single room with no cover still validates", () => {
    const { map, spawn } = seedBreachArena({ id: "solo", seed: 1, rooms: 1, coverPerRoom: 0 });
    expect(map.obstacles?.length ?? 0).toBe(0);
    expect(validateMapLayout(map, { spawn }).ok).toBe(true);
  });

  test("uses square bounds with the requested half-extent", () => {
    const { map } = seedBreachArena({ id: "arena", seed: 1, rooms: 4, half: 30 });
    expect(map.bounds).toEqual({ kind: "square", half: 30 });
  });
});

describe("colorToCss", () => {
  test("formats a numeric token as hex", () => {
    expect(colorToCss(0xff7a3c, "#000")).toBe("#ff7a3c");
  });

  test("trims and passes through a string token", () => {
    expect(colorToCss("  #abc  ", "#000")).toBe("#abc");
  });

  test("falls back on undefined or empty", () => {
    expect(colorToCss(undefined, "#fallback")).toBe("#fallback");
    expect(colorToCss("   ", "#fallback")).toBe("#fallback");
  });
});

describe("renderTopDownSvg", () => {
  test("emits a deterministic, well-formed svg", () => {
    const { map, spawn } = seedBreachArena({ id: "arena", seed: 1, rooms: 4 });
    const svg = renderTopDownSvg(map, { spawn });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toBe(renderTopDownSvg(map, { spawn }));
  });

  test("draws a marker per obstacle and the spawn", () => {
    const map: ArenaMap = {
      id: "m",
      bounds: { kind: "square", half: 10 },
      obstacles: [rect("a", 0, 0, 4, 4), circle("b", 5, 5, 1)],
      metadata: { spawn: { x: -5, z: -5 } },
    };
    const svg = renderTopDownSvg(map);
    expect(svg).toContain("<rect");
    expect(svg).toContain("<circle");
    // spawn marker uses the green fill
    expect(svg).toContain("#4cff8f");
  });

  test("escapes the map name in the aria label", () => {
    const map: ArenaMap = { id: "m", name: 'a <b> & "c"', bounds: { kind: "square", half: 10 } };
    const svg = renderTopDownSvg(map);
    expect(svg).toContain("&lt;b&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).not.toContain('aria-label="a <b>');
  });
});

describe("toIdentifier", () => {
  test("camel-cases a kebab id", () => {
    expect(toIdentifier("breach-alpha")).toBe("breachAlpha");
  });

  test("lower-cases the leading word", () => {
    expect(toIdentifier("Scourge Front")).toBe("scourgeFront");
  });

  test("prefixes ids that would start with a digit", () => {
    expect(toIdentifier("7-gates")).toBe("map7Gates");
  });

  test("falls back for an empty id", () => {
    expect(toIdentifier("!!!")).toBe("arenaMap");
  });
});

describe("buildMapsModule", () => {
  const map: ArenaMap = {
    id: "breach-alpha",
    name: "Breach Alpha",
    bounds: { kind: "square", half: 20 },
    obstacles: [rect("a", 0, 0, 4, 4)],
  };

  test("imports ArenaMap as a type from the engine and exports a typed const", () => {
    const mod = buildMapsModule(map);
    expect(mod).toContain('import type { ArenaMap } from "@shipshitgames/engine";');
    expect(mod).toContain("export const breachAlphaMap: ArenaMap = {");
    expect(mod).toContain("export default breachAlphaMap;");
    expect(mod).toContain("GENERATED by");
  });

  test("honours engineImport and constName overrides", () => {
    const mod = buildMapsModule(map, { engineImport: "../engine.ts", constName: "myMap" });
    expect(mod).toContain('from "../engine.ts"');
    expect(mod).toContain("export const myMap: ArenaMap = {");
    expect(mod).toContain("export default myMap;");
  });

  test("is deterministic", () => {
    expect(buildMapsModule(map)).toBe(buildMapsModule(map));
  });

  test("the generated module is valid TS that round-trips the map data", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assetgen-maps-"));
    try {
      const { map: seeded, spawn } = seedBreachArena({ id: "breach-alpha", seed: 9, rooms: 4 });
      const file = join(dir, "maps.generated.ts");
      // strip the engine type import so the module imports cleanly at runtime
      const text = buildMapsModule(seeded).replace(/^import type .*$/m, "");
      await writeFile(file, text, "utf8");
      const mod = (await import(pathToFileURL(file).href)) as { default: ArenaMap; breachAlphaMap: ArenaMap };
      expect(mod.default.id).toBe("breach-alpha");
      expect(mod.breachAlphaMap.bounds).toEqual(seeded.bounds);
      expect(validateMapLayout(mod.default, { spawn }).ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
