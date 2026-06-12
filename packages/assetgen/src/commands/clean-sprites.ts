import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const IMAGE_EXTENSIONS = new Set([".png", ".webp", ".jpg", ".jpeg"]);
const CHROMA_KEYS = {
  magenta: [255, 0, 255],
  green: [0, 255, 0],
  blue: [0, 0, 255],
};

export async function runCleanSpritesCommand(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  if (!args.input || !args.output) {
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

  const options = {
    chromaKey: args.key ?? "auto",
    tolerance: numberArg(args.tolerance, 70),
    halo: numberArg(args.halo, 115),
    padding: numberArg(args.padding, 24),
    size: args.size ? numberArg(args.size, 0) : undefined,
    pixelScale: numberArg(args["pixel-scale"], 0),
    fit: !args["no-fit"],
    format: args.format ?? "webp",
    quality: numberArg(args.quality, 92),
    recursive: Boolean(args.recursive),
    dryRun: Boolean(args["dry-run"]),
  };

  if (!["auto", ...Object.keys(CHROMA_KEYS)].includes(options.chromaKey)) {
    throw new Error(`Unknown --key ${options.chromaKey}`);
  }

  const inputPath = path.resolve(String(args.input));
  const outputPath = path.resolve(String(args.output));
  const inputs = await collectInputs(inputPath, options.recursive);

  if (!options.dryRun) {
    await fs.mkdir(outputPath, { recursive: true });
  }

  const results = [];
  for (const input of inputs) {
    const result = await cleanSprite(input, outputPath, options);
    results.push(result);
    console.log(
      `${options.dryRun ? "would clean" : "cleaned"} ${path.relative(process.cwd(), input)} -> ${path.relative(
        process.cwd(),
        result.output,
      )} (${result.bounds.width}x${result.bounds.height} on ${result.canvas}x${result.canvas}, key=${result.key})`,
    );
  }

  if (!results.length) {
    console.log("No sprite images found.");
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
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

function numberArg(value, fallback) {
  if (value === undefined || value === true) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected number, got ${value}`);
  return parsed;
}

async function collectInputs(input, recursive) {
  const stat = await fs.stat(input);
  if (stat.isFile()) return IMAGE_EXTENSIONS.has(path.extname(input).toLowerCase()) ? [input] : [];
  const entries = await fs.readdir(input, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(input, entry.name);
    if (entry.isDirectory() && recursive) files.push(...(await collectInputs(fullPath, recursive)));
    if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function cleanSprite(input, outputDir, options) {
  const image = sharp(input).ensureAlpha();
  const metadata = await image.metadata();
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  const key = chooseChromaKey(data, options.chromaKey);
  const pixels = Buffer.from(data);

  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const alpha = pixels[offset + 3];
    const distance = colorDistance([red, green, blue], key);

    if (distance <= options.tolerance) {
      pixels[offset + 3] = 0;
      continue;
    }

    if (distance <= options.halo) {
      const fade = (distance - options.tolerance) / Math.max(1, options.halo - options.tolerance);
      pixels[offset + 3] = Math.round(alpha * clamp(fade, 0, 1));
    }
  }

  const bounds = alphaBounds(pixels, metadata.width, metadata.height);
  if (!bounds) throw new Error(`No non-chroma pixels found in ${input}`);

  const paddedBounds = padBounds(bounds, metadata.width, metadata.height, options.padding);
  const cropWidth = paddedBounds.right - paddedBounds.left + 1;
  const cropHeight = paddedBounds.bottom - paddedBounds.top + 1;
  const canvas = options.size ?? nextPowerOfTwo(Math.max(cropWidth, cropHeight));
  if (!options.fit && (cropWidth > canvas || cropHeight > canvas)) {
    throw new Error(`Sprite crop ${cropWidth}x${cropHeight} does not fit requested ${canvas}x${canvas}`);
  }

  let cleaned = sharp(pixels, {
    raw: {
      width: metadata.width,
      height: metadata.height,
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
    key: keyName(key),
    bounds: {
      width: cropWidth,
      height: cropHeight,
    },
    canvas,
  };
}

function chooseChromaKey(data, mode) {
  if (mode !== "auto") return CHROMA_KEYS[mode];
  const scores = new Map(Object.entries(CHROMA_KEYS).map(([name]) => [name, 0]));
  for (let offset = 0; offset < data.length; offset += 4) {
    const color = [data[offset], data[offset + 1], data[offset + 2]];
    for (const [name, key] of Object.entries(CHROMA_KEYS)) {
      if (colorDistance(color, key) < 80) scores.set(name, scores.get(name) + 1);
    }
  }
  const [winner] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  return CHROMA_KEYS[winner];
}

function colorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function keyName(key) {
  for (const [name, value] of Object.entries(CHROMA_KEYS)) {
    if (value.every((component, index) => component === key[index])) return name;
  }
  return "custom";
}

function alphaBounds(pixels, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha <= 4) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  return { left, top, right, bottom };
}

function padBounds(bounds, width, height, padding) {
  return {
    left: Math.max(0, bounds.left - padding),
    top: Math.max(0, bounds.top - padding),
    right: Math.min(width - 1, bounds.right + padding),
    bottom: Math.min(height - 1, bounds.bottom + padding),
  };
}

function fitDimensions(width, height, canvas) {
  if (width <= canvas && height <= canvas) return { width, height };
  const scale = Math.min(canvas / width, canvas / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
