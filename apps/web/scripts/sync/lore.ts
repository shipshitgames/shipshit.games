import type {
  AccentToken,
  BestiaryEntry,
  CharacterEntry,
  FactionEntry,
  GameLore,
  LoreSnapshot,
  UniverseLore,
} from "../../lib/content/types";

const ACCENTS: readonly AccentToken[] = ["blood", "hellfire", "toxic", "rust", "bone"];

/** Raw shape of deadrotcom/apps/web/lib/content/data.json (validated, not trusted). */
export interface RawLoreData {
  games: Array<Record<string, unknown>>;
  factions: Array<Record<string, unknown>>;
  characters: Array<Record<string, unknown>>;
  bestiary: Array<Record<string, unknown>>;
  universe: Record<string, unknown>;
}

function asString(value: unknown, context: string): string {
  if (typeof value !== "string") throw new Error(`expected string at ${context}, got ${typeof value}`);
  return value;
}

function asStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(`expected string[] at ${context}`);
  }
  return value as string[];
}

function asAccent(value: unknown, context: string): AccentToken {
  const s = asString(value, context);
  if (!ACCENTS.includes(s as AccentToken)) throw new Error(`unknown accent "${s}" at ${context}`);
  return s as AccentToken;
}

function asFeatures(value: unknown, context: string): { title: string; desc: string }[] {
  if (!Array.isArray(value)) throw new Error(`expected feature[] at ${context}`);
  return value.map((f, i) => ({
    title: asString((f as Record<string, unknown>).title, `${context}[${i}].title`),
    desc: asString((f as Record<string, unknown>).desc, `${context}[${i}].desc`),
  }));
}

/** "" → null for cross-faction games. */
function nullableSlug(value: unknown, context: string): string | null {
  const s = asString(value, context);
  return s === "" ? null : s;
}

/**
 * Transform the raw deadrot lore dataset into the committed LoreSnapshot.
 * `spriteResolver` maps a spriteBase (e.g. "player-ranger-front") to a
 * site-relative public path, or null when the sprite was not synced.
 */
export function transformLore(
  raw: RawLoreData,
  spriteResolver: (spriteBase: string) => string | null,
): LoreSnapshot {
  const games: GameLore[] = raw.games.map((g, i) => ({
    slug: asString(g.slug, `games[${i}].slug`),
    title: asString(g.title, `games[${i}].title`),
    tagline: asString(g.tagline, `games[${i}].tagline`),
    genre: asString(g.genre, `games[${i}].genre`),
    factionSlug: nullableSlug(g.factionSlug, `games[${i}].factionSlug`),
    factionName: asString(g.factionName, `games[${i}].factionName`),
    accent: asAccent(g.accent, `games[${i}].accent`),
    overview: asString(g.overview, `games[${i}].overview`),
    features: asFeatures(g.features, `games[${i}].features`),
    characterSlugs: asStringArray(g.characterSlugs, `games[${i}].characterSlugs`),
    enemySlugs: asStringArray(g.enemySlugs, `games[${i}].enemySlugs`),
  }));

  const characters: CharacterEntry[] = raw.characters.map((c, i) => ({
    slug: asString(c.slug, `characters[${i}].slug`),
    name: asString(c.name, `characters[${i}].name`),
    factionSlug: nullableSlug(c.factionSlug, `characters[${i}].factionSlug`),
    factionName: asString(c.factionName, `characters[${i}].factionName`),
    role: asString(c.role, `characters[${i}].role`),
    tagline: asString(c.tagline, `characters[${i}].tagline`),
    accent: asAccent(c.accent, `characters[${i}].accent`),
    overview: asString(c.overview, `characters[${i}].overview`),
    gameplayRead: asStringArray(c.gameplayRead, `characters[${i}].gameplayRead`),
    visualMotifs: asStringArray(c.visualMotifs, `characters[${i}].visualMotifs`),
    appearsIn: asStringArray(c.appearsIn, `characters[${i}].appearsIn`),
    spritePath: typeof c.spriteBase === "string" ? spriteResolver(c.spriteBase) : null,
  }));

  const bestiary: BestiaryEntry[] = raw.bestiary.map((b, i) => ({
    slug: asString(b.slug, `bestiary[${i}].slug`),
    name: asString(b.name, `bestiary[${i}].name`),
    tier: asString(b.tier, `bestiary[${i}].tier`),
    tagline: asString(b.tagline, `bestiary[${i}].tagline`),
    accent: asAccent(b.accent, `bestiary[${i}].accent`),
    overview: asString(b.overview, `bestiary[${i}].overview`),
    gameplayRead: asStringArray(b.gameplayRead, `bestiary[${i}].gameplayRead`),
    visualMotifs: asStringArray(b.visualMotifs, `bestiary[${i}].visualMotifs`),
    appearsIn: asStringArray(b.appearsIn, `bestiary[${i}].appearsIn`),
    spritePath: typeof b.spriteBase === "string" ? spriteResolver(b.spriteBase) : null,
  }));

  const factions: FactionEntry[] = raw.factions.map((f, i) => {
    const slug = asString(f.slug, `factions[${i}].slug`);
    return {
      slug,
      name: asString(f.name, `factions[${i}].name`),
      doctrine: asString(f.doctrine, `factions[${i}].doctrine`),
      tagline: asString(f.tagline, `factions[${i}].tagline`),
      accent: asAccent(f.accent, `factions[${i}].accent`),
      overview: asString(f.overview, `factions[${i}].overview`),
      playstyle: asString(f.playstyle, `factions[${i}].playstyle`),
      rivalry: asString(f.rivalry, `factions[${i}].rivalry`),
      crestMotif: asString(f.crestMotif, `factions[${i}].crestMotif`),
      gameSlugs: asStringArray(f.gameSlugs, `factions[${i}].gameSlugs`),
      characterSlugs: characters.filter((c) => c.factionSlug === slug).map((c) => c.slug),
    };
  });

  const universe: UniverseLore = {
    premise: asString(raw.universe.premise, "universe.premise"),
    pillars: asFeatures(raw.universe.pillars, "universe.pillars"),
    eras: (Array.isArray(raw.universe.eras) ? raw.universe.eras : []).map((e, i) => ({
      name: asString((e as Record<string, unknown>).name, `universe.eras[${i}].name`),
      blurb: asString((e as Record<string, unknown>).blurb, `universe.eras[${i}].blurb`),
    })),
  };

  // Internal consistency: every character/enemy slug referenced by a game must resolve.
  const characterSlugs = new Set(characters.map((c) => c.slug));
  const bestiarySlugs = new Set(bestiary.map((b) => b.slug));
  for (const game of games) {
    for (const slug of game.characterSlugs) {
      if (!characterSlugs.has(slug)) throw new Error(`game ${game.slug} references unknown character "${slug}"`);
    }
    for (const slug of game.enemySlugs) {
      if (!bestiarySlugs.has(slug)) throw new Error(`game ${game.slug} references unknown creature "${slug}"`);
    }
  }

  return { games, factions, characters, bestiary, universe };
}
