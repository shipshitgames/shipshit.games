import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { GapReport } from "../src/gap-map.ts";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const cliPath = join(pkgDir, "src", "cli.ts");

type CliResult = { exitCode: number; stdout: string; stderr: string };

async function runGapMap(args: string[], opts: { extraEnv?: Record<string, string> } = {}): Promise<CliResult> {
  // Clear registry env so resolution is driven only by the explicit fixture flags.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (typeof v === "string") env[k] = v;
  delete env.ASSETGEN_IP;
  delete env.ASSETGEN_PROJECT_ROOT;
  delete env.ASSETGEN_PROJECTS;
  env.SHIPSHIT_ASSETGEN_USAGE_LOG = "off";
  Object.assign(env, opts.extraEnv ?? {});

  // Run from an isolated throwaway cwd so the per-game `defaultRepo` fallback can
  // never resolve a manifest inside the package source tree (test isolation).
  const cwd = await mkdtemp(join(tmpdir(), "assetgen-gapmap-cwd-"));
  try {
    const proc = Bun.spawn(["bun", cliPath, "gap-map", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, stdout, stderr };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

const LICENSE = { tool: "codex", plan: "gpt-image-1", date: "2026-06-17", kind: "sprite" };

function variants(over: Record<string, string | null> = {}): Record<string, string | null> {
  return {
    "scourge-survivors": null,
    deadlane: null,
    pactfall: null,
    starblight: null,
    redline: null,
    rothulk: null,
    ...over,
  };
}

function entity(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "gap-entity",
    kind: "entity",
    name: "Gap Entity",
    faction: "scourge",
    hostFamily: null,
    canon: "c",
    promptBase: "p",
    games: ["scourge-survivors", "deadlane"],
    variants: variants({ "scourge-survivors": "entities/gap-entity/scourge-survivors.webp" }),
    ...over,
  };
}

const FILLED_ENTITY = entity({
  id: "filled-entity",
  name: "Filled",
  games: ["scourge-survivors"],
  variants: variants({ "scourge-survivors": "entities/filled-entity/scourge-survivors.webp" }),
});

/** A catalog with exactly one variant gap (gap-entity → deadlane). */
function gappyCatalog() {
  return { version: "9.9.9", entities: [entity(), FILLED_ENTITY], shared: [] };
}

/** Seed a shared @shipshitgames/assets package holding just the catalog. */
async function seedAssetsDir(catalog: { version?: string; entities: unknown[]; shared?: unknown[] }): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-gapmap-assets-"));
  await writeFile(join(dir, "assets-catalog.json"), JSON.stringify({ shared: [], ...catalog }, null, 2));
  return dir;
}

/**
 * Seed a games root holding per-game registration manifests at
 * `<root>/<slug>/src/assets/assets.json` — the layout `check --game` reads.
 */
async function seedGamesRoot(manifests: Record<string, { assets: unknown[]; files?: string[] }>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "assetgen-gapmap-games-"));
  for (const [game, manifest] of Object.entries(manifests)) {
    const assetsRoot = join(root, game, "src", "assets");
    await mkdir(assetsRoot, { recursive: true });
    await writeFile(join(assetsRoot, "assets.json"), JSON.stringify({ assets: manifest.assets }, null, 2));
    for (const f of manifest.files ?? []) {
      const full = join(assetsRoot, f);
      await mkdir(join(full, ".."), { recursive: true });
      await writeFile(full, "webp-bytes");
    }
  }
  return root;
}

/** A scourge-survivors manifest referencing a file that does not exist → 1 broken asset. */
const SS_BROKEN = {
  "scourge-survivors": {
    assets: [{ id: "ghost", kind: "sprite", game: "scourge-survivors", path: "sprites/ghost.webp", license: { ...LICENSE } }],
    files: [] as string[],
  },
};

test("e2e: --json maps catalog variant gaps and check failures into one report", async () => {
  const assetsDir = await seedAssetsDir(gappyCatalog());
  const gamesRoot = await seedGamesRoot(SS_BROKEN);
  try {
    const res = await runGapMap(["--assets-dir", assetsDir, "--games-root", gamesRoot, "--json"]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    const report = JSON.parse(res.stdout) as GapReport;

    assert.equal(report.summary.missingVariants, 1); // gap-entity → deadlane
    assert.equal(report.summary.brokenAssets, 1); // ghost unresolved in scourge-survivors
    assert.equal(report.summary.totalGaps, 2);
    assert.equal(report.summary.gamesTotal, 8);
    assert.equal(report.summary.gamesChecked, 1);
    assert.equal(report.catalogVersion, "9.9.9");

    // byEntity rolls the variant gap up under its entity.
    const gapEntity = report.byEntity.find((e) => e.entity === "gap-entity");
    assert.deepEqual(gapEntity?.missingGames, ["deadlane"]);

    // Priority groups lead with sprites (P1) and never decrease in priority.
    assert.equal(report.byTypeAndPriority[0]?.priority, 1);
    assert.ok(report.byTypeAndPriority.some((g) => g.brokenAssets > 0));

    // The broken asset lives under the checked game's section, classified as a
    // P1 sprite end-to-end (entry label `ghost:sprite` → sprite bucket).
    const ss = report.byGame.find((g) => g.game === "scourge-survivors");
    assert.equal(ss?.checked, true);
    const ghost = ss?.brokenAssets[0];
    assert.equal(ghost?.check, "manifest-resolves");
    assert.equal(ghost?.assetType, "sprite");
    assert.equal(ghost?.priority, 1);
    assert.match(ghost?.detail ?? "", /ghost:sprite .* not found/);
    const ssSprite = report.byTypeAndPriority.find((g) => g.assetType === "sprite" && g.game === "scourge-survivors");
    assert.ok((ssSprite?.brokenAssets ?? 0) >= 1);

    // The seven games with no seeded manifest are reported unchecked, not crashed.
    const unchecked = report.byGame.filter((g) => !g.checked);
    assert.equal(unchecked.length, 7);
    assert.ok(unchecked.every((g) => /no registration manifest/.test(g.reason ?? "")));
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
    await rm(gamesRoot, { recursive: true, force: true });
  }
});

test("e2e: --game narrows the report to one slug", async () => {
  const assetsDir = await seedAssetsDir(gappyCatalog());
  const gamesRoot = await seedGamesRoot(SS_BROKEN);
  try {
    const res = await runGapMap([
      "--assets-dir", assetsDir, "--games-root", gamesRoot, "--game", "scourge-survivors", "--json",
    ]);
    assert.equal(res.exitCode, 0, res.stderr);
    const report = JSON.parse(res.stdout) as GapReport;
    assert.deepEqual(report.games, ["scourge-survivors"]);
    assert.equal(report.summary.gamesTotal, 1);
    // scourge-survivors variants are filled, so no variant gap — only the broken asset.
    assert.equal(report.summary.missingVariants, 0);
    assert.equal(report.summary.brokenAssets, 1);
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
    await rm(gamesRoot, { recursive: true, force: true });
  }
});

test("e2e: a runtime-shaped manifest is reported unchecked, not as fabricated broken assets", async () => {
  const assetsDir = await seedAssetsDir(gappyCatalog());
  // A real deadrot runtime manifest has no top-level `assets` array.
  const gamesRoot = await mkdtemp(join(tmpdir(), "assetgen-gapmap-runtime-"));
  const runtimeRoot = join(gamesRoot, "scourge-survivors", "src", "assets");
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(join(runtimeRoot, "assets.json"), JSON.stringify({ sprites: {}, audio: {}, ui: {} }));
  try {
    const res = await runGapMap(["--assets-dir", assetsDir, "--games-root", gamesRoot, "--json"]);
    assert.equal(res.exitCode, 0, res.stderr);
    const report = JSON.parse(res.stdout) as GapReport;
    const ss = report.byGame.find((g) => g.game === "scourge-survivors");
    assert.equal(ss?.checked, false);
    assert.match(ss?.reason ?? "", /not a registration manifest/);
    assert.equal(report.summary.brokenAssets, 0);
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
    await rm(gamesRoot, { recursive: true, force: true });
  }
});

test("e2e: --no-checks reports only catalog variant gaps", async () => {
  const assetsDir = await seedAssetsDir(gappyCatalog());
  try {
    const res = await runGapMap(["--assets-dir", assetsDir, "--no-checks", "--json"]);
    assert.equal(res.exitCode, 0, res.stderr);
    const report = JSON.parse(res.stdout) as GapReport;
    assert.equal(report.summary.brokenAssets, 0);
    assert.equal(report.summary.missingVariants, 1);
    assert.equal(report.summary.gamesChecked, 0);
    assert.ok(report.byGame.every((g) => !g.checked));
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});

test("e2e: --fail-on-gaps exits non-zero when gaps exist", async () => {
  const assetsDir = await seedAssetsDir(gappyCatalog());
  try {
    const res = await runGapMap(["--assets-dir", assetsDir, "--no-checks", "--fail-on-gaps"]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stderr, /gap\(s\) found — failing/);
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});

test("e2e: a fully rendered catalog has no gaps and exits 0 under --fail-on-gaps", async () => {
  const assetsDir = await seedAssetsDir({ version: "1.0.0", entities: [FILLED_ENTITY], shared: [] });
  try {
    const res = await runGapMap(["--assets-dir", assetsDir, "--no-checks", "--fail-on-gaps"]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /no gaps/);
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});

test("e2e: --out writes a deterministic JSON file", async () => {
  const assetsDir = await seedAssetsDir(gappyCatalog());
  const outPath = join(assetsDir, "gap-report.json");
  try {
    const res = await runGapMap(["--assets-dir", assetsDir, "--no-checks", "--out", outPath]);
    assert.equal(res.exitCode, 0, res.stderr);
    assert.match(res.stdout, /wrote .*gap-report\.json/);
    const written = JSON.parse(await Bun.file(outPath).text()) as GapReport;
    assert.equal(written.summary.missingVariants, 1);
    assert.equal(written.version, 1);
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});

test("e2e: a missing catalog fails clearly (exit 1)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-gapmap-empty-"));
  try {
    const res = await runGapMap(["--assets-dir", dir, "--no-checks"]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stderr, /no assets-catalog\.json/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: an unknown --game slug is rejected (exit 1)", async () => {
  const assetsDir = await seedAssetsDir(gappyCatalog());
  try {
    const res = await runGapMap(["--assets-dir", assetsDir, "--game", "not-a-game", "--no-checks"]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stderr, /unknown game "not-a-game"/);
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});

test("e2e: --codegen surfaces a stale/missing-codegen broken asset and records the check that ran", async () => {
  const assetsDir = await seedAssetsDir(gappyCatalog());
  // A clean, resolvable manifest so codegen-current is the only failing check
  // (no committed assets.generated.ts → "generated module missing").
  const gamesRoot = await seedGamesRoot({
    "scourge-survivors": {
      assets: [{ id: "sword", kind: "sprite", game: "scourge-survivors", path: "sprites/sword.webp", license: { ...LICENSE } }],
      files: ["sprites/sword.webp"],
    },
  });
  try {
    const res = await runGapMap([
      "--assets-dir", assetsDir, "--games-root", gamesRoot, "--game", "scourge-survivors", "--codegen", "--json",
    ]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    const report = JSON.parse(res.stdout) as GapReport;
    const ss = report.byGame.find((g) => g.game === "scourge-survivors");
    assert.equal(ss?.checked, true);
    // codegen-current ran (it is listed) and failed (it is a broken asset).
    assert.ok(ss?.checks.includes("codegen-current"));
    assert.ok(ss?.brokenAssets.some((b) => b.check === "codegen-current"));
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
    await rm(gamesRoot, { recursive: true, force: true });
  }
});

test("e2e: default run omits codegen-current from the checks that ran", async () => {
  const assetsDir = await seedAssetsDir(gappyCatalog());
  const gamesRoot = await seedGamesRoot(SS_BROKEN);
  try {
    const res = await runGapMap(["--assets-dir", assetsDir, "--games-root", gamesRoot, "--game", "scourge-survivors", "--json"]);
    assert.equal(res.exitCode, 0, res.stderr);
    const report = JSON.parse(res.stdout) as GapReport;
    const ss = report.byGame.find((g) => g.game === "scourge-survivors");
    assert.equal(ss?.checked, true);
    assert.ok(!ss?.checks.includes("codegen-current"));
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
    await rm(gamesRoot, { recursive: true, force: true });
  }
});

test("e2e: --ip resolves the assets dir via the registry and labels the report", async () => {
  const assetsDir = await seedAssetsDir(gappyCatalog());
  try {
    const projects = JSON.stringify([{ id: "testip", root: assetsDir, assetsDir }]);
    const res = await runGapMap(["--ip", "testip", "--no-checks", "--json"], { extraEnv: { ASSETGEN_PROJECTS: projects } });
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    const report = JSON.parse(res.stdout) as GapReport;
    assert.equal(report.project, "testip");
    assert.equal(report.summary.missingVariants, 1);
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
  }
});

test("e2e: an unregistered --ip is rejected (exit 1)", async () => {
  const res = await runGapMap(["--ip", "no-such-ip", "--no-checks"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /Register it via ASSETGEN_PROJECTS/);
});

test("e2e: a corrupt registration manifest degrades to unchecked, not a crash", async () => {
  const assetsDir = await seedAssetsDir(gappyCatalog());
  const gamesRoot = await mkdtemp(join(tmpdir(), "assetgen-gapmap-corrupt-"));
  const root = join(gamesRoot, "scourge-survivors", "src", "assets");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "assets.json"), "{ not json");
  try {
    const res = await runGapMap(["--assets-dir", assetsDir, "--games-root", gamesRoot, "--json"]);
    assert.equal(res.exitCode, 0, res.stderr);
    const report = JSON.parse(res.stdout) as GapReport;
    const ss = report.byGame.find((g) => g.game === "scourge-survivors");
    assert.equal(ss?.checked, false);
    assert.match(ss?.reason ?? "", /not valid JSON/);
    assert.equal(report.summary.brokenAssets, 0);
  } finally {
    await rm(assetsDir, { recursive: true, force: true });
    await rm(gamesRoot, { recursive: true, force: true });
  }
});

test("e2e: a structurally malformed catalog (no entities array) fails clearly (exit 1)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-gapmap-badcatalog-"));
  await writeFile(join(dir, "assets-catalog.json"), JSON.stringify({ version: "1.0.0" }));
  try {
    const res = await runGapMap(["--assets-dir", dir, "--no-checks"]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stderr, /not a valid asset catalog/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
