import { mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import { runGenerate } from "./commands/generate";

test("generate --provider mock writes a webp and upserts assets.json", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-generate-test-"));
  const usageLog = join(repo, "usage.jsonl");

  await runGenerate([
    "--provider",
    "mock",
    "--dry-run",
    "--id",
    "swarm-husk",
    "--prompt",
    "a parasite-taken Scourge host",
    "--game",
    "scourge-survivors",
    "--kind",
    "sprite",
    "--size",
    "128",
    "--repo",
    repo,
    "--usage-log",
    usageLog,
  ]);

  const assetPath = join(repo, "src/assets/sprites/swarm-husk.webp");
  const manifestPath = join(repo, "src/assets/assets.json");
  assert.equal(existsSync(assetPath), true);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.assets.length, 1);
  assert.deepEqual(manifest.assets[0], {
    id: "swarm-husk",
    kind: "sprite",
    game: "scourge-survivors",
    path: "sprites/swarm-husk.webp",
    prompt: "a parasite-taken Scourge host",
    provider: "mock",
    license: {
      tool: "mock",
      plan: "mock",
      date: manifest.assets[0].license.date,
      kind: "sprite",
    },
  });
  assert.match(manifest.assets[0].license.date, /^\d{4}-\d{2}-\d{2}$/);

  const usage = JSON.parse(await readFile(usageLog, "utf8"));
  assert.equal(usage.command, "generate");
  assert.equal(usage.provider, "mock");
  assert.equal(usage.kind, "sprite");
  assert.equal(usage.id, "swarm-husk");
  assert.equal(usage.success, true);
  assert.equal(typeof usage.promptHash, "string");
  assert.equal(usage.prompt, undefined);
});
