import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGallery, flattenManifest, groupFor, mimeFor } from "./gallery";

const temps = [];
function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shipshit-gallery-"));
  temps.push(root);
  return root;
}
function writeAsset(root, relPath, bytes = 8) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.alloc(bytes, 1));
  return abs;
}
function writeManifest(root, game, data) {
  const abs = path.join(root, "games", game, "assets.json");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(data));
  return abs;
}

afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop(), { recursive: true, force: true });
});

test("flattens multi-view sprites into one record per view", () => {
  const flat = flattenManifest("scourge-survivors", {
    sprites: {
      grunt: {
        type: "sprite",
        filter: "nearest",
        views: {
          front: { path: "games/scourge-survivors/enemies/grunt/front.webp", dimensions: [128, 128], scale: [1.8, 2.5] },
          side: { path: "games/scourge-survivors/enemies/grunt/side.webp", dimensions: [128, 128] },
        },
      },
    },
  });
  expect(flat).toHaveLength(2);
  expect(flat.map((a) => a.id).sort()).toEqual(["grunt:front", "grunt:side"]);
  const front = flat.find((a) => a.id === "grunt:front");
  expect(front.view).toBe("front");
  expect(front.assetId).toBe("grunt");
  expect(front.group).toBe("enemies");
  expect(front.dimensions).toEqual([128, 128]);
  expect(front.scale).toEqual([1.8, 2.5]);
  expect(front.filter).toBe("nearest");
});

test("flattens single-path sprites/textures/ui and skips runtime + audio + non-images", () => {
  const flat = flattenManifest("scourge-survivors", {
    sprites: { pistol: { type: "sprite", path: "games/scourge-survivors/weapons/pistol.webp" } },
    textures: { floor: { type: "texture", path: "games/scourge-survivors/textures/floor.webp", dimensions: [512, 512] } },
    ui: { title: { type: "ui", path: "games/scourge-survivors/ui/title.webp", role: "menu-background" } },
    audio: { song: { type: "audio", path: "games/scourge-survivors/audio/song.webm" } },
    runtime: { weapons: { pistol: { sprite: "pistol" } } },
  });
  expect(flat.map((a) => a.id).sort()).toEqual(["floor", "pistol", "title"]);
  expect(flat.find((a) => a.id === "pistol").group).toBe("weapons");
  expect(flat.find((a) => a.id === "title").role).toBe("menu-background");
});

test("groupFor falls back to top segment for shared/entity paths", () => {
  expect(groupFor("scourge-survivors", "games/scourge-survivors/pickups/heart.webp")).toBe("pickups");
  expect(groupFor("scourge-survivors", "shared/fx/muzzle-flash.webp")).toBe("shared");
  expect(groupFor("scourge-survivors", "entities/scourge-swarm/x.webp")).toBe("entities");
});

test("mimeFor maps extensions", () => {
  expect(mimeFor(".png")).toBe("image/png");
  expect(mimeFor(".jpg")).toBe("image/jpeg");
  expect(mimeFor(".webp")).toBe("image/webp");
  expect(mimeFor(".unknown")).toBe("image/webp");
});

test("listGames returns only game dirs that have a manifest", () => {
  const root = tempRoot();
  writeManifest(root, "scourge-survivors", { sprites: {} });
  writeManifest(root, "deadlane", { sprites: {} });
  fs.mkdirSync(path.join(root, "games", "no-manifest"), { recursive: true });
  const gallery = createGallery({ assetsRoot: root });
  expect(gallery.listGames()).toEqual(["deadlane", "scourge-survivors"]);
});

test("list embeds existing images, flags missing, and resolves bytes", () => {
  const root = tempRoot();
  writeAsset(root, "games/scourge-survivors/weapons/pistol.webp", 12);
  writeManifest(root, "scourge-survivors", {
    sprites: {
      pistol: { type: "sprite", path: "games/scourge-survivors/weapons/pistol.webp" },
      ghost: { type: "sprite", path: "games/scourge-survivors/weapons/ghost.webp" },
    },
  });
  const gallery = createGallery({ assetsRoot: root });
  const res = gallery.list("scourge-survivors");
  expect(res.ok).toBe(true);
  const pistol = res.assets.find((a) => a.id === "pistol");
  expect(pistol.missing).toBe(false);
  expect(pistol.dataUrl).toMatch(/^data:image\/webp;base64,/);
  expect(pistol.bytes).toBe(12);
  const ghost = res.assets.find((a) => a.id === "ghost");
  expect(ghost.missing).toBe(true);
  expect(ghost.dataUrl).toBeNull();
});

test("list defers embedding past the byte budget; image() fetches on demand", () => {
  const root = tempRoot();
  writeAsset(root, "games/scourge-survivors/weapons/a.webp", 1000);
  writeAsset(root, "games/scourge-survivors/weapons/b.webp", 1000);
  writeManifest(root, "scourge-survivors", {
    sprites: {
      a: { type: "sprite", path: "games/scourge-survivors/weapons/a.webp" },
      b: { type: "sprite", path: "games/scourge-survivors/weapons/b.webp" },
    },
  });
  const gallery = createGallery({ assetsRoot: root });
  const res = gallery.list("scourge-survivors", { embedBudget: 1500 });
  const embedded = res.assets.filter((a) => a.dataUrl);
  const deferred = res.assets.filter((a) => a.deferred);
  expect(embedded).toHaveLength(1);
  expect(deferred).toHaveLength(1);
  const fetched = gallery.image(deferred[0].path);
  expect(fetched.dataUrl).toMatch(/^data:image\/webp;base64,/);
});

test("image() refuses path traversal outside the assets root", () => {
  const root = tempRoot();
  writeManifest(root, "scourge-survivors", { sprites: {} });
  const gallery = createGallery({ assetsRoot: root });
  expect(gallery.image("../../../etc/passwd")).toBeNull();
});

test("listGames includes manifest-less dirs that contain images", () => {
  const root = tempRoot();
  writeManifest(root, "scourge-survivors", { sprites: {} });
  writeAsset(root, "games/warline/ui/title.webp");
  fs.mkdirSync(path.join(root, "games", "empty"), { recursive: true });
  const gallery = createGallery({ assetsRoot: root });
  expect(gallery.listGames()).toEqual(["scourge-survivors", "warline"]);
});

test("list falls back to a filesystem scan when a game has no manifest", () => {
  const root = tempRoot();
  writeAsset(root, "games/warline/ui/menu/title.webp", 10);
  writeAsset(root, "games/warline/props/turret.webp", 10);
  const gallery = createGallery({ assetsRoot: root });
  const res = gallery.list("warline");
  expect(res.ok).toBe(true);
  expect(res.source).toBe("filesystem");
  expect(res.assets.map((a) => a.id).sort()).toEqual(["props/turret", "ui/menu/title"]);
  const ui = res.assets.find((a) => a.group === "ui");
  expect(ui.dataUrl).toMatch(/^data:image\/webp;base64,/);
});

test("list reports manifest source for games with a manifest", () => {
  const root = tempRoot();
  writeAsset(root, "games/scourge-survivors/weapons/pistol.webp", 8);
  writeManifest(root, "scourge-survivors", {
    sprites: { pistol: { type: "sprite", path: "games/scourge-survivors/weapons/pistol.webp" } },
  });
  const gallery = createGallery({ assetsRoot: root });
  expect(gallery.list("scourge-survivors").source).toBe("manifest");
});

test("list reports an error when the assets package is absent", () => {
  const gallery = createGallery({ assetsRoot: () => null });
  const res = gallery.list("scourge-survivors");
  expect(res.ok).toBe(false);
  expect(res.assets).toEqual([]);
});
