import { expect, test } from "bun:test";
import { buildPixelizeArgs, decodePixelizeDataUrl, parsePixelizeCutout } from "./pixelize-args";

const ASSETGEN = "/repo/packages/assetgen/src/cli.ts";
const IN = "/tmp/in.png";
const OUT = "/tmp/out.webp";

test("buildPixelizeArgs emits the pixelize verb with grid/cutout/palette defaults", () => {
  const { args, height, bg, cutout, palette } = buildPixelizeArgs({ assetgenPath: ASSETGEN, inPath: IN, outPath: OUT });
  expect(args).toEqual([
    ASSETGEN, "pixelize",
    "--in", IN,
    "--out", OUT,
    "--height", "110",
    "--bg", "42",
    "--cutout", "auto",
    "--palette", "doom",
  ]);
  expect({ height, bg, cutout, palette }).toEqual({ height: 110, bg: 42, cutout: "auto", palette: "doom" });
});

test("buildPixelizeArgs honors valid options", () => {
  const { args } = buildPixelizeArgs({
    assetgenPath: ASSETGEN, inPath: IN, outPath: OUT,
    opts: { height: 180, bgThreshold: 60, cutout: "rembg", palette: "doom" },
  });
  expect(args.slice(-8)).toEqual(["--height", "180", "--bg", "60", "--cutout", "rembg", "--palette", "doom"]);
});

test("buildPixelizeArgs clamps wild grid height and bg threshold", () => {
  const tiny = buildPixelizeArgs({ assetgenPath: ASSETGEN, inPath: IN, outPath: OUT, opts: { height: 2, bgThreshold: -5 } });
  expect(tiny.height).toBe(16);
  expect(tiny.bg).toBe(0);
  const huge = buildPixelizeArgs({ assetgenPath: ASSETGEN, inPath: IN, outPath: OUT, opts: { height: 99999, bgThreshold: 999 } });
  expect(huge.height).toBe(512);
  expect(huge.bg).toBe(255);
});

test("buildPixelizeArgs falls back to safe defaults for invalid cutout/palette/height", () => {
  const { height, cutout, palette } = buildPixelizeArgs({
    assetgenPath: ASSETGEN, inPath: IN, outPath: OUT,
    opts: { height: "abc", cutout: "magic", palette: "nebula" },
  });
  expect(height).toBe(110);
  expect(cutout).toBe("auto");
  expect(palette).toBe("doom");
});

test("decodePixelizeDataUrl round-trips base64 image bytes, rejecting non-data-URLs", () => {
  const payload = Buffer.from("fake-webp");
  const url = `data:image/webp;base64,${payload.toString("base64")}`;
  const decoded = decodePixelizeDataUrl(url);
  expect(decoded?.mime).toBe("image/webp");
  expect(decoded?.buffer.equals(payload)).toBe(true);
  expect(decodePixelizeDataUrl("/tmp/sprite.webp")).toBeNull();
  expect(decodePixelizeDataUrl(undefined)).toBeNull();
});

test("parsePixelizeCutout reads the CLI cutout line, with and without a reason", () => {
  expect(parsePixelizeCutout("[pixelize] cutout: rembg\n[pixelize] in -> out")).toEqual({ tool: "rembg" });
  expect(parsePixelizeCutout("[pixelize] cutout: flood-fill (rembg not installed)")).toEqual({
    tool: "flood-fill",
    reason: "rembg not installed",
  });
  expect(parsePixelizeCutout("no cutout line here")).toBeNull();
});
