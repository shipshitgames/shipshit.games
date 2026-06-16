import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildAtlas, serializeAtlasMap } from "../atlas.ts";
import { GAME_SLUGS } from "../assets-package.ts";
import { formatReports, gateSpriteGeometry, loadSpriteContract } from "../sprite-geometry.ts";
import { flag, has, intFlag } from "./args.ts";
import { defaultAssetsDir } from "./paths.ts";

/**
 * Pack a game's individual sprite frames into edge-extruded texture atlas
 * page(s) (`<game>.atlas<n>.webp`) + a deterministic frame map
 * (`<game>.atlas.json`). `--check` compares the freshly-built map to the
 * committed one.
 */
export async function runAtlasCommand(argv: string[]): Promise<void> {
  const assetsDir = flag(argv, "assets-dir") || defaultAssetsDir();
  if (!existsSync(assetsDir)) {
    console.error(`[atlas] assets dir not found: ${assetsDir} — pass --assets-dir <@shipshitgames/assets path>`);
    process.exit(1);
  }

  const game = flag(argv, "game");
  if (game && !GAME_SLUGS.includes(game as (typeof GAME_SLUGS)[number])) {
    console.warn(`[atlas] warning: "${game}" is not a known game slug (${GAME_SLUGS.join(", ")})`);
  }

  // Enforce the sprite frame-set geometry contract BEFORE packing (issue #166):
  // a malformed `<id>.anim.json` would otherwise be baked into the atlas. Fast
  // structural+contract pass (no per-frame pixel scan); `--no-geometry-check` skips it.
  if (!has(argv, "no-geometry-check")) {
    const contract = await loadSpriteContract(assetsDir, game);
    const { ok, reports } = await gateSpriteGeometry({ assetsDir, game, contract, readPixels: false });
    if (reports.length > 0 && !ok) {
      console.error(formatReports(reports));
      console.error("[atlas] sprite-anim frame-set geometry check failed — fix the frame-set(s) above or pass --no-geometry-check");
      process.exit(1);
    }
  }

  const padding = intFlag(argv, "padding", 2);
  const maxWidth = intFlag(argv, "max-width", 4096);
  const maxHeight = intFlag(argv, "max-height", 4096);
  const outDir = flag(argv, "out-dir") || assetsDir;
  const base = flag(argv, "name") || game || "all";

  const { map, images } = await buildAtlas({ assetsDir, game, padding, maxWidth, maxHeight, baseName: base });
  const mapPath = join(outDir, `${base}.atlas.json`);

  if (has(argv, "check")) {
    if (!existsSync(mapPath)) {
      console.error(`[atlas] no atlas map at ${mapPath} — run \`assetgen atlas\` first`);
      process.exit(1);
    }
    if ((await readFile(mapPath, "utf8")) !== serializeAtlasMap(map)) {
      console.error(`[atlas] ${mapPath} is out of date — re-run \`assetgen atlas\``);
      process.exit(1);
    }
    console.log(`[atlas] up to date — ${map.frameCount} frames across ${map.pages.length} page(s) — ${mapPath}`);
    return;
  }

  await mkdir(outDir, { recursive: true });
  for (let i = 0; i < images.length; i++) {
    await writeFile(join(outDir, map.pages[i]!.image), images[i]!);
  }
  await writeFile(mapPath, serializeAtlasMap(map));
  const dims = map.pages.map((p) => `${p.width}x${p.height}`).join(", ");
  console.log(`[atlas] wrote ${map.pages.length} page(s) [${dims}] + ${mapPath}`);
  console.log(`[atlas] packed ${map.frameCount} frames${game ? ` for ${game}` : ""}, ${padding}px extruded gutter`);
}
