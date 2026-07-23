import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildMinimalGlb } from "../src/glb-fixture.ts";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const GLB_MAGIC = 0x46546c67; // "glTF"
const MODEL_E2E_RUNNER_VERBS = new Set(["generate", "model"]);

function assertModelE2eRunnerArgs(args: string[]): void {
  if (!args[0] || !MODEL_E2E_RUNNER_VERBS.has(args[0])) {
    throw new Error("model E2E test runner requires an explicit generate or model command verb");
  }
}

async function runCli(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  assertModelE2eRunnerArgs(args);
  const proc = Bun.spawn(["bun", "src/cli.ts", ...args], {
    cwd: pkgDir,
    env: { ...process.env, ...env },
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

function assertGlbMagic(data: Buffer, label: string): void {
  assert.equal(data.readUInt32LE(0), GLB_MAGIC, `${label} missing GLB magic`);
}

test("model E2E test runner rejects calls without an explicit command verb", () => {
  assert.throws(
    () => assertModelE2eRunnerArgs(["--id", "missing-verb"]),
    /test runner requires an explicit generate or model command verb/,
  );
});

test("e2e: model generate stages a reviewable draft by default", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-model-e2e-command-"));
  try {
    const result = await runCli([
      "model",
      "generate",
      "--id",
      "e2e-draft-golem",
      "--prompt",
      "a stone golem",
      "--provider",
      "mock",
      "--repo",
      repo,
      "--usage-log",
      "off",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.equal(existsSync(join(repo, "src/assets/drafts/models/e2e-draft-golem.glb")), true);
    const drafts = JSON.parse(await readFile(join(repo, "src/assets/drafts/drafts.json"), "utf8"));
    assert.equal(drafts.assets[0].id, "e2e-draft-golem");
    assert.equal(drafts.assets[0].kind, "model");
    assert.equal(drafts.assets[0].provider, "mock");
    assert.match(drafts.assets[0].provenance.promptHash, /^[0-9a-f]{16}$/);
    assert.equal(existsSync(join(repo, "src/assets/assets.json")), false);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: mock model generation optimizes the GLB and records model metadata", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-model-e2e-mock-"));
  try {
    const result = await runCli([
      "generate",
      "--id", "e2e-golem",
      "--prompt", "a hulking stone golem",
      "--kind", "model",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const assetPath = join(repo, "src/assets/models/e2e-golem.glb");
    assert.equal(existsSync(assetPath), true);
    const glb = await readFile(assetPath);
    assertGlbMagic(glb, "model output");
    assert.ok(glb.includes(Buffer.from("KHR_draco_mesh_compression")), "optimize should apply Draco");

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    const entry = manifest.assets[0];
    assert.equal(entry.kind, "model");
    assert.equal(entry.path, "models/e2e-golem.glb");
    assert.equal(entry.optimized, true);
    assert.equal(entry.compression.draco, true);
    assert.equal(entry.compression.textureFormat, "none");
    assert.deepEqual(entry.animations, ["idle"]);
    assert.equal(entry.skins, 1);
    assert.equal(entry.joints, 1);
    assert.equal(entry.license.kind, "model");
    assert.equal(entry.license.type, "ai-generated");
    assert.equal(entry.license.rig.rigged, true);
    assert.deepEqual(entry.license.rig.animations, ["idle"]);
    assert.equal(entry.modelTrace.source, "sources/models/e2e-golem.glb");
    assert.equal(entry.modelTrace.report, "sources/models/e2e-golem.optimize.json");
    assert.equal(existsSync(join(repo, "src/assets", entry.modelTrace.source)), true);
    assert.equal(existsSync(join(repo, "src/assets", entry.modelTrace.report)), true);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: selected project routes model output to its shared assets package", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "assetgen-model-e2e-project-"));
  try {
    const result = await runCli(
      [
        "generate",
        "--id",
        "project-golem",
        "--prompt",
        "a project-scoped stone golem",
        "--kind",
        "model",
        "--provider",
        "mock",
        "--game",
        "shared",
        "--usage-log",
        "off",
      ],
      { ASSETGEN_PROJECT_ROOT: projectRoot },
    );
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const assetsRoot = join(projectRoot, "packages/assets");
    assert.equal(existsSync(join(assetsRoot, "models/project-golem.glb")), true);
    assert.equal(existsSync(join(assetsRoot, "sources/models/project-golem.glb")), true);
    const manifest = JSON.parse(await readFile(join(assetsRoot, "assets.json"), "utf8"));
    assert.equal(manifest.assets[0].path, "models/project-golem.glb");
    assert.equal(existsSync(join(projectRoot, "src/assets/assets.json")), false);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("e2e: --no-draco leaves geometry uncompressed", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-model-e2e-nodraco-"));
  try {
    const result = await runCli([
      "generate",
      "--id", "e2e-static",
      "--prompt", "a crate",
      "--kind", "model",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--no-draco",
    ]);
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const glb = await readFile(join(repo, "src/assets/models/e2e-static.glb"));
    assertGlbMagic(glb, "model output");
    assert.ok(!glb.includes(Buffer.from("KHR_draco_mesh_compression")), "Draco should be skipped");

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    assert.equal(manifest.assets[0].compression.draco, false);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: model generate rejects unverifiable rig-source attribution", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-model-e2e-rig-"));
  try {
    const result = await runCli([
      "model",
      "generate",
      "--id", "e2e-rigged-hero",
      "--prompt", "an armored hero",
      "--kind", "model",
      "--provider", "mock",
      "--game", "shared",
      "--repo", repo,
      "--usage-log", "off",
      "--rig", "mixamo",
    ]);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /derives rig provenance from its provider/);
    assert.equal(existsSync(join(repo, "src/assets/assets.json")), false);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: a static (unrigged) model records rig.source=none and rigged=false", async () => {
  // Serve a deliberately unrigged GLB so the optimize reads skins=0 and the rig
  // provenance falls back to the static "none" source with no animations.
  const glb = buildMinimalGlb({ rigged: false });
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "POST" && url.pathname === "/openapi/v2/text-to-3d") {
        return Response.json({ result: "task-static" });
      }
      if (url.pathname === "/openapi/v2/text-to-3d/task-static") {
        return Response.json({ status: "SUCCEEDED", model_urls: { glb: `${url.origin}/static.glb` } });
      }
      if (url.pathname === "/static.glb") {
        return new Response(new Uint8Array(glb), { headers: { "content-type": "model/gltf-binary" } });
      }
      return new Response("not found", { status: 404 });
    },
  });
  const repo = await mkdtemp(join(tmpdir(), "assetgen-model-e2e-static-"));
  try {
    const result = await runCli(
      [
        "generate",
        "--id", "e2e-static-prop",
        "--prompt", "a wooden crate",
        "--kind", "model",
        "--provider", "meshy",
        "--game", "shared",
        "--repo", repo,
        "--usage-log", "off",
      ],
      { MESHY_API_KEY: "test-key", MESHY_API_BASE_URL: server.url.origin },
    );
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    const entry = manifest.assets[0];
    assert.equal(entry.license.rig.rigged, false);
    assert.equal(entry.license.rig.source, "none");
    assert.equal(entry.skins, 0);
    assert.deepEqual(entry.license.rig.animations, []);
    assert.deepEqual(entry.animations, []);
  } finally {
    server.stop(true);
    await rm(repo, { recursive: true, force: true });
  }
});

test("e2e: meshy provider drives a create→poll→download task to an optimized model", async () => {
  const glb = buildMinimalGlb({ animationName: "idle" });
  let polls = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "POST" && url.pathname === "/openapi/v2/text-to-3d") {
        return Response.json({ result: "task-1" });
      }
      if (url.pathname === "/openapi/v2/text-to-3d/task-1") {
        polls += 1;
        if (polls < 2) return Response.json({ status: "IN_PROGRESS", progress: 50 });
        return Response.json({ status: "SUCCEEDED", model_urls: { glb: `${url.origin}/model.glb` } });
      }
      if (url.pathname === "/model.glb") {
        return new Response(new Uint8Array(glb), { headers: { "content-type": "model/gltf-binary" } });
      }
      return new Response("not found", { status: 404 });
    },
  });
  const repo = await mkdtemp(join(tmpdir(), "assetgen-model-e2e-meshy-"));
  try {
    const result = await runCli(
      [
        "generate",
        "--id", "e2e-meshy-golem",
        "--prompt", "a stone golem",
        "--kind", "model",
        "--provider", "meshy",
        "--game", "shared",
        "--repo", repo,
        "--usage-log", "off",
      ],
      { MESHY_API_KEY: "test-key", MESHY_API_BASE_URL: server.url.origin },
    );
    assert.equal(result.exitCode, 0, `cli failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assert.ok(polls >= 2, `expected polling, saw ${polls}`);

    const glbPath = join(repo, "src/assets/models/e2e-meshy-golem.glb");
    assert.equal(existsSync(glbPath), true);
    assertGlbMagic(await readFile(glbPath), "meshy model output");

    const manifest = JSON.parse(await readFile(join(repo, "src/assets/assets.json"), "utf8"));
    const entry = manifest.assets[0];
    assert.equal(entry.provider, "meshy");
    assert.equal(entry.optimized, true);
    assert.deepEqual(entry.animations, ["idle"]);
    assert.equal(entry.license.rig.source, "meshy");
  } finally {
    server.stop(true);
    await rm(repo, { recursive: true, force: true });
  }
});
