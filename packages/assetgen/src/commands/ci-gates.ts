import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GAME_SLUGS, type GameSlug } from "../assets-package.ts";
import { flag, has } from "./args.ts";
import { isAssetIndexFile } from "./check.ts";
import { defaultAssetsDir, defaultGamesRoot } from "./paths.ts";

const commandsDir = dirname(fileURLToPath(import.meta.url));
const cliPath = join(commandsDir, "..", "cli.ts");
const ATLAS_MAP = /^([a-z0-9-]+)\.atlas\.json$/;

export interface CodegenTarget {
  game: GameSlug;
  out: string;
}

export interface AssetgenGatePlan {
  assetsDir: string;
  gamesRoot: string;
  indexFiles: string[];
  skippedIndexFiles: string[];
  atlasGames: GameSlug[];
  codegenTargets: CodegenTarget[];
}

function isKnownGame(value: string): value is GameSlug {
  return GAME_SLUGS.includes(value as GameSlug);
}

async function readDirNames(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).sort();
}

async function isAssetgenIndexFormat(path: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    return (
      typeof parsed.version === "number" &&
      typeof parsed.generatedFrom === "string" &&
      Array.isArray(parsed.assets)
    );
  } catch {
    return false;
  }
}

async function discoverIndexFiles(assetsDir: string): Promise<Pick<AssetgenGatePlan, "indexFiles" | "skippedIndexFiles">> {
  const indexFiles: string[] = [];
  const skippedIndexFiles: string[] = [];

  for (const file of await readDirNames(assetsDir)) {
    if (!isAssetIndexFile(file)) continue;
    if (await isAssetgenIndexFormat(join(assetsDir, file))) indexFiles.push(file);
    else skippedIndexFiles.push(file);
  }

  return { indexFiles, skippedIndexFiles };
}

async function discoverAtlasGames(assetsDir: string): Promise<GameSlug[]> {
  const games = new Set<GameSlug>();
  for (const file of await readDirNames(assetsDir)) {
    const match = ATLAS_MAP.exec(file);
    if (match && isKnownGame(match[1]!)) games.add(match[1]!);
  }
  return [...games].sort();
}

async function discoverCodegenTargets(gamesRoot: string): Promise<CodegenTarget[]> {
  const targets: CodegenTarget[] = [];
  for (const game of await readDirNames(gamesRoot)) {
    if (!isKnownGame(game)) continue;
    const out = join(gamesRoot, game, "src", "assets.generated.ts");
    if (existsSync(out)) targets.push({ game, out });
  }
  return targets.sort((a, b) => a.game.localeCompare(b.game));
}

export async function buildAssetgenGatePlan(options: { assetsDir: string; gamesRoot: string }): Promise<AssetgenGatePlan> {
  const { indexFiles, skippedIndexFiles } = await discoverIndexFiles(options.assetsDir);
  return {
    assetsDir: options.assetsDir,
    gamesRoot: options.gamesRoot,
    indexFiles,
    skippedIndexFiles,
    atlasGames: await discoverAtlasGames(options.assetsDir),
    codegenTargets: await discoverCodegenTargets(options.gamesRoot),
  };
}

function runBun(args: string[]): Promise<void> {
  console.log(`[ci-gates] $ bun ${args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn("bun", args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`bun ${args.join(" ")} exited with ${code ?? "unknown status"}`));
    });
  });
}

function logPlan(plan: AssetgenGatePlan): void {
  console.log(`[ci-gates] assets-dir ${plan.assetsDir}`);
  console.log(`[ci-gates] games-root ${plan.gamesRoot}`);

  if (plan.skippedIndexFiles.length > 0) {
    console.log(
      `[ci-gates] skipped non-assetgen index file(s): ${plan.skippedIndexFiles.join(", ")}`
    );
  }
  if (plan.indexFiles.length === 0) console.log("[ci-gates] no assetgen-format assets.index*.json files found");
  else console.log(`[ci-gates] assetgen index file(s): ${plan.indexFiles.join(", ")}`);

  if (plan.atlasGames.length === 0) console.log("[ci-gates] no committed per-game atlas maps found");
  else console.log(`[ci-gates] atlas game(s): ${plan.atlasGames.join(", ")}`);

  if (plan.codegenTargets.length === 0) console.log("[ci-gates] no committed per-game assets.generated.ts files found");
  else console.log(`[ci-gates] codegen game(s): ${plan.codegenTargets.map((target) => target.game).join(", ")}`);
}

export async function runCiGatesCommand(argv: string[]): Promise<void> {
  const assetsDir = flag(argv, "assets-dir") || process.env.ASSETGEN_ASSETS_DIR || defaultAssetsDir();
  const gamesRoot = flag(argv, "games-root") || process.env.ASSETGEN_GAMES_ROOT || defaultGamesRoot();
  const strict = has(argv, "strict");

  if (!existsSync(assetsDir)) {
    console.error(`[ci-gates] assets dir not found: ${assetsDir} — pass --assets-dir <@shipshitgames/assets path>`);
    process.exit(1);
  }
  if (!existsSync(gamesRoot)) {
    console.error(`[ci-gates] games root not found: ${gamesRoot} — pass --games-root <apps/games path>`);
    process.exit(1);
  }

  const plan = await buildAssetgenGatePlan({ assetsDir, gamesRoot });
  logPlan(plan);

  const targetCount = plan.indexFiles.length + plan.atlasGames.length + plan.codegenTargets.length;
  if (strict && targetCount === 0) {
    console.error("[ci-gates] no assetgen gate targets found");
    process.exit(1);
  }

  if (plan.indexFiles.length > 0) {
    await runBun([cliPath, "check", "--assets-dir", assetsDir]);
  }

  for (const game of plan.atlasGames) {
    await runBun([cliPath, "atlas", "--game", game, "--assets-dir", assetsDir, "--out-dir", assetsDir, "--name", game, "--check"]);
  }

  for (const target of plan.codegenTargets) {
    await runBun([cliPath, "codegen", "--game", target.game, "--assets-dir", assetsDir, "--out", target.out, "--check"]);
  }

  console.log("[ci-gates] complete");
}
