import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import { register } from "./manifest";
import type { AssetEntry } from "./manifest";

test("register requires license provenance fields", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-manifest-test-"));
  await assert.rejects(
    () =>
      register(join(repo, "assets.json"), {
        id: "missing-license",
        kind: "sprite",
        game: "shared",
        path: "sprites/missing-license.webp",
      } as AssetEntry),
    /requires license.tool/,
  );
});

test("register upserts entries with license provenance", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-manifest-test-"));
  const manifestPath = join(repo, "assets.json");
  await register(manifestPath, {
    id: "husk",
    kind: "sprite",
    game: "scourge-survivors",
    path: "sprites/husk.webp",
    provider: "mock",
    license: { tool: "mock", plan: "mock", date: "2026-06-07", kind: "sprite" },
  });
  await register(manifestPath, {
    id: "husk",
    kind: "sprite",
    game: "scourge-survivors",
    path: "sprites/husk-v2.webp",
    provider: "codex",
    license: { tool: "codex", plan: "codex-cli", date: "2026-06-07", kind: "sprite" },
  });

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.assets.length, 1);
  assert.equal(manifest.assets[0].path, "sprites/husk-v2.webp");
  assert.deepEqual(manifest.assets[0].license, {
    tool: "codex",
    plan: "codex-cli",
    date: "2026-06-07",
    kind: "sprite",
  });
});
