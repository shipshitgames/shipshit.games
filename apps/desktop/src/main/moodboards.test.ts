import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMoodboardStore, sanitizeGame } from "./moodboards";

const temps = [];
function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipshit-moodboard-"));
  temps.push(root);
  return root;
}

afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop(), { recursive: true, force: true });
});

test("sanitizes game slugs for board storage", () => {
  expect(sanitizeGame("Scourge Survivors!!")).toBe("scourge-survivors");
  expect(sanitizeGame("")).toBe("scourge-survivors");
});

test("creates an empty board for a game with no prior data", () => {
  const store = createMoodboardStore({ rootDir: tempRoot(), now: () => "2026-06-08T00:00:00.000Z" });
  const board = store.readBoard("starblight");
  expect(board.game).toBe("starblight");
  expect(board.items).toEqual([]);
});

test("persists notes and visual target markers across store instances", () => {
  const root = tempRoot();
  let ids = 0;
  const store = createMoodboardStore({ rootDir: root, now: () => "2026-06-08T00:00:00.000Z", id: () => `id-${++ids}` });

  const withNote = store.addNote("pactfall", "isometric Warden shield read");
  expect(withNote.items).toHaveLength(1);
  expect(withNote.items[0].text).toBe("isometric Warden shield read");

  store.setVisualTarget("pactfall", "id-1", true);

  const reloaded = createMoodboardStore({ rootDir: root, now: () => "2026-06-08T00:00:00.000Z" }).readBoard("pactfall");
  expect(reloaded.items[0].visualTarget).toBe(true);
});

test("imports references into moodboard storage without touching game assets", () => {
  const root = tempRoot();
  const gameAssets = path.join(root, "games", "scourge-survivors", "src", "assets");
  const sourceDir = path.join(root, "sources");
  fs.mkdirSync(gameAssets, { recursive: true });
  fs.mkdirSync(sourceDir, { recursive: true });
  const source = path.join(sourceDir, "target.webp");
  fs.writeFileSync(source, "fake-webp");

  const store = createMoodboardStore({ rootDir: path.join(root, "userData"), now: () => "2026-06-08T00:00:00.000Z", id: () => "image-1" });
  const board = store.importImages("scourge-survivors", [source]);

  expect(board.items).toHaveLength(1);
  expect(board.items[0].type).toBe("image");
  expect(board.items[0].image.name).toBe("target.webp");
  expect(board.items[0].dataUrl).toBe("data:image/webp;base64,ZmFrZS13ZWJw");
  expect(fs.readdirSync(gameAssets)).toEqual([]);
  expect(fs.existsSync(path.join(root, "userData", "scourge-survivors", "images", "image-1.webp"))).toBe(true);
});
