/**
 * Typed accessors over the committed content snapshot (see types.ts for the
 * sync architecture). Everything here is static JSON — safe in server and
 * client components, no network.
 */
import activitySnapshot from "@/content/activity-snapshot.json";
import assetIndexJson from "@/content/asset-index.json";
import loreJson from "@/content/lore.json";
import manifestJson from "@/content/manifest.json";
import roadmapSnapshot from "@/content/roadmap-snapshot.json";
import siteMetaJson from "@/content/site-meta.json";

import type {
  ActivitySnapshot,
  AssetIndexEntry,
  BestiaryEntry,
  CharacterEntry,
  ContentManifest,
  FactionEntry,
  GameLore,
  LoreSnapshot,
  RoadmapSnapshot,
  SiteMeta,
} from "./types";

const lore = loreJson as LoreSnapshot;
const assetIndex = assetIndexJson as AssetIndexEntry[];

export const CONTENT_MANIFEST = manifestJson as ContentManifest;
export const SITE_META = siteMetaJson as SiteMeta;
export const UNIVERSE = lore.universe;

export function getGameLore(slug: string): GameLore | null {
  return lore.games.find((g) => g.slug === slug) ?? null;
}

export function getFactions(): FactionEntry[] {
  return lore.factions;
}

export function getFaction(slug: string): FactionEntry | null {
  return lore.factions.find((f) => f.slug === slug) ?? null;
}

function getCharacter(slug: string): CharacterEntry | null {
  return lore.characters.find((c) => c.slug === slug) ?? null;
}

export function getCharacters(slugs: string[]): CharacterEntry[] {
  return slugs.map((slug) => getCharacter(slug)).filter((c): c is CharacterEntry => c !== null);
}

export function getCreature(slug: string): BestiaryEntry | null {
  return lore.bestiary.find((b) => b.slug === slug) ?? null;
}

export function getCreatures(slugs: string[]): BestiaryEntry[] {
  return slugs.map((slug) => getCreature(slug)).filter((b): b is BestiaryEntry => b !== null);
}

export function getAssetIndex(): AssetIndexEntry[] {
  return assetIndex;
}

export function getAssetsForGame(slug: string): AssetIndexEntry[] {
  return assetIndex.filter((entry) => entry.game === slug);
}

/** Committed board snapshot; lib/github.ts may serve a fresher copy via ISR. */
export function getRoadmapSnapshot(): RoadmapSnapshot {
  return roadmapSnapshot as RoadmapSnapshot;
}

/** Committed activity snapshot; lib/github.ts may serve a fresher copy via ISR. */
export function getActivitySnapshot(): ActivitySnapshot {
  return activitySnapshot as ActivitySnapshot;
}
