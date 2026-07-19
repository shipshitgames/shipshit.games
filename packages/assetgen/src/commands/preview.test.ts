import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  assert.ok(
    html.includes(
      'integrity="sha384-cprcVQt7wbUl0xngF3PGP6yBB7n4/t+4AoAMG9biiMCGFiWOdzUH10Ie2COTqFNW"',
    ),
  );
  assert.match(html, /crossorigin="anonymous"/);
  assert.doesNotMatch(html, /src="file:/);
});

test("preview bundles external GLTF resources into one binary data URL", async () => {
  const root = await tempRoot();
  const model = join(root, "golem.gltf");
  await writeFile(join(root, "mesh.bin"), Buffer.alloc(36));
  await writeFile(
    model,
    JSON.stringify({
      asset: { version: "2.0" },
      buffers: [{ uri: "mesh.bin", byteLength: 36 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", max: [0, 0, 0], min: [0, 0, 0] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 0 }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    }),
  );

  const target = await buildPreviewTarget(model);
  assert.equal(target.mediaType, "model/gltf-binary");
  const html = await readFile(target.target, "utf8");
  assert.match(html, /data:model\/gltf-binary;base64,/);
  assert.doesNotMatch(html, /data:model\/gltf\+json;base64,/);
});

test("preview rejects GLTF resources outside the model directory", async () => {
  const root = await tempRoot();
  const modelDir = join(root, "model");
  await mkdir(modelDir);
  await writeFile(join(root, "outside.bin"), Buffer.alloc(4));
  const model = join(modelDir, "unsafe.gltf");
  await writeFile(
    model,
    JSON.stringify({
      asset: { version: "2.0" },
      buffers: [{ uri: "../outside.bin", byteLength: 4 }],
    }),
  );

  await assert.rejects(buildPreviewTarget(model), /resource escapes the model directory/);
});

test("preview positional input skips values belonging to other flags", () => {
  assert.equal(previewInput(["--out", "/tmp/viewer.html", "/tmp/golem.glb"]), "/tmp/golem.glb");
  assert.equal(previewInput(["--json", "/tmp/golem.glb"]), "/tmp/golem.glb");
  assert.equal(previewInput(["--in", "/tmp/golem.glb"]), undefined);
});
