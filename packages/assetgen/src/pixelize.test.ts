import { expect, test } from "bun:test";
import sharp from "sharp";
import {
  DOOM_RAMP,
  pixelize,
  pixelizeDetailed,
  PIXELIZE_PALETTES,
  resolvePaletteByName,
  type PixelizeOpts,
} from "./pixelize.ts";

// A bright subject square on a near-black void, so the cutout has a real edge-
// connected background to remove and the subject survives the luma threshold.
async function subjectOnVoid(size = 64, subject = 32): Promise<Buffer> {
  const inset = Math.floor((size - subject) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 8, g: 8, b: 8, alpha: 1 } } })
    .composite([
      {
        input: {
          create: { width: subject, height: subject, channels: 4, background: { r: 150, g: 90, b: 70, alpha: 1 } },
        },
        left: inset,
        top: inset,
      },
    ])
    .png()
    .toBuffer();
}

function assertWebp(data: Buffer): void {
  expect(data.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(data.subarray(8, 12).toString("ascii")).toBe("WEBP");
}

const RAMP_SET = new Set(
  DOOM_RAMP.map((h) => {
    const n = parseInt(h.replace(/^#/, ""), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }),
);

async function assertPaletteLocked(webp: Buffer): Promise<number> {
  const { data, info } = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    const o = i * info.channels;
    if ((data[o + 3] ?? 0) < 128) continue;
    opaque++;
    expect(RAMP_SET.has(`${data[o]},${data[o + 1]},${data[o + 2]}`)).toBe(true);
  }
  return opaque;
}

test("resolvePaletteByName maps doom to the DOOM ramp and rejects unknown names", () => {
  expect(resolvePaletteByName("doom")).toEqual(DOOM_RAMP);
  expect(resolvePaletteByName("DOOM")).toEqual(DOOM_RAMP);
  expect(resolvePaletteByName("nebula")).toBeUndefined();
  expect(resolvePaletteByName(undefined)).toBeUndefined();
  expect(PIXELIZE_PALETTES.doom).toEqual(DOOM_RAMP);
});

test("pixelize snaps to the target grid height and locks every opaque pixel to the palette", async () => {
  const raw = await subjectOnVoid();
  const out = await pixelize(raw, { height: 24 });
  assertWebp(out);
  const meta = await sharp(out).metadata();
  expect(meta.height).toBe(24);
  const opaque = await assertPaletteLocked(out);
  expect(opaque).toBeGreaterThan(0); // the subject survives the cutout
});

test("default cutout is the flood-fill (unchanged behavior for existing callers)", async () => {
  const raw = await subjectOnVoid();
  const res = await pixelizeDetailed(raw, { height: 24 });
  expect(res.cutout.tool).toBe("flood-fill");
  assertWebp(res.data);
});

test("cutout 'none' skips segmentation and reports tool none", async () => {
  const raw = await subjectOnVoid();
  const res = await pixelizeDetailed(raw, { height: 24, cutout: "none" });
  expect(res.cutout.tool).toBe("none");
  assertWebp(res.data);
});

test("cutout 'rembg' uses the injected segmentation result", async () => {
  const raw = await subjectOnVoid();
  const cut = await subjectOnVoid(48, 24); // stand in for rembg's RGBA output
  const opts: PixelizeOpts = {
    height: 24,
    cutout: "rembg",
    cutoutFn: async () => ({ data: cut, applied: true, tool: "rembg" }),
  };
  const res = await pixelizeDetailed(raw, opts);
  expect(res.cutout.tool).toBe("rembg");
  assertWebp(res.data);
  await assertPaletteLocked(res.data);
});

test("cutout 'auto' falls back to the flood-fill when rembg no-ops, carrying the reason", async () => {
  const raw = await subjectOnVoid();
  const res = await pixelizeDetailed(raw, {
    height: 24,
    cutout: "auto",
    cutoutFn: async (input) => ({ data: input, applied: false, tool: "rembg", reason: "rembg not installed" }),
  });
  expect(res.cutout.tool).toBe("flood-fill");
  expect(res.cutout.reason).toMatch(/not installed/);
  assertWebp(res.data);
});

test("pixelize() and pixelizeDetailed() agree on the bytes for the same input", async () => {
  const raw = await subjectOnVoid();
  const a = await pixelize(raw, { height: 24, cutout: "flood" });
  const b = await pixelizeDetailed(raw, { height: 24, cutout: "flood" });
  expect(a.equals(b.data)).toBe(true);
});
