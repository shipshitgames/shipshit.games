import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { ASSET_INDEX_FILE, buildAssetIndex, checkAssetIndex } from "../asset-index.ts";
import { flag } from "./args.ts";
import { defaultAssetsDir } from "./paths.ts";

const PER_GAME_INDEX = /^assets\.index\.([a-z0-9-]+)\.json$/;

/**
 * Asset-integrity gate: verify every committed `assets.index*.json` is current
 * (the full index and any per-game `assets.index.<game>.json`). Exits non-zero
 * when any is stale — drop into CI / a pre-commit hook. Generate them first
 * with `assetgen index`.
 */
export async function runCheckCommand(argv: string[]): Promise<void> {
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
