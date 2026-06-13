import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMapsStore, sanitizeGame, sanitizeId } from "./maps";

const temps = [];
function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipshit-maps-"));
  temps.push(root);
  return root;
}

afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop(), { recursive: true, force: true });
});

test("sanitizes game and id slugs", () => {
  expect(sanitizeGame("Scourge Survivors!!")).toBe("scourge-survivors");
  expect(sanitizeGame("")).toBe("scourge-survivors");
  expect(sanitizeId("Breach Alpha!!")).toBe("breach-alpha");
  expect(sanitizeId("")).toBe("arena");
});

test("preview returns a valid layout with an svg data url and a typed module", () => {
  const store = createMapsStore({ rootDir: tempRoot() });
  const result = store.preview({ id: "breach-alpha", rooms: 6, levels: 2, seed: 7 });
  expect(result.ok).toBe(true);
  expect(result.validation.ok).toBe(true);
  expect(result.dataUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
  expect(result.svg.startsWith("<svg")).toBe(true);
  expect(result.moduleText).toContain("export const breachAlphaMap: ArenaMap =");
  expect(result.summary.rooms).toBe(6);
  expect(result.summary.levels).toBe(2);
  expect(result.summary.obstacles).toBeGreaterThan(0);
});

test("preview is deterministic for a given seed", () => {
  const store = createMapsStore({ rootDir: tempRoot() });
  const a = store.preview({ id: "arena", rooms: 4, seed: 11 });
  const b = store.preview({ id: "arena", rooms: 4, seed: 11 });
  expect(a.moduleText).toBe(b.moduleText);
  expect(a.svg).toBe(b.svg);
});

test("write persists the module and svg under <root>/<game>/<id>", () => {
  const root = tempRoot();
  const store = createMapsStore({ rootDir: root });
  const result = store.write({ id: "Breach Alpha", game: "Scourge Survivors", rooms: 4, seed: 3 });
  expect(result.ok).toBe(true);
  expect(result.path).toBe(path.join(root, "scourge-survivors", "breach-alpha.maps.ts"));
  expect(result.svgPath).toBe(path.join(root, "scourge-survivors", "breach-alpha.svg"));
  expect(fs.existsSync(result.path)).toBe(true);
  expect(fs.existsSync(result.svgPath)).toBe(true);
  expect(fs.readFileSync(result.path, "utf8")).toContain('import type { ArenaMap } from "@shipshitgames/engine";');
});

test("write clamps out-of-range inputs instead of producing an invalid map", () => {
  const store = createMapsStore({ rootDir: tempRoot() });
  // huge room count + tiny arena: the seeder + clamps must still yield a valid layout
  const result = store.write({ id: "stress", game: "scourge-survivors", rooms: 9999, levels: 99, half: 1, seed: 1 });
  expect(result.ok).toBe(true);
  expect(result.validation.ok).toBe(true);
});

test("rootDir accepts a function and is resolved lazily", () => {
  const root = tempRoot();
  let calls = 0;
  const store = createMapsStore({
    rootDir: () => {
      calls++;
      return root;
    },
  });
  store.preview({ id: "arena", seed: 1 }); // preview does not touch the filesystem
  expect(calls).toBe(0);
  store.write({ id: "arena", game: "scourge-survivors", seed: 1 });
  expect(calls).toBeGreaterThan(0);
});
