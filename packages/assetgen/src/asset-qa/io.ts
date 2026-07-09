import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";

import sharp from "sharp";

import type { AssetQaWebpOutput, RgbaImage, WebpEncodingKind } from "./types.ts";
import { assertRgbaImage } from "./rgba.ts";

const MAX_IMAGE_BUFFER = 512 * 1024 * 1024;

export function encodePamRgba(image: RgbaImage): Buffer {
  assertRgbaImage(image);
  const header = Buffer.from(
    `P7\nWIDTH ${image.width}\nHEIGHT ${image.height}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`,
    "ascii",
  );
  return Buffer.concat([header, image.data]);
}

export function decodePamRgba(buffer: Buffer): RgbaImage {
  const preview = buffer.subarray(0, Math.min(buffer.length, 64 * 1024)).toString("latin1");
  const end = /ENDHDR\r?\n/.exec(preview);
  if (end?.index === undefined) throw new Error("PAM input is missing ENDHDR");
  const dataOffset = end.index + end[0].length;
  const header = preview.slice(0, dataOffset).replace(/\r/g, "");
  const lines = header
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (lines[0] !== "P7") throw new Error(`expected PAM P7 magic, got ${JSON.stringify(lines[0] ?? "")}`);
  const fields = new Map<string, string>();
  for (const line of lines.slice(1)) {
    if (line === "ENDHDR") continue;
    const field = /^(\S+)\s+(.+)$/.exec(line);
    if (!field) throw new Error(`invalid PAM header line: ${JSON.stringify(line)}`);
    fields.set(field[1]!, field[2]!.trim());
  }
  const width = Number(fields.get("WIDTH"));
  const height = Number(fields.get("HEIGHT"));
  const depth = Number(fields.get("DEPTH"));
  const maxValue = Number(fields.get("MAXVAL"));
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`PAM dimensions must be positive integers, got ${width}x${height}`);
  }
  if (depth !== 4 || maxValue !== 255 || fields.get("TUPLTYPE") !== "RGB_ALPHA") {
    throw new Error(
      `expected 8-bit RGBA PAM (DEPTH 4, MAXVAL 255, TUPLTYPE RGB_ALPHA), got DEPTH ${depth}, MAXVAL ${maxValue}, TUPLTYPE ${fields.get("TUPLTYPE") ?? "missing"}`,
    );
  }
  const expected = width * height * 4;
  const data = buffer.subarray(dataOffset);
  if (data.length !== expected) throw new Error(`PAM raster is ${data.length} bytes; expected ${expected} for ${width}x${height} RGBA`);
  return { data: Buffer.from(data), width, height };
}

export async function withTemporaryDirectory<T>(prefix: string, fn: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runBinary(command: string, args: readonly string[], maxBuffer = MAX_IMAGE_BUFFER): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(error);
    };

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        fail(new Error(`missing required ${command} binary; install the libwebp command-line tools`));
      } else {
        fail(new Error(`${command} failed to start: ${error.message}`));
      }
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBuffer) {
        fail(new Error(`${command} output exceeded ${maxBuffer} bytes`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(`${command} exited ${code ?? `on signal ${signal ?? "unknown"}`}${detail ? `: ${detail}` : ""}`));
        return;
      }
      resolve(Buffer.concat(stdout));
    });
  });
}

export async function decodeImageFile(path: string): Promise<RgbaImage> {
  const extension = extname(path).toLowerCase();
  if (extension === ".pam") return decodePamRgba(await readFile(path));
  if (extension === ".webp") {
    const pam = await runBinary("dwebp", ["-quiet", path, "-pam", "-o", "-"]);
    return decodePamRgba(pam);
  }
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`${path}: expected RGBA decode, got ${info.channels} channels`);
  return { data: Buffer.from(data), width: info.width, height: info.height };
}

export async function encodeWebp(image: RgbaImage, options: AssetQaWebpOutput): Promise<Buffer> {
  assertRgbaImage(image);
  const method = options.method ?? (options.lossless ? 4 : 6);
  if (!Number.isInteger(method) || method < 0 || method > 6) throw new Error(`WebP method must be an integer from 0 to 6, got ${method}`);
  const quality = options.quality ?? 92;
  if (!Number.isFinite(quality) || quality < 0 || quality > 100) throw new Error(`WebP quality must be between 0 and 100, got ${quality}`);

  return await withTemporaryDirectory("assetgen-asset-qa-", async (directory) => {
    const pamPath = join(directory, "input.pam");
    const webpPath = join(directory, "output.webp");
    await writeFile(pamPath, encodePamRgba(image));
    const args = options.lossless
      ? ["-quiet", "-lossless", "-m", String(method)]
      : ["-quiet", "-q", String(quality), "-alpha_q", "100", "-m", String(method)];
    if (options.exact ?? true) args.push("-exact");
    args.push(pamPath, "-o", webpPath);
    await runBinary("cwebp", args, 64 * 1024 * 1024);
    const output = await readFile(webpPath);
    if (output.length === 0) throw new Error("cwebp produced an empty output file");
    const actual = webpEncodingKind(output);
    const expected: WebpEncodingKind = options.lossless ? "lossless" : "lossy";
    if (actual !== expected) throw new Error(`cwebp produced ${actual} WebP; expected ${expected}`);
    return output;
  });
}

/** Detect the payload codec without decoding or rewriting the file. */
export function webpEncodingKind(buffer: Buffer): WebpEncodingKind {
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return "unknown";
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const fourcc = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (fourcc === "VP8L") return "lossless";
    if (fourcc === "VP8 ") return "lossy";
    const next = offset + 8 + size + (size % 2);
    if (!Number.isSafeInteger(next) || next <= offset || next > buffer.length) return "unknown";
    offset = next;
  }
  return "unknown";
}

/** Atomically replace a target without leaving temporary files behind. */
export async function writeFileAtomic(path: string, data: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const directory = await mkdtemp(join(dirname(path), `.${basename(path)}.asset-qa-`));
  const temporaryPath = join(directory, "output");
  try {
    await writeFile(temporaryPath, data);
    await rename(temporaryPath, path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
