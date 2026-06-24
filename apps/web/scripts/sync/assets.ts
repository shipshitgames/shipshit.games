import type { AssetIndexEntry, AssetProvenance, LoreSnapshot } from "../../lib/content/types";
import { resolveAssetUrl } from "@shipshitgames/shared";

export interface SpriteCopy {
  /** Absolute source path inside the Deadrot asset package. */
  src: string;
  /** Site-relative public path (also the index publicPath). */
  publicPath: string;
}

export interface AssetIndexBuild {
  entries: AssetIndexEntry[];
  copies: SpriteCopy[];
}

interface CatalogEntity {
  id: string;
  name: string;
  faction: string | null;
  hostFamily?: string;
  canon?: string;
  promptBase?: string;
  variants: Record<string, string | null>;
}

interface RuntimeSpriteViews {
  front?: { path: string; dimensions?: [number, number] };
}

interface RuntimeSprite {
  type: string;
  views?: RuntimeSpriteViews;
  license?: AssetProvenance & Record<string, unknown>;
}

function humanize(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pickProvenance(license: RuntimeSprite["license"]): AssetProvenance | null {
  if (!license) return null;
  const { tool, date, kind, scope } = license;
  if (typeof tool !== "string" || typeof date !== "string") return null;
  return {
    tool,
    date,
    kind: typeof kind === "string" ? kind : "AI generated asset",
    scope: typeof scope === "string" ? scope : "Deadrot runtime",
  };
}

/**
 * Build the asset index + copy plan from the three verified sources:
 * catalog entities (cross-game variant renders), the Scourge Survivors
 * runtime manifest (front views with AI provenance), and the deadrot.com
 * site sprite set (portraits + hero views referenced by lore spriteBase).
 */
export function buildAssetIndex(input: {
  catalogEntities: CatalogEntity[];
  scourgeSprites: Record<string, RuntimeSprite>;
  /** Filenames (no dir) of sites/deadrotcom/public/sprites/*.webp, drafts excluded. */
  deadrotSpriteFiles: string[];
  lore: LoreSnapshot;
  assetBaseUrl?: string | null;
}): AssetIndexBuild {
  const entries: AssetIndexEntry[] = [];
  const copies: SpriteCopy[] = [];
  const assetUrl = (sourcePath: string) => resolveAssetUrl(sourcePath, input.assetBaseUrl);

  for (const entity of input.catalogEntities) {
    for (const [game, variantPath] of Object.entries(entity.variants)) {
      if (!variantPath) continue;
      const publicPath = `/sprites/entities/${entity.id}/${game}.webp`;
      copies.push({ src: variantPath, publicPath });
      entries.push({
        id: `entity:${entity.id}:${game}`,
        kind: "entity-variant",
        name: entity.name,
        faction: entity.faction ?? null,
        game,
        publicPath,
        sourcePath: variantPath,
        assetUrl: assetUrl(variantPath),
        dimensions: null,
        provenance: null,
        canon: entity.canon,
        promptBase: entity.promptBase,
        hostFamily: entity.hostFamily,
      });
    }
  }

  for (const [key, sprite] of Object.entries(input.scourgeSprites)) {
    const front = sprite.views?.front;
    if (sprite.type !== "sprite" || !front?.path) continue;
    const publicPath = `/sprites/games/scourge-survivors/${key}.webp`;
    copies.push({ src: front.path, publicPath });
    entries.push({
      id: `runtime:scourge-survivors:${key}`,
      kind: "runtime-sprite",
      name: humanize(key),
      faction: /^(enemy|boss)/.test(key) ? "scourge" : "pyre",
      game: "scourge-survivors",
      publicPath,
      sourcePath: front.path,
      assetUrl: assetUrl(front.path),
      dimensions: front.dimensions ?? null,
      provenance: pickProvenance(sprite.license),
    });
  }

  // Lore spriteBase → faction/name enrichment for the deadrot site sprites.
  const loreBySprite = new Map<string, { name: string; faction: string | null }>();
  for (const c of input.lore.characters) {
    if (c.spritePath) {
      const base = c.spritePath.split("/").pop()?.replace(/\.webp$/, "");
      if (base) loreBySprite.set(base, { name: c.name, faction: c.factionSlug });
    }
  }
  for (const b of input.lore.bestiary) {
    if (b.spritePath) {
      const base = b.spritePath.split("/").pop()?.replace(/\.webp$/, "");
      if (base) loreBySprite.set(base, { name: b.name, faction: "scourge" });
    }
  }

  for (const file of input.deadrotSpriteFiles) {
    if (!file.endsWith(".webp")) continue;
    const base = file.replace(/\.webp$/, "");
    const publicPath = `/sprites/deadrot/${file}`;
    const sourcePath = `sites/deadrotcom/public/sprites/${file}`;
    const loreMatch = loreBySprite.get(base);
    copies.push({ src: sourcePath, publicPath });
    entries.push({
      id: `deadrot:${base}`,
      kind: base.startsWith("portrait-") ? "portrait" : "runtime-sprite",
      name: loreMatch?.name ?? humanize(base),
      faction: loreMatch?.faction ?? inferFactionFromName(base),
      game: null,
      publicPath,
      sourcePath,
      assetUrl: assetUrl(sourcePath),
      dimensions: null,
      provenance: null,
    });
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  copies.sort((a, b) => a.publicPath.localeCompare(b.publicPath));
  return { entries, copies };
}

function inferFactionFromName(base: string): string | null {
  if (/warden/.test(base)) return "the-wardens";
  if (/pyre|player|ranger|heavy|scout|medic/.test(base)) return "the-pyre";
  if (/scourge|enemy|boss|graft|rot-engine|render|breach/.test(base)) return "scourge";
  return null;
}
