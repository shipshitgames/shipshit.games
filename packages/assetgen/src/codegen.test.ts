import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { assetId, buildCodegenModule, buildIdMap, type AtlasMapJson } from "./codegen.ts";
import type { AssetIndex, ImageAsset, SheetInfo } from "./asset-index.ts";

function image(path: string, width: number, height: number, sheet: SheetInfo | null = null): ImageAsset {
  return {
    path,
    type: "image",
    game: "scourge-survivors",
    group: "games",
    id: null,
    format: "webp",
    width,
    height,
    hasAlpha: true,
    bytes: 1234,
    blank: false,
    sheet,
    inCatalog: false,
  };
}

const INDEX: AssetIndex = {
  version: 1,
  generatedFrom: "scourge-survivors",
  assetCount: 2,
  images: 2,
  models: 0,
  games: [],
  assets: [
    image("players/hero.webp", 64, 96),
    image("fx/run.webp", 256, 64, { frameWidth: 64, frameHeight: 64, cols: 4, rows: 1, frames: 4, blankFrames: [] }),
  ],
};

const ATLAS: AtlasMapJson = {
  pages: [{ image: "scourge-survivors.atlas0.webp", width: 512, height: 512 }],
  frames: [{ id: "players/hero.webp", page: 0, x: 2, y: 2, w: 64, h: 96 }],
};

describe("buildCodegenModule", () => {
  test("assetId strips the extension", () => {
    expect(assetId("a/b/c.webp")).toBe("a/b/c");
  });

  test("buildIdMap keeps extensions only for colliding ids (no asset dropped)", () => {
    const map = buildIdMap(["ui/x.jpg", "ui/x.png", "ui/y.webp"]);
    expect(map.get("ui/x.jpg")).toBe("ui/x.jpg"); // collision -> keep ext
    expect(map.get("ui/x.png")).toBe("ui/x.png");
    expect(map.get("ui/y.webp")).toBe("ui/y"); // unique -> stripped
  });

  test("emits a typed manifest, animations, and loader", () => {
    const mod = buildCodegenModule(INDEX, null, "scourge-survivors");
    expect(mod).toContain("export const ASSETS = {");
    expect(mod).toContain('"players/hero": { path: "players/hero.webp", width: 64, height: 96, frames: 1 }');
    expect(mod).toContain("export type AssetId = keyof typeof ASSETS;");
    expect(mod).toContain('"fx/run": { frameWidth: 64, frameHeight: 64, frames: 4, fps: 12, loop: true }');
    expect(mod).toContain("export async function loadAssets(");
    expect(mod).not.toContain("export const ATLAS"); // no atlas passed
  });

  test("embeds the atlas table when an atlas map is given", () => {
    const mod = buildCodegenModule(INDEX, ATLAS, "scourge-survivors");
    expect(mod).toContain("export const ATLAS = {");
    expect(mod).toContain("scourge-survivors.atlas0.webp");
    expect(mod).toContain('"players/hero": { page: 0, x: 2, y: 2, w: 64, h: 96 }');
  });

  test("is deterministic", () => {
    expect(buildCodegenModule(INDEX, ATLAS, "scourge-survivors")).toBe(buildCodegenModule(INDEX, ATLAS, "scourge-survivors"));
  });

  test("the generated module is valid TS that imports with correct data", async () => {
    const dir = await mkdtemp(join(tmpdir(), "assetgen-codegen-"));
    try {
      const file = join(dir, "assets.generated.ts");
      await writeFile(file, buildCodegenModule(INDEX, ATLAS, "scourge-survivors"), "utf8");
      const mod = (await import(pathToFileURL(file).href)) as {
        ASSETS: Record<string, { width: number; frames: number }>;
        ANIMATIONS: Record<string, { frames: number }>;
        ATLAS: { frames: Record<string, { w: number }> };
        loadAssets: unknown;
      };
      expect(mod.ASSETS["players/hero"]!.width).toBe(64);
      expect(mod.ANIMATIONS["fx/run"]!.frames).toBe(4);
      expect(mod.ATLAS.frames["players/hero"]!.w).toBe(64);
      expect(typeof mod.loadAssets).toBe("function");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
