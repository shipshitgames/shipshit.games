import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  ASSET_INDEX_FILE,
  buildAssetIndex,
  checkAssetIndex,
  serializeAssetIndex,
} from "../asset-index.ts";
import { GAME_SLUGS } from "../assets-package.ts";
import { flag, has } from "./args.ts";
import { defaultAssetsDir } from "./paths.ts";

function parseFrameSize(spec: string | undefined): { width: number; height: number } | undefined {
  if (!spec) return undefined;
  const match = /^(\d+)x(\d+)$/.exec(spec.trim());
  if (!match) {
    console.error(`[index] invalid --frame-size "${spec}" (expected WxH, e.g. 64x64)`);
    process.exit(1);
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

function defaultOutPath(assetsDir: string, game: string | undefined): string {
  return join(assetsDir, game ? `assets.index.${game}.json` : ASSET_INDEX_FILE);
}

export async function runIndexCommand(argv: string[]): Promise<void> {
  const assetsDir = flag(argv, "assets-dir") || defaultAssetsDir();
  if (!existsSync(assetsDir)) {
    console.error(`[index] assets dir not found: ${assetsDir} — pass --assets-dir <@shipshitgames/assets path>`);
    process.exit(1);
  }

  const game = flag(argv, "game");
  if (game && !GAME_SLUGS.includes(game as (typeof GAME_SLUGS)[number])) {
    console.warn(`[index] warning: "${game}" is not a known game slug (${GAME_SLUGS.join(", ")}); indexing whatever matches`);
  }
  const frameSize = parseFrameSize(flag(argv, "frame-size"));
  const outPath = flag(argv, "out") || defaultOutPath(assetsDir, game);

  const index = await buildAssetIndex({ assetsDir, game, frameSize });

  if (has(argv, "check")) {
    const result = await checkAssetIndex(index, outPath);
    if (result.stale) {
      console.error(`[index] ${result.reason}`);
      process.exit(1);
    }
    console.log(`[index] up to date — ${index.assetCount} assets — ${outPath}`);
    return;
  }

  await writeFile(outPath, serializeAssetIndex(index), "utf8");
  const perGame = index.games.map((g) => `${g.game}:${g.total}`).join(" ");
  console.log(`[index] wrote ${outPath}`);
  console.log(`[index] ${index.assetCount} assets (${index.images} images, ${index.models} models)`);
  console.log(`[index] per-game: ${perGame || "(none)"}`);
}
