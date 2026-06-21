// `assetgen gap-map` — map a project's asset gaps for the Build Plan engine (#259).
//
// Folds two signals into one priority-ordered JSON report:
//   1. catalog variant gaps  — entity sprites still `null` for a game they ship in
//   2. broken assets         — whatever `assetgen check --game <slug>` rejects
//
// Resolution honours the project registry (#256): pass `--ip <id>` or set
// `ASSETGEN_IP` / `ASSETGEN_PROJECT_ROOT` to target a franchise, or `--assets-dir`
// to point straight at a shared `@shipshitgames/assets` package. Per-game checks
// are best-effort: a game with no resolvable manifest is reported as unchecked
// rather than failing the run.
//
// The `codegen-current` (stale-codegen) check is opt-in via `--codegen` — it
// needs each game repo's committed `assets.generated.ts`, so it is off by default
// to avoid false "broken" noise where that module is not vendored. Each game
// section reports the exact `checks` that ran so the staleness signal's presence
// is explicit. Other flags: `--game <slug>`, `--games-root <dir>`,
// `--game-assets-root <dir>`, `--no-checks`, `--out <file>`, `--json`,
// `--fail-on-gaps`.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  GAME_SLUGS,
  normalizeCatalog,
  type AssetCatalog,
  type GameSlug,
} from "../assets-package.ts";
import { runGameCheck } from "../game-check.ts";
import {
  buildGapReport,
  serializeGapReport,
  type GameCheckSlot,
  type GapReport,
} from "../gap-map.ts";
import { flag, has } from "./args.ts";
import { defaultAssetsDir, defaultRepo } from "./paths.ts";
import { findProject, listProjects, projectAssetsDir, UnknownProjectError } from "./registry.ts";

const CATALOG_FILE = "assets-catalog.json";

function isGameSlug(value: string): value is GameSlug {
  return (GAME_SLUGS as readonly string[]).includes(value);
}

/** Resolve the shared assets dir: explicit flag > `--ip` registry entry > env/default. */
function resolveAssetsDir(argv: string[]): string {
  const explicit = flag(argv, "assets-dir");
  if (explicit) return explicit;

  const ip = flag(argv, "ip");
  if (ip) {
    const project = findProject(ip);
    if (!project) throw new UnknownProjectError(ip, listProjects().map((p) => p.id));
    return projectAssetsDir(project);
  }
  return defaultAssetsDir();
}

/** Which games to report on: `--game <slug>` narrows to one, else every known slug. */
function resolveGames(argv: string[]): GameSlug[] {
  if (!has(argv, "game")) return [...GAME_SLUGS];
  // `flag` grabs the next token unconditionally, so guard a bare/flag-shaped value
  // instead of silently falling through to "all games" (mirrors check.ts).
  const one = flag(argv, "game");
  if (!one || one.startsWith("--")) {
    console.error("[gap-map] --game requires a slug, e.g. assetgen gap-map --game <slug>");
    process.exit(1);
  }
  if (!isGameSlug(one)) {
    console.error(`[gap-map] unknown game "${one}" — expected one of ${GAME_SLUGS.join(", ")}`);
    process.exit(1);
  }
  return [one];
}

/**
 * Candidate `src/assets` roots for a game's *registration* manifest, most
 * specific first: an explicit `--game-assets-root` (single-game), a
 * `--games-root <dir>/<slug>/src/assets`, then the registry-aware game repo.
 *
 * Note: the shared `<assetsDir>/games/<slug>/assets.json` is deliberately NOT a
 * candidate — that is the game's *runtime* manifest (a different schema), not the
 * `{ assets: [...] }` registration manifest `check --game` validates.
 */
function gameAssetsRootCandidates(argv: string[], game: GameSlug, single: boolean): string[] {
  const roots: string[] = [];
  if (single) {
    const override = flag(argv, "game-assets-root");
    if (override) roots.push(override);
  }
  const gamesRoot = flag(argv, "games-root");
  if (gamesRoot) roots.push(join(gamesRoot, game, "src", "assets"));
  roots.push(join(defaultRepo(game), "src", "assets"));
  return roots;
}

type ManifestProbe = { status: "ok" } | { status: "missing" } | { status: "wrong-shape"; reason: string };

/** Classify a candidate manifest as a usable registration manifest, missing, or the wrong schema. */
async function probeRegistrationManifest(manifestPath: string): Promise<ManifestProbe> {
  if (!existsSync(manifestPath)) return { status: "missing" };
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as { assets?: unknown };
    if (!Array.isArray(parsed.assets)) {
      return { status: "wrong-shape", reason: `manifest ${manifestPath} has no "assets" array (not a registration manifest)` };
    }
    return { status: "ok" };
  } catch (error) {
    return { status: "wrong-shape", reason: `manifest ${manifestPath} is not valid JSON: ${(error as Error).message}` };
  }
}

/** Resolve and run `check --game` for one game, degrading to an explained "unchecked" slot. */
async function resolveGameCheck(
  argv: string[],
  game: GameSlug,
  single: boolean,
  withCodegen: boolean,
  assetsDir: string,
): Promise<GameCheckSlot> {
  let wrongShapeReason: string | null = null;
  for (const assetsRoot of gameAssetsRootCandidates(argv, game, single)) {
    const manifest = join(assetsRoot, "assets.json");
    const probe = await probeRegistrationManifest(manifest);
    if (probe.status === "missing") continue;
    if (probe.status === "wrong-shape") {
      wrongShapeReason ??= probe.reason;
      continue;
    }
    try {
      const report = await runGameCheck({
        game,
        assetsRoot,
        skipCodegen: !withCodegen,
        assetsDir: withCodegen ? assetsDir : undefined,
      });
      return { report, manifest, reason: null };
    } catch (error) {
      return { report: null, manifest, reason: `check failed: ${(error as Error).message}` };
    }
  }
  return { report: null, manifest: null, reason: wrongShapeReason ?? `no registration manifest found for ${game}` };
}

async function runChecksPerGame(
  argv: string[],
  assetsDir: string,
  games: GameSlug[],
): Promise<Map<GameSlug, GameCheckSlot>> {
  const slots = new Map<GameSlug, GameCheckSlot>();
  if (has(argv, "no-checks")) {
    for (const game of games) slots.set(game, { report: null, manifest: null, reason: "checks skipped (--no-checks)" });
    return slots;
  }

  const withCodegen = has(argv, "codegen");
  const single = games.length === 1;
  for (const game of games) {
    slots.set(game, await resolveGameCheck(argv, game, single, withCodegen, assetsDir));
  }
  return slots;
}

async function readCatalog(assetsDir: string): Promise<AssetCatalog> {
  const catalogPath = join(assetsDir, CATALOG_FILE);
  if (!existsSync(catalogPath)) {
    console.error(
      `[gap-map] no ${CATALOG_FILE} in ${assetsDir} — pass --assets-dir <@shipshitgames/assets path>, --ip <id>, or set ASSETGEN_PROJECT_ROOT`,
    );
    process.exit(1);
  }
  let parsed: AssetCatalog;
  try {
    parsed = JSON.parse(await readFile(catalogPath, "utf8")) as AssetCatalog;
  } catch (error) {
    console.error(`[gap-map] ${catalogPath} is not valid JSON: ${(error as Error).message}`);
    process.exit(1);
  }
  // Valid JSON is not enough — normalizeCatalog maps over `entities`, so reject a
  // structurally-malformed catalog cleanly instead of letting it throw a raw
  // TypeError out of the command.
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.entities)) {
    console.error(`[gap-map] ${catalogPath} is not a valid asset catalog (missing "entities" array)`);
    process.exit(1);
  }
  return normalizeCatalog(parsed);
}

function projectLabel(argv: string[]): string {
  // An explicit --assets-dir bypasses registry/IP resolution, so the IP did not
  // determine what was mapped — don't stamp it on the report as the project.
  if (flag(argv, "assets-dir")) return "custom";
  return flag(argv, "ip") || process.env.ASSETGEN_IP?.trim() || (process.env.ASSETGEN_PROJECT_ROOT ? "custom" : "default");
}

function printHuman(report: GapReport): void {
  const { summary } = report;
  console.log(`[gap-map] project=${report.project} assetsDir=${report.assetsDir}`);
  console.log(
    `[gap-map] catalog ${report.catalogVersion ? `v${report.catalogVersion}` : "(no version)"} — ${report.byEntity.length} entit${report.byEntity.length === 1 ? "y" : "ies"} with variant gaps`,
  );
  console.log(
    `[gap-map] ${summary.missingVariants} missing variant(s), ${summary.brokenAssets} broken asset(s) across ${summary.gamesTotal} game(s) (${summary.gamesChecked} checked)`,
  );
  if (report.byTypeAndPriority.length === 0) {
    console.log("[gap-map] no gaps — every mapped variant is rendered and every checked game is clean");
    return;
  }
  console.log("[gap-map] priority groups (sprites → music → UI → VFX):");
  for (const group of report.byTypeAndPriority) {
    console.log(
      `[gap-map]   P${group.priority} ${group.assetType.padEnd(6)} ${group.game.padEnd(18)} ${group.total} gap(s) (${group.missingVariants} missing, ${group.brokenAssets} broken)`,
    );
  }
  const unchecked = report.byGame.filter((g) => !g.checked);
  if (unchecked.length > 0) {
    console.log(`[gap-map] not checked: ${unchecked.map((g) => `${g.game} (${g.reason})`).join(", ")}`);
  }
  console.log("[gap-map] pass --json for the full machine report, or --out <file> to write it");
}

export async function runGapMapCommand(argv: string[]): Promise<void> {
  let assetsDir: string;
  try {
    assetsDir = resolveAssetsDir(argv);
  } catch (error) {
    console.error(`[gap-map] ${(error as Error).message}`);
    process.exit(1);
  }

  const games = resolveGames(argv);
  const catalog = await readCatalog(assetsDir);
  const gameChecks = await runChecksPerGame(argv, assetsDir, games);

  const report = buildGapReport({ project: projectLabel(argv), assetsDir, catalog, games, gameChecks });

  const outPath = flag(argv, "out");
  if (outPath !== undefined) {
    if (!outPath || outPath.startsWith("--")) {
      console.error("[gap-map] --out requires a file path");
      process.exit(1);
    }
    try {
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, serializeGapReport(report), "utf8");
    } catch (error) {
      console.error(`[gap-map] could not write ${outPath}: ${(error as Error).message}`);
      process.exit(1);
    }
    if (!has(argv, "json")) {
      console.log(`[gap-map] wrote ${outPath} — ${report.summary.totalGaps} gap(s)`);
    }
  }

  if (has(argv, "json")) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!outPath) {
    printHuman(report);
  }

  if (has(argv, "fail-on-gaps") && report.summary.totalGaps > 0) {
    console.error(`[gap-map] ${report.summary.totalGaps} gap(s) found — failing (--fail-on-gaps)`);
    process.exit(1);
  }
}
