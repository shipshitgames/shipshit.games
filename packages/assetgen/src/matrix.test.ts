import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { GAME_SLUGS, initAssetsPackage, seedAssetCatalog } from "./assets-package.ts";
import { runMatrixCommand } from "./commands/matrix.ts";
import { buildPrompt } from "./style.ts";

test("matrix bootstrap seeds the issue #6 variant row and shared assets", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "assetgen-matrix-seed-"));

  const result = await initAssetsPackage(assetsDir);
  assert.equal(result.created, true);
  assert.equal(existsSync(join(assetsDir, "assets-catalog.schema.json")), true);
  assert.equal(existsSync(join(assetsDir, "src/index.ts")), true);

  const catalog = JSON.parse(await readFile(join(assetsDir, "assets-catalog.json"), "utf8"));
  const swarm = catalog.entities.find((entity: any) => entity.id === "scourge-swarm");

  assert.ok(swarm);
  assert.equal(swarm.faction, "scourge");
  assert.equal(swarm.hostFamily, "rot-flesh");
  assert.deepEqual(swarm.games, ["scourge-survivors", "deadlane", "pactfall"]);
  assert.deepEqual(Object.keys(swarm.variants), [...GAME_SLUGS]);
  assert.deepEqual(Object.values(swarm.variants), GAME_SLUGS.map(() => null));

  assert.ok(catalog.shared.length >= 3);
  assert.equal(new Set(catalog.shared.map((entry: any) => entry.id)).size, catalog.shared.length);
  assert.equal(new Set(catalog.shared.map((entry: any) => entry.path)).size, catalog.shared.length);
  assert.equal(catalog.shared.some((entry: any) => entry.path.includes("/scourge-survivors/")), false);
  assert.equal(catalog.shared.some((entry: any) => entry.path.includes("/deadlane/")), false);
  assert.equal(catalog.shared.some((entry: any) => entry.path.includes("/pactfall/")), false);
});

test("matrix renders one canon Scourge row into FPS, TD, and MOBA variants", async () => {
  const assetsDir = await mkdtemp(join(tmpdir(), "assetgen-matrix-render-"));
  await initAssetsPackage(assetsDir);

  await runMatrixCommand([
    "--provider",
    "mock",
    "--id",
    "scourge-swarm",
    "--assets-dir",
    assetsDir,
    "--size",
    "64",
    "--usage-log",
    join(assetsDir, "usage.jsonl"),
  ]);

  const catalog = JSON.parse(await readFile(join(assetsDir, "assets-catalog.json"), "utf8"));
  const swarm = catalog.entities.find((entity: any) => entity.id === "scourge-swarm");

  assert.equal(swarm.variants["scourge-survivors"], "entities/scourge-swarm/scourge-survivors.webp");
  assert.equal(swarm.variants.deadlane, "entities/scourge-swarm/deadlane.webp");
  assert.equal(swarm.variants.pactfall, "entities/scourge-swarm/pactfall.webp");
  assert.equal(swarm.variants.starblight, null);
  assert.equal(swarm.variants.redline, null);
  assert.equal(swarm.variants.rothulk, null);

  for (const game of swarm.games) {
    assert.equal(existsSync(join(assetsDir, swarm.variants[game])), true);
  }

  assert.equal(catalog.shared.find((entry: any) => entry.id === "ui-breach-core-icon").game, undefined);
  assert.equal(catalog.shared.find((entry: any) => entry.id === "ui-breach-core-icon").path, "shared/ui/breach-core-icon.webp");

  // The usage log records one event per rendered cell, attributed to the
  // *requested* provider under the "matrix" command.
  const events = (await readFile(join(assetsDir, "usage.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(events.length, 3);
  for (const event of events) {
    assert.equal(event.command, "matrix");
    assert.equal(event.provider, "mock");
    assert.equal(event.kind, "sprite");
    assert.equal(event.id, "scourge-swarm");
    assert.equal(event.model, "mock");
    assert.equal(event.success, true);
    assert.ok(event.outputPath.endsWith(`/${event.game}.webp`));
  }
  assert.deepEqual(
    events.map((event: any) => event.game),
    ["scourge-survivors", "deadlane", "pactfall"],
  );
});

test("matrix prompt preserves lore parasite grammar and game framing", () => {
  const swarm = seedAssetCatalog().entities[0]!;
  const prompt = buildPrompt({ prompt: swarm.promptBase, game: "scourge-survivors", kind: "sprite" });

  assert.match(prompt, /Scourge melee swarm creature/);
  assert.match(prompt, /first-person game billboard sprite/);
  assert.match(prompt, /toxic-green/);
  assert.match(prompt, /parasite army wearing conquered host races/);
  assert.match(prompt, /never a standalone generic demon or alien/);
});
