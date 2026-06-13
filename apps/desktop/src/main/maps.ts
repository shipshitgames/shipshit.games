import fs from "node:fs";
import path from "node:path";

// Pure, bundle-safe assetgen core (no sharp/node-pty/three) — same direct-import
// precedent as manifest.ts/fal.ts in index.ts. The Studio drives the generator
// in-process rather than shelling out, so previews are instant.
import {
  buildMapsModule,
  renderTopDownSvg,
  seedBreachArena,
  validateMapLayout,
} from "../../../../packages/assetgen/src/maps.ts";

function sanitizeGame(game) {
  const slug = String(game || "scourge-survivors")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "scourge-survivors";
}

function sanitizeId(id) {
  const slug = String(id || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "arena";
}

// Coerce a renderer-supplied options bag into the seedBreachArena contract.
// All numerics are clamped to safe ranges so the pane can pass raw input.
function seedOptions(opts) {
  const o = opts || {};
  const id = sanitizeId(o.id);
  const seedOpts: any = {
    id,
    seed: clampInt(o.seed, 1, 0, 2 ** 31 - 1),
    rooms: clampInt(o.rooms, 4, 1, 64),
    levels: clampInt(o.levels, 1, 1, 8),
    half: clampInt(o.half, 24, 8, 200),
    coverPerRoom: clampInt(o.coverPerRoom, 3, 0, 20),
    spawnRadius: clampNumber(o.spawnRadius, 2.5, 0.5, 20),
  };
  if (o.name && String(o.name).trim()) seedOpts.name = String(o.name).trim().slice(0, 120);
  const spawn = readSpawn(o.spawn);
  if (spawn) seedOpts.spawn = spawn;
  return seedOpts;
}

function readSpawn(spawn) {
  if (!spawn || typeof spawn !== "object") return undefined;
  const x = Number(spawn.x);
  const z = Number(spawn.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return undefined;
  return { x, z };
}

function clampInt(value, def, lo, hi) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}

function clampNumber(value, def, lo, hi) {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}

function summarize(map, rooms) {
  return {
    id: map.id,
    name: map.name || map.id,
    rooms: rooms.length,
    levels: (map.metadata && map.metadata.levels) || 1,
    obstacles: (map.obstacles && map.obstacles.length) || 0,
    lights: (map.lights && map.lights.length) || 0,
    bounds: map.bounds,
  };
}

function createMapsStore(options) {
  const rootDir = () => {
    const root = typeof options?.rootDir === "function" ? options.rootDir() : options?.rootDir;
    if (!root) throw new Error("maps rootDir is required");
    return root;
  };

  function gameDir(game) {
    return path.join(rootDir(), sanitizeGame(game));
  }

  // Seed + validate + render. Never throws on a bad layout — it returns the
  // validation result so the renderer can surface the issues inline.
  function preview(opts) {
    const seed = seedOptions(opts);
    const { map, spawn, rooms } = seedBreachArena(seed);
    const validation = validateMapLayout(map, { spawn, spawnRadius: seed.spawnRadius });
    const svg = renderTopDownSvg(map, { spawn });
    const moduleText = buildMapsModule(map);
    return {
      ok: validation.ok,
      dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
      svg,
      moduleText,
      summary: summarize(map, rooms),
      validation,
    };
  }

  // Persist the generated module (+ a sibling SVG) under the Studio's maps dir.
  // The Studio owns this directory; a human copies the module into the target
  // game's data/maps.ts during review (the shipped games live out-of-repo).
  function write(opts) {
    const seed = seedOptions(opts);
    const game = sanitizeGame(opts?.game);
    const { map, spawn, rooms } = seedBreachArena(seed);
    const validation = validateMapLayout(map, { spawn, spawnRadius: seed.spawnRadius });
    if (!validation.ok) {
      return { ok: false, validation, summary: summarize(map, rooms) };
    }

    const dir = gameDir(game);
    fs.mkdirSync(dir, { recursive: true });
    const modulePath = path.join(dir, `${seed.id}.maps.ts`);
    const svgPath = path.join(dir, `${seed.id}.svg`);
    fs.writeFileSync(modulePath, buildMapsModule(map));
    fs.writeFileSync(svgPath, renderTopDownSvg(map, { spawn }));

    return { ok: true, path: modulePath, svgPath, game, summary: summarize(map, rooms), validation };
  }

  return { preview, write };
}

export { createMapsStore, sanitizeGame, sanitizeId, seedOptions };
