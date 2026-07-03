import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { validateContent } from "./check";
import type {
  ActivitySnapshot,
  AssetIndexEntry,
  ContentManifest,
  LoreSnapshot,
  RoadmapSnapshot,
  SiteMeta,
} from "../../lib/content/types";

const roots: string[] = [];
const originalAssetBaseUrl = process.env.ASSET_BASE_URL;
const originalNextPublicAssetBaseUrl = process.env.NEXT_PUBLIC_ASSET_BASE_URL;

function tempRoot() {
  const root = path.join(tmpdir(), `shipshit-content-${crypto.randomUUID()}`);
  roots.push(root);
  mkdirSync(path.join(root, "content"), { recursive: true });
  mkdirSync(path.join(root, "public"), { recursive: true });
  return root;
}

function writeJson(root: string, file: string, value: unknown) {
  writeFileSync(path.join(root, "content", file), `${JSON.stringify(value, null, 2)}\n`);
}

function writeBaseline(root: string, assets: AssetIndexEntry[]) {
  const lore: LoreSnapshot = {
    games: [
      {
        slug: "scourge-survivors",
        title: "Scourge Survivors",
        tagline: "",
        genre: "",
        factionSlug: "the-pyre",
        factionName: "The Pyre",
        accent: "hellfire",
        overview: "",
        features: [],
        characterSlugs: ["ranger"],
        enemySlugs: ["husk"],
      },
      {
        slug: "deadlane",
        title: "Deadlane",
        tagline: "",
        genre: "",
        factionSlug: "the-wardens",
        factionName: "The Wardens",
        accent: "bone",
        overview: "",
        features: [],
        characterSlugs: [],
        enemySlugs: [],
      },
      {
        slug: "pactfall",
        title: "Pactfall",
        tagline: "",
        genre: "",
        factionSlug: null,
        factionName: "Cross-faction",
        accent: "rust",
        overview: "",
        features: [],
        characterSlugs: [],
        enemySlugs: [],
      },
      {
        slug: "starblight",
        title: "Starblight",
        tagline: "",
        genre: "",
        factionSlug: null,
        factionName: "Orbital",
        accent: "bone",
        overview: "",
        features: [],
        characterSlugs: [],
        enemySlugs: [],
      },
      {
        slug: "redline",
        title: "Redline",
        tagline: "",
        genre: "",
        factionSlug: "the-pyre",
        factionName: "The Pyre",
        accent: "hellfire",
        overview: "",
        features: [],
        characterSlugs: [],
        enemySlugs: [],
      },
      {
        slug: "rothulk",
        title: "Rothulk",
        tagline: "",
        genre: "",
        factionSlug: "scourge",
        factionName: "Scourge",
        accent: "toxic",
        overview: "",
        features: [],
        characterSlugs: [],
        enemySlugs: [],
      },
    ],
    factions: [
      {
        slug: "the-pyre",
        name: "The Pyre",
        doctrine: "",
        tagline: "",
        accent: "hellfire",
        overview: "",
        playstyle: "",
        rivalry: "",
        crestMotif: "",
        gameSlugs: [],
        characterSlugs: ["ranger"],
      },
      {
        slug: "the-wardens",
        name: "The Wardens",
        doctrine: "",
        tagline: "",
        accent: "bone",
        overview: "",
        playstyle: "",
        rivalry: "",
        crestMotif: "",
        gameSlugs: [],
        characterSlugs: [],
      },
      {
        slug: "scourge",
        name: "Scourge",
        doctrine: "",
        tagline: "",
        accent: "toxic",
        overview: "",
        playstyle: "",
        rivalry: "",
        crestMotif: "",
        gameSlugs: [],
        characterSlugs: [],
      },
    ],
    characters: [
      {
        slug: "ranger",
        name: "Ranger",
        factionSlug: "the-pyre",
        factionName: "The Pyre",
        role: "",
        tagline: "",
        accent: "hellfire",
        overview: "",
        gameplayRead: [],
        visualMotifs: [],
        appearsIn: ["scourge-survivors"],
        spritePath: "https://cdn.deadrot.test/assets/sites/deadrotcom/public/sprites/player-ranger-front.webp",
      },
    ],
    bestiary: [
      {
        slug: "husk",
        name: "Husk",
        tier: "",
        tagline: "",
        accent: "toxic",
        overview: "",
        gameplayRead: [],
        visualMotifs: [],
        appearsIn: ["scourge-survivors"],
        spritePath: null,
      },
    ],
    universe: { premise: "", pillars: [], eras: [] },
  };
  const roadmap: RoadmapSnapshot = {
    generatedAt: "2026-06-24T00:00:00.000Z",
    boards: [{ scope: "studio", title: "shipshit.games", projectNumber: 4, url: "https://example.test", counts: { todo: 1, inProgress: 0, done: 0 }, topItems: [] }],
  };
  const activity: ActivitySnapshot = {
    generatedAt: "2026-06-24T00:00:00.000Z",
    events: [{ type: "commit", repo: "shipshitgames/shipshit.games", sha: "abc123", message: "test", url: "https://example.test", date: "2026-06-24" }],
    stats: { gameCount: 6, spriteCount: assets.length, mergedPrsTotal: 1, commitsLast30d: 1 },
  };
  const siteMeta: SiteMeta = { youtubeChannelId: null, youtubeFeatured: [{ videoId: "x", title: "test", published: "today", summary: "test" }] };
  const manifest: ContentManifest = {
    generatedAt: "2026-06-24T00:00:00.000Z",
    counts: { games: lore.games.length, factions: lore.factions.length, characters: lore.characters.length, bestiary: lore.bestiary.length, assets: assets.length, sprites: assets.length },
    spriteBytes: 0,
    spriteBudgetBytes: 15 * 1024 * 1024,
  };

  writeJson(root, "lore.json", lore);
  writeJson(root, "asset-index.json", assets);
  writeJson(root, "roadmap-snapshot.json", roadmap);
  writeJson(root, "activity-snapshot.json", activity);
  writeJson(root, "site-meta.json", siteMeta);
  writeJson(root, "manifest.json", manifest);
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  if (originalAssetBaseUrl === undefined) delete process.env.ASSET_BASE_URL;
  else process.env.ASSET_BASE_URL = originalAssetBaseUrl;
  if (originalNextPublicAssetBaseUrl === undefined) delete process.env.NEXT_PUBLIC_ASSET_BASE_URL;
  else process.env.NEXT_PUBLIC_ASSET_BASE_URL = originalNextPublicAssetBaseUrl;
});

describe("validateContent asset origin checks", () => {
  test("accepts package assets resolved through assetUrl without public copies", () => {
    const root = tempRoot();
    writeBaseline(root, [
      {
        id: "entity:scourge-swarm:deadlane",
        kind: "entity-variant",
        name: "Swarm Ripper",
        faction: "scourge",
        game: "deadlane",
        publicPath: "/sprites/entities/scourge-swarm/deadlane.webp",
        sourcePath: "entities/scourge-swarm/deadlane.webp",
        assetUrl: "https://cdn.deadrot.test/assets/entities/scourge-swarm/deadlane.webp",
        dimensions: [128, 128],
        provenance: null,
      },
    ]);

    expect(validateContent(path.join(root, "content"), root)).toEqual([]);
  });

  test("accepts package assets resolved through asset origin env without public copies", () => {
    process.env.ASSET_BASE_URL = "https://cdn.deadrot.test/assets";
    const root = tempRoot();
    writeBaseline(root, [
      {
        id: "entity:scourge-swarm:deadlane",
        kind: "entity-variant",
        name: "Swarm Ripper",
        faction: "scourge",
        game: "deadlane",
        publicPath: "/sprites/entities/scourge-swarm/deadlane.webp",
        sourcePath: "entities/scourge-swarm/deadlane.webp",
        assetUrl: null,
        dimensions: [128, 128],
        provenance: null,
      },
    ]);

    expect(validateContent(path.join(root, "content"), root)).toEqual([]);
  });

  test("still fails missing local package assets when no CDN URL is available", () => {
    const root = tempRoot();
    writeBaseline(root, [
      {
        id: "entity:scourge-swarm:deadlane",
        kind: "entity-variant",
        name: "Swarm Ripper",
        faction: "scourge",
        game: "deadlane",
        publicPath: "/sprites/entities/scourge-swarm/deadlane.webp",
        sourcePath: "entities/scourge-swarm/deadlane.webp",
        assetUrl: null,
        dimensions: [128, 128],
        provenance: null,
      },
    ]);

    expect(validateContent(path.join(root, "content"), root).some((error) => error.includes("missing from public"))).toBe(true);
  });
});
