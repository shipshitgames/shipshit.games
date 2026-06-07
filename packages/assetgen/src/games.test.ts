import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import { GAME_SLUGS, discoverGameTargets, runGamesDiscovery } from "./games";

async function writeGame(gamesRoot: string, slug: string, constantsPath: string): Promise<void> {
  const root = join(gamesRoot, slug);
  await mkdir(join(root, "src", "game"), { recursive: true });
  await writeFile(join(root, constantsPath), "export const COLORS = {};\n");
  await writeFile(join(root, "src", "styles.css"), ":root {}\n");
}

async function writeFixtureGames(root: string): Promise<string> {
  const gamesRoot = join(root, "apps", "games");
  for (const slug of ["scourge-survivors", "pactfall", "starblight"]) {
    await writeGame(gamesRoot, slug, "src/game/constants.ts");
  }
  for (const slug of ["deadlane", "redline", "rothulk"]) {
    await writeGame(gamesRoot, slug, "src/constants.ts");
  }
  return gamesRoot;
}

test("discovers every game token target without assuming one constants path", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-games-test-"));
  const gamesRoot = await writeFixtureGames(root);

  const games = discoverGameTargets(gamesRoot);

  assert.deepEqual(
    games.map((game) => game.slug),
    [...GAME_SLUGS],
  );
  assert.equal(games.find((game) => game.slug === "scourge-survivors")?.constantsPath, "src/game/constants.ts");
  assert.equal(games.find((game) => game.slug === "pactfall")?.constantsPath, "src/game/constants.ts");
  assert.equal(games.find((game) => game.slug === "starblight")?.constantsPath, "src/game/constants.ts");
  assert.equal(games.find((game) => game.slug === "deadlane")?.constantsPath, "src/constants.ts");
  assert.equal(games.find((game) => game.slug === "redline")?.constantsPath, "src/constants.ts");
  assert.equal(games.find((game) => game.slug === "rothulk")?.constantsPath, "src/constants.ts");
  for (const game of games) {
    assert.equal(game.stylesPath, "src/styles.css");
    assert.equal(game.fontTarget, "src/fonts.css");
  }
});

test("writes games.json into the assets package and supports drift checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-games-test-"));
  const gamesRoot = await writeFixtureGames(root);
  const assetsDir = join(root, "packages", "assets");
  await mkdir(assetsDir, { recursive: true });

  const written = await runGamesDiscovery({ assetsDir, gamesRoot });
  assert.equal(written.drift, false);
  assert.equal(existsSync(join(assetsDir, "games.json")), true);

  const manifest = JSON.parse(await readFile(join(assetsDir, "games.json"), "utf8"));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.generatedBy, "@shipshitgames/assetgen games");
  assert.equal(manifest.gamesRoot, "../../apps/games");
  assert.equal(manifest.games.length, 6);

  const current = await runGamesDiscovery({ assetsDir, gamesRoot, check: true });
  assert.equal(current.drift, false);

  await writeFile(join(assetsDir, "games.json"), "{}\n");
  const drifted = await runGamesDiscovery({ assetsDir, gamesRoot, check: true });
  assert.equal(drifted.drift, true);
});
