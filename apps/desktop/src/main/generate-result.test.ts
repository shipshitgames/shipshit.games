import { test, expect } from "bun:test";

import { parseGenerateResult, dataUrlFor } from "./generate-result";

// Mirrors the assetgen pipeline log line:
// `[wrote] ${outputPath} (${kb} kb, ${mediaType})` (packages/assetgen/src/pipeline.ts).
const wroteLine = (path: string, mediaType?: string) =>
  mediaType ? `[wrote] ${path} (12.3 kb, ${mediaType})\n` : `[wrote] ${path}\n`;

test("parses a webp wrote-line with the media type suffix", () => {
  const buf =
    "[manifest] /games/scourge-survivors/assets.json\n" +
    wroteLine("/games/scourge-survivors/src/assets/sprites/swarm-husk.webp", "image/webp") +
    "[manifest] /games/scourge-survivors/assets.json updated\n";
  expect(parseGenerateResult(buf)).toEqual({
    path: "/games/scourge-survivors/src/assets/sprites/swarm-husk.webp",
    mediaType: "image/webp",
  });
});

test("parses audio wrote-lines (webm, ogg, mp3) from the media type suffix", () => {
  expect(parseGenerateResult(wroteLine("/g/src/assets/audio/music/theme.webm", "audio/webm"))).toEqual({
    path: "/g/src/assets/audio/music/theme.webm",
    mediaType: "audio/webm",
  });
  expect(parseGenerateResult(wroteLine("/g/src/assets/audio/music/theme.ogg", "audio/ogg"))).toEqual({
    path: "/g/src/assets/audio/music/theme.ogg",
    mediaType: "audio/ogg",
  });
  expect(parseGenerateResult(wroteLine("/g/src/assets/audio/music/theme.mp3", "audio/mpeg"))).toEqual({
    path: "/g/src/assets/audio/music/theme.mp3",
    mediaType: "audio/mpeg",
  });
});

test("falls back to extension sniffing when the suffix is absent", () => {
  expect(parseGenerateResult(wroteLine("/g/sprite.webp"))).toEqual({ path: "/g/sprite.webp", mediaType: "image/webp" });
  expect(parseGenerateResult(wroteLine("/g/sheet.png"))).toEqual({ path: "/g/sheet.png", mediaType: "image/png" });
  expect(parseGenerateResult(wroteLine("/g/theme.webm"))).toEqual({ path: "/g/theme.webm", mediaType: "audio/webm" });
  expect(parseGenerateResult(wroteLine("/g/stinger.wav"))).toEqual({ path: "/g/stinger.wav", mediaType: "audio/wav" });
  expect(parseGenerateResult(wroteLine("/g/golem.glb"))).toEqual({ path: "/g/golem.glb", mediaType: "model/gltf-binary" });
});

test("the last wrote-line wins when the run writes multiple files", () => {
  const buf =
    wroteLine("/g/src/assets/sprites/husk-front.webp", "image/webp") +
    wroteLine("/g/src/assets/sprites/husk-side.webp", "image/webp") +
    wroteLine("/g/src/assets/audio/music/theme.webm", "audio/webm");
  expect(parseGenerateResult(buf)).toEqual({
    path: "/g/src/assets/audio/music/theme.webm",
    mediaType: "audio/webm",
  });
});

test("returns null when the log has no wrote-line", () => {
  expect(parseGenerateResult("")).toBeNull();
  expect(parseGenerateResult("[exit 1]\nprovider error: missing key\n")).toBeNull();
});

test("dataUrlFor encodes image, audio, and GLB model media types", () => {
  const bytes = Buffer.from("shipshit");
  const b64 = bytes.toString("base64");
  expect(dataUrlFor({ path: "/g/a.webp", mediaType: "image/webp" }, bytes)).toBe(`data:image/webp;base64,${b64}`);
  expect(dataUrlFor({ path: "/g/a.webm", mediaType: "audio/webm" }, bytes)).toBe(`data:audio/webm;base64,${b64}`);
  expect(dataUrlFor({ path: "/g/a.glb", mediaType: "model/gltf-binary" }, bytes)).toBe(
    `data:model/gltf-binary;base64,${b64}`,
  );
});

test("dataUrlFor returns null for media types with no inline preview", () => {
  const bytes = Buffer.from("shipshit");
  expect(dataUrlFor({ path: "/g/a.html", mediaType: "text/html" }, bytes)).toBeNull();
  expect(dataUrlFor({ path: "/g/a.bin", mediaType: "application/octet-stream" }, bytes)).toBeNull();
});
