const { test, expect } = require("bun:test");
const path = require("node:path");

const { FALLBACK_GAME_SLUGS, readSharedGameSlugs } = require("../electron/game-slugs.cjs");

const STUDIO_REPO = path.join(__dirname, "..", "..", "..");

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
