import { mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GAME_ASSET_PIPELINE_STEPS,
  defaultPostprocess,
  describeAssetPipeline,
  generateOne,
  runAssetPipeline,
  withUsageAccounting,
} from "./pipeline";
import { promptHash, styleSuffixHash } from "./provenance";
import { STYLE_SUFFIX } from "./style";

test("runAssetPipeline enforces the five-step contract and returns a hot preview", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-pipeline-test-"));
  const startedSteps: string[] = [];
  let hookCalled = false;

  const result = await runAssetPipeline({
    id: "pipeline-husk",
    prompt: "a parasite-taken Scourge host",
    game: "scourge-survivors",
    kind: "sprite",
    provider: "mock",
    size: 96,
    outputRoot: join(repo, "src/assets"),
    usageLogPath: "off",
    includePreviewDataUrl: true,
    now: () => new Date("2026-06-07T12:00:00.000Z"),
    onStep: (event) => {
      if (event.status === "start") startedSteps.push(event.step);
    },
    postprocess: async (asset, context) => {
      hookCalled = true;
      return defaultPostprocess(asset, context);
    },
  });

  assert.deepEqual(startedSteps, [...GAME_ASSET_PIPELINE_STEPS]);
  assert.equal(hookCalled, true);
  assert.equal(result.relPath, "sprites/pipeline-husk.webp");
  assert.equal(result.preview.mediaType, "image/webp");
  assert.match(result.preview.dataUrl ?? "", /^data:image\/webp;base64,/);
  assert.equal(existsSync(result.outputPath), true);
  assert.equal(result.entry.colorGrade, undefined);

  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  assert.deepEqual(manifest.assets[0].license, {
    tool: "mock",
    plan: "mock",
    date: "2026-06-07",
    kind: "sprite",
  });
});

test("runAssetPipeline soft grade writes a linked non-blocking gamut report", async () => {
  const repo = await mkdtemp(join(tmpdir(), "assetgen-pipeline-grade-test-"));
  const outputRoot = join(repo, "src/assets");
  const result = await runAssetPipeline({
    id: "graded-icon",
    prompt: "a cold blue industrial icon",
    game: "shared",
    kind: "icon",
    provider: "mock",
    size: 64,
    outputRoot,
    usageLogPath: "off",
    softGrade: true,
  });

  assert.deepEqual({ ...result.entry.colorGrade, outOfGamutRatio: undefined, material: undefined }, {
    applied: true,
    advisory: true,
    blocking: false,
    report: "reports/graded-icon.color-gamut.json",
    outOfGamutRatio: undefined,
    material: undefined,
  });
  assert.ok(result.entry.colorGrade!.outOfGamutRatio >= 0 && result.entry.colorGrade!.outOfGamutRatio <= 1);
  assert.equal(typeof result.entry.colorGrade!.material, "boolean");
  const report = JSON.parse(await readFile(join(outputRoot, result.entry.colorGrade!.report), "utf8"));
  assert.equal(report.advisory, true);
  assert.equal(report.blocking, false);
  assert.deepEqual(report.dimensions, [64, 64]);
});

test("generateOne reports the selected provider/model before postprocess runs", async () => {
  const order: string[] = [];
  let reported: { provider: string; model?: string } | undefined;

  const result = await generateOne({
    id: "core-husk",
    prompt: "a parasite-taken Scourge host",
    game: "scourge-survivors",
    kind: "sprite",
    provider: "mock",
    size: 64,
    onGenerated: (asset) => {
      order.push("onGenerated");
      reported = { provider: asset.provider, model: asset.model };
    },
    postprocess: async (asset, context) => {
      order.push("postprocess");
      return defaultPostprocess(asset, context);
    },
  });

  assert.deepEqual(order, ["onGenerated", "postprocess"]);
  assert.deepEqual(reported, { provider: "mock", model: "mock" });
  assert.equal(result.generated.provider, "mock");
  assert.equal(result.optimized.mediaType, "image/webp");
  assert.match(result.fullPrompt, /parasite-taken Scourge host/);
  assert.equal(result.context.kind, "sprite");

  // Constraint #6: provenance hashes the RAW user prompt, never the sprite/style-
  // augmented fullPrompt. The two diverge (fullPrompt wraps the raw prompt in the
  // STYLE canon), so pinning exact values makes feeding fullPrompt here fail loudly
  // instead of passing a bare 16-hex shape check.
  assert.equal(result.provenance.promptHash, promptHash("a parasite-taken Scourge host"));
  assert.notEqual(result.provenance.promptHash, promptHash(result.fullPrompt));
  // styleSuffixHash is the canon style string for image kinds (empty only for audio).
  assert.equal(result.provenance.styleSuffixHash, styleSuffixHash(STYLE_SUFFIX));
});

test("withUsageAccounting writes a success event with settle-time mutations applied", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-usage-acct-"));
  const usageLog = join(dir, "usage.jsonl");
  let model: string | undefined;

  const value = await withUsageAccounting(
    {
      usageLogPath: usageLog,
      logStyle: "line",
      event: () => ({ command: "matrix", provider: "mock", kind: "sprite", model }),
    },
    async () => {
      model = "mock-v2";
      return 42;
    },
  );

  assert.equal(value, 42);
  const event = JSON.parse((await readFile(usageLog, "utf8")).trim());
  assert.equal(event.success, true);
  assert.equal(event.provider, "mock");
  assert.equal(event.model, "mock-v2");
  assert.equal(typeof event.durationMs, "number");
});

test("withUsageAccounting rethrows failures after recording them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-usage-acct-fail-"));
  const usageLog = join(dir, "usage.jsonl");

  await assert.rejects(
    withUsageAccounting(
      {
        usageLogPath: usageLog,
        logStyle: "stream",
        event: () => ({ command: "generate", provider: "mock", kind: "sprite" }),
      },
      async () => {
        throw new Error("provider exploded");
      },
    ),
    /provider exploded/,
  );

  const event = JSON.parse((await readFile(usageLog, "utf8")).trim());
  assert.equal(event.success, false);
  assert.equal(event.error, "provider exploded");
});

test("describeAssetPipeline exposes UI, credential, manifest, and preview contracts", () => {
  const contract = describeAssetPipeline();
  assert.deepEqual(contract.steps, GAME_ASSET_PIPELINE_STEPS);
  assert.deepEqual(contract.promptPanel.requiredFields, ["id", "prompt", "game", "kind"]);
  assert.ok(contract.promptPanel.optionalFields.includes("referenceImages"));
  assert.deepEqual(contract.manifest.requiredLicenseFields, ["tool", "plan", "date", "kind"]);
  assert.deepEqual(contract.previewPane.emits, ["path", "mediaType", "dataUrl"]);
  assert.equal(contract.credentialVault.some((entry) => entry.provider === "openai" && entry.keyed), true);
  assert.equal(contract.credentialVault.some((entry) => entry.provider === "codex" && !entry.keyed), true);
});
