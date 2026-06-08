import { mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";

import { runGenerate } from "./commands/generate";

test("generate --provider mock writes a sprite webp, preview, and manifest metadata", async () => {
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
  const previewPath = join(repo, "src/assets/previews/swarm-husk-billboard.html");
  const manifestPath = join(repo, "src/assets/assets.json");
  assert.equal(existsSync(assetPath), true);
  assert.equal(existsSync(previewPath), true);

  const image = await sharp(assetPath).metadata();
  assert.equal(image.width, 128);
  assert.equal(image.height, 128);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.assets.length, 1);
  // Unified entry: sprite geometry + the shared pipeline's required license
  // provenance (tool/plan/date/kind) plus AI-generation disclosure.
  assert.deepEqual(manifest.assets[0], {
    id: "swarm-husk",
    kind: "sprite",
    game: "scourge-survivors",
    path: "sprites/swarm-husk.webp",
    prompt: "a parasite-taken Scourge host",
    provider: "mock",
    model: "mock",
    dimensions: [128, 128],
    frameSize: [128, 128],
    frames: 1,
    anchor: [0.5, 1],
    scale: 1,
    views: ["front"],
    sheet: {
      columns: 1,
      rows: 1,
      usedColumns: 1,
      usedRows: 1,
    },
    preview: "previews/swarm-husk-billboard.html",
    license: {
      tool: "mock",
      plan: "mock",
      date: manifest.assets[0].license.date,
      kind: "sprite",
      type: "ai-generated",
      terms: "review required before shipping",
      generatedAt: manifest.assets[0].license.generatedAt,
    },
  });
  assert.match(manifest.assets[0].license.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(manifest.assets[0].license.generatedAt, /^\d{4}-\d{2}-\d{2}T/);

  const usage = JSON.parse(await readFile(usageLog, "utf8"));
  assert.equal(usage.command, "generate");
  assert.equal(usage.provider, "mock");
  assert.equal(usage.kind, "sprite");
  assert.equal(usage.id, "swarm-husk");
  assert.equal(usage.success, true);
  assert.equal(typeof usage.promptHash, "string");
  assert.equal(usage.prompt, undefined);
});

test("generate records multi-view animation sheets as sprite-anim entries", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-generate-anim-test-"));

  await runGenerate([
    "--provider",
    "mock",
    "--dry-run",
    "--id",
    "warden-run",
    "--prompt",
    "a Warden bastion sprint cycle",
    "--game",
    "scourge-survivors",
    "--kind",
    "sprite",
    "--size",
    "128",
    "--repo",
    repo,
    "--views",
    "front,side,back",
    "--frames",
    "4",
    "--fps",
    "12",
    "--scale",
    "1.5",
    "--license",
    "internal prototype only",
    "--usage-log",
    "off",
  ]);

  const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
  assert.equal(manifest.assets[0].kind, "sprite-anim");
  assert.deepEqual(manifest.assets[0].dimensions, [128, 128]);
  assert.deepEqual(manifest.assets[0].frameSize, [32, 32]);
  assert.deepEqual(manifest.assets[0].views, ["front", "side", "back"]);
  assert.deepEqual(manifest.assets[0].sheet, {
    columns: 4,
    rows: 4,
    usedColumns: 4,
    usedRows: 3,
  });
  assert.equal(manifest.assets[0].frames, 4);
  assert.equal(manifest.assets[0].fps, 12);
  assert.equal(manifest.assets[0].scale, 1.5);
  // License provenance is always present; disclosure terms come from --license.
  assert.equal(manifest.assets[0].license.tool, "mock");
  assert.equal(manifest.assets[0].license.kind, "sprite");
  assert.equal(manifest.assets[0].license.type, "ai-generated");
  assert.equal(manifest.assets[0].license.terms, "internal prototype only");
  assert.equal(existsSync(join(repo, "src/assets/previews/warden-run-billboard.html")), true);
});
