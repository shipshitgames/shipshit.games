import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { ASSET_INDEX_FILE, buildAssetIndex, checkAssetIndex } from "../asset-index.ts";
import { GAME_SLUGS } from "../assets-package.ts";
import { runGameCheck, type GameCheckReport } from "../game-check.ts";
import { flag, has } from "./args.ts";
import { defaultAssetsDir, defaultRepo } from "./paths.ts";

const PER_GAME_INDEX = /^assets\.index\.([a-z0-9-]+)\.json$/;

/**
 * Asset-integrity gate. With `--game <slug>` it runs the per-game checks (#52):
 * every manifest reference resolves, no orphan webps, every entry licensed, no
 * banned source (Udio), and the generated module is current — the guarantee a
 * game repo wires into its `prebuild`. Without `--game` it verifies every
 * committed `assets.index*.json` is current. Exits non-zero on any failure.
 */
export async function runCheckCommand(argv: string[]): Promise<void> {
  if (has(argv, "game")) {
    // `flag` returns the next token unconditionally, so `--game --json` would read
    // "--json" as the slug and a trailing `--game` would read undefined. Reject a
    // missing or flag-shaped value instead of running the per-game branch with a
    // bogus slug (or silently falling through to the index check).
    const game = flag(argv, "game");
    if (!game || game.startsWith("--")) {
      console.error("[check] --game requires a slug, e.g. assetgen check --game <slug>");
      process.exit(1);
    }
    await runGameCheckCommand(argv, game);
    return;
  }
  await runIndexCheckCommand(argv);
}

/** Per-game asset-integrity gate (#52). */
async function runGameCheckCommand(argv: string[], game: string): Promise<void> {
  if (!GAME_SLUGS.includes(game as (typeof GAME_SLUGS)[number])) {
    console.warn(`[check:game] warning: "${game}" is not a known game slug (${GAME_SLUGS.join(", ")})`);
  }

  const root = flag(argv, "root") || defaultRepo(game);
  const assetsRoot = flag(argv, "assets-root") || join(root, "src", "assets");
  const manifest = flag(argv, "manifest");
  const generatedPath = flag(argv, "out") || join(root, "src", "assets.generated.ts");
  const skipCodegen = has(argv, "skip-codegen");
  const assetsDir = skipCodegen ? undefined : flag(argv, "assets-dir") || defaultAssetsDir();
  const json = has(argv, "json");

  const report = await runGameCheck({ game, assetsRoot, manifest, generatedPath, assetsDir, skipCodegen });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[check:game] ${game} — manifest ${report.manifest}`);
    for (const result of report.results) {
      const label = result.status.toUpperCase().padEnd(7);
      console.log(`[check:game] ${label} ${result.check} — ${result.summary}`);
      for (const message of result.messages) console.log(`[check:game]   - ${message}`);
    }
  }

  if (!report.ok) {
    const failed = report.results.filter((r) => r.status === "fail").map((r) => r.check);
    console.error(`[check:game] ${game} failed: ${failed.join(", ")}. See the details above.`);
    process.exit(1);
  }
  if (!json) console.log(`[check:game] ${game} ok — all checks passed`);
}

/**
 * Index-staleness gate: verify every committed `assets.index*.json` is current
 * (the full index and any per-game `assets.index.<game>.json`). Exits non-zero
 * when any is stale — drop into CI / a pre-commit hook. Generate them first
 * with `assetgen index`.
 */
async function runIndexCheckCommand(argv: string[]): Promise<void> {
  const assetsDir = flag(argv, "assets-dir") || defaultAssetsDir();
  if (!existsSync(assetsDir)) {
    console.error(`[check] assets dir not found: ${assetsDir} — pass --assets-dir <@shipshitgames/assets path>`);
    process.exit(1);
  }

  const entries = await readdir(assetsDir);
  const indexFiles = entries
    .filter((f) => f === ASSET_INDEX_FILE || PER_GAME_INDEX.test(f))
    .sort();
  if (indexFiles.length === 0) {
    console.error(`[check] no assets.index*.json in ${assetsDir} — run \`assetgen index\` first`);
    process.exit(1);
  }

  let stale = 0;
  for (const file of indexFiles) {
    const match = PER_GAME_INDEX.exec(file);
    const game = match ? match[1] : undefined;
    const index = await buildAssetIndex({ assetsDir, game });
    const result = await checkAssetIndex(index, join(assetsDir, file));
    if (result.stale) {
      console.error(`[check] STALE ${file} — ${result.reason}`);
      stale++;
    } else {
      console.log(`[check] ok ${file} (${index.assetCount} assets)`);
    }
  }

  if (stale > 0) {
    console.error(`[check] ${stale}/${indexFiles.length} index file(s) stale — re-run \`assetgen index\``);
    process.exit(1);
  }
  console.log(`[check] all ${indexFiles.length} index file(s) up to date`);
}

export type { GameCheckReport };
