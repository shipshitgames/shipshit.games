import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pixelize } from "../pixelize.ts";
import { flag, intFlag } from "./args.ts";

export async function runPixelizeCommand(argv: string[]): Promise<void> {
  const inPath = flag(argv, "in");
  const outPath = flag(argv, "out");
  if (!inPath || !outPath) {
    console.error("usage: assetgen pixelize --in <raw.png> --out <sprite.webp> [--height 110] [--bg 42]");
    process.exit(1);
  }
  const height = intFlag(argv, "height", 110);
  const buf = await pixelize(await readFile(inPath), {
    height,
    bgThreshold: intFlag(argv, "bg", 42),
  });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  console.log(`[pixelize] ${inPath} -> ${outPath} (${(buf.length / 1024).toFixed(1)} kb, ${height}px grid)`);
}
