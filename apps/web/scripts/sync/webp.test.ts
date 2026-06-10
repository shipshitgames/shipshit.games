import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { readWebpDimensions } from "./webp";
import { PUBLIC_SPRITES_DIR, WEB_ROOT } from "./paths";

describe("readWebpDimensions", () => {
  test("rejects non-webp bytes", () => {
    expect(readWebpDimensions(new Uint8Array(64))).toBeNull();
    expect(readWebpDimensions(new TextEncoder().encode("RIFFxxxxNOPE" + "x".repeat(40)))).toBeNull();
  });

  test("parses every synced sprite", () => {
    // The synced set mixes VP8, VP8L, and VP8X containers — all must parse.
    const samples: string[] = [];
    const walk = (dir: string) => {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walk(full);
        else if (item.name.endsWith(".webp")) samples.push(full);
      }
    };
    walk(path.join(PUBLIC_SPRITES_DIR, "entities"));
    walk(path.join(WEB_ROOT, "public/images/games"));
    expect(samples.length).toBeGreaterThan(10);

    for (const file of samples) {
      const dims = readWebpDimensions(new Uint8Array(readFileSync(file)));
      expect(dims).not.toBeNull();
      const [width, height] = dims as [number, number];
      expect(width).toBeGreaterThan(0);
      expect(width).toBeLessThan(20000);
      expect(height).toBeGreaterThan(0);
      expect(height).toBeLessThan(20000);
    }
  });
});
