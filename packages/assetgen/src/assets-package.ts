import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type GameSlug =
  | "scourge-survivors"
  | "deadlane"
  | "pactfall"
  | "starblight"
  | "redline"
  | "rothulk"
  | "brawl"
  | "warline";

export const GAME_SLUGS: readonly GameSlug[] = [
  "scourge-survivors",
  "deadlane",
  "pactfall",
  "starblight",
  "redline",
  "rothulk",
  "brawl",
  "warline",
] as const;

export type Faction = "scourge" | "pyre" | "wardens" | "neutral";
export type HostFamily =
  | "rot-flesh"
  | "chitin"
  | "mycelial"
  | "machine-graft"
  | "bone-titan"
  | "voidship";

export type AssetVariants = Record<GameSlug, string | null>;

export interface EntityAsset {
  id: string;
  kind: "entity" | "boss";
  name: string;
  faction: Faction;
  hostFamily: HostFamily | null;
  canon: string;
  promptBase: string;
  games: GameSlug[];
  variants: AssetVariants;
}

export interface SharedAsset {
  id: string;
  kind: "fx" | "ui" | "font" | "audio";
  name: string;
  path: string;
  note?: string;
}

export interface AssetCatalog {
  $schema?: string;
  version: string;
  note?: string;
  entities: EntityAsset[];
  shared: SharedAsset[];
}

export const CATALOG_FILE = "assets-catalog.json";
export const CATALOG_SCHEMA_FILE = "assets-catalog.schema.json";

export function emptyVariants(): AssetVariants {
  return Object.fromEntries(GAME_SLUGS.map((game) => [game, null])) as AssetVariants;
}

export function normalizeVariants(variants: Partial<AssetVariants> | undefined): AssetVariants {
  return { ...emptyVariants(), ...(variants ?? {}) };
}

export function normalizeCatalog(catalog: AssetCatalog): AssetCatalog {
  return {
    ...catalog,
    entities: catalog.entities.map((entity) => ({
      ...entity,
      variants: normalizeVariants(entity.variants),
    })),
    shared: catalog.shared ?? [],
  };
}

export function seedAssetCatalog(): AssetCatalog {
  return {
    $schema: `./${CATALOG_SCHEMA_FILE}`,
    version: "0.2.0",
    note:
      "Seed canon asset catalog for the per-game variant matrix. Entity sprites are per-game renders of shared canon; shared assets are game-agnostic FX/UI/font/audio entries reused by every game.",
    entities: [
      {
        id: "scourge-swarm",
        kind: "entity",
        name: "Swarm Ripper",
        faction: "scourge",
        hostFamily: "rot-flesh",
        canon:
          "Fast melee Scourge fodder that floods lanes and breach rooms through numbers, claws, and parasite-driven host takeover.",
        promptBase:
          "Scourge melee swarm creature wearing a ruptured rot-flesh host, hunched parasite frame, black chitin over raw muscle, blade-like forearms, invasive tendrils, toxic-green breach cores, wet gore and exposed sinew",
        games: ["scourge-survivors", "deadlane", "pactfall"],
        variants: emptyVariants(),
      },
    ],
    shared: [
      {
        id: "fx-blood-splatter",
        kind: "fx",
        name: "Blood Splatter FX",
        path: "shared/fx/blood-splatter.webp",
        note: "Game-agnostic gore FX reused across games.",
      },
      {
        id: "fx-hellfire-ember",
        kind: "fx",
        name: "Hellfire Ember FX",
        path: "shared/fx/hellfire-ember.webp",
        note: "Shared Pyre heat/ember FX, not a per-game render.",
      },
      {
        id: "ui-breach-core-icon",
        kind: "ui",
        name: "Breach Core Icon",
        path: "shared/ui/breach-core-icon.webp",
        note: "Scourge-only toxic breach-core UI proof reused across games.",
      },
      {
        id: "font-doom-ui",
        kind: "font",
        name: "DOOM UI Font",
        path: "shared/fonts/doom-ui.woff2",
        note: "Shared UI font token for game HUDs and tools.",
      },
    ],
  };
}

export const ASSETS_CATALOG_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://shipshit.dev/schemas/assets-catalog.json",
  title: "Scourge-universe canon asset catalog",
  description:
    "Single source of truth for the per-game sprite variant matrix: canon entities with a per-game render matrix, plus truly game-agnostic shared assets.",
  type: "object",
  required: ["version", "entities", "shared"],
  additionalProperties: false,
  properties: {
    $schema: { type: "string" },
    version: { type: "string" },
    note: { type: "string" },
    entities: {
      type: "array",
      items: { $ref: "#/definitions/entity" },
    },
    shared: {
      type: "array",
      items: { $ref: "#/definitions/shared" },
    },
  },
  definitions: {
    gameSlug: {
      type: "string",
      enum: GAME_SLUGS,
    },
    faction: {
      type: "string",
      enum: ["scourge", "pyre", "wardens", "neutral"],
    },
    hostFamily: {
      oneOf: [
        { type: "string", enum: ["rot-flesh", "chitin", "mycelial", "machine-graft", "bone-titan", "voidship"] },
        { type: "null" },
      ],
    },
    variants: {
      type: "object",
      required: GAME_SLUGS,
      additionalProperties: false,
      properties: Object.fromEntries(GAME_SLUGS.map((game) => [game, { type: ["string", "null"] }])),
    },
    entity: {
      type: "object",
      required: ["id", "kind", "name", "faction", "hostFamily", "canon", "promptBase", "games", "variants"],
      additionalProperties: false,
      properties: {
        id: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
        kind: { type: "string", enum: ["entity", "boss"] },
        name: { type: "string" },
        faction: { $ref: "#/definitions/faction" },
        hostFamily: { $ref: "#/definitions/hostFamily" },
        canon: { type: "string" },
        promptBase: { type: "string" },
        games: {
          type: "array",
          uniqueItems: true,
          items: { $ref: "#/definitions/gameSlug" },
        },
        variants: { $ref: "#/definitions/variants" },
      },
    },
    shared: {
      type: "object",
      required: ["id", "kind", "name", "path"],
      additionalProperties: false,
      properties: {
        id: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
        kind: { type: "string", enum: ["fx", "ui", "font", "audio"] },
        name: { type: "string" },
        path: { type: "string" },
        note: { type: "string" },
      },
    },
  },
} as const;

const ASSETS_PACKAGE_JSON = {
  name: "@shipshitgames/assets",
  version: "0.1.0",
  private: true,
  type: "module",
  exports: {
    ".": "./src/index.ts",
    "./assets-catalog.json": "./assets-catalog.json",
  },
} as const;

const ASSETS_README = `# @shipshitgames/assets

Shared Deadrot asset package initialized by @shipshitgames/assetgen.

Entity sprites are per-game renders of one canon roster. Shared FX, UI, font,
and audio assets live once under the shared catalog and are reused by games.
`;

const ASSETS_INDEX_TS = `import catalogJson from "../assets-catalog.json" with { type: "json" };

export type GameSlug =
  | "scourge-survivors"
  | "deadlane"
  | "pactfall"
  | "starblight"
  | "redline"
  | "rothulk"
  | "brawl"
  | "warline";

export const GAME_SLUGS: readonly GameSlug[] = [
  "scourge-survivors",
  "deadlane",
  "pactfall",
  "starblight",
  "redline",
  "rothulk",
  "brawl",
  "warline",
] as const;

export type AssetKind = "entity" | "boss" | "fx" | "ui" | "font" | "audio";
export type Faction = "scourge" | "pyre" | "wardens" | "neutral";
export type HostFamily = "rot-flesh" | "chitin" | "mycelial" | "machine-graft" | "bone-titan" | "voidship";
export type AssetVariants = Record<GameSlug, string | null>;

export interface EntityAsset {
  id: string;
  kind: "entity" | "boss";
  name: string;
  faction: Faction;
  hostFamily: HostFamily | null;
  canon: string;
  promptBase: string;
  games: GameSlug[];
  variants: AssetVariants;
}

export interface SharedAsset {
  id: string;
  kind: "fx" | "ui" | "font" | "audio";
  name: string;
  path: string;
  note?: string;
}

export interface AssetCatalog {
  $schema?: string;
  version: string;
  note?: string;
  entities: EntityAsset[];
  shared: SharedAsset[];
}

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  path: string | null;
  game: GameSlug | null;
}

export const catalog: AssetCatalog = catalogJson as unknown as AssetCatalog;

export function getAsset(catalog: AssetCatalog, id: string, game?: GameSlug): Asset | undefined {
  const entity = catalog.entities.find((entry) => entry.id === id);
  if (entity) {
    return {
      id: entity.id,
      kind: entity.kind,
      name: entity.name,
      path: game ? entity.variants[game] ?? null : null,
      game: game ?? null,
    };
  }

  const shared = catalog.shared.find((entry) => entry.id === id);
  if (shared) {
    return {
      id: shared.id,
      kind: shared.kind,
      name: shared.name,
      path: shared.path,
      game: null,
    };
  }

  return undefined;
}

export function gamesFor(catalog: AssetCatalog, id: string): GameSlug[] {
  return catalog.entities.find((entry) => entry.id === id)?.games ?? [];
}

export function renderedGames(entity: EntityAsset): GameSlug[] {
  return GAME_SLUGS.filter((game) => entity.variants[game] !== null);
}

export function pendingGames(entity: EntityAsset): GameSlug[] {
  return entity.games.filter((game) => entity.variants[game] === null);
}
`;

export interface InitAssetsPackageResult {
  created: boolean;
  catalogPath: string;
}

export async function initAssetsPackage(assetsDir: string): Promise<InitAssetsPackageResult> {
  const targetCatalog = join(assetsDir, CATALOG_FILE);
  if (existsSync(targetCatalog)) {
    return { created: false, catalogPath: targetCatalog };
  }

  await mkdir(join(assetsDir, "src"), { recursive: true });
  await mkdir(join(assetsDir, "shared", "fx"), { recursive: true });
  await mkdir(join(assetsDir, "shared", "ui"), { recursive: true });
  await mkdir(join(assetsDir, "shared", "fonts"), { recursive: true });
  await writeFile(targetCatalog, JSON.stringify(seedAssetCatalog(), null, 2) + "\n");
  await writeFile(join(assetsDir, CATALOG_SCHEMA_FILE), JSON.stringify(ASSETS_CATALOG_SCHEMA, null, 2) + "\n");
  await writeFile(join(assetsDir, "package.json"), JSON.stringify(ASSETS_PACKAGE_JSON, null, 2) + "\n");
  await writeFile(join(assetsDir, "README.md"), ASSETS_README);
  await writeFile(join(assetsDir, "src", "index.ts"), ASSETS_INDEX_TS);

  return { created: true, catalogPath: targetCatalog };
}
