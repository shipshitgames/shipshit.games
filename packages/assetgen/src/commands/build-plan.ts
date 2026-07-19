// `assetgen build-plan` — the Build Plan engine (#257).
//
// Composes the merged pieces into one MVP-ordered worklist for a game:
//   1. ingest-docs (#260) -> genre + core loop + MVP requirements
//   2. catalog variant nulls (#259) -> what's MISSING
//   3. check --game (#259, opt-in via --checks) -> what's BROKEN
//   4. the game-type blueprint skill -> what the type NEEDS + MVP priority
//
// Project resolution honours the registry (#256): `--ip <id>`, `ASSETGEN_IP`,
// `ASSETGEN_PROJECT_ROOT`, or `--root`/`--assets-dir`. Blueprints are read from the
// shipshitgames/skills repo (`<skill>/blueprint.json`); override the location with
// `--skills-dir` or `ASSETGEN_SKILLS_DIR`.
//
// Flags: `--game <slug>` (required), `--ip <id>`, `--root <path>`,
// `--assets-dir <path>`, `--skills-dir <path>`, `--checks` (run check --game for
// broken assets), `--codegen` (include the stale-codegen check), `--out <file>`,
// `--json`.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUILD_PLAN_VERSION,
  buildPlan,
  loadBlueprints,
  selectBlueprint,
  serializeBuildPlan,
  type BuildPlan,
} from "../build-plan.ts";
import { ingestProjectDocs } from "../doc-ingestion.ts";
import { brokenAssetsFromReport, computeVariantGaps, type BrokenAssetGap } from "../gap-map.ts";
import { runGameCheck } from "../game-check.ts";
import { GAME_SLUGS, normalizeCatalog, type AssetCatalog, type GameSlug } from "../assets-package.ts";
import { flag, has } from "./args.ts";
import { defaultAssetsDir, defaultRepo } from "./paths.ts";
import { findProject, listProjects, projectAssetsDir, selectedProject, UnknownProjectError } from "./registry.ts";

const CATALOG_FILE = "assets-catalog.json";
// this file: <repo>/packages/assetgen/src/commands/build-plan.ts -> srcDir = .../src
const srcDir = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Where blueprints live: the shipshitgames/skills repo (a `<skill>/blueprint.json`
 * per game type). Honour ASSETGEN_SKILLS_DIR, then the sibling skills checkout
 * (monorepo dev), then the repository's checked-in agent skills, then skills
 * installed into the project (.claude / .codex).
 */
function defaultSkillsDir(): string {
  const env = process.env.ASSETGEN_SKILLS_DIR?.trim();
  if (env) return env;
  const cwd = process.cwd();
  const candidates = [
    join(srcDir, "..", "..", "..", "..", "skills", "skills"), // <www>/shipshitgames/skills/skills
    join(cwd, "..", "skills", "skills"),
    join(cwd, "..", "..", "skills", "skills"),
    join(srcDir, "..", "..", "..", ".agents", "skills"),
    join(cwd, ".agents", "skills"),
    join(cwd, ".claude", "skills"),
    join(cwd, ".codex", "skills"),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0]!;
}

function isGameSlug(value: string): value is GameSlug {
  return (GAME_SLUGS as readonly string[]).includes(value);
}

/** Shared assets dir: explicit flag > `--ip` registry entry > env/default. */
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

/** Project repo root for doc ingestion: `--root` > `--ip` > selected env project > derived from assetsDir. */
function resolveRoot(argv: string[], assetsDir: string): string {
  const explicit = flag(argv, "root");
  if (explicit) return explicit;
  const ip = flag(argv, "ip");
  if (ip) {
    const project = findProject(ip);
    if (project) return project.root;
  }
  const selected = selectedProject();
  if (selected) return selected.root;
  // default assets dir is <root>/packages/assets — climb back to the repo root.
  return join(assetsDir, "..", "..");
}

/** Report label, mirroring gap-map: an explicit --assets-dir bypasses IP resolution. */
function projectLabel(argv: string[]): string {
  if (flag(argv, "assets-dir") || flag(argv, "root")) return flag(argv, "ip") || "custom";
  return flag(argv, "ip") || selectedProject()?.id || "default";
}

async function readCatalog(assetsDir: string): Promise<AssetCatalog> {
  const catalogPath = join(assetsDir, CATALOG_FILE);
  if (!existsSync(catalogPath)) {
    console.error(
      `[build-plan] no ${CATALOG_FILE} in ${assetsDir} — pass --assets-dir <@shipshitgames/assets path>, --ip <id>, or set ASSETGEN_PROJECT_ROOT`,
    );
    process.exit(1);
  }
  let parsed: AssetCatalog;
  try {
    parsed = JSON.parse(await readFile(catalogPath, "utf8")) as AssetCatalog;
  } catch (error) {
    console.error(`[build-plan] ${catalogPath} is not valid JSON: ${(error as Error).message}`);
    process.exit(1);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.entities)) {
    console.error(`[build-plan] ${catalogPath} is not a valid asset catalog (missing "entities" array)`);
    process.exit(1);
  }
  return normalizeCatalog(parsed);
}

/** Best-effort broken-asset signal — opt-in (--checks) and degrades to [] when the game repo isn't resolvable. */
async function collectBroken(argv: string[], game: GameSlug, assetsDir: string): Promise<BrokenAssetGap[]> {
  if (!has(argv, "checks")) return [];
  const assetsRoot = join(defaultRepo(game), "src", "assets");
  if (!existsSync(join(assetsRoot, "assets.json"))) return [];
  try {
    const withCodegen = has(argv, "codegen");
    const report = await runGameCheck({
      game,
      assetsRoot,
      skipCodegen: !withCodegen,
      assetsDir: withCodegen ? assetsDir : undefined,
    });
    return brokenAssetsFromReport(report);
  } catch {
    return [];
  }
}

function printHuman(plan: BuildPlan): void {
  console.log(`[build-plan] project=${plan.project} game=${plan.game} genre=${plan.genre ?? "(unknown)"}`);
  console.log(`[build-plan] blueprint=${plan.blueprint ?? "(none matched — add a build-<type>-game skill)"}`);
  if (plan.design.coreLoop) console.log(`[build-plan] core loop: ${plan.design.coreLoop}`);
  console.log(
    `[build-plan] ${plan.summary.totalTasks} task(s): ${plan.summary.mvpTasks} MVP, ${plan.summary.missing} missing, ${plan.summary.broken} broken`,
  );
  if (plan.worklist.length === 0) {
    console.log("[build-plan] no gaps — the catalog is fully rendered for this game");
    return;
  }
  console.log("[build-plan] next up (MVP-first):");
  for (const it of plan.worklist.slice(0, 15)) {
    console.log(
      `[build-plan]   ${String(it.order).padStart(2)}. ${it.mvp ? "[MVP] " : "      "}${it.assetType.padEnd(6)} ${it.status.padEnd(7)} ${it.detail}`,
    );
  }
  if (plan.worklist.length > 15) {
    console.log(`[build-plan]   … ${plan.worklist.length - 15} more (pass --json for the full plan)`);
  }
}

export async function runBuildPlanCommand(argv: string[]): Promise<void> {
  const game = flag(argv, "game");
  if (!game || game.startsWith("--")) {
    console.error("[build-plan] --game <slug> is required, e.g. assetgen build-plan --game scourge-survivors");
    process.exit(1);
  }
  if (!isGameSlug(game)) {
    console.error(`[build-plan] unknown game "${game}" — expected one of ${GAME_SLUGS.join(", ")}`);
    process.exit(1);
  }

  let assetsDir: string;
  try {
    assetsDir = resolveAssetsDir(argv);
  } catch (error) {
    console.error(`[build-plan] ${(error as Error).message}`);
    process.exit(1);
  }
  const root = resolveRoot(argv, assetsDir);
  const project = projectLabel(argv);

  const context = await ingestProjectDocs({ root, projectId: project, game, assetsDir });
  const catalog = await readCatalog(assetsDir);
  const missing = computeVariantGaps(catalog, [game]);
  const broken = await collectBroken(argv, game, assetsDir);

  const blueprints = await loadBlueprints(flag(argv, "skills-dir") || defaultSkillsDir());
  const blueprint = selectBlueprint(blueprints, context.design.genre);

  const plan = buildPlan({
    project,
    game,
    genre: context.design.genre,
    design: context.design,
    missing,
    broken,
    blueprint,
  });
  plan.version = BUILD_PLAN_VERSION;

  const outPath = flag(argv, "out");
  if (outPath !== undefined) {
    if (!outPath || outPath.startsWith("--")) {
      console.error("[build-plan] --out requires a file path");
      process.exit(1);
    }
    try {
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, serializeBuildPlan(plan), "utf8");
    } catch (error) {
      console.error(`[build-plan] could not write ${outPath}: ${(error as Error).message}`);
      process.exit(1);
    }
    if (!has(argv, "json")) console.log(`[build-plan] wrote ${outPath} — ${plan.summary.totalTasks} task(s)`);
  }

  if (has(argv, "json")) {
    console.log(JSON.stringify(plan, null, 2));
  } else if (!outPath) {
    printHuman(plan);
  }
}
