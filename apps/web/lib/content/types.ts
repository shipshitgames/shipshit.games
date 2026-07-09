/**
 * Typed schema for the committed content snapshot in `apps/web/content/`.
 *
 * Source of truth lives in the sibling deadrotcom repo (lore data + asset
 * catalog) and on GitHub (boards, activity). `scripts/sync-content.ts`
 * regenerates these files; the website only ever reads the committed copies,
 * so Vercel builds never need the sibling repo or network access.
 */

/** Accent token names that map 1:1 to `--color-*` tokens in theme.css. */
export type AccentToken = "blood" | "hellfire" | "toxic" | "rust" | "bone";

/** Slugs of games shown in the site gallery (packages/shared GAMES). */
export type GameSlug =
  | "scourge-survivors"
  | "deadlane"
  | "pactfall"
  | "starblight"
  | "redline"
  | "rothulk"
  | "warline";

/**
 * Lore-side game slug. The lore vault also covers games the gallery does not
 * list yet (e.g. "zero-day"), and the gallery lists games without lore entries
 * (e.g. "warline") — joins happen by slug and must tolerate both directions.
 */
export type LoreGameSlug = string;

export interface LoreFeature {
  title: string;
  desc: string;
}

export interface GameLore {
  slug: LoreGameSlug;
  title: string;
  tagline: string;
  genre: string;
  /** Null for cross-faction games (e.g. pactfall's "Pyre vs Wardens"). */
  factionSlug: string | null;
  factionName: string;
  accent: AccentToken;
  overview: string;
  features: LoreFeature[];
  characterSlugs: string[];
  enemySlugs: string[];
}

export interface CharacterEntry {
  slug: string;
  name: string;
  factionSlug: string | null;
  factionName: string;
  role: string;
  tagline: string;
  accent: AccentToken;
  overview: string;
  gameplayRead: string[];
  visualMotifs: string[];
  appearsIn: LoreGameSlug[];
  /** Site-relative sprite path (e.g. /sprites/deadrot/player-ranger-front.webp), if synced. */
  spritePath: string | null;
}

export interface BestiaryEntry {
  slug: string;
  name: string;
  tier: string;
  tagline: string;
  accent: AccentToken;
  overview: string;
  gameplayRead: string[];
  visualMotifs: string[];
  appearsIn: LoreGameSlug[];
  spritePath: string | null;
}

export interface FactionEntry {
  slug: string;
  name: string;
  doctrine: string;
  tagline: string;
  accent: AccentToken;
  overview: string;
  playstyle: string;
  rivalry: string;
  crestMotif: string;
  gameSlugs: LoreGameSlug[];
  /** Derived: characters whose factionSlug matches. */
  characterSlugs: string[];
}

export interface UniverseLore {
  premise: string;
  pillars: LoreFeature[];
  eras: { name: string; blurb: string }[];
}

export interface LoreSnapshot {
  games: GameLore[];
  factions: FactionEntry[];
  characters: CharacterEntry[];
  bestiary: BestiaryEntry[];
  universe: UniverseLore;
}

/** AI-generation provenance, copied verbatim from the asset package license blocks. */
export interface AssetProvenance {
  tool: string;
  date: string;
  kind: string;
  scope: string;
}

export type AssetKind = "entity-variant" | "runtime-sprite" | "portrait" | "cover";

export interface AssetIndexEntry {
  /** Stable id, e.g. "entity:scourge-swarm:deadlane" or "runtime:scourge-survivors:enemy-melee". */
  id: string;
  kind: AssetKind;
  name: string;
  faction: string | null;
  game: LoreGameSlug | null;
  /** Site-relative public path. */
  publicPath: string;
  /** Path relative to the shared Deadrot asset package, when this entry comes from that package. */
  sourcePath?: string | null;
  /** CDN-backed URL resolved from sourcePath and asset-origin config, when configured. */
  assetUrl?: string | null;
  /** [width, height] parsed from the webp header; null when unknown. */
  dimensions: [number, number] | null;
  provenance: AssetProvenance | null;
  /** Canon/prompt context from the asset catalog, when available. */
  canon?: string;
  promptBase?: string;
  hostFamily?: string;
}

export type CanonicalRoadmapStatus =
  | "Backlog"
  | "In Progress"
  | "Human Review"
  | "Done"
  | "Deferred";

/**
 * `Todo` is retained so committed snapshots written before the GitHub project
 * renamed that option to `Backlog` remain readable.
 */
export type RoadmapStatus = CanonicalRoadmapStatus | "Todo" | "Other";

export interface RoadmapCounts {
  /** Persisted compatibility key; this is the count displayed as Backlog. */
  todo: number;
  inProgress: number;
  done: number;
  /** Missing in legacy snapshots and treated as zero by consumers. */
  humanReview?: number;
  /** Missing in legacy snapshots and treated as zero by consumers. */
  deferred?: number;
}

export interface RoadmapBoard {
  /** Game slug, or "studio" / "deadrot" for the org-level boards. */
  scope: LoreGameSlug | "studio" | "deadrot";
  title: string;
  projectNumber: number;
  url: string;
  counts: RoadmapCounts;
  /** Up to 5 actionable items, Human Review then In Progress then Backlog. */
  topItems: { title: string; status: RoadmapStatus }[];
}

export interface RoadmapSnapshot {
  generatedAt: string;
  boards: RoadmapBoard[];
}

export type ActivityEvent =
  | {
      type: "pr_merged";
      repo: string;
      number: number;
      title: string;
      url: string;
      date: string;
    }
  | {
      type: "commit";
      repo: string;
      sha: string;
      message: string;
      url: string;
      date: string;
    };

export interface ActivityStats {
  gameCount: number;
  spriteCount: number;
  mergedPrsTotal: number;
  commitsLast30d: number;
}

export interface ActivitySnapshot {
  generatedAt: string;
  events: ActivityEvent[];
  stats: ActivityStats;
}

export interface FeaturedVideo {
  videoId: string;
  title: string;
  published: string;
  summary: string;
}

export interface SiteMeta {
  /** Resolved UC… channel id for @ShipShitShow; null when resolution failed. */
  youtubeChannelId: string | null;
  youtubeFeatured: FeaturedVideo[];
}

export interface LatestVideo {
  videoId: string;
  title: string;
  published: string;
}

export interface ContentManifest {
  generatedAt: string;
  counts: {
    games: number;
    factions: number;
    characters: number;
    bestiary: number;
    assets: number;
    sprites: number;
  };
  spriteBytes: number;
  spriteBudgetBytes: number;
}
