/**
 * Content sync for shipshit.games.
 *
 * Reads the Deadrot lore dataset + asset catalog from the sibling deadrotcom
 * repo and GitHub (boards, activity), then writes committed snapshots into
 * apps/web/content/ and curated sprite copies into apps/web/public/sprites/.
 * Vercel builds read only the committed copies — never the sibling repo.
 *
 *   bun apps/web/scripts/sync-content.ts [--assets-dir <path>] [--lore-data <path>]
 *                                        [--check] [--skip-github] [--skip-sprites]
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  AssetIndexEntry,
  ContentManifest,
  FeaturedVideo,
  SiteMeta,
} from "../lib/content/types";
import { buildAssetIndex } from "./sync/assets";
import { SPRITE_BUDGET_BYTES, measureSpriteBytes, validateContent } from "./sync/check";
import { snapshotActivity, snapshotRoadmap } from "./sync/github";
import { transformLore, type RawLoreData } from "./sync/lore";
import { CONTENT_DIR, WEB_ROOT, defaultAssetsDir, defaultLoreDataPath } from "./sync/paths";
import { readWebpDimensions } from "./sync/webp";
import { resolveChannelId } from "./sync/youtube";

const DEFAULT_FEATURED: FeaturedVideo[] = [
  {
    videoId: "49IkgeGr1kE",
    title: "Opus 4.8: We Built a Browser FPS in 45 Minutes With One Prompt",
    published: "June 4, 2026",
    summary: "One prompt, one playable browser FPS — the build that set the studio's pace.",
  },
  {
    videoId: "p-WXHu2gU2s",
    title: "[LIVE] Claude Opus 4.8 Masterclass: Everything You Need to Know",
    published: "June 3, 2026",
    summary: "Live masterclass on the agent workflows behind the studio.",
  },
];

interface Flags {
  assetsDir: string;
  loreDataPath: string;
  check: boolean;
  skipGithub: boolean;
  skipSprites: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    assetsDir: defaultAssetsDir(),
    loreDataPath: defaultLoreDataPath(),
    check: false,
    skipGithub: false,
    skipSprites: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--assets-dir") flags.assetsDir = path.resolve(argv[(i += 1)]);
    else if (arg === "--lore-data") flags.loreDataPath = path.resolve(argv[(i += 1)]);
    else if (arg === "--check") flags.check = true;
    else if (arg === "--skip-github") flags.skipGithub = true;
    else if (arg === "--skip-sprites") flags.skipSprites = true;
    else throw new Error(`unknown flag: ${arg}`);
  }
  return flags;
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(path.join(CONTENT_DIR, file), `${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.check) {
    const errors = validateContent(CONTENT_DIR, WEB_ROOT);
    if (errors.length > 0) {
      console.error(`content check failed (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
      for (const error of errors) console.error(`  - ${error}`);
      process.exit(1);
    }
    console.log("content check passed");
    return;
  }

  if (!existsSync(flags.assetsDir) || !existsSync(flags.loreDataPath)) {
    throw new Error(
      `sources not found (assets: ${flags.assetsDir}, lore: ${flags.loreDataPath}) — ` +
        "sync runs locally next to the deadrotcom checkout; CI uses --check instead",
    );
  }

  const now = new Date().toISOString();
  mkdirSync(CONTENT_DIR, { recursive: true });

  // 1. Lore — resolve spriteBase against the deadrot site sprite set.
  const deadrotSpritesDir = path.join(flags.assetsDir, "sites/deadrotcom/public/sprites");
  const deadrotSpriteFiles = readdirSync(deadrotSpritesDir).filter((f) => f.endsWith(".webp"));
  const spriteSet = new Set(deadrotSpriteFiles);
  const rawLore = JSON.parse(readFileSync(flags.loreDataPath, "utf8")) as RawLoreData;
  const lore = transformLore(rawLore, (base) =>
    spriteSet.has(`${base}.webp`) ? `/sprites/deadrot/${base}.webp` : null,
  );

  // 2. Asset index + sprite copy plan.
  const catalog = JSON.parse(readFileSync(path.join(flags.assetsDir, "assets-catalog.json"), "utf8")) as {
    entities: Parameters<typeof buildAssetIndex>[0]["catalogEntities"];
  };
  const scourgeManifest = JSON.parse(
    readFileSync(path.join(flags.assetsDir, "games/scourge-survivors/assets.json"), "utf8"),
  ) as { sprites: Parameters<typeof buildAssetIndex>[0]["scourgeSprites"] };
  const { entries, copies } = buildAssetIndex({
    catalogEntities: catalog.entities,
    scourgeSprites: scourgeManifest.sprites,
    deadrotSpriteFiles,
    lore,
  });

  // 3. Copy sprites + fill dimensions from the webp headers.
  if (!flags.skipSprites) {
    const byPublicPath = new Map(entries.map((e) => [e.publicPath, e]));
    for (const copy of copies) {
      const src = path.join(flags.assetsDir, copy.src);
      const dest = path.join(WEB_ROOT, "public", copy.publicPath.replace(/^\//, ""));
      if (!existsSync(src)) throw new Error(`copy source missing: ${src}`);
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      const entry = byPublicPath.get(copy.publicPath);
      if (entry && !entry.dimensions) {
        entry.dimensions = readWebpDimensions(new Uint8Array(readFileSync(dest)));
      }
    }
  }

  // 4. Index the pre-existing game cover art (already in public/, not copied).
  const coversDir = path.join(WEB_ROOT, "public/images/games");
  const covers: AssetIndexEntry[] = readdirSync(coversDir)
    .filter((f) => f.endsWith(".webp"))
    .map((file) => {
      const slug = file.replace(/\.webp$/, "");
      const game = lore.games.find((g) => g.slug === slug);
      return {
        id: `cover:${slug}`,
        kind: "cover" as const,
        name: `${game?.title ?? slug} cover`,
        faction: game?.factionSlug ?? null,
        game: slug,
        publicPath: `/images/games/${file}`,
        dimensions: readWebpDimensions(new Uint8Array(readFileSync(path.join(coversDir, file)))),
        provenance: null,
      };
    });
  const assetIndex = [...entries, ...covers].sort((a, b) => a.id.localeCompare(b.id));

  // 5. GitHub snapshots (roadmap boards + activity) — local gh auth.
  const spriteCount = assetIndex.filter((e) => e.kind !== "cover").length;
  if (!flags.skipGithub) {
    writeJson("roadmap-snapshot.json", snapshotRoadmap(now));
    writeJson(
      "activity-snapshot.json",
      snapshotActivity(now, { gameCount: 7, spriteCount }),
    );
  }

  // 6. Site meta — keep curated featured list, resolve channel id once.
  const siteMetaPath = path.join(CONTENT_DIR, "site-meta.json");
  const existingMeta: Partial<SiteMeta> = existsSync(siteMetaPath)
    ? (JSON.parse(readFileSync(siteMetaPath, "utf8")) as SiteMeta)
    : {};
  const youtubeChannelId =
    existingMeta.youtubeChannelId ?? (flags.skipGithub ? null : await resolveChannelId());
  writeJson("site-meta.json", {
    youtubeChannelId,
    youtubeFeatured: existingMeta.youtubeFeatured?.length ? existingMeta.youtubeFeatured : DEFAULT_FEATURED,
  } satisfies SiteMeta);

  writeJson("lore.json", lore);
  writeJson("asset-index.json", assetIndex);

  const spriteBytes = measureSpriteBytes(WEB_ROOT, assetIndex);
  if (spriteBytes > SPRITE_BUDGET_BYTES) {
    throw new Error(`synced sprites are ${(spriteBytes / 1e6).toFixed(1)}MB — over budget, tighten curation`);
  }
  writeJson("manifest.json", {
    generatedAt: now,
    counts: {
      games: lore.games.length,
      factions: lore.factions.length,
      characters: lore.characters.length,
      bestiary: lore.bestiary.length,
      assets: assetIndex.length,
      sprites: spriteCount,
    },
    spriteBytes,
    spriteBudgetBytes: SPRITE_BUDGET_BYTES,
  } satisfies ContentManifest);

  const errors = validateContent(CONTENT_DIR, WEB_ROOT);
  if (errors.length > 0) {
    console.error("sync wrote content but validation failed:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(
    `synced: ${lore.games.length} games, ${lore.characters.length} characters, ${lore.bestiary.length} creatures, ` +
      `${assetIndex.length} assets (${(spriteBytes / 1e6).toFixed(1)}MB sprites)`,
  );
}

await main();
