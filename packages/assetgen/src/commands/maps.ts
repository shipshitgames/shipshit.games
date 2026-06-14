import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  buildMapsModule,
  renderTopDownSvg,
  seedBreachArena,
  validateMapLayout,
} from "../maps.ts";
import type { BreachArenaOptions, SpawnPoint } from "../maps-types.ts";
import { flag, has } from "./args.ts";

/**
 * Seed / edit an engine-schema ArenaMap layout, run the geometric validator
 * (no out-of-bounds / overlap / sliver, clear spawn), optionally write a
 * top-down SVG preview, and emit a typed `data/maps.ts` module.
 *
 *   assetgen maps --id breach-alpha --rooms 6 --levels 2 --seed 7 \
 *     --out apps/games/scourge-survivors/src/game/data/maps.ts --svg preview.svg
 *
 * Without `--out` the module is printed to stdout. `--check` regenerates and
 * fails (exit 1) if the committed `--out` file is stale — so it can gate CI.
 */
export async function runMapsCommand(argv: string[]): Promise<void> {
  const id = flag(argv, "id");
  if (!id) {
    console.error("[maps] --id <map-id> is required (e.g. --id breach-alpha)");
    process.exit(1);
  }

  const preset = flag(argv, "preset", "breach-arena");
  if (preset !== "breach-arena") {
    console.error(`[maps] unknown --preset "${preset}" (supported: breach-arena)`);
    process.exit(1);
  }

  const spawn = readSpawn(argv);
  const seedOpts: BreachArenaOptions = {
    id,
    name: flag(argv, "name"),
    // seed 0 is a valid deterministic stream, so its floor is 0; the rest must
    // be >= 1. An explicitly-supplied invalid value errors rather than silently
    // reverting to the default (which would mislead a determinism-sensitive run).
    seed: numFlag(argv, "seed", 1, { min: 0, integer: true }),
    rooms: numFlag(argv, "rooms", 4, { min: 1, integer: true }),
    levels: numFlag(argv, "levels", 1, { min: 1, integer: true }),
    half: numFlag(argv, "half", 24, { min: 1, integer: true }),
    coverPerRoom: numFlag(argv, "cover", 3, { min: 0, integer: true }),
    spawnRadius: numFlag(argv, "spawn-radius", 2.5, { min: 0, exclusive: true }),
    ...(spawn ? { spawn } : {}),
  };

  const { map, spawn: resolvedSpawn } = seedBreachArena(seedOpts);

  const validation = validateMapLayout(map, { spawn: resolvedSpawn, spawnRadius: seedOpts.spawnRadius });
  if (!validation.ok) {
    console.error(`[maps] generated layout for "${id}" failed validation:`);
    for (const issue of validation.issues) {
      console.error(`  - [${issue.code}] ${issue.message}`);
    }
    process.exit(1);
  }

  const moduleText = buildMapsModule(map, {
    engineImport: flag(argv, "engine-import"),
    constName: flag(argv, "const"),
  });

  const svgPath = flag(argv, "svg");
  const outPath = flag(argv, "out");

  if (has(argv, "check")) {
    if (!outPath) {
      console.error("[maps] --check requires --out <path> to compare against");
      process.exit(1);
    }
    if (!existsSync(outPath)) {
      console.error(`[maps] no map module at ${outPath} — run \`${invocationHint(id, outPath, seedOpts)}\` first`);
      process.exit(1);
    }
    if ((await readFile(outPath, "utf8")) !== moduleText) {
      console.error(`[maps] ${outPath} is out of date — re-run \`${invocationHint(id, outPath, seedOpts)}\``);
      process.exit(1);
    }
    console.log(
      `[maps] up to date — "${id}": ${map.obstacles?.length ?? 0} obstacles, ${map.lights?.length ?? 0} lights — ${outPath}`,
    );
    return;
  }

  if (svgPath) {
    await mkdir(dirname(svgPath), { recursive: true });
    await writeFile(svgPath, renderTopDownSvg(map, { spawn: resolvedSpawn }));
    console.log(`[maps] wrote preview ${svgPath}`);
  }

  if (outPath) {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, moduleText);
    console.log(
      `[maps] wrote ${outPath} — "${id}": ${map.obstacles?.length ?? 0} obstacles, ${map.lights?.length ?? 0} lights`,
    );
  } else {
    process.stdout.write(moduleText);
  }
}

function readSpawn(argv: string[]): SpawnPoint | undefined {
  const x = flag(argv, "spawn-x");
  const z = flag(argv, "spawn-z");
  if (x === undefined || z === undefined) return undefined;
  const px = Number(x);
  const pz = Number(z);
  if (!Number.isFinite(px) || !Number.isFinite(pz)) return undefined;
  return { x: px, z: pz };
}

// Parse a numeric flag. Absent → `def`. An explicitly-supplied value that is
// NaN, out of range, or non-integer (when required) exits(1) with a clear
// message instead of silently falling back to the default — so a typo in a
// determinism-sensitive flag like `--seed 0` is surfaced, not swallowed.
function numFlag(
  argv: string[],
  name: string,
  def: number,
  spec: { min: number; integer?: boolean; exclusive?: boolean },
): number {
  const raw = flag(argv, name);
  if (raw === undefined) return def;
  const n = Number(raw);
  const tooLow = spec.exclusive ? n <= spec.min : n < spec.min;
  if (!Number.isFinite(n) || tooLow || (spec.integer && !Number.isInteger(n))) {
    const bound = `${spec.exclusive ? ">" : ">="} ${spec.min}`;
    console.error(`[maps] invalid --${name} "${raw}" (expected ${spec.integer ? "an integer" : "a number"} ${bound})`);
    process.exit(1);
  }
  return n;
}

// A copy-paste regeneration command that reproduces the module byte-for-byte —
// including every generation flag — so a CI operator who follows a `--check`
// failure hint re-runs with the same inputs rather than silently regenerating
// with defaults (which, for a deterministic generator, yields a different map).
function invocationHint(id: string, outPath: string, o: BreachArenaOptions): string {
  const parts = [`assetgen maps --id ${id}`];
  if (o.name) parts.push(`--name ${JSON.stringify(o.name)}`);
  parts.push(
    `--seed ${o.seed}`,
    `--rooms ${o.rooms}`,
    `--levels ${o.levels}`,
    `--half ${o.half}`,
    `--cover ${o.coverPerRoom}`,
    `--spawn-radius ${o.spawnRadius}`,
  );
  if (o.spawn) parts.push(`--spawn-x ${o.spawn.x}`, `--spawn-z ${o.spawn.z}`);
  parts.push(`--out ${outPath}`);
  return parts.join(" ");
}
