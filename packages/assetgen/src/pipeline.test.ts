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
  runAssetPipeline,
} from "./pipeline";

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

  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  assert.deepEqual(manifest.assets[0].license, {
    tool: "mock",
    plan: "mock",
    date: "2026-06-07",
    kind: "sprite",
  });
});

test("describeAssetPipeline exposes UI, credential, manifest, and preview contracts", () => {
  const contract = describeAssetPipeline();
  assert.deepEqual(contract.steps, GAME_ASSET_PIPELINE_STEPS);
  assert.deepEqual(contract.promptPanel.requiredFields, ["id", "prompt", "game", "kind"]);
  assert.deepEqual(contract.manifest.requiredLicenseFields, ["tool", "plan", "date", "kind"]);
  assert.deepEqual(contract.previewPane.emits, ["path", "mediaType", "dataUrl"]);
  assert.equal(contract.credentialVault.some((entry) => entry.provider === "openai" && entry.keyed), true);
  assert.equal(contract.credentialVault.some((entry) => entry.provider === "codex" && !entry.keyed), true);
});
