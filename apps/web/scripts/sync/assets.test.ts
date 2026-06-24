import { describe, expect, test } from "bun:test";

import { buildAssetIndex } from "./assets";
import type { LoreSnapshot } from "../../lib/content/types";

const LORE: LoreSnapshot = {
  games: [],
  factions: [],
  characters: [
    {
      slug: "ranger",
      name: "Ranger",
      factionSlug: "the-pyre",
      factionName: "The Pyre",
      role: "Purger",
      tagline: "",
      accent: "hellfire",
      overview: "",
      gameplayRead: [],
      visualMotifs: [],
      appearsIn: [],
      spritePath: "/sprites/deadrot/player-ranger-front.webp",
    },
  ],
  bestiary: [],
  universe: { premise: "", pillars: [], eras: [] },
};

describe("buildAssetIndex", () => {
  test("indexes entity variants, runtime sprites, and deadrot sprites", () => {
    const { entries, copies } = buildAssetIndex({
      catalogEntities: [
        {
          id: "scourge-swarm",
          name: "Swarm Ripper",
          faction: "scourge",
          hostFamily: "rot-flesh",
          canon: "Fast melee fodder.",
          promptBase: "Scourge melee swarm creature",
          variants: {
            "scourge-survivors": "entities/scourge-swarm/scourge-survivors.webp",
            deadlane: null,
          },
        },
      ],
      scourgeSprites: {
        "enemy-melee": {
          type: "sprite",
          views: { front: { path: "games/scourge-survivors/enemies/x/front.webp", dimensions: [128, 128] } },
          license: { tool: "gpt-image-2", date: "2026-06-05", kind: "AI sprite", scope: "runtime" },
        },
        "not-a-sprite": { type: "texture" },
      },
      deadrotSpriteFiles: ["player-ranger-front.webp", "portrait-rot-engine.webp"],
      lore: LORE,
      assetBaseUrl: "https://cdn.deadrot.test/assets/",
    });

    const ids = entries.map((e) => e.id);
    expect(ids).toContain("entity:scourge-swarm:scourge-survivors");
    expect(ids).toContain("runtime:scourge-survivors:enemy-melee");
    expect(ids).toContain("deadrot:player-ranger-front");
    expect(ids).toContain("deadrot:portrait-rot-engine");
    expect(ids).not.toContain("entity:scourge-swarm:deadlane");
    expect(ids).not.toContain("runtime:scourge-survivors:not-a-sprite");
    expect(copies).toHaveLength(4);
    expect(entries.find((e) => e.id === "entity:scourge-swarm:scourge-survivors")?.sourcePath).toBe(
      "entities/scourge-swarm/scourge-survivors.webp",
    );
    expect(entries.find((e) => e.id === "entity:scourge-swarm:scourge-survivors")?.assetUrl).toBe(
      "https://cdn.deadrot.test/assets/entities/scourge-swarm/scourge-survivors.webp",
    );
    expect(entries.find((e) => e.id === "deadrot:player-ranger-front")?.assetUrl).toBe(
      "https://cdn.deadrot.test/assets/sites/deadrotcom/public/sprites/player-ranger-front.webp",
    );
  });

  test("carries provenance and enriches from lore", () => {
    const { entries } = buildAssetIndex({
      catalogEntities: [],
      scourgeSprites: {
        "enemy-melee": {
          type: "sprite",
          views: { front: { path: "p.webp", dimensions: [128, 128] } },
          license: { tool: "gpt-image-2", date: "2026-06-05", kind: "AI sprite", scope: "runtime" },
        },
      },
      deadrotSpriteFiles: ["player-ranger-front.webp"],
      lore: LORE,
    });

    const runtime = entries.find((e) => e.id === "runtime:scourge-survivors:enemy-melee");
    expect(runtime?.provenance?.tool).toBe("gpt-image-2");
    expect(runtime?.faction).toBe("scourge");
    expect(runtime?.dimensions).toEqual([128, 128]);

    const ranger = entries.find((e) => e.id === "deadrot:player-ranger-front");
    expect(ranger?.name).toBe("Ranger");
    expect(ranger?.faction).toBe("the-pyre");
    expect(ranger?.kind).toBe("runtime-sprite");
  });
});
