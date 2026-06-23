import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { LegalReport } from "../src/legal.ts";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const cliPath = join(pkgDir, "src", "cli.ts");

type CliResult = { exitCode: number; stdout: string; stderr: string };

async function runLegal(args: string[]): Promise<CliResult> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (typeof v === "string") env[k] = v;
  env.SHIPSHIT_ASSETGEN_USAGE_LOG = "off";
  // Run from a throwaway cwd so the `--game` defaultRepo fallback can never reach a
  // manifest inside the package source tree.
  const cwd = await mkdtemp(join(tmpdir(), "assetgen-legal-cwd-"));
  try {
    const proc = Bun.spawn(["bun", cliPath, "legal", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
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

function asset(over: { id: string; tool: string; kind?: string; category?: string; authored?: boolean }) {
  const kind = over.kind ?? "sprite";
  return {
    id: over.id,
    kind,
    game: "scourge-survivors",
    path: `${kind === "music" || kind === "sfx" ? "audio" : "sprites"}/${over.id}`,
    ...(over.category ? { category: over.category } : {}),
    ...(over.authored ? { human: { authored: true } } : {}),
    license: { tool: over.tool, plan: over.tool, date: "2026-06-22", kind },
  };
}

/** A mixed ledger: a banned Udio track, ElevenLabs music + sfx, codex sprites, a beatoven track. */
const MIXED = [
  asset({ id: "udio-theme", tool: "udio", kind: "music", category: "music" }),
  asset({ id: "el-music", tool: "elevenlabs", kind: "music", category: "music" }),
  asset({ id: "el-sfx", tool: "elevenlabs", kind: "sfx", category: "sfx" }),
  asset({ id: "hero", tool: "codex", authored: true }),
  asset({ id: "grunt", tool: "openai" }),
  asset({ id: "beat", tool: "beatoven", kind: "music", category: "music" }),
];

async function seedLedger(assets: unknown[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-legal-ledger-"));
  const file = join(dir, "assets.json");
  await writeFile(file, JSON.stringify({ assets }, null, 2));
  return file;
}

test("e2e: --manifest --json maps the ledger into the four reports + disclosures", async () => {
  const ledger = await seedLedger(MIXED);
  const res = await runLegal(["--manifest", ledger, "--json"]);
  assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  const report = JSON.parse(res.stdout) as LegalReport;

  assert.equal(report.version, 1);
  assert.equal(report.game, "scourge-survivors");
  assert.equal(report.usage, "in-game");
  assert.equal(report.summary.totalAssets, 6);
  // Banned in-game: udio-theme + el-music.
  assert.equal(report.summary.bannedSource, 2);
  assert.deepEqual(report.reports["banned-source"].map((r) => r.id).sort(), ["el-music", "udio-theme"]);
  // needs-authorship: all AI assets except the human-authored hero = 5.
  assert.equal(report.summary.needsAuthorship, 5);
  assert.equal(report.summary.protectableReview, 6);
  assert.equal(report.summary.providers, 5);

  // Disclosures travel with the report and never assert a conclusion.
  assert.match(report.steamDisclosure, /pre-generated/);
  assert.match(report.disclaimer, /not legal advice/i);
});

test("e2e: --usage marketing reclassifies ElevenLabs Music out of banned-source", async () => {
  const ledger = await seedLedger(MIXED);
  const res = await runLegal(["--manifest", ledger, "--usage", "marketing", "--json"]);
  assert.equal(res.exitCode, 0, res.stderr);
  const report = JSON.parse(res.stdout) as LegalReport;
  // Only Udio stays banned under marketing use.
  assert.equal(report.summary.bannedSource, 1);
  assert.deepEqual(report.reports["banned-source"].map((r) => r.id), ["udio-theme"]);
});

test("e2e: --steam-disclosure prints only the disclosure string", async () => {
  const ledger = await seedLedger(MIXED);
  const res = await runLegal(["--manifest", ledger, "--steam-disclosure"]);
  assert.equal(res.exitCode, 0, res.stderr);
  assert.match(res.stdout, /AI-generated content disclosure \(Steam\)/);
  assert.match(res.stdout, /Art, Music, Sound Effects/);
  // Just the string — no JSON, no per-report lines.
  assert.ok(!res.stdout.includes("banned-source"));
});

test("e2e: --report banned-source --json narrows to one report", async () => {
  const ledger = await seedLedger(MIXED);
  const res = await runLegal(["--manifest", ledger, "--report", "banned-source", "--json"]);
  assert.equal(res.exitCode, 0, res.stderr);
  const payload = JSON.parse(res.stdout) as { report: { id: string }[]; disclaimer: string };
  assert.deepEqual(payload.report.map((r) => r.id).sort(), ["el-music", "udio-theme"]);
  assert.match(payload.disclaimer, /not legal advice/i);
});

test("e2e: --fail-on-banned exits non-zero when a banned source is present", async () => {
  const ledger = await seedLedger(MIXED);
  const res = await runLegal(["--manifest", ledger, "--fail-on-banned"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /banned-source asset\(s\) for in-game use — failing/);
});

test("e2e: a clean ledger exits 0 under --fail-on-banned", async () => {
  const ledger = await seedLedger([
    asset({ id: "ok-sprite", tool: "codex", authored: true }),
    asset({ id: "ok-music", tool: "beatoven", kind: "music", category: "music" }),
  ]);
  const res = await runLegal(["--manifest", ledger, "--fail-on-banned"]);
  assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
});

test("e2e: --out writes a deterministic JSON report", async () => {
  const ledger = await seedLedger(MIXED);
  const outPath = join(ledger, "..", "legal-report.json");
  const res = await runLegal(["--manifest", ledger, "--out", outPath]);
  assert.equal(res.exitCode, 0, res.stderr);
  assert.match(res.stdout, /wrote .*legal-report\.json/);
  const written = JSON.parse(await Bun.file(outPath).text()) as LegalReport;
  assert.equal(written.version, 1);
  assert.equal(written.summary.bannedSource, 2);
});

test("e2e: default human output carries the Steam disclosure and the disclaimer", async () => {
  const ledger = await seedLedger(MIXED);
  const res = await runLegal(["--manifest", ledger]);
  assert.equal(res.exitCode, 0, res.stderr);
  assert.match(res.stdout, /\[legal\] game=scourge-survivors usage=in-game/);
  assert.match(res.stdout, /banned-source \(2\)/);
  assert.match(res.stdout, /by-provider:/);
  assert.match(res.stdout, /AI-generated content disclosure \(Steam\)/);
  assert.match(res.stdout, /not legal advice/i);
});

test("e2e: a missing ledger fails clearly (exit 1)", async () => {
  const res = await runLegal(["--manifest", join(tmpdir(), "does-not-exist-legal.json")]);
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /no ledger at/);
});

test("e2e: a runtime-shaped manifest (no assets array) is rejected (exit 1)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-legal-runtime-"));
  const file = join(dir, "assets.json");
  await writeFile(file, JSON.stringify({ sprites: {}, audio: {} }));
  try {
    const res = await runLegal(["--manifest", file, "--json"]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stderr, /not a registration manifest/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: corrupt JSON fails clearly (exit 1)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-legal-corrupt-"));
  const file = join(dir, "assets.json");
  await writeFile(file, "{ not json");
  try {
    const res = await runLegal(["--manifest", file]);
    assert.equal(res.exitCode, 1);
    assert.match(res.stderr, /not valid JSON/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("e2e: neither --manifest nor --game is a usage error (exit 1)", async () => {
  const res = await runLegal(["--json"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /pass --manifest <file> or --game <slug>/);
});

test("e2e: an unknown --game slug is rejected (exit 1)", async () => {
  const res = await runLegal(["--game", "not-a-game"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.stderr, /unknown game "not-a-game"/);
});

test("e2e: --game resolves <games-root>/<slug>/src/assets/assets.json", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-legal-games-"));
  const assetsRoot = join(root, "scourge-survivors", "src", "assets");
  await mkdir(assetsRoot, { recursive: true });
  await writeFile(join(assetsRoot, "assets.json"), JSON.stringify({ assets: MIXED }));
  try {
    const res = await runLegal(["--game", "scourge-survivors", "--games-root", root, "--json"]);
    assert.equal(res.exitCode, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    const report = JSON.parse(res.stdout) as LegalReport;
    assert.equal(report.game, "scourge-survivors");
    assert.equal(report.summary.bannedSource, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
