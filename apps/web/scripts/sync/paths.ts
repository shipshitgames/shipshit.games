import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** apps/web root. */
export const WEB_ROOT = path.resolve(HERE, "../..");

/** shipshitgames repo root. */
const REPO_ROOT = path.resolve(WEB_ROOT, "../..");

/** Committed JSON snapshots. */
export const CONTENT_DIR = path.join(WEB_ROOT, "content");

/** Synced sprite copies served by the site. */
export const PUBLIC_SPRITES_DIR = path.join(WEB_ROOT, "public", "sprites");

/** Same convention as packages/assetgen: the Deadrot asset package next door. */
export function defaultAssetsDir(): string {
  return path.resolve(REPO_ROOT, "../deadrotcom/packages/assets");
}

/** The deadrot.com web lore dataset (games/factions/characters/bestiary/universe). */
export function defaultLoreDataPath(): string {
  return path.resolve(REPO_ROOT, "../deadrotcom/apps/web/lib/content/data.json");
}
