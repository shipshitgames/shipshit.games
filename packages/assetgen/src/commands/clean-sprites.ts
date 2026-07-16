import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { alphaBounds as measureAlphaBounds } from "../asset-qa/rgba.ts";

type ArgValue = string | boolean | undefined;
type ParsedArgs = Record<string, ArgValue>;
type ChromaKeyName = "magenta" | "green" | "blue";
type ChromaMode = ChromaKeyName | "auto";
type OutputFormat = "webp" | "png";
type Rgb = readonly [number, number, number];

type CleanSpriteOptions = {
  chromaKey: ChromaMode;
  tolerance: number;
  halo: number;
  padding: number;
  size: number | undefined;
  pixelScale: number;
  fit: boolean;
  format: OutputFormat;
  quality: number;
  recursive: boolean;
  dryRun: boolean;
};

type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type CleanSpriteResult = {
  input: string;
  output: string;
  key: ChromaKeyName | "custom" | "none";
  /** Share of pixels matching the chosen key (0 when no key was applied). */
  keyShare: number;
  bounds: {
    width: number;
    height: number;
  };
  canvas: number;
};

const IMAGE_EXTENSIONS = new Set([".png", ".webp", ".jpg", ".jpeg"]);
const CHROMA_KEYS = {
  magenta: [255, 0, 255],
  green: [0, 255, 0],
  blue: [0, 0, 255],
} as const satisfies Record<ChromaKeyName, Rgb>;
const CHROMA_KEY_ENTRIES = Object.entries(CHROMA_KEYS) as Array<[ChromaKeyName, Rgb]>;

export async function runCleanSpritesCommand(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const input = stringArg(args.input);
  const output = stringArg(args.output);

  if (!input || !output) {
    console.error(
      [
        "Usage:",
        "  assetgen clean-sprites --input <file-or-dir> --output <dir> [options]",
        "",
        "Options:",
        "  --key magenta|green|blue|auto   Chroma key to remove. Default: auto",
        "  --tolerance <0-255>             Chroma distance tolerance. Default: 70",
        "  --halo <0-255>                  Desaturate/alpha fringe near key. Default: 115",
        "  --padding <px>                  Transparent padding around crop. Default: 24",
        "  --size <px>                     Square output canvas. Default: next power of two",
        "  --pixel-scale <px>              Down/up pixelize step before export. Default: 0",
        "  --no-fit                        Fail instead of resizing crops larger than canvas",
        "  --format webp|png               Output format. Default: webp",
        "  --quality <1-100>               WebP quality. Default: 92",
        "  --recursive                     Recurse when input is a directory",
        "  --dry-run                       Print actions only",
      ].join("\n"),
    );
    process.exit(1);
  }

  const chromaKey = stringArg(args.key) ?? "auto";
  if (!isChromaMode(chromaKey)) {
    throw new Error(`Unknown --key ${chromaKey}`);
  }

  const options: CleanSpriteOptions = {
    chromaKey,
    tolerance: numberArg(args.tolerance, 70),
    halo: numberArg(args.halo, 115),
    padding: numberArg(args.padding, 24),
    size: typeof args.size === "string" ? numberArg(args.size, 0) : undefined,
    pixelScale: numberArg(args["pixel-scale"], 0),
    fit: !args["no-fit"],
    format: formatArg(args.format),
    quality: numberArg(args.quality, 92),
    recursive: Boolean(args.recursive),
    dryRun: Boolean(args["dry-run"]),
  };

  const inputPath = path.resolve(input);
  const outputPath = path.resolve(output);
  const inputs = await collectInputs(inputPath, options.recursive);

  if (!options.dryRun) {
    await fs.mkdir(outputPath, { recursive: true });
  }

  const results: CleanSpriteResult[] = [];
  for (const input of inputs) {
    const result = await cleanSprite(input, outputPath, options);
    results.push(result);
    const keyLabel = result.key === "none" ? "none" : `${result.key} ${(result.keyShare * 100).toFixed(1)}%`;
    console.log(
      `${options.dryRun ? "would clean" : "cleaned"} ${path.relative(process.cwd(), input)} -> ${path.relative(
        process.cwd(),
        result.output,
      )} (${result.bounds.width}x${result.bounds.height} on ${result.canvas}x${result.canvas}, key=${keyLabel})`,
    );
  }

  if (!results.length) {
    console.log("No sprite images found.");
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function stringArg(value: ArgValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberArg(value: ArgValue, fallback: number): number {
  if (value === undefined || value === true) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected number, got ${value}`);
  return parsed;
}

function formatArg(value: ArgValue): OutputFormat {
  if (value === undefined || value === true) return "webp";
  if (value === "webp" || value === "png") return value;
  throw new Error(`Unknown --format ${value}`);
}

async function collectInputs(input: string, recursive: boolean): Promise<string[]> {
  const stat = await fs.stat(input);
  if (stat.isFile()) return IMAGE_EXTENSIONS.has(path.extname(input).toLowerCase()) ? [input] : [];
  const entries = await fs.readdir(input, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(input, entry.name);
    if (entry.isDirectory() && recursive) files.push(...(await collectInputs(fullPath, recursive)));
    if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function cleanSprite(input: string, outputDir: string, options: CleanSpriteOptions): Promise<CleanSpriteResult> {
  const image = sharp(input).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) {
    throw new Error(`Could not read image dimensions for ${input}`);
  }

  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  const chosen = chooseChromaKey(data, options.chromaKey);
  const pixels = Buffer.from(data);

  // When auto found no dominant key, the sprite is already key-free — keying would
  // punch holes in the subject, so skip chroma removal and only crop/pad.
  if (chosen !== NO_KEY) {
    const key = chosen.key;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      const alpha = pixels[offset + 3] ?? 0;
      const color: Rgb = [red, green, blue];
      const distance = colorDistance(color, key);

      if (distance <= options.tolerance) {
        pixels[offset + 3] = 0;
        continue;
      }

      if (distance <= options.halo) {
        const fade = (distance - options.tolerance) / Math.max(1, options.halo - options.tolerance);
        pixels[offset + 3] = Math.round(alpha * clamp(fade, 0, 1));
      }
    }
  }

  const bounds = alphaBounds(pixels, width, height);
  if (!bounds) throw new Error(`No non-chroma pixels found in ${input}`);

  const paddedBounds = padBounds(bounds, width, height, options.padding);
  const cropWidth = paddedBounds.right - paddedBounds.left + 1;
  const cropHeight = paddedBounds.bottom - paddedBounds.top + 1;
  const canvas = options.size ?? nextPowerOfTwo(Math.max(cropWidth, cropHeight));
  if (!options.fit && (cropWidth > canvas || cropHeight > canvas)) {
    throw new Error(`Sprite crop ${cropWidth}x${cropHeight} does not fit requested ${canvas}x${canvas}`);
  }

  let cleaned = sharp(pixels, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .extract({
      left: paddedBounds.left,
      top: paddedBounds.top,
      width: cropWidth,
      height: cropHeight,
    });

  const fitted = fitDimensions(cropWidth, cropHeight, canvas);
  if (options.fit && (cropWidth > canvas || cropHeight > canvas)) {
    cleaned = cleaned.resize(fitted.width, fitted.height, {
      fit: "fill",
      kernel: "nearest",
    });
  }

  cleaned = cleaned.extend({
    left: Math.floor((canvas - fitted.width) / 2),
    right: Math.ceil((canvas - fitted.width) / 2),
    top: Math.floor((canvas - fitted.height) / 2),
    bottom: Math.ceil((canvas - fitted.height) / 2),
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  if (options.pixelScale > 0 && options.pixelScale < canvas) {
    cleaned = cleaned
      .resize(options.pixelScale, options.pixelScale, { fit: "contain", kernel: "nearest" })
      .resize(canvas, canvas, { fit: "fill", kernel: "nearest" });
  }

  const baseName = path.basename(input, path.extname(input));
  const extension = options.format === "png" ? ".png" : ".webp";
  const output = path.join(outputDir, `${baseName}-clean${extension}`);

  if (!options.dryRun) {
    if (options.format === "png") {
      await cleaned.png({ compressionLevel: 9 }).toFile(output);
    } else {
      await cleaned.webp({ quality: options.quality, lossless: false, smartSubsample: false }).toFile(output);
    }
  }

  return {
    input,
    output,
    key: chosen === NO_KEY ? "none" : keyName(chosen.key),
    keyShare: chosen === NO_KEY ? 0 : chosen.share,
    bounds: {
      width: cropWidth,
      height: cropHeight,
    },
    canvas,
  };
}

/**
 * The winning auto-key must cover at least this fraction of the image before we
 * treat the sprite as chroma-keyed. Below it, the matches are incidental subject
 * pixels (a stray green leaf, a blue rim light) and keying would punch holes in
 * the art, so we report "no key" and skip chroma removal entirely.
 */
const MIN_KEY_SHARE = 0.02;

/** Sentinel meaning "auto found no dominant chroma key" — skip the removal pass. */
const NO_KEY = "none" as const;

function chooseChromaKey(data: Buffer, mode: ChromaMode): { key: Rgb; share: number } | typeof NO_KEY {
  if (mode !== "auto") return { key: CHROMA_KEYS[mode], share: 1 };
  const totalPixels = data.length / 4;
  const scores = new Map<ChromaKeyName, number>(CHROMA_KEY_ENTRIES.map(([name]) => [name, 0]));
  for (let offset = 0; offset < data.length; offset += 4) {
    const color: Rgb = [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0];
    for (const [name, key] of CHROMA_KEY_ENTRIES) {
      if (colorDistance(color, key) < 80) scores.set(name, (scores.get(name) ?? 0) + 1);
    }
  }
  const [winner, winnerCount] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const share = totalPixels > 0 ? winnerCount / totalPixels : 0;
  // A key-free sprite with incidental key-coloured pixels must not be treated as
  // keyed: require the winner to cover a meaningful share before keying.
  if (share < MIN_KEY_SHARE) return NO_KEY;
  return { key: CHROMA_KEYS[winner], share };
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function keyName(key: Rgb): ChromaKeyName | "custom" {
  for (const [name, value] of CHROMA_KEY_ENTRIES) {
    if (value.every((component, index) => component === key[index])) return name;
  }
  return "custom";
}

function alphaBounds(pixels: Buffer, width: number, height: number): Bounds | null {
  const bounds = measureAlphaBounds({ data: pixels, width, height }, 4);
  return bounds
    ? { left: bounds.minX, top: bounds.minY, right: bounds.maxX, bottom: bounds.maxY }
    : null;
}

function padBounds(bounds: Bounds, width: number, height: number, padding: number): Bounds {
  return {
    left: Math.max(0, bounds.left - padding),
    top: Math.max(0, bounds.top - padding),
    right: Math.min(width - 1, bounds.right + padding),
    bottom: Math.min(height - 1, bounds.bottom + padding),
  };
}

function fitDimensions(width: number, height: number, canvas: number): { width: number; height: number } {
  if (width <= canvas && height <= canvas) return { width, height };
  const scale = Math.min(canvas / width, canvas / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isChromaMode(value: string): value is ChromaMode {
  return value === "auto" || value in CHROMA_KEYS;
}
