import assert from "node:assert/strict";
import { test } from "node:test";

import { downloadGeneratedAsset, extensionForMediaType, mediaTypeFromUrl, outputUrl } from "./media";

test("outputUrl finds the first usable URL across provider response shapes", () => {
  assert.equal(outputUrl("https://x.test/a.png"), "https://x.test/a.png");
  assert.equal(outputUrl([null, "https://x.test/b.png"]), "https://x.test/b.png");
  assert.equal(outputUrl({ url: "https://x.test/c.png" }), "https://x.test/c.png");
  assert.equal(outputUrl({ audio_url: "https://x.test/d.mp3" }), "https://x.test/d.mp3");
  assert.equal(outputUrl({ image_url: "https://x.test/e.png" }), "https://x.test/e.png");
  assert.equal(outputUrl({ data: ["https://x.test/f.png"] }), "https://x.test/f.png");
  assert.equal(outputUrl({ output: { url: "https://x.test/g.png" } }), "https://x.test/g.png");
  assert.equal(outputUrl({ output: { data: ["https://x.test/h.png"] } }), "https://x.test/h.png");
  assert.equal(outputUrl({ nothing: true }), undefined);
  assert.equal(outputUrl(42), undefined);
});

test("mediaTypeFromUrl maps known extensions and falls back to octet-stream", () => {
  assert.equal(mediaTypeFromUrl("https://x.test/a.webp"), "image/webp");
  assert.equal(mediaTypeFromUrl("https://x.test/a.jpg"), "image/jpeg");
  assert.equal(mediaTypeFromUrl("https://x.test/a.jpeg"), "image/jpeg");
  assert.equal(mediaTypeFromUrl("https://x.test/a.mp3"), "audio/mpeg");
  assert.equal(mediaTypeFromUrl("https://x.test/a.ogg"), "audio/ogg");
  assert.equal(mediaTypeFromUrl("https://x.test/a.webm"), "audio/webm");
  assert.equal(mediaTypeFromUrl("https://x.test/a.wav"), "audio/wav");
  assert.equal(mediaTypeFromUrl("https://x.test/a.glb"), "model/gltf-binary");
  // .png is deliberately unmapped — image providers send a content-type header.
  assert.equal(mediaTypeFromUrl("https://x.test/a.png"), "application/octet-stream");
});

test("extensionForMediaType maps media types, then sniffs the URL, then bins out", () => {
  assert.equal(extensionForMediaType("image/png"), "png");
  assert.equal(extensionForMediaType("image/webp"), "webp");
  assert.equal(extensionForMediaType("image/jpeg"), "jpg");
  assert.equal(extensionForMediaType("audio/mpeg"), "mp3");
  assert.equal(extensionForMediaType("model/gltf-binary"), "glb");
  assert.equal(extensionForMediaType("application/octet-stream", "https://x.test/file.PNG?sig=abc"), "png");
  assert.equal(extensionForMediaType("application/octet-stream", "https://x.test/file"), "bin");
  assert.equal(extensionForMediaType("text/weird"), "bin");
});

test("downloadGeneratedAsset prefers the content-type header over the URL", async () => {
  const bytes = Buffer.from([1, 2, 3]);
  const fetchImpl = (async () =>
    new Response(bytes, { headers: { "content-type": "image/webp; charset=binary" } })) as unknown as typeof fetch;

  const asset = await downloadGeneratedAsset("https://x.test/thing.bin", "some/model", fetchImpl);

  assert.deepEqual(asset.data, bytes);
  assert.equal(asset.mediaType, "image/webp");
  assert.equal(asset.extension, "webp");
  assert.equal(asset.model, "some/model");
});

test("downloadGeneratedAsset sniffs the URL when no content-type header is sent", async () => {
  const fetchImpl = (async () => new Response(Buffer.from([1]))) as unknown as typeof fetch;

  const asset = await downloadGeneratedAsset("https://x.test/track.mp3", undefined, fetchImpl);

  assert.equal(asset.mediaType, "audio/mpeg");
  assert.equal(asset.extension, "mp3");
});

test("downloadGeneratedAsset surfaces non-ok responses", async () => {
  const fetchImpl = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(downloadGeneratedAsset("https://x.test/a.png", undefined, fetchImpl), /download 404: nope/);
});
