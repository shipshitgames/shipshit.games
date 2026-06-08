import { test, expect } from "bun:test";
import path from "node:path";

import { FALLBACK_GAME_SLUGS, readSharedGameSlugs } from "./game-slugs";

// From apps/desktop/src/main, four levels up is the monorepo root (the shared
// game catalog the loader reads lives at packages/shared/src/games.json).
const STUDIO_REPO = path.join(__dirname, "..", "..", "..", "..");

test("loads all canonical game slugs from the shared catalog", () => {
  expect(readSharedGameSlugs(STUDIO_REPO)).toEqual([
    "scourge-survivors",
    "deadlane",
    "pactfall",
    "starblight",
    "redline",
    "rothulk",
  ]);
});

test("falls back to the full six-game slug list when shared catalog is unavailable", () => {
  expect(readSharedGameSlugs(path.join(__dirname, "missing"))).toEqual([
    ...FALLBACK_GAME_SLUGS,
  ]);
});
