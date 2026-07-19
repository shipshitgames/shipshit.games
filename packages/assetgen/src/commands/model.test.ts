import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { buildMinimalGlb } from "../glb-fixture.ts";
import { modelGenerateArgs, optimizeModelFile, registerModelFile } from "./model.ts";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length > 0) await rm(temps.pop()!, { recursive: true, force: true });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "assetgen-model-command-"));
  temps.push(root);
  return root;
}

test("model generate defaults to a staged model draft", () => {
  assert.deepEqual(modelGenerateArgs(["--id", "golem", "--prompt", "stone golem"]), [
    "--id",
    "golem",
    "--prompt",
    "stone golem",
    "--kind",
    "model",
    "--draft",
  ]);
  assert.deepEqual(modelGenerateArgs(["--id", "golem", "--prompt", "stone golem", "--publish"]), [
    "--id",
    "golem",
    "--prompt",
    "stone golem",
    "--kind",
    "model",
  ]);
});

test("model generate rejects unverifiable rig-source attribution", () => {
  assert.throws(
    () => modelGenerateArgs(["--id", "golem", "--prompt", "stone golem", "--rig", "mixamo"]),
    /derives rig provenance from its provider/,
  );
});

test("model optimize preserves the raw source and writes a hash-addressed trace report", async () => {
  const root = await tempRoot();
  const source = join(root, "source.glb");
  const output = join(root, "runtime.glb");
  await writeFile(source, buildMinimalGlb());

  const result = await optimizeModelFile({
    inputPath: source,
    outputPath: output,
    draco: false,
    now: () => new Date("2026-07-17T00:00:00.000Z"),
  });

  assert.equal(existsSync(source), true);
  assert.equal(existsSync(output), true);
  assert.equal(existsSync(result.reportPath), true);
  assert.equal(result.report.source.path, "source.glb");
  assert.equal(result.report.output.path, "runtime.glb");
  assert.equal(result.report.compression.draco, false);
  assert.match(result.report.source.sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.report.generatedAt, "2026-07-17T00:00:00.000Z");
});

test("model register verifies the optimization trace and writes the shared manifest contract", async () => {
  const root = await tempRoot();
  const source = join(root, "source.glb");
  const runtime = join(root, "runtime.glb");
  const repo = join(root, "game");
  await writeFile(source, buildMinimalGlb());
  await optimizeModelFile({ inputPath: source, outputPath: runtime, draco: false });

  const result = await registerModelFile({
    inputPath: runtime,
    repo,
    id: "stone-golem",
    game: "shared",
    provider: "mock",
    model: "mock-model",
    prompt: "a stone golem",
    licenseTerms: "internal prototype",
    licenseType: "ai-generated",
    rigSource: "mixamo",
    now: () => new Date("2026-07-17T00:00:00.000Z"),
  });

  assert.equal(existsSync(result.outputPath), true);
  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  const entry = manifest.assets[0];
  assert.equal(entry.id, "stone-golem");
  assert.equal(entry.kind, "model");
  assert.equal(entry.path, "models/stone-golem.glb");
  assert.equal(entry.optimized, true);
  assert.equal(entry.provider, "mock");
  assert.equal(entry.provenance.model, "mock-model");
  assert.equal(entry.license.terms, "internal prototype");
  assert.equal(entry.license.type, "ai-generated");
  assert.equal(entry.license.rig.rigged, true);
  assert.equal(entry.license.rig.source, "mixamo");
  assert.equal(entry.modelTrace.source, "sources/models/stone-golem.glb");
  assert.equal(existsSync(join(repo, "src/assets", entry.modelTrace.source)), true);
  assert.equal(existsSync(join(repo, "src/assets", entry.modelTrace.report)), true);
});

test("model register records static imported models without fabricating AI provenance", async () => {
  const root = await tempRoot();
  const source = join(root, "source.glb");
  const runtime = join(root, "runtime.glb");
  await writeFile(source, buildMinimalGlb({ rigged: false }));
  await optimizeModelFile({ inputPath: source, outputPath: runtime, draco: false });

  const result = await registerModelFile({
    inputPath: runtime,
    repo: join(root, "game"),
    id: "artist-model",
    game: "shared",
    provider: "blender",
    licenseTerms: "CC-BY-4.0",
    licenseType: "hand-authored",
  });

  assert.equal(result.entry.provenance, undefined);
  assert.equal(result.entry.license.type, "hand-authored");
  const rig = result.entry.license.rig;
  assert.ok(rig);
  assert.equal(rig.rigged, false);
  assert.equal(rig.source, "none");
});

test("model register rejects rig metadata that contradicts the optimized model", async () => {
  const root = await tempRoot();
  const source = join(root, "source.glb");
  const runtime = join(root, "runtime.glb");
  await writeFile(source, buildMinimalGlb({ rigged: false }));
  await optimizeModelFile({ inputPath: source, outputPath: runtime, draco: false });

  await assert.rejects(
    registerModelFile({
      inputPath: runtime,
      repo: join(root, "game"),
      id: "static-model",
      game: "shared",
      provider: "blender",
      licenseTerms: "internal prototype",
      rigSource: "mixamo",
    }),
    /contradicts the model's detected rig state/,
  );
});

test("model register rejects an optimized file that drifted from its trace report", async () => {
  const root = await tempRoot();
  const source = join(root, "source.glb");
  const runtime = join(root, "runtime.glb");
  await writeFile(source, buildMinimalGlb());
  await optimizeModelFile({ inputPath: source, outputPath: runtime, draco: false });
  await writeFile(runtime, Buffer.from("tampered"));

  await assert.rejects(
    registerModelFile({
      inputPath: runtime,
      repo: join(root, "game"),
      id: "tampered",
      game: "shared",
      provider: "mock",
      licenseTerms: "internal prototype",
    }),
    /no longer matches/,
  );
});

test("model register rejects ids that could escape the model asset directory", async () => {
  await assert.rejects(
    registerModelFile({
      inputPath: "/tmp/runtime.glb",
      repo: "/tmp/game",
      id: "../../escape",
      game: "shared",
      provider: "mock",
      licenseTerms: "internal prototype",
    }),
    /invalid model id/,
  );
});
