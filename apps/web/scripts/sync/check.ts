import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type {
  ActivitySnapshot,
  AssetIndexEntry,
  ContentManifest,
  LoreSnapshot,
  RoadmapSnapshot,
  SiteMeta,
} from "../../lib/content/types";

export const SPRITE_BUDGET_BYTES = 15 * 1024 * 1024;

const REQUIRED_FILES = [
  "lore.json",
  "asset-index.json",
  "roadmap-snapshot.json",
  "activity-snapshot.json",
  "site-meta.json",
  "manifest.json",
] as const;

/**
 * Validate the committed content snapshot without needing the sibling repo or
 * network — this is the mode CI runs. Returns human-actionable errors.
 */
export function validateContent(contentDir: string, webRoot: string): string[] {
  const errors: string[] = [];
  const read = <T>(file: string): T | null => {
    const full = path.join(contentDir, file);
    if (!existsSync(full)) {
      errors.push(`missing ${file} — run \`bun run sync:content\``);
      return null;
    }
    try {
      return JSON.parse(readFileSync(full, "utf8")) as T;
    } catch (error) {
      errors.push(`${file} is not valid JSON: ${(error as Error).message}`);
      return null;
    }
  };

  for (const file of REQUIRED_FILES) {
    if (!existsSync(path.join(contentDir, file))) {
      errors.push(`missing content/${file} — run \`bun run sync:content\``);
    }
  }
  if (errors.length > 0) return errors;

  const lore = read<LoreSnapshot>("lore.json");
  const assetIndex = read<AssetIndexEntry[]>("asset-index.json");
  const roadmap = read<RoadmapSnapshot>("roadmap-snapshot.json");
  const activity = read<ActivitySnapshot>("activity-snapshot.json");
  const siteMeta = read<SiteMeta>("site-meta.json");
  const manifest = read<ContentManifest>("manifest.json");
  if (!lore || !assetIndex || !roadmap || !activity || !siteMeta || !manifest) return errors;

  if (lore.games.length < 6) errors.push(`lore.json has only ${lore.games.length} games`);
  if (lore.factions.length !== 3) errors.push(`expected 3 factions, found ${lore.factions.length}`);
  if (lore.characters.length === 0) errors.push("lore.json has no characters");
  if (lore.bestiary.length === 0) errors.push("lore.json has no bestiary entries");

  const characterSlugs = new Set(lore.characters.map((c) => c.slug));
  const bestiarySlugs = new Set(lore.bestiary.map((b) => b.slug));
  for (const game of lore.games) {
    for (const slug of game.characterSlugs) {
      if (!characterSlugs.has(slug)) errors.push(`lore: game ${game.slug} references unknown character "${slug}"`);
    }
    for (const slug of game.enemySlugs) {
      if (!bestiarySlugs.has(slug)) errors.push(`lore: game ${game.slug} references unknown creature "${slug}"`);
    }
  }

  // Every referenced sprite must exist in public/ (lore portraits + asset index).
  const missingPaths: string[] = [];
  const checkPublic = (publicPath: string | null, context: string) => {
    if (!publicPath) return;
    if (!existsSync(path.join(webRoot, "public", publicPath.replace(/^\//, "")))) {
      missingPaths.push(`${publicPath} (${context})`);
    }
  };
  for (const c of lore.characters) checkPublic(c.spritePath, `character ${c.slug}`);
  for (const b of lore.bestiary) checkPublic(b.spritePath, `creature ${b.slug}`);
  for (const entry of assetIndex) checkPublic(entry.publicPath, entry.id);
  if (missingPaths.length > 0) {
    errors.push(
      `${missingPaths.length} sprite path(s) missing from public/ — run \`bun run sync:content\`. First: ${missingPaths[0]}`,
    );
  }

  if (assetIndex.length === 0) errors.push("asset-index.json is empty");
  if (activity.events.length === 0) errors.push("activity-snapshot.json has no events");
  if (roadmap.boards.length === 0) errors.push("roadmap-snapshot.json has no boards");
  if (siteMeta.youtubeFeatured.length === 0) errors.push("site-meta.json has no featured videos");

  const spriteBytes = measureSpriteBytes(webRoot, assetIndex);
  if (spriteBytes > SPRITE_BUDGET_BYTES) {
    errors.push(`synced sprites are ${(spriteBytes / 1e6).toFixed(1)}MB — over the ${SPRITE_BUDGET_BYTES / 1e6}MB budget`);
  }
  if (manifest.counts.assets !== assetIndex.length) {
    errors.push(`manifest.counts.assets (${manifest.counts.assets}) != asset-index length (${assetIndex.length})`);
  }

  return errors;
}

export function measureSpriteBytes(webRoot: string, assetIndex: AssetIndexEntry[]): number {
  let total = 0;
  for (const entry of assetIndex) {
    if (entry.kind === "cover") continue; // pre-existing site images, not synced copies
    const full = path.join(webRoot, "public", entry.publicPath.replace(/^\//, ""));
    if (existsSync(full)) total += statSync(full).size;
  }
  return total;
}
