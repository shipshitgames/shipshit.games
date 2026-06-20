import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));

async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "src/cli.ts", ...args], {
    cwd: pkgDir,
    // No provider keys: the keyless mock provider must serve the whole run.
    env: { ...process.env, SHIPSHIT_ASSETGEN_USAGE_LOG: "off" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

test("e2e: generate --draft stages a sprite without touching production; promote publishes it", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-draft-promote-e2e-"));
  try {
    const gen = await runCli([
      "generate",
      "--id", "swarm-husk",
      "--prompt", "a parasite-taken Scourge host",
      "--kind", "sprite",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--size", "64",
      "--draft",
    ]);
    assert.equal(gen.exitCode, 0, `generate --draft failed\nstdout:\n${gen.stdout}\nstderr:\n${gen.stderr}`);
    assert.match(gen.stdout, /\[draft\] staged/);

    const draftManifestPath = join(repo, "src/assets/drafts/drafts.json");
    const prodManifestPath = join(repo, "src/assets/assets.json");

    // Read the staged entry and derive the relative paths from it rather than
    // hardcoding the sprite preview naming convention.
    const draftManifest = JSON.parse(await readFile(draftManifestPath, "utf8"));
    assert.equal(draftManifest.assets.length, 1);
    const entry = draftManifest.assets[0];
    assert.equal(entry.id, "swarm-husk");
    assert.equal(entry.path, "sprites/swarm-husk.webp");
    assert.ok(typeof entry.preview === "string" && entry.preview.length > 0, "sprite draft must record a preview sidecar");

    const draftAsset = join(repo, "src/assets/drafts", entry.path);
    const draftPreview = join(repo, "src/assets/drafts", entry.preview);
    const prodAsset = join(repo, "src/assets", entry.path);
    const prodPreview = join(repo, "src/assets", entry.preview);

    // Staged under drafts/, production tree untouched.
    assert.equal(existsSync(draftAsset), true, "draft asset must be staged under drafts/");
    assert.equal(existsSync(draftPreview), true, "draft sprite billboard sidecar must be staged too");
    assert.equal(existsSync(prodAsset), false, "draft must NOT write the production asset");
    assert.equal(existsSync(prodManifestPath), false, "draft must NOT write the production manifest");

    // Promote.
    const promote = await runCli(["promote", "--id", "swarm-husk", "--game", "shared", "--repo", repo]);
    assert.equal(promote.exitCode, 0, `promote failed\nstdout:\n${promote.stdout}\nstderr:\n${promote.stderr}`);
    assert.match(promote.stdout, /\[promote\] published 1 asset/);

    // Files moved into the production tree; staging emptied.
    assert.equal(existsSync(prodAsset), true, "promote must move the asset into production");
    assert.equal(existsSync(prodPreview), true, "promote must move the billboard sidecar into production");
    assert.equal(existsSync(draftAsset), false, "promote must remove the staged asset");
    assert.equal(existsSync(draftPreview), false, "promote must remove the staged sidecar");

    const prodManifest = JSON.parse(await readFile(prodManifestPath, "utf8"));
    assert.equal(prodManifest.assets.length, 1);
    assert.equal(prodManifest.assets[0].id, "swarm-husk");
    assert.equal(prodManifest.assets[0].kind, "sprite");
    assert.equal(prodManifest.assets[0].path, "sprites/swarm-husk.webp");
    assert.equal(prodManifest.assets[0].provider, "mock");

    const draftsAfter = JSON.parse(await readFile(draftManifestPath, "utf8"));
    assert.equal(draftsAfter.assets.length, 0, "promoted draft must be pruned from drafts.json");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

async function stageDraft(repo: string, id: string, kind = "texture"): Promise<void> {
  const gen = await runCli([
    "generate",
    "--id", id,
    "--prompt", `${id} ${kind}`,
    "--kind", kind,
    "--provider", "mock",
    "--game", "shared",
    "--repo", repo,
    "--usage-log", "off",
    "--size", "64",
    "--draft",
  ]);
  assert.equal(gen.exitCode, 0, `generate --draft ${id} failed\n${gen.stderr}`);
}

async function promotedIds(repo: string): Promise<string[]> {
  const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
  return manifest.assets.map((e: { id: string }) => e.id).sort();
}

test("e2e: generate without --draft still writes production directly (opt-in, no regression)", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-draft-off-e2e-"));
  try {
    const gen = await runCli([
      "generate",
      "--id", "warden-pyre",
      "--prompt", "a warden pyre icon",
      "--kind", "icon",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--size", "64",
    ]);
    assert.equal(gen.exitCode, 0, `generate failed\nstdout:\n${gen.stdout}\nstderr:\n${gen.stderr}`);

    assert.equal(existsSync(join(repo, "src/assets/icons/warden-pyre.webp")), true);
    assert.equal(
      existsSync(join(repo, "src/assets/drafts/drafts.json")),
      false,
      "non-draft generate must not create a drafts manifest",
    );
    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    assert.equal(manifest.assets.length, 1);
    assert.equal(manifest.assets[0].id, "warden-pyre");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: promote --all publishes every staged draft", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-promote-all-e2e-"));
  try {
    for (const id of ["alpha", "beta"]) {
      const gen = await runCli([
        "generate",
        "--id", id,
        "--prompt", `${id} texture`,
        "--kind", "texture",
        "--provider", "mock",
        "--game", "shared",
        "--repo", repo,
        "--usage-log", "off",
        "--size", "64",
        "--draft",
      ]);
      assert.equal(gen.exitCode, 0, `generate --draft ${id} failed\n${gen.stderr}`);
    }

    const promote = await runCli(["promote", "--all", "--game", "shared", "--repo", repo]);
    assert.equal(promote.exitCode, 0, `promote --all failed\n${promote.stderr}`);

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    assert.deepEqual(manifest.assets.map((e: { id: string }) => e.id).sort(), ["alpha", "beta"]);
    const drafts = JSON.parse(await readFile(join(repo, "src/assets/drafts/drafts.json"), "utf8"));
    assert.equal(drafts.assets.length, 0);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: promote --id a,b promotes a comma-separated list", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-promote-comma-e2e-"));
  try {
    await stageDraft(repo, "alpha");
    await stageDraft(repo, "beta");

    const promote = await runCli(["promote", "--id", "alpha,beta", "--game", "shared", "--repo", repo]);
    assert.equal(promote.exitCode, 0, `promote --id alpha,beta failed\n${promote.stderr}`);

    assert.deepEqual(await promotedIds(repo), ["alpha", "beta"]);
    const drafts = JSON.parse(await readFile(join(repo, "src/assets/drafts/drafts.json"), "utf8"));
    assert.equal(drafts.assets.length, 0);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: promote --id a --id b promotes via repeated flags", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-promote-repeated-e2e-"));
  try {
    await stageDraft(repo, "alpha");
    await stageDraft(repo, "beta");

    const promote = await runCli([
      "promote",
      "--id", "alpha",
      "--id", "beta",
      "--game", "shared",
      "--repo", repo,
    ]);
    assert.equal(promote.exitCode, 0, `promote --id alpha --id beta failed\n${promote.stderr}`);

    assert.deepEqual(await promotedIds(repo), ["alpha", "beta"]);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: a missing staged file aborts the whole batch before any move", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-promote-partial-e2e-"));
  try {
    await stageDraft(repo, "alpha");
    await stageDraft(repo, "beta");
    // Corrupt the staging: delete alpha's staged file after staging.
    await rm(join(repo, "src/assets/drafts/textures/alpha.webp"), { force: true });

    const promote = await runCli(["promote", "--id", "alpha,beta", "--game", "shared", "--repo", repo]);
    assert.equal(promote.exitCode, 1);
    assert.match(promote.stderr, /file\(s\) missing/);

    // Pre-flight aborted: nothing moved, nothing registered, both drafts intact.
    assert.equal(existsSync(join(repo, "src/assets/assets.json")), false, "no production manifest on a failed batch");
    assert.equal(existsSync(join(repo, "src/assets/textures/beta.webp")), false, "beta must not have moved");
    const drafts = JSON.parse(await readFile(join(repo, "src/assets/drafts/drafts.json"), "utf8"));
    assert.deepEqual(drafts.assets.map((e: { id: string }) => e.id).sort(), ["alpha", "beta"]);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: promote --all on an empty staging area exits 0 with a friendly message", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-promote-empty-e2e-"));
  try {
    const promote = await runCli(["promote", "--all", "--game", "shared", "--repo", repo]);
    assert.equal(promote.exitCode, 0, `promote --all on empty staging failed\n${promote.stderr}`);
    assert.match(promote.stdout, /no staged drafts/);
    assert.equal(existsSync(join(repo, "src/assets/assets.json")), false);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: promote with an unknown id fails clearly", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-promote-unknown-e2e-"));
  try {
    const promote = await runCli(["promote", "--id", "nope", "--game", "shared", "--repo", repo]);
    assert.equal(promote.exitCode, 1);
    assert.match(promote.stderr, /no staged draft for id/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: promote with no selection prints usage and exits non-zero", async () => {
  const promote = await runCli(["promote"]);
  assert.equal(promote.exitCode, 1);
  assert.match(promote.stderr, /usage:[\s\S]*assetgen promote/);
});

test("e2e: generate usage banner advertises --draft", async () => {
  const gen = await runCli(["generate"]);
  assert.equal(gen.exitCode, 1);
  assert.match(gen.stderr, /--draft/);
});
