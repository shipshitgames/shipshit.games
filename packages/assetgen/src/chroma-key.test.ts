import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import {
  countVisibleKeyPixels,
  dominantMatteColor,
  extractWithKey,
  floodKeyFromEdges,
  hardenAlpha,
  keyOutMatte,
} from "./chroma-key.ts";
import { hexToRgb, type RGB } from "./key-color.ts";

const GREEN: RGB = [0, 255, 0];
const MAGENTA: RGB = [255, 0, 255];
const VIOLET = ["#c020c0", "#a030b0", "#c1121f", "#e9e3d6", "#161214"];

/** Build a w×h RGBA buffer; `paint(x,y) -> [r,g,b,a]`. */
function buffer(w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const [r, g, b, a] = paint(x, y);
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
    }
  }
  return data;
}

/** A green matte with a centred 2×2 violet subject block. */
function greenMatteWithViolet(w = 6, h = 6): Uint8Array {
  return buffer(w, h, (x, y) => {
    const inside = x >= 2 && x <= 3 && y >= 2 && y <= 3;
    return inside ? [192, 32, 192, 255] : [0, 255, 0, 255];
  });
}

describe("keyOutMatte", () => {
  test("clears the matte within tolerance and leaves the subject opaque", () => {
    const w = 6, h = 6;
    const data = greenMatteWithViolet(w, h);
    const keyed = keyOutMatte(data, w, h, GREEN, { tolerance: 70, halo: 70 });
    expect(keyed).toBe(w * h - 4); // everything but the 2×2 subject
    // subject pixel still opaque
    expect(data[(2 * w + 2) * 4 + 3]).toBe(255);
    // a former matte pixel now transparent
    expect(data[0 * 4 + 3]).toBe(0);
  });

  test("fades pixels in the tolerance..halo band", () => {
    // a single pixel exactly between key and subject
    const data = buffer(1, 1, () => [128, 200, 128, 200]); // ~halfway-ish to green
    keyOutMatte(data, 1, 1, GREEN, { tolerance: 20, halo: 400 });
    const a = data[3]!;
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(200); // faded, not fully cleared
  });
});

describe("countVisibleKeyPixels", () => {
  test("counts visible key-coloured pixels only", () => {
    const data = greenMatteWithViolet();
    // raw source: 32 green matte pixels are visible & key-coloured
    expect(countVisibleKeyPixels(data, 6, 6, GREEN, { tolerance: 70 })).toBe(32);
    // the violet subject is not within tolerance of green
    expect(countVisibleKeyPixels(data, 6, 6, MAGENTA, { tolerance: 70 })).toBe(0);
  });
});

describe("floodKeyFromEdges", () => {
  test("removes the edge-connected matte but keeps interior key pixels", () => {
    const w = 5, h = 5;
    // green border, with one isolated green pixel trapped inside a violet ring
    const data = buffer(w, h, (x, y) => {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (border) return [0, 255, 0, 255]; // matte
      if (x === 2 && y === 2) return [0, 255, 0, 255]; // trapped interior key pixel
      return [192, 32, 192, 255]; // violet ring
    });
    const removed = floodKeyFromEdges(data, w, h, GREEN, { tolerance: 70 });
    expect(removed).toBe(16); // the border ring only
    // the trapped interior green pixel survives -> residue the check should flag
    expect(data[(2 * w + 2) * 4 + 3]).toBe(255);
    expect(countVisibleKeyPixels(data, w, h, GREEN, { tolerance: 70 })).toBe(1);
  });

  test("a clean out-of-palette matte leaves zero residue", () => {
    const data = greenMatteWithViolet();
    floodKeyFromEdges(data, 6, 6, GREEN, { tolerance: 70 });
    expect(countVisibleKeyPixels(data, 6, 6, GREEN, { tolerance: 70 })).toBe(0);
  });
});

describe("hardenAlpha", () => {
  test("snaps alpha to 0/255 around the threshold, leaving RGB", () => {
    const data = buffer(3, 1, (x) => [10, 20, 30, x === 0 ? 10 : x === 1 ? 200 : 130]);
    hardenAlpha(data, 3, 1, 128);
    expect([data[3], data[7], data[11]]).toEqual([0, 255, 255]);
    expect([data[0], data[1], data[2]]).toEqual([10, 20, 30]); // rgb intact
  });
});

describe("dominantMatteColor", () => {
  test("recovers the flat border colour", () => {
    const det = dominantMatteColor(greenMatteWithViolet(), 6, 6);
    expect(det.hex).toBe("#00ff00");
    expect(det.share).toBeGreaterThan(0.9);
    expect(det.transparentShare).toBe(0);
  });

  test("reports a transparent border", () => {
    const data = buffer(4, 4, () => [0, 0, 0, 0]);
    expect(dominantMatteColor(data, 4, 4).transparentShare).toBe(1);
  });
});

describe("extractWithKey", () => {
  test("auto-selects a safe key, clears the matte, records the reason", async () => {
    const png = await sharp(Buffer.from(greenMatteWithViolet(16, 16)), { raw: { width: 16, height: 16, channels: 4 } })
      .png()
      .toBuffer();
    const res = await extractWithKey(png, { palette: VIOLET, size: 32 });

    expect(res.key.name).toBe("green");
    expect(res.key.safe).toBe(true);
    expect(res.key.reason).toMatch(/green/);
    expect(res.dimensions).toEqual([32, 32]);
    expect(res.residual.after).toBe(0); // no green left after keying

    // the emitted webp decodes to a 32×32 plate with a transparent corner.
    const out = await sharp(res.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(out.info.width).toBe(32);
    expect(out.info.height).toBe(32);
    expect(out.data[3]).toBe(0); // top-left corner transparent
  });

  test("a forced in-palette key is reported unsafe", async () => {
    const png = await sharp(Buffer.from(greenMatteWithViolet(16, 16)), { raw: { width: 16, height: 16, channels: 4 } })
      .png()
      .toBuffer();
    const res = await extractWithKey(png, { palette: VIOLET, key: "#ff00ff" });
    expect(res.key.hex).toBe("#ff00ff");
    expect(res.key.safe).toBe(false);
  });

  test("keyRgb helper import stays in sync", () => {
    // guards against an accidental hex/rgb drift in the shared parser
    expect(hexToRgb("#00ff00")).toEqual([0, 255, 0]);
  });
});
