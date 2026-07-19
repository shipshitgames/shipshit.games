import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, test } from "bun:test";

import { parseAssetQaManifest, resolveWithinRoot } from "./manifest.ts";

describe("asset QA manifest contract", () => {
  test("parses the checked-in target/threshold fixture", async () => {
    const fixture = fileURLToPath(new URL("../../test-fixtures/asset-qa/manifest.json", import.meta.url));
    const manifest = parseAssetQaManifest(JSON.parse(await readFile(fixture, "utf8")) as unknown);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.targets[0]?.id, "sample-sprite");
    assert.equal(manifest.targets[0]?.checks.alpha?.maxDarkFringePixels, 0);
    assert.equal(manifest.targets[0]?.repair?.output.lossless, true);
  });

  test("rejects duplicate ids and incomplete mutation declarations before work starts", () => {
    const target = {
      id: "sprite",
      path: "sprite.webp",
      checks: { webpEncoding: "lossless" },
      repair: { output: { format: "webp", lossless: true } },
    };
    assert.throws(
      () => parseAssetQaManifest({ schemaVersion: 1, targets: [target, target] }),
      /duplicates "sprite"/,
    );
    assert.throws(
      () => parseAssetQaManifest({ schemaVersion: 1, targets: [{ ...target, repair: { output: { format: "webp" } } }] }),
      /output\.lossless must be a boolean/,
    );
  });

  test("rejects absolute and root-escaping product paths", () => {
    assert.throws(() => resolveWithinRoot("/tmp/project", "/tmp/out.webp"), /must be relative/);
    assert.throws(() => resolveWithinRoot("/tmp/project", "../out.webp"), /escapes the manifest root/);
    assert.equal(resolveWithinRoot("/tmp/project", "assets/out.webp"), "/tmp/project/assets/out.webp");
  });
});
