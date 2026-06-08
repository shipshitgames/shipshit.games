import fs from "node:fs";
import path from "node:path";

const FALLBACK_GAME_SLUGS = Object.freeze([
  "scourge-survivors",
  "deadlane",
  "pactfall",
  "starblight",
  "redline",
  "rothulk",
]);

function isGameSlug(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function readSharedGameSlugs(studioRepo) {
  const catalogPath = path.join(studioRepo, "packages", "shared", "src", "games.json");
  try {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    const slugs = Array.isArray(catalog?.gameSlugs) ? catalog.gameSlugs : [];
    if (slugs.length && slugs.every(isGameSlug)) return slugs;
  } catch {}
  return [...FALLBACK_GAME_SLUGS];
}

export { FALLBACK_GAME_SLUGS, readSharedGameSlugs };
