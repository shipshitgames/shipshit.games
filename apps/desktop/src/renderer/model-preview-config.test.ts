import { test, expect } from "bun:test";

import { DECODER_BASE, MODEL_MEDIA_TYPE, decoderPaths, isModelResult } from "./model-preview-config";

test("decoderPaths derives draco + basis dirs from the default base", () => {
  expect(decoderPaths()).toEqual({
    draco: "./decoders/draco/",
    ktx2: "./decoders/basis/",
  });
  // The default base itself is a trailing-slashed directory URL.
  expect(DECODER_BASE.endsWith("/")).toBe(true);
});

test("decoderPaths normalizes a base with no trailing slash", () => {
  expect(decoderPaths("/assets/decoders")).toEqual({
    draco: "/assets/decoders/draco/",
    ktx2: "/assets/decoders/basis/",
  });
});

test("decoder paths always end in a slash (DRACOLoader/KTX2Loader join filenames verbatim)", () => {
  for (const base of ["./decoders/", "./decoders", "https://cdn.example/d/"]) {
    const paths = decoderPaths(base);
    expect(paths.draco.endsWith("/")).toBe(true);
    expect(paths.ktx2.endsWith("/")).toBe(true);
  }
});

test("isModelResult recognizes only the GLB media type", () => {
  expect(isModelResult(MODEL_MEDIA_TYPE)).toBe(true);
  expect(isModelResult("model/gltf-binary")).toBe(true);
  expect(isModelResult("image/webp")).toBe(false);
  expect(isModelResult("audio/webm")).toBe(false);
  expect(isModelResult(null)).toBe(false);
  expect(isModelResult(undefined)).toBe(false);
});
