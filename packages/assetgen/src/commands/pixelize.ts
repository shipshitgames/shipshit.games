import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pixelize } from "../pixelize.ts";
import { maybeUpscale, normalizeScale } from "../upscale.ts";
import { flag, has, intFlag } from "./args.ts";

export async function runPixelizeCommand(argv: string[]): Promise<void> {
  const inPath = flag(argv, "in");
  const outPath = flag(argv, "out");
  if (!inPath || !outPath) {
    console.error(
      "usage: assetgen pixelize --in <raw.png> --out <sprite.webp> [--height 110] [--bg 42] [--upscale] [--upscale-scale 2|4] [--upscale-model <name>]",
    );
    process.exit(1);
  }
  const height = intFlag(argv, "height", 110);
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
  const buf = await pixelize(raw, {
    height,
    bgThreshold: intFlag(argv, "bg", 42),
  });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  console.log(`[pixelize] ${inPath} -> ${outPath} (${(buf.length / 1024).toFixed(1)} kb, ${height}px grid)`);
}
