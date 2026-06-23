// `assetgen legal` — flag the assets in a game's ledger for legal review and emit
// disclosures (issue #59).
//
// Reads a game's registration manifest (`{ assets: [...] }` — "the ledger") and
// produces four advisory reports — protectable-flag-for-review / needs-authorship
// / banned-source / by-provider — plus the Steam AI-content disclosure string,
// derived entirely from the recorded provider/license/human-authorship fields.
//
// It FLAGS for human review and NEVER asserts a copyright conclusion: even a
// `banned-source` row only repeats the provider-stated terms it was given.
//
// Resolution: pass the ledger directly with `--manifest <file>`, or resolve a
// game's `src/assets/assets.json` with `--game <slug>` plus `--game-assets-root`
// / `--games-root <dir>` (falling back to the local game repo). Usage context for
// the conditional audio sources is `--usage <in-game|marketing>` (default
// in-game, the cautious read). Other flags: `--report <name>`, `--steam-disclosure`,
// `--out <file>`, `--json`, `--fail-on-banned`.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { GAME_SLUGS, type GameSlug } from "../assets-package.ts";
import {
  buildLegalReport,
  isUsageContext,
  REPORT_NAMES,
  serializeLegalReport,
  USAGE_CONTEXTS,
  type LegalReport,
  type ReportName,
  type UsageContext,
} from "../legal.ts";
import type { AssetEntry } from "../manifest.ts";
import { flag, has } from "./args.ts";
import { defaultRepo } from "./paths.ts";

function isGameSlug(value: string): value is GameSlug {
  return (GAME_SLUGS as readonly string[]).includes(value);
}

function isReportName(value: string): value is ReportName {
  return (REPORT_NAMES as readonly string[]).includes(value);
}

/** Candidate `src/assets` roots for a game's registration manifest, most specific first. */
function gameAssetsRootCandidates(argv: string[], game: GameSlug): string[] {
  const roots: string[] = [];
  const override = flag(argv, "game-assets-root");
  if (override) roots.push(override);
  const gamesRoot = flag(argv, "games-root");
  if (gamesRoot) roots.push(join(gamesRoot, game, "src", "assets"));
  roots.push(join(defaultRepo(game), "src", "assets"));
  return roots;
}

/** Resolve the ledger path from `--manifest` or `--game` (+ root flags). Exits 1 on a usage error. */
function resolveLedgerPath(argv: string[]): string {
  const explicit = flag(argv, "manifest");
  if (explicit !== undefined) {
    if (!explicit || explicit.startsWith("--")) {
      console.error("[legal] --manifest requires a file path");
      process.exit(1);
    }
    return explicit;
  }

  if (!has(argv, "game")) {
    console.error("[legal] pass --manifest <file> or --game <slug> to point at the asset ledger");
    process.exit(1);
  }
  const one = flag(argv, "game");
  if (!one || one.startsWith("--")) {
    console.error("[legal] --game requires a slug, e.g. assetgen legal --game <slug>");
    process.exit(1);
  }
  if (!isGameSlug(one)) {
    console.error(`[legal] unknown game "${one}" — expected one of ${GAME_SLUGS.join(", ")}`);
    process.exit(1);
  }
  for (const root of gameAssetsRootCandidates(argv, one)) {
    const manifest = join(root, "assets.json");
    if (existsSync(manifest)) return manifest;
  }
  console.error(
    `[legal] no registration manifest (assets.json) found for ${one} — pass --manifest, --game-assets-root, or --games-root`,
  );
  process.exit(1);
}

/** Read + validate the ledger into an AssetEntry[]. Exits 1 on a missing / wrong-shape file. */
async function readLedger(manifestPath: string): Promise<AssetEntry[]> {
  if (!existsSync(manifestPath)) {
    console.error(`[legal] no ledger at ${manifestPath} — register assets or pass --manifest`);
    process.exit(1);
  }
  let parsed: { assets?: unknown };
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8")) as { assets?: unknown };
  } catch (error) {
    console.error(`[legal] ${manifestPath} is not valid JSON: ${(error as Error).message}`);
    process.exit(1);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.assets)) {
    console.error(`[legal] ${manifestPath} has no "assets" array — not a registration manifest (the ledger)`);
    process.exit(1);
  }
  return parsed.assets as AssetEntry[];
}

function resolveUsage(argv: string[]): UsageContext {
  const raw = flag(argv, "usage");
  if (raw === undefined) return "in-game";
  if (!isUsageContext(raw)) {
    console.error(`[legal] unknown --usage "${raw}" — expected one of ${USAGE_CONTEXTS.join(", ")}`);
    process.exit(1);
  }
  return raw;
}

function resolveReport(argv: string[]): ReportName | "all" {
  const raw = flag(argv, "report");
  if (raw === undefined) return "all";
  if (raw === "all") return "all";
  if (!isReportName(raw)) {
    console.error(`[legal] unknown --report "${raw}" — expected one of ${REPORT_NAMES.join(", ")}, all`);
    process.exit(1);
  }
  return raw;
}

function printHuman(report: LegalReport, only: ReportName | "all"): void {
  const { summary } = report;
  console.log(`[legal] game=${report.game} usage=${report.usage} — ${summary.totalAssets} asset(s), ${summary.aiAssets} AI-generated`);
  console.log(
    `[legal] ${summary.bannedSource} banned-source, ${summary.needsAuthorship} needs-authorship, ${summary.protectableReview} flagged for protectability review, ${summary.unknownSource} unknown-source`,
  );

  const show = (name: ReportName) => only === "all" || only === name;

  if (show("banned-source")) {
    const rows = report.reports["banned-source"];
    if (rows.length > 0) {
      console.log(`[legal] banned-source (${rows.length}):`);
      for (const r of rows) console.log(`[legal]   ✗ ${r.id}:${r.kind} via ${r.label} — ${r.basis}`);
    }
  }
  if (show("needs-authorship")) {
    const rows = report.reports["needs-authorship"];
    if (rows.length > 0) {
      console.log(`[legal] needs-authorship (${rows.length}): AI-generated with no recorded human authorship`);
      for (const r of rows) console.log(`[legal]   • ${r.id}:${r.kind} via ${r.label}`);
    }
  }
  if (show("protectable-flag-for-review")) {
    const rows = report.reports["protectable-flag-for-review"];
    if (rows.length > 0) {
      console.log(`[legal] protectable-flag-for-review (${rows.length}): a human must review before relying on these`);
    }
  }
  if (show("by-provider")) {
    console.log("[legal] by-provider:");
    for (const g of report.reports["by-provider"]) {
      console.log(`[legal]   ${g.label.padEnd(24)} ${String(g.count).padStart(4)} asset(s)  [${g.disposition}] ${g.kinds.join("/")}`);
    }
  }

  console.log("");
  console.log(report.steamDisclosure);
  console.log("");
  console.log(`[legal] ${report.disclaimer}`);
}

export async function runLegalCommand(argv: string[]): Promise<void> {
  const manifestPath = resolveLedgerPath(argv);
  const usage = resolveUsage(argv);
  const only = resolveReport(argv);

  const entries = await readLedger(manifestPath);
  const gameFlag = flag(argv, "game");
  const report = buildLegalReport(entries, {
    usage,
    ...(gameFlag && !gameFlag.startsWith("--") ? { game: gameFlag } : {}),
  });

  // `--steam-disclosure` prints just the disclosure string (handy to paste into a
  // store page); it still respects --out by writing the full JSON report.
  const steamOnly = has(argv, "steam-disclosure");

  const outPath = flag(argv, "out");
  if (outPath !== undefined) {
    if (!outPath || outPath.startsWith("--")) {
      console.error("[legal] --out requires a file path");
      process.exit(1);
    }
    try {
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, serializeLegalReport(report), "utf8");
    } catch (error) {
      console.error(`[legal] could not write ${outPath}: ${(error as Error).message}`);
      process.exit(1);
    }
    if (!has(argv, "json") && !steamOnly) {
      console.log(`[legal] wrote ${outPath} — ${report.summary.bannedSource} banned, ${report.summary.needsAuthorship} needs-authorship`);
    }
  }

  if (steamOnly) {
    console.log(report.steamDisclosure);
  } else if (has(argv, "json")) {
    const payload = only === "all" ? report : { version: report.version, game: report.game, usage: report.usage, report: report.reports[only], disclaimer: report.disclaimer };
    console.log(JSON.stringify(payload, null, 2));
  } else if (!outPath) {
    printHuman(report, only);
  }

  if (has(argv, "fail-on-banned") && report.summary.bannedSource > 0) {
    console.error(`[legal] ${report.summary.bannedSource} banned-source asset(s) for ${usage} use — failing (--fail-on-banned)`);
    process.exit(1);
  }
}
