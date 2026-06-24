import { expect, test } from "bun:test";

import {
  isHttpAssetUrl,
  normalizeAssetBaseUrl,
  readAssetBaseUrl,
  resolveAssetUrl,
} from "./assets";

test("normalizes configured asset base URLs", () => {
  expect(normalizeAssetBaseUrl(" https://cdn.deadrot.test/assets/// ")).toBe("https://cdn.deadrot.test/assets");
  expect(normalizeAssetBaseUrl("")).toBeNull();
  expect(() => normalizeAssetBaseUrl("file:///tmp/assets")).toThrow("http(s)");
  expect(() => normalizeAssetBaseUrl("not a url")).toThrow("invalid asset base URL");
});

test("reads the first configured asset origin env key", () => {
  expect(
    readAssetBaseUrl({
      ASSET_BASE_URL: "https://private.example/assets/",
      NEXT_PUBLIC_ASSET_BASE_URL: "https://public.example/assets/",
    }),
  ).toBe("https://public.example/assets");
  expect(readAssetBaseUrl({})).toBeNull();
});

test("resolves package-relative paths against the asset origin", () => {
  expect(resolveAssetUrl("games/scourge-survivors/enemies/husk.webp", "https://cdn.example/assets/")).toBe(
    "https://cdn.example/assets/games/scourge-survivors/enemies/husk.webp",
  );
  expect(resolveAssetUrl("/entities/scourge-swarm/deadlane.webp", "https://cdn.example/assets")).toBe(
    "https://cdn.example/assets/entities/scourge-swarm/deadlane.webp",
  );
  expect(resolveAssetUrl("https://other.example/file.webp", "https://cdn.example/assets")).toBe(
    "https://other.example/file.webp",
  );
  expect(resolveAssetUrl("x.webp", null)).toBeNull();
});

test("recognizes only http asset URLs as remote assets", () => {
  expect(isHttpAssetUrl("https://cdn.example/file.webp")).toBe(true);
  expect(isHttpAssetUrl("http://localhost:3000/file.webp")).toBe(true);
  expect(isHttpAssetUrl("/sprites/file.webp")).toBe(false);
  expect(isHttpAssetUrl("file:///tmp/file.webp")).toBe(false);
});
