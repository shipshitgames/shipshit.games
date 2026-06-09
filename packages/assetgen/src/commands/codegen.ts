import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { buildAssetIndex } from "../asset-index.ts";
import { buildCodegenModule, type AtlasMapJson } from "../codegen.ts";
import { GAME_SLUGS } from "../assets-package.ts";
import { flag, has } from "./args.ts";
import { defaultAssetsDir, defaultRepo } from "./paths.ts";

function parseFrameSize(spec: string | undefined): { width: number; height: number } | undefined {
  if (!spec) return undefined;
  const match = /^(\d+)x(\d+)$/.exec(spec.trim());
  if (!match) {
    console.error(`[codegen] invalid --frame-size "${spec}" (expected WxH)`);
    process.exit(1);
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

/**
 * Generate a per-game typed asset module (`assets.generated.ts`) from the asset
 * index (+ optional `<game>.atlas.json`): typed ASSETS manifest, ATLAS frame
 * table, ANIMATIONS bindings, and a thin DOM loader. Writes into the game's src
 * by default; `--out` to redirect. `--check` fails when the module is stale.
 */
export async function runCodegenCommand(argv: string[]): Promise<void> {
  const game = flag(argv, "game");
  if (!game) {
    console.error("[codegen] --game <slug> is required (codegen is per-game)");
    process.exit(1);
  }
  if (!GAME_SLUGS.includes(game as (typeof GAME_SLUGS)[number])) {
    console.warn(`[codegen] warning: "${game}" is not a known game slug (${GAME_SLUGS.join(", ")})`);
  }

  const assetsDir = flag(argv, "assets-dir") || defaultAssetsDir();
  if (!existsSync(assetsDir)) {
    console.error(`[codegen] assets dir not found: ${assetsDir} — pass --assets-dir <@shipshitgames/assets path>`);
    process.exit(1);
  }

  const frameSize = parseFrameSize(flag(argv, "frame-size"));
  const index = await buildAssetIndex({ assetsDir, game, frameSize });

  const atlasPath = flag(argv, "atlas") || join(assetsDir, `${game}.atlas.json`);
  let atlas: AtlasMapJson | null = null;
  if (existsSync(atlasPath)) {
    atlas = JSON.parse(await readFile(atlasPath, "utf8")) as AtlasMapJson;
  }

  const module = buildCodegenModule(index, atlas, game);
  const outPath = flag(argv, "out") || join(defaultRepo(game), "src", "assets.generated.ts");

  if (has(argv, "check")) {
    if (!existsSync(outPath)) {
      console.error(`[codegen] no generated module at ${outPath} — run \`assetgen codegen --game ${game}\` first`);
      process.exit(1);
    }
    if ((await readFile(outPath, "utf8")) !== module) {
      console.error(`[codegen] ${outPath} is out of date — re-run \`assetgen codegen --game ${game}\``);
      process.exit(1);
    }
    console.log(`[codegen] up to date — ${index.assetCount} assets — ${outPath}`);
    return;
  }

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, module, "utf8");
  console.log(`[codegen] wrote ${outPath}`);
  console.log(`[codegen] ${index.assetCount} assets typed${atlas ? `, atlas embedded (${atlas.pages.length} pages)` : ""}`);
}
