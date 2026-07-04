import assert from "node:assert/strict";
import { test } from "node:test";

import type { AssetCatalog, EntityAsset, GameSlug } from "./assets-package.ts";
import type { GameCheckReport, GameCheckResult } from "./game-check.ts";
import {
  ASSET_TYPE_PRIORITY,
  assetTypePriority,
  brokenAssetsFromReport,
  brokenMessageAssetType,
  buildGapReport,
  classifyAssetType,
  classifyAssetTypeFromPath,
  computeVariantGaps,
  GAP_MAP_VERSION,
  pendingGames,
  serializeGapReport,
  type GameCheckSlot,
} from "./gap-map.ts";

// ── fixtures ──────────────────────────────────────────────────────────────────

function entity(over: Partial<EntityAsset> = {}): EntityAsset {
  return {
    id: "scourge-swarm",
    kind: "entity",
    name: "Swarm Ripper",
    faction: "scourge",
    hostFamily: "rot-flesh",
    canon: "fodder",
    promptBase: "swarm",
    games: ["scourge-survivors", "deadlane"],
    variants: {
      "scourge-survivors": "entities/scourge-swarm/scourge-survivors.webp",
      deadlane: null,
      pactfall: null,
      starblight: null,
      redline: null,
      rothulk: null,
      brawl: null,
      warline: null,
    },
    ...over,
  };
}

function catalog(entities: EntityAsset[], version = "0.3.0"): AssetCatalog {
  return { version, entities, shared: [] };
}

function checkResult(over: Partial<GameCheckResult> & Pick<GameCheckResult, "check" | "status">): GameCheckResult {
  return { messages: [], summary: "", ...over };
}

function report(game: GameSlug, results: GameCheckResult[]): GameCheckReport {
  return {
    ok: results.every((r) => r.status !== "fail"),
    game,
    manifest: `/tmp/${game}/assets.json`,
    assetsRoot: `/tmp/${game}`,
    results,
  };
}

// ── priority + classification ──────────────────────────────────────────────────

test("priority order is sprites → music → UI → VFX, ahead of model/other", () => {
  assert.ok(ASSET_TYPE_PRIORITY.sprite < ASSET_TYPE_PRIORITY.music);
  assert.ok(ASSET_TYPE_PRIORITY.music < ASSET_TYPE_PRIORITY.ui);
  assert.ok(ASSET_TYPE_PRIORITY.ui < ASSET_TYPE_PRIORITY.vfx);
  assert.ok(ASSET_TYPE_PRIORITY.vfx < ASSET_TYPE_PRIORITY.model);
  assert.ok(ASSET_TYPE_PRIORITY.vfx < ASSET_TYPE_PRIORITY.other);
  assert.equal(assetTypePriority("sprite"), 1);
});

test("classifyAssetType buckets manifest kinds", () => {
  assert.equal(classifyAssetType("sprite"), "sprite");
  assert.equal(classifyAssetType("sprite-anim"), "sprite");
  assert.equal(classifyAssetType("boss"), "sprite");
  assert.equal(classifyAssetType("music"), "music");
  assert.equal(classifyAssetType("sfx"), "music");
  assert.equal(classifyAssetType("voice"), "music");
  assert.equal(classifyAssetType("ui"), "ui");
  assert.equal(classifyAssetType("font"), "ui");
  assert.equal(classifyAssetType("fx"), "vfx");
  assert.equal(classifyAssetType("vfx"), "vfx");
  assert.equal(classifyAssetType("model"), "model");
  assert.equal(classifyAssetType("glb"), "model");
  assert.equal(classifyAssetType(""), "other");
  assert.equal(classifyAssetType(undefined), "other");
  assert.equal(classifyAssetType("mystery"), "other");
});

test("classifyAssetTypeFromPath buckets by directory and extension", () => {
  assert.equal(classifyAssetTypeFromPath("sprites/sword.webp"), "sprite");
  assert.equal(classifyAssetTypeFromPath("music/theme.mp3"), "music");
  assert.equal(classifyAssetTypeFromPath("audio/hit.wav"), "music");
  assert.equal(classifyAssetTypeFromPath("ui/icon.webp"), "ui");
  assert.equal(classifyAssetTypeFromPath("shared/fonts/doom.woff2"), "ui");
  assert.equal(classifyAssetTypeFromPath("fx/blood.webp"), "vfx");
  assert.equal(classifyAssetTypeFromPath("models/husk.glb"), "model");
  assert.equal(classifyAssetTypeFromPath("notes.txt"), "other");
  // A real font file is ui; a sprite whose name merely contains "font" stays a sprite.
  assert.equal(classifyAssetTypeFromPath("hud/title.ttf"), "ui");
  assert.equal(classifyAssetTypeFromPath("sprites/fontaine.webp"), "sprite");
  assert.equal(classifyAssetTypeFromPath("entities/font-golem/redline.webp"), "sprite");
});

test("brokenMessageAssetType reads the kind from an entry label first, falls back to path", () => {
  assert.equal(brokenMessageAssetType('song:music → path "music/song.webp" not found'), "music");
  assert.equal(brokenMessageAssetType('sword:sprite missing license.date'), "sprite");
  // `#3:?` style labels (no id/kind) fall through to the path heuristic.
  assert.equal(brokenMessageAssetType("ui/breach-core-icon.webp is not referenced by the manifest"), "ui");
  assert.equal(brokenMessageAssetType("husk.glb is out of date"), "model");
});

// ── catalog variant gaps ────────────────────────────────────────────────────────

test("pendingGames returns only meant-for games whose variant is null", () => {
  // deadlane is meant-for and null → pending; scourge-survivors is rendered;
  // pactfall is null but NOT in `games`, so it is not pending.
  assert.deepEqual(pendingGames(entity()), ["deadlane"]);
});

test("pendingGames ignores a variant present for a game not in `games` (extra, not a gap)", () => {
  const e = entity({
    games: ["scourge-survivors"],
    variants: {
      "scourge-survivors": "x.webp",
      deadlane: "extra.webp", // present but not meant-for → neither gap nor pending
      pactfall: null,
      starblight: null,
      redline: null,
      rothulk: null,
      brawl: null,
      warline: null,
    },
  });
  assert.deepEqual(pendingGames(e), []);
});

test("computeVariantGaps emits one sprite gap per (entity, missing game), sorted by game then entity", () => {
  const a = entity({ id: "alpha", games: ["deadlane", "redline"], variants: { ...emptyVariants() } });
  const b = entity({ id: "beta", games: ["deadlane"], variants: { ...emptyVariants() } });
  const gaps = computeVariantGaps(catalog([a, b]));
  assert.deepEqual(
    gaps.map((g) => `${g.game}/${g.entity}`),
    ["deadlane/alpha", "deadlane/beta", "redline/alpha"],
  );
  assert.ok(gaps.every((g) => g.assetType === "sprite" && g.priority === 1));
});

test("computeVariantGaps honours the games filter", () => {
  const a = entity({ id: "alpha", games: ["deadlane", "redline"], variants: { ...emptyVariants() } });
  const gaps = computeVariantGaps(catalog([a]), ["redline"]);
  assert.deepEqual(gaps.map((g) => g.game), ["redline"]);
});

test("computeVariantGaps tolerates a missing variants map", () => {
  const e = { ...entity({ id: "x", games: ["deadlane"] }) } as EntityAsset;
  // @ts-expect-error — exercise the malformed-catalog guard
  delete e.variants;
  assert.deepEqual(computeVariantGaps(catalog([e])).map((g) => g.game), ["deadlane"]);
});

function emptyVariants(): Record<GameSlug, string | null> {
  return {
    "scourge-survivors": null,
    deadlane: null,
    pactfall: null,
    starblight: null,
    redline: null,
    rothulk: null,
    brawl: null,
    warline: null,
  };
}

// ── broken assets ────────────────────────────────────────────────────────────

test("brokenAssetsFromReport flattens only failing checks into per-message gaps", () => {
  const r = report("scourge-survivors", [
    checkResult({
      check: "manifest-resolves",
      status: "fail",
      summary: "1 unresolved reference(s)",
      messages: ['ghost:sprite → path "sprites/ghost.webp" not found'],
    }),
    checkResult({ check: "licensed", status: "ok", summary: "all licensed" }),
    checkResult({ check: "orphan-webps", status: "skipped", summary: "skipped" }),
  ]);
  const gaps = brokenAssetsFromReport(r);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0]?.check, "manifest-resolves");
  assert.equal(gaps[0]?.assetType, "sprite");
  assert.equal(gaps[0]?.game, "scourge-survivors");
});

test("brokenAssetsFromReport falls back to the summary when a failing check has no messages", () => {
  const r = report("deadlane", [
    checkResult({ check: "manifest-resolves", status: "fail", summary: "manifest unavailable", messages: [] }),
  ]);
  const gaps = brokenAssetsFromReport(r);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0]?.detail, "manifest unavailable");
});

// ── full report assembly ─────────────────────────────────────────────────────

function slot(over: Partial<GameCheckSlot> = {}): GameCheckSlot {
  return { report: null, manifest: null, reason: null, ...over };
}

test("buildGapReport assembles summary, byGame, byEntity, and priority groups", () => {
  const swarm = entity({ id: "swarm", games: ["scourge-survivors", "deadlane"], variants: { ...emptyVariants() } });
  const brokenReport = report("scourge-survivors", [
    checkResult({
      check: "orphan-webps",
      status: "fail",
      summary: "1 orphan webp(s)",
      messages: ["fx/orphan.webp is not referenced by the manifest"],
    }),
  ]);

  const gameChecks = new Map<GameSlug, GameCheckSlot>([
    ["scourge-survivors", slot({ report: brokenReport, manifest: "/tmp/ss/assets.json" })],
    ["deadlane", slot({ reason: "no manifest found for deadlane" })],
  ]);

  const result = buildGapReport({
    project: "deadrot",
    assetsDir: "/tmp/assets",
    catalog: catalog([swarm]),
    games: ["scourge-survivors", "deadlane"],
    gameChecks,
  });

  assert.equal(result.version, GAP_MAP_VERSION);
  assert.equal(result.project, "deadrot");
  assert.equal(result.catalogVersion, "0.3.0");
  // 2 missing variants (swarm × 2 games), 1 broken asset.
  assert.equal(result.summary.missingVariants, 2);
  assert.equal(result.summary.brokenAssets, 1);
  assert.equal(result.summary.totalGaps, 3);
  assert.equal(result.summary.gamesTotal, 2);
  assert.equal(result.summary.gamesChecked, 1);

  // byGame: ss checked with a broken asset, deadlane unchecked with a reason.
  const ss = result.byGame.find((g) => g.game === "scourge-survivors")!;
  assert.equal(ss.checked, true);
  assert.equal(ss.brokenAssets.length, 1);
  assert.equal(ss.missingVariants.length, 1);
  // checks lists exactly the sub-checks that ran (here just the one failing check).
  assert.deepEqual(ss.checks, ["orphan-webps"]);
  const dl = result.byGame.find((g) => g.game === "deadlane")!;
  assert.equal(dl.checked, false);
  assert.equal(dl.reason, "no manifest found for deadlane");
  assert.deepEqual(dl.checks, []);

  // byEntity: swarm missing both games (sorted).
  assert.deepEqual(result.byEntity[0]?.missingGames, ["deadlane", "scourge-survivors"]);

  // byTypeAndPriority: full ordering is priority-asc then game-asc then type-asc.
  // Two P1 sprite groups (one per game) precede the P4 vfx orphan group, and the
  // deadlane sprite group sorts before the scourge-survivors one by the game tiebreak.
  assert.deepEqual(
    result.byTypeAndPriority.map((g) => `${g.assetType}:${g.game}`),
    ["sprite:deadlane", "sprite:scourge-survivors", "vfx:scourge-survivors"],
  );
  const vfx = result.byTypeAndPriority.find((g) => g.assetType === "vfx")!;
  assert.equal(vfx.brokenAssets, 1);
});

test("buildGapReport reports zero gaps for a fully rendered, clean catalog", () => {
  const filled = entity({
    games: ["scourge-survivors"],
    variants: { ...emptyVariants(), "scourge-survivors": "x.webp" },
  });
  const cleanReport = report("scourge-survivors", [
    checkResult({ check: "manifest-resolves", status: "ok", summary: "ok" }),
  ]);
  const result = buildGapReport({
    project: "default",
    assetsDir: "/tmp",
    catalog: catalog([filled]),
    games: ["scourge-survivors"],
    gameChecks: new Map([["scourge-survivors", slot({ report: cleanReport, manifest: "/tmp/x" })]]),
  });
  assert.equal(result.summary.totalGaps, 0);
  assert.deepEqual(result.byTypeAndPriority, []);
  // byEntity lists only entities that have a gap, so a clean catalog yields none.
  assert.deepEqual(result.byEntity, []);
});

test("serializeGapReport is stable, pretty, and newline-terminated", () => {
  const result = buildGapReport({
    project: "default",
    assetsDir: "/tmp",
    catalog: catalog([]),
    games: [],
    gameChecks: new Map(),
  });
  const text = serializeGapReport(result);
  assert.ok(text.endsWith("\n"));
  assert.equal(serializeGapReport(JSON.parse(text) as typeof result), text);
});
