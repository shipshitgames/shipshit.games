import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { buildMinimalGlb } from "../glb-fixture.ts";
import { buildPreviewTarget, previewInput } from "./preview.ts";

const temps: string[] = [];

afterEach(async () => {
  while (temps.length > 0) await rm(temps.pop()!, { recursive: true, force: true });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "assetgen-preview-command-"));
  temps.push(root);
  return root;
}

test("preview emits direct targets for images, audio, and export packs", async () => {
  const root = await tempRoot();
  for (const [name, kind] of [
    ["sprite.webp", "image"],
    ["theme.ogg", "audio"],
    ["export.zip", "export-pack"],
  ] as const) {
    const path = join(root, name);
    await writeFile(path, Buffer.from("fixture"));
    const target = await buildPreviewTarget(path);
    assert.equal(target.kind, kind);
    assert.equal(target.target, path);
  }
});

test("preview writes a browser target for GLB models", async () => {
  const root = await tempRoot();
  const model = join(root, "golem.glb");
  await writeFile(model, buildMinimalGlb());

  const target = await buildPreviewTarget(model);
  assert.equal(target.kind, "model");
  assert.equal(target.target, `${model}.preview.html`);
  const html = await readFile(target.target, "utf8");
  assert.match(html, /<model-viewer/);
  assert.match(html, /golem\.glb/);
  assert.match(html, /data:model\/gltf-binary;base64,/);
  assert.doesNotMatch(html, /src="file:/);
});

test("preview positional input skips values belonging to other flags", () => {
  assert.equal(previewInput(["--out", "/tmp/viewer.html", "/tmp/golem.glb"]), "/tmp/golem.glb");
  assert.equal(previewInput(["--json", "/tmp/golem.glb"]), "/tmp/golem.glb");
  assert.equal(previewInput(["--in", "/tmp/golem.glb"]), undefined);
});
