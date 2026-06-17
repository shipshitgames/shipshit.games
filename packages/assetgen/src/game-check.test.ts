import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import sharp from "sharp";

import { buildAssetIndex } from "./asset-index.ts";
import { buildCodegenModule } from "./codegen.ts";
import { BANNED_SOURCES, isBannedSource, runGameCheck, type GameCheckName, type GameCheckReport } from "./game-check.ts";
import type { AssetEntry, AssetLicenseRecord } from "./manifest.ts";

const GAME = "scourge-survivors";

function lic(over: Partial<AssetLicenseRecord> = {}): AssetLicenseRecord {
  return { tool: "codex", plan: "gpt-image-1", date: "2026-06-17", kind: "sprite", ...over };
}

function entry(over: Partial<AssetEntry> = {}): AssetEntry {
  return { id: "sword", kind: "sprite", game: GAME, path: "sprites/sword.webp", license: lic(), ...over };
}

/** Build a temp `<root>/src/assets` tree with a manifest and the given on-disk files. */
async function fixture(
  entries: AssetEntry[],
  files: string[],
  opts: { manifest?: unknown; noManifest?: boolean } = {},
): Promise<{ dir: string; assetsRoot: string }> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-gamecheck-"));
  const assetsRoot = join(dir, "src", "assets");
  await mkdir(assetsRoot, { recursive: true });
  if (!opts.noManifest) {
    const body = opts.manifest !== undefined ? opts.manifest : { assets: entries };
    await writeFile(join(assetsRoot, "assets.json"), JSON.stringify(body, null, 2));
  }
  for (const f of files) {
    const full = join(assetsRoot, f);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, "webp-bytes");
  }
  return { dir, assetsRoot };
}

function byCheck(report: GameCheckReport, name: GameCheckName) {
  const r = report.results.find((res) => res.check === name);
  assert.ok(r, `expected a "${name}" result`);
  return r;
}

async function run(assetsRoot: string) {
  return runGameCheck({ game: GAME, assetsRoot, skipCodegen: true });
}

// ── isBannedSource ──────────────────────────────────────────────────────────

test("isBannedSource matches Udio as a whole token, case-insensitively", () => {
  assert.equal(isBannedSource("udio"), true);
  assert.equal(isBannedSource("Udio"), true);
  assert.equal(isBannedSource("UDIO"), true);
  assert.equal(isBannedSource("udio-v1.5"), true);
  assert.equal(isBannedSource("bark:udio"), true);
});

test("isBannedSource does not false-positive on substrings or unrelated providers", () => {
  // "studio" and "audio" contain the letters but are not the token "udio".
  assert.equal(isBannedSource("studio"), false);
  assert.equal(isBannedSource("audio"), false);
  assert.equal(isBannedSource("openai"), false);
  assert.equal(isBannedSource("elevenlabs"), false);
  assert.equal(isBannedSource(undefined), false);
  assert.equal(isBannedSource(null), false);
  assert.equal(isBannedSource(""), false);
});

test("BANNED_SOURCES names udio", () => {
  assert.deepEqual([...BANNED_SOURCES], ["udio"]);
});

// ── happy path ──────────────────────────────────────────────────────────────

test("a fully-valid game passes every check", async () => {
  const { dir, assetsRoot } = await fixture(
    [
      entry({ id: "sword", path: "sprites/sword.webp" }),
      entry({ id: "shield", path: "sprites/shield.webp", preview: "previews/shield.webp" }),
    ],
    ["sprites/sword.webp", "sprites/shield.webp", "previews/shield.webp"],
  );
  try {
    const report = await run(assetsRoot);
    assert.equal(report.ok, true, JSON.stringify(report.results, null, 2));
    for (const r of report.results) assert.equal(r.status, "ok", `${r.check}: ${r.summary}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── manifest-resolves ───────────────────────────────────────────────────────

test("manifest-resolves fails when a referenced file is missing on disk", async () => {
  const { dir, assetsRoot } = await fixture(
    [entry({ id: "sword", path: "sprites/sword.webp" }), entry({ id: "ghost", path: "sprites/ghost.webp" })],
    ["sprites/sword.webp"], // ghost.webp intentionally absent
  );
  try {
    const report = await run(assetsRoot);
    assert.equal(report.ok, false);
    const result = byCheck(report, "manifest-resolves");
    assert.equal(result.status, "fail");
    assert.match(result.messages.join("\n"), /ghost:sprite → path "sprites\/ghost\.webp" not found/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("manifest-resolves checks animation and preview references too", async () => {
  const { dir, assetsRoot } = await fixture(
    [entry({ id: "hero", path: "sprites/hero.anim0.webp", animation: "sprites/hero.anim.json", preview: "previews/hero.webp" })],
    ["sprites/hero.anim0.webp", "previews/hero.webp"], // hero.anim.json absent
  );
  try {
    const report = await run(assetsRoot);
    const result = byCheck(report, "manifest-resolves");
    assert.equal(result.status, "fail");
    assert.match(result.messages.join("\n"), /animation "sprites\/hero\.anim\.json" not found/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── orphan-webps ────────────────────────────────────────────────────────────

test("orphan-webps fails on a webp the manifest never references", async () => {
  const { dir, assetsRoot } = await fixture(
    [entry({ id: "sword", path: "sprites/sword.webp" })],
    ["sprites/sword.webp", "sprites/leftover.webp"],
  );
  try {
    const report = await run(assetsRoot);
    assert.equal(report.ok, false);
    const result = byCheck(report, "orphan-webps");
    assert.equal(result.status, "fail");
    assert.match(result.messages.join("\n"), /sprites\/leftover\.webp is not referenced/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("orphan-webps ignores packed atlas/anim page images (derived build output)", async () => {
  const { dir, assetsRoot } = await fixture(
    [entry({ id: "sword", path: "sprites/sword.webp" })],
    ["sprites/sword.webp", "sprites/pack.atlas0.webp", "sprites/hero.anim0.webp"],
  );
  try {
    const report = await run(assetsRoot);
    const result = byCheck(report, "orphan-webps");
    assert.equal(result.status, "ok", result.messages.join("\n"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── licensed ────────────────────────────────────────────────────────────────

test("licensed fails when an entry is missing a required license field", async () => {
  const { dir, assetsRoot } = await fixture(
    [entry({ id: "sword", path: "sprites/sword.webp", license: lic({ date: "" }) })],
    ["sprites/sword.webp"],
  );
  try {
    const report = await run(assetsRoot);
    assert.equal(report.ok, false);
    const result = byCheck(report, "licensed");
    assert.equal(result.status, "fail");
    assert.match(result.messages.join("\n"), /sword:sprite missing license\.date/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── banned-source ───────────────────────────────────────────────────────────

test("banned-source fails for Udio in any scanned field (provider, model, license.tool, license.plan, provenance.provider)", async () => {
  const { dir, assetsRoot } = await fixture(
    [
      entry({ id: "song", kind: "music", path: "music/song.webp", provider: "udio" }),
      entry({ id: "mdl", kind: "music", path: "music/mdl.webp", model: "udio-130", license: lic({ kind: "music" }) }),
      entry({ id: "loop", kind: "music", path: "music/loop.webp", license: lic({ kind: "music", tool: "udio" }) }),
      entry({ id: "plan", kind: "music", path: "music/plan.webp", license: lic({ kind: "music", plan: "udio" }) }),
      entry({
        id: "drone",
        kind: "music",
        path: "music/drone.webp",
        provenance: { provider: "Udio" } as unknown as AssetEntry["provenance"],
      }),
    ],
    ["music/song.webp", "music/mdl.webp", "music/loop.webp", "music/plan.webp", "music/drone.webp"],
  );
  try {
    const report = await run(assetsRoot);
    assert.equal(report.ok, false);
    const result = byCheck(report, "banned-source");
    assert.equal(result.status, "fail");
    const joined = result.messages.join("\n");
    assert.match(joined, /song:music provider="udio" is a banned source/);
    assert.match(joined, /mdl:music model="udio-130" is a banned source/);
    assert.match(joined, /loop:music license\.tool="udio" is a banned source/);
    assert.match(joined, /plan:music license\.plan="udio" is a banned source/);
    assert.match(joined, /drone:music provenance\.provider="Udio" is a banned source/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("banned-source passes for legitimate providers that merely contain the letters", async () => {
  const { dir, assetsRoot } = await fixture(
    [entry({ id: "clip", kind: "sfx", path: "sfx/clip.webp", provider: "studio-tools", license: lic({ kind: "sfx" }) })],
    ["sfx/clip.webp"],
  );
  try {
    const report = await run(assetsRoot);
    const result = byCheck(report, "banned-source");
    assert.equal(result.status, "ok", result.messages.join("\n"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── manifest errors ─────────────────────────────────────────────────────────

test("a missing manifest fails the gate with a clear message", async () => {
  const { dir, assetsRoot } = await fixture([], [], { noManifest: true });
  try {
    const report = await run(assetsRoot);
    assert.equal(report.ok, false);
    const result = byCheck(report, "manifest-resolves");
    assert.equal(result.status, "fail");
    assert.match(result.messages.join("\n"), /no manifest at .*assets\.json/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a malformed manifest (no assets array) fails the gate", async () => {
  const { dir, assetsRoot } = await fixture([], [], { manifest: { notAssets: true } });
  try {
    const report = await run(assetsRoot);
    assert.equal(report.ok, false);
    assert.match(byCheck(report, "manifest-resolves").messages.join("\n"), /has no "assets" array/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── codegen-current (opt-in) ────────────────────────────────────────────────

test("codegen-current is skipped (not failed) when the shared assets package is absent", async () => {
  const { dir, assetsRoot } = await fixture([entry({ path: "sprites/sword.webp" })], ["sprites/sword.webp"]);
  try {
    // skipCodegen omitted, but no assetsDir provided → the check auto-skips.
    const report = await runGameCheck({ game: GAME, assetsRoot });
    assert.equal(report.ok, true, JSON.stringify(report.results, null, 2));
    assert.equal(byCheck(report, "codegen-current").status, "skipped");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("codegen-current fails when the generated module is missing but the shared package exists", async () => {
  const { dir, assetsRoot } = await fixture([entry({ path: "sprites/sword.webp" })], ["sprites/sword.webp"]);
  // A minimal shared assets package (just enough for the existence gate).
  const assetsDir = join(dir, "shared-assets");
  await mkdir(assetsDir, { recursive: true });
  await writeFile(join(assetsDir, "assets-catalog.json"), JSON.stringify({ entities: [], shared: [] }));
  try {
    const report = await runGameCheck({
      game: GAME,
      assetsRoot,
      assetsDir,
      generatedPath: join(dir, "src", "assets.generated.ts"), // does not exist
    });
    assert.equal(report.ok, false);
    const result = byCheck(report, "codegen-current");
    assert.equal(result.status, "fail");
    assert.match(result.messages.join("\n"), /no generated module at .*assets\.generated\.ts/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/**
 * Seed a real shared @shipshitgames/assets package (catalog + one game-tagged
 * webp sharp can analyze) under `<dir>/shared-assets`, returning its path and
 * the module the codegen check expects to find on disk.
 */
async function seedSharedAssets(dir: string): Promise<{ assetsDir: string; expected: string }> {
  const assetsDir = join(dir, "shared-assets");
  const gameDir = join(assetsDir, "games", GAME);
  await mkdir(gameDir, { recursive: true });
  await writeFile(join(assetsDir, "assets-catalog.json"), JSON.stringify({ entities: [], shared: [] }));
  const webp = await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .webp()
    .toBuffer();
  await writeFile(join(gameDir, "husk.webp"), webp);
  const index = await buildAssetIndex({ assetsDir, game: GAME });
  return { assetsDir, expected: buildCodegenModule(index, null, GAME) };
}

test("codegen-current passes when the generated module is byte-equal to a freshly built one", async () => {
  const { dir, assetsRoot } = await fixture([entry({ path: "sprites/sword.webp" })], ["sprites/sword.webp"]);
  try {
    const { assetsDir, expected } = await seedSharedAssets(dir);
    const generatedPath = join(dir, "src", "assets.generated.ts");
    await writeFile(generatedPath, expected);

    const report = await runGameCheck({ game: GAME, assetsRoot, assetsDir, generatedPath });
    assert.equal(report.ok, true, JSON.stringify(report.results, null, 2));
    const result = byCheck(report, "codegen-current");
    assert.equal(result.status, "ok");
    assert.match(result.summary, /generated module current/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("codegen-current fails when the generated module has drifted from the built output", async () => {
  const { dir, assetsRoot } = await fixture([entry({ path: "sprites/sword.webp" })], ["sprites/sword.webp"]);
  try {
    const { assetsDir, expected } = await seedSharedAssets(dir);
    const generatedPath = join(dir, "src", "assets.generated.ts");
    await writeFile(generatedPath, `${expected}// hand-edited drift\n`);

    const report = await runGameCheck({ game: GAME, assetsRoot, assetsDir, generatedPath });
    assert.equal(report.ok, false);
    const result = byCheck(report, "codegen-current");
    assert.equal(result.status, "fail");
    assert.match(result.messages.join("\n"), /is out of date — re-run `assetgen codegen --game scourge-survivors`/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
