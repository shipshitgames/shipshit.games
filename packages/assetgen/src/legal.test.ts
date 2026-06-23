import assert from "node:assert/strict";
import { test } from "node:test";

import type { AssetEntry } from "./manifest.ts";
import {
  assetCategory,
  buildLegalReport,
  buildSteamDisclosure,
  classifyAsset,
  KNOWN_SOURCES,
  LEGAL_DISCLAIMER,
  normalizeKind,
  normalizeSource,
  resolveSourcePolicy,
  rollupDisposition,
  serializeLegalReport,
  steamCategory,
  type AssetLegalRecord,
  type UsageContext,
} from "./legal.ts";

/** Build an AssetEntry with a complete license record; override anything per test. */
function entry(over: Partial<AssetEntry> & { id: string; tool: string; kind?: string }): AssetEntry {
  const kind = over.kind ?? "sprite";
  return {
    id: over.id,
    kind,
    game: over.game ?? "scourge-survivors",
    path: over.path ?? `sprites/${over.id}.webp`,
    ...over,
    license: { tool: over.tool, plan: over.plan ?? over.tool, date: "2026-06-22", kind, ...(over.license ?? {}) },
  } as AssetEntry;
}

test("normalizeSource lowercases, trims, and de-aliases", () => {
  assert.equal(normalizeSource("  Codex-CLI "), "codex");
  assert.equal(normalizeSource("Eleven Labs"), "elevenlabs");
  assert.equal(normalizeSource("FAL.ai"), "fal");
  assert.equal(normalizeSource("OpenAI"), "openai");
  assert.equal(normalizeSource(undefined), "");
});

test("normalizeKind strips the audio/ prefix and lowercases", () => {
  assert.equal(normalizeKind("audio/music"), "music");
  assert.equal(normalizeKind("Sprite-Anim"), "sprite-anim");
  assert.equal(assetCategory({ kind: "music", category: "music" }), "music");
  assert.equal(assetCategory({ kind: "sprite", category: undefined }), "sprite");
});

test("Udio is denied everywhere — the PRD's hard DENY", () => {
  for (const usage of ["in-game", "marketing"] as UsageContext[]) {
    const p = resolveSourcePolicy("udio", { kind: "music", usage });
    assert.equal(p.disposition, "deny");
    assert.equal(p.known, true);
    assert.equal(p.ai, true);
  }
});

test("ElevenLabs Music is context-dependent: in-game DENY, marketing ALLOW", () => {
  assert.equal(resolveSourcePolicy("elevenlabs", { kind: "music", usage: "in-game" }).disposition, "deny");
  assert.equal(resolveSourcePolicy("elevenlabs", { kind: "music", usage: "marketing" }).disposition, "allow");
  // SFX stays perpetual-commercial regardless of usage.
  assert.equal(resolveSourcePolicy("elevenlabs", { kind: "sfx", usage: "in-game" }).disposition, "allow");
});

test("Soundraw and Beatoven are perpetual-ALLOW", () => {
  assert.equal(resolveSourcePolicy("soundraw", { kind: "music" }).disposition, "allow");
  assert.equal(resolveSourcePolicy("beatoven", { kind: "music" }).disposition, "allow");
});

test("Suno and the image/3D generators flag for review, never a conclusion", () => {
  assert.equal(resolveSourcePolicy("suno", { kind: "music" }).disposition, "review");
  for (const src of ["codex", "openai", "fal", "replicate", "meshy", "tripo"]) {
    assert.equal(resolveSourcePolicy(src, { kind: "sprite" }).disposition, "review", src);
  }
});

test("an unmapped source is unknown and flagged for review", () => {
  const p = resolveSourcePolicy("midjourney", { kind: "sprite" });
  assert.equal(p.known, false);
  assert.equal(p.disposition, "review");
  assert.equal(p.ai, true);
});

test("default usage is the cautious in-game read", () => {
  // No usage passed → in-game → ElevenLabs Music denied.
  assert.equal(resolveSourcePolicy("elevenlabs", { kind: "music" }).disposition, "deny");
});

test("rollupDisposition picks the most cautious (deny > review > allow)", () => {
  assert.equal(rollupDisposition(["allow", "allow"]), "allow");
  assert.equal(rollupDisposition(["allow", "review"]), "review");
  assert.equal(rollupDisposition(["review", "deny", "allow"]), "deny");
  assert.equal(rollupDisposition([]), "allow");
});

test("classifyAsset flags a banned source (Udio in-game)", () => {
  const r = classifyAsset(entry({ id: "theme", tool: "udio", kind: "music", category: "music" }), "in-game");
  assert.equal(r.disposition, "deny");
  assert.ok(r.flags.includes("banned-source"));
  // AI + no human authorship → also protectable-review + needs-authorship.
  assert.ok(r.flags.includes("protectable-review"));
  assert.ok(r.flags.includes("needs-authorship"));
});

test("classifyAsset: recorded human authorship clears needs-authorship but NOT protectable-review", () => {
  const r = classifyAsset(
    entry({ id: "hero", tool: "codex", human: { authored: true, editKind: "retouch" } }),
    "in-game",
  );
  assert.equal(r.humanAuthored, true);
  assert.equal(r.editKind, "retouch");
  assert.ok(!r.flags.includes("needs-authorship"));
  assert.ok(r.flags.includes("protectable-review"), "AI assets always need a protectability review");
});

test("classifyAsset marks an unmapped source unknown-source", () => {
  const r = classifyAsset(entry({ id: "x", tool: "midjourney" }), "in-game");
  assert.ok(r.flags.includes("unknown-source"));
  assert.equal(r.label, "midjourney");
});

test("classifyAsset falls back to provenance.provider when license.tool is blank", () => {
  const e = entry({ id: "y", tool: "codex" });
  // Simulate a manifest where the source only lives in provenance.
  (e.license as { tool: string }).tool = "";
  e.provenance = {
    provider: "fal",
    reproducible: false,
    promptHash: "abc",
    styleSuffixHash: "def",
    date: "2026-06-22",
  };
  const r = classifyAsset(e, "in-game");
  assert.equal(r.source, "fal");
});

test("buildLegalReport rolls up the summary and the four reports", () => {
  const entries: AssetEntry[] = [
    entry({ id: "udio-theme", tool: "udio", kind: "music", category: "music" }),
    entry({ id: "el-music", tool: "elevenlabs", kind: "music", category: "music" }),
    entry({ id: "el-sfx", tool: "elevenlabs", kind: "sfx", category: "sfx" }),
    entry({ id: "hero", tool: "codex", human: { authored: true } }),
    entry({ id: "grunt", tool: "openai" }),
    entry({ id: "beat", tool: "beatoven", kind: "music", category: "music" }),
  ];
  const report = buildLegalReport(entries, { usage: "in-game" });

  assert.equal(report.version, 1);
  assert.equal(report.game, "scourge-survivors");
  assert.equal(report.usage, "in-game");
  assert.equal(report.summary.totalAssets, 6);
  assert.equal(report.summary.aiAssets, 6);
  // Banned in-game: udio-theme + el-music (ElevenLabs Music in-game).
  assert.equal(report.summary.bannedSource, 2);
  // needs-authorship: every AI asset except `hero` (human authored) = 5.
  assert.equal(report.summary.needsAuthorship, 5);
  // protectable-review: all 6 AI assets.
  assert.equal(report.summary.protectableReview, 6);

  const banned = report.reports["banned-source"].map((r) => r.id).sort();
  assert.deepEqual(banned, ["el-music", "udio-theme"]);

  // by-provider groups by source: udio, elevenlabs, codex, openai, beatoven → 5.
  const byProvider = report.reports["by-provider"];
  assert.equal(byProvider.length, 5);
  assert.equal(report.summary.providers, 5);
});

test("by-provider rolls up ElevenLabs (music deny + sfx allow) to deny and counts both", () => {
  const entries: AssetEntry[] = [
    entry({ id: "m", tool: "elevenlabs", kind: "music", category: "music" }),
    entry({ id: "s", tool: "elevenlabs", kind: "sfx", category: "sfx" }),
  ];
  const report = buildLegalReport(entries, { usage: "in-game" });
  const el = report.reports["by-provider"].find((g) => g.source === "elevenlabs");
  assert.ok(el);
  assert.equal(el?.count, 2);
  assert.equal(el?.disposition, "deny"); // worst-case across the two assets
  assert.deepEqual(el?.kinds, ["music", "sfx"]);
  assert.deepEqual(el?.assetIds, ["m", "s"]);
  // Most-cautious-first ordering puts the deny group at the top.
  assert.equal(report.reports["by-provider"][0]?.disposition, "deny");
});

test("usage=marketing reclassifies ElevenLabs Music out of banned-source", () => {
  const entries = [entry({ id: "trailer", tool: "elevenlabs", kind: "music", category: "music" })];
  assert.equal(buildLegalReport(entries, { usage: "in-game" }).summary.bannedSource, 1);
  assert.equal(buildLegalReport(entries, { usage: "marketing" }).summary.bannedSource, 0);
});

test("game inference: single game, mixed games, and explicit override", () => {
  const mixed = [entry({ id: "a", tool: "codex", game: "deadlane" }), entry({ id: "b", tool: "codex", game: "pactfall" })];
  assert.equal(buildLegalReport(mixed).game, "(mixed)");
  assert.equal(buildLegalReport([entry({ id: "a", tool: "codex" })]).game, "scourge-survivors");
  assert.equal(buildLegalReport(mixed, { game: "override" }).game, "override");
});

test("steamCategory maps kinds to disclosure buckets", () => {
  assert.equal(steamCategory("sprite"), "Art");
  assert.equal(steamCategory("texture"), "Art");
  assert.equal(steamCategory("music"), "Music");
  assert.equal(steamCategory("sfx"), "Sound Effects");
  assert.equal(steamCategory("voice"), "Voice");
  assert.equal(steamCategory("model"), "3D Models");
  assert.equal(steamCategory("weird"), "Other");
});

test("buildSteamDisclosure enumerates sorted categories + tools and says pre-generated", () => {
  const records: AssetLegalRecord[] = [
    classifyAsset(entry({ id: "a", tool: "codex", kind: "sprite" }), "in-game"),
    classifyAsset(entry({ id: "b", tool: "beatoven", kind: "music", category: "music" }), "in-game"),
  ];
  const s = buildSteamDisclosure(records);
  assert.match(s, /Steam/);
  assert.match(s, /pre-generated/);
  assert.match(s, /Art, Music/); // sorted categories
  assert.match(s, /Beatoven, Codex CLI/); // sorted tool labels
});

test("buildSteamDisclosure handles a ledger with no AI assets", () => {
  const records = [classifyAsset(entry({ id: "conv", tool: "ffmpeg", kind: "music", category: "music" }), "in-game")];
  assert.match(buildSteamDisclosure(records), /no AI-generated assets/);
});

test("a non-AI source (ffmpeg) is not flagged for authorship or protectability", () => {
  const r = classifyAsset(entry({ id: "conv", tool: "ffmpeg", kind: "music", category: "music" }), "in-game");
  assert.equal(r.ai, false);
  assert.ok(!r.flags.includes("needs-authorship"));
  assert.ok(!r.flags.includes("protectable-review"));
});

test("the disclaimer never asserts a copyright conclusion", () => {
  assert.match(LEGAL_DISCLAIMER, /not legal advice/i);
  assert.match(LEGAL_DISCLAIMER, /no copyright or protectability determination/i);
  const report = buildLegalReport([entry({ id: "a", tool: "codex" })]);
  assert.equal(report.disclaimer, LEGAL_DISCLAIMER);
});

test("serializeLegalReport is stable JSON with a trailing newline", () => {
  const report = buildLegalReport([entry({ id: "a", tool: "udio", kind: "music", category: "music" })]);
  const text = serializeLegalReport(report);
  assert.ok(text.endsWith("\n"));
  assert.deepEqual(JSON.parse(text), report);
});

test("KNOWN_SOURCES covers every PRD-named source", () => {
  for (const src of ["udio", "elevenlabs", "soundraw", "beatoven", "suno"]) {
    assert.ok(KNOWN_SOURCES.includes(src), src);
  }
});
