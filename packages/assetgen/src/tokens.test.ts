import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import { runTokens } from "./tokens";

test("tokens --check --repo-only verifies the in-repo generated artifact without an assets package", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-tokens-test-"));
  const design = await writeDesign(root);
  const stylePath = join(root, "style.generated.ts");

  await runTokens({ design, stylePath, repoOnly: true });

  const logs: string[] = [];
  const result = await runTokens({
    check: true,
    design,
    stylePath,
    repoOnly: true,
    log: (message) => {
      logs.push(message);
    },
  });

  assert.equal(result.drift, false);
  assert.deepEqual(result.drifts, []);
  assert.deepEqual(result.files, [stylePath]);
  assert.match(logs.join("\n"), /all artifacts current/);
});

test("tokens --check flags generated token body changes without a version or hash bump", async () => {
  const root = await mkdtemp(join(tmpdir(), "assetgen-tokens-test-"));
  const design = await writeDesign(root);
  const assetsDir = await writeAssetsPackage(root);
  const stylePath = join(root, "style.generated.ts");

  await runTokens({ design, assetsDir, stylePath });
  await writeFile(stylePath, `${await readFile(stylePath, "utf8")}\nexport const BROKEN_TOKEN = true;\n`);

  const logs: string[] = [];
  const result = await runTokens({
    check: true,
    design,
    assetsDir,
    stylePath,
    log: (message) => {
      logs.push(message);
    },
  });

  assert.equal(result.drift, true);
  assert.equal(result.drifts.length, 1);
  assert.equal(result.drifts[0]?.reason, "metadata-unchanged");
  assert.match(result.drifts[0]?.diff ?? "", /BROKEN_TOKEN/);
  assert.match(logs.join("\n"), /without a metadata bump/);
});

async function writeDesign(root: string): Promise<string> {
  const path = join(root, "DESIGN.md");
  await writeFile(
    path,
    `---
version: "1.0.0"
colors:
  primary: "#111111"
  bone: "#eeeeee"
typography:
  display:
    fontFamily: "Display"
  body:
    fontFamily: "Body"
  mono:
    fontFamily: "Mono"
assetgen:
  styleSuffix: "test pixel style"
  negativePrompts:
    - "blur"
  perGameFraming:
    shared: "game asset"
  kindMap:
    texture: "seamless texture"
  scourgeRule:
    trigger: "\\\\bscourge\\\\b"
    flags: "i"
    clause: "parasite takeover"
  gradeParams:
    pixelGrid: 110
  referenceImages:
    shared: "refs/shared.webp"
  providers:
    default: "mock"
---

# Test design
`,
  );
  return path;
}

async function writeAssetsPackage(root: string): Promise<string> {
  const assetsDir = join(root, "assets");
  await mkdir(assetsDir, { recursive: true });
  await writeFile(join(assetsDir, "assets-catalog.json"), "{}\n");
  return assetsDir;
}
