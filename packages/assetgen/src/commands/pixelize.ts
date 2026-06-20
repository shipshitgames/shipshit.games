import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pixelizeDetailed, resolvePaletteByName, PIXELIZE_PALETTES } from "../pixelize.ts";
import { normalizeCutoutMode } from "../pixelize-opts.ts";
import { maybeUpscale, normalizeScale } from "../upscale.ts";
import { flag, has, intFlag } from "./args.ts";

export async function runPixelizeCommand(argv: string[]): Promise<void> {
  const inPath = flag(argv, "in");
  const outPath = flag(argv, "out");
  if (!inPath || !outPath) {
    console.error(
      "usage: assetgen pixelize --in <raw.png> --out <sprite.webp> [--height 110] [--bg 42] " +
        "[--cutout auto|rembg|flood|none] [--palette doom] [--upscale] [--upscale-scale 2|4] [--upscale-model <name>]",
    );
    process.exit(1);
  }
  const height = intFlag(argv, "height", 110);
  // Cutout backend (#66): auto prefers rembg (subject segmentation for dark-bodied
  // subjects) and falls back to the flood-fill when rembg is not installed.
  const cutout = normalizeCutoutMode(flag(argv, "cutout", "auto"));
  const paletteName = flag(argv, "palette", "doom");
  const palette = resolvePaletteByName(paletteName);
  if (paletteName && !palette) {
    console.error(`unknown palette: ${paletteName} (known: ${Object.keys(PIXELIZE_PALETTES).join(", ")})`);
    process.exit(1);
  }
  const buf0 = await readFile(inPath);
  let raw: Buffer = buf0;
  if (has(argv, "upscale")) {
    const up = await maybeUpscale(buf0, {
      scale: normalizeScale(intFlag(argv, "upscale-scale", 4)),
      model: flag(argv, "upscale-model"),
      log: (c) => process.stdout.write(c),
    });
    raw = up.data;
    console.log(
      up.upscaled ? `[pixelize] upscaled ×${up.scale} pre-pass` : `[pixelize] upscale skipped (${up.reason})`,
    );
  }
  const { data: buf, cutout: cutoutInfo } = await pixelizeDetailed(raw, {
    height,
    bgThreshold: intFlag(argv, "bg", 42),
    cutout,
    palette,
  });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  console.log(`[pixelize] cutout: ${cutoutInfo.tool}${cutoutInfo.reason ? ` (${cutoutInfo.reason})` : ""}`);
  console.log(`[pixelize] ${inPath} -> ${outPath} (${(buf.length / 1024).toFixed(1)} kb, ${height}px grid)`);
}
