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

test("register rejects blank (whitespace-only) license fields", async () => {
  // The desktop once shipped a truthiness-only copy of this check that let a
  // "   " plan through; the shared writer trims, so this must reject.
  const repo = await mkdtemp(join(tmpdir(), "assetgen-manifest-test-"));
  await assert.rejects(
    () =>
      register(join(repo, "assets.json"), {
        id: "blank-license",
        kind: "music",
        game: "shared",
        path: "audio/music/blank-license.webm",
        license: { tool: "ffmpeg", plan: "   ", date: "2026-06-08", kind: "music" },
      } as AssetEntry),
    /requires license.plan/,
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

// Symmetric to the desktop guard in apps/desktop/src/main/index-register.test.ts:
// every assetgen generator must write the manifest through the shared register(),
// never via an inline upsert — that is the issue #17 "no generator may skip
// register" guarantee for the assetgen side.
for (const generator of ["pipeline.ts", "matrix.ts"]) {
  test(`${generator} writes the manifest through the shared register()`, async () => {
    const source = await readFile(new URL(`./${generator}`, import.meta.url), "utf8");
    assert.match(source, /import \{[^}]*\bregister\b[^}]*\} from "\.\/manifest(\.ts)?"/);
    // No hand-rolled upsert (the fingerprint of a forked manifest writer).
    assert.doesNotMatch(source, /\.assets\.findIndex/);
  });
}
