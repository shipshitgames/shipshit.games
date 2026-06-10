import { describe, expect, test } from "bun:test";

import { transformLore, type RawLoreData } from "./lore";

const RAW: RawLoreData = {
  games: [
    {
      slug: "scourge-survivors",
      title: "Scourge Survivors",
      tagline: "Hold the breach.",
      genre: "FPS Survivors",
      factionSlug: "the-pyre",
      factionName: "The Pyre",
      accent: "hellfire",
      overview: "Burn it back.",
      features: [{ title: "Waves", desc: "Endless pressure." }],
      characterSlugs: ["ranger"],
      enemySlugs: ["swarm-ripper"],
    },
    {
      slug: "pactfall",
      title: "Pactfall",
      tagline: "The pact breaks.",
      genre: "MOBA",
      factionSlug: "",
      factionName: "Pyre vs Wardens",
      accent: "blood",
      overview: "Lanes.",
      features: [],
      characterSlugs: [],
      enemySlugs: [],
    },
  ],
  factions: [
    {
      slug: "the-pyre",
      name: "The Pyre",
      doctrine: "Purge",
      tagline: "Burn.",
      accent: "hellfire",
      overview: "Zealots.",
      playstyle: "Aggressive",
      rivalry: "Wardens hold; Pyre burns.",
      crestMotif: "Flame",
      gameSlugs: ["scourge-survivors"],
    },
  ],
  characters: [
    {
      slug: "ranger",
      name: "Ranger",
      factionSlug: "the-pyre",
      factionName: "The Pyre",
      role: "Balanced Purger",
      tagline: "Start here.",
      accent: "hellfire",
      overview: "Baseline.",
      gameplayRead: ["Medium armor"],
      visualMotifs: ["Scorched gunmetal"],
      appearsIn: ["scourge-survivors"],
      spriteBase: "player-ranger-front",
    },
  ],
  bestiary: [
    {
      slug: "swarm-ripper",
      name: "Swarm Ripper",
      tier: "fodder",
      tagline: "Claws.",
      accent: "toxic",
      overview: "Floods lanes.",
      gameplayRead: ["Melee"],
      visualMotifs: ["Chitin"],
      appearsIn: ["scourge-survivors"],
      spriteBase: "missing-sprite",
    },
  ],
  universe: {
    premise: "We lost the sky.",
    pillars: [{ title: "War", desc: "Everywhere." }],
    eras: [{ name: "Zero Day", blurb: "It began." }],
  },
};

const resolver = (base: string) =>
  base === "player-ranger-front" ? `/sprites/deadrot/${base}.webp` : null;

describe("transformLore", () => {
  test("transforms games and normalizes empty factionSlug to null", () => {
    const lore = transformLore(RAW, resolver);
    expect(lore.games).toHaveLength(2);
    expect(lore.games[0].factionSlug).toBe("the-pyre");
    expect(lore.games[1].factionSlug).toBeNull();
  });

  test("resolves sprite paths and tolerates missing sprites", () => {
    const lore = transformLore(RAW, resolver);
    expect(lore.characters[0].spritePath).toBe("/sprites/deadrot/player-ranger-front.webp");
    expect(lore.bestiary[0].spritePath).toBeNull();
  });

  test("derives faction character rosters", () => {
    const lore = transformLore(RAW, resolver);
    expect(lore.factions[0].characterSlugs).toEqual(["ranger"]);
  });

  test("rejects games referencing unknown characters", () => {
    const broken = structuredClone(RAW);
    broken.games[0].characterSlugs = ["ghost"];
    expect(() => transformLore(broken, resolver)).toThrow(/unknown character "ghost"/);
  });

  test("rejects unknown accents", () => {
    const broken = structuredClone(RAW);
    broken.games[0].accent = "neon";
    expect(() => transformLore(broken, resolver)).toThrow(/unknown accent "neon"/);
  });
});
