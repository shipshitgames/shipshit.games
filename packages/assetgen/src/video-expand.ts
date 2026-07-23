import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import { hardenAlpha, keyOutMatte } from "./chroma-key.ts";
import { FAL_KEY_CONFIG } from "./fal.ts";
import { getKey, missingKeyMessage } from "./keys.ts";
import { hexToRgb } from "./key-color.ts";
import { downloadGeneratedAsset, outputUrl } from "./media.ts";
import { generateReplicateAsset, uploadReplicateFile } from "./replicate.ts";

export const DEFAULT_FAL_VIDEO_MODEL = "fal-ai/wan/v2.2-a14b/image-to-video";
export const DEFAULT_REPLICATE_VIDEO_MODEL = "wan-video/wan-2.2-i2v-fast";

export interface VideoClipRequest {
  originData: Buffer;
  prompt: string;
  provider: string;
  model?: string;
  frames: number;
  fps: number;
  size: number;
  keyColor: string;
  timeoutMs?: number;
  log?: (chunk: string) => void;
}

export interface VideoClip {
  provider: string;
  model?: string;
  mediaType?: string;
  extension?: string;
  data?: Buffer;
  /** The keyless mock lane supplies decoded frames while preserving the same clip seam. */
  frames?: Buffer[];
  /**
   * Real generated clip length in seconds (num_frames / fps the provider
   * actually used, after its own floors). Frame extraction samples across this
   * so the sprite spans the whole animation instead of only its opening window.
   */
  clipSeconds?: number;
}

export type VideoClipGenerator = (
  request: VideoClipRequest,
) => Promise<VideoClip>;

export interface VideoFrameRunResult {
  code: number;
  stderr: string;
}

export type VideoFrameRunner = (
  command: string,
  args: string[],
) => Promise<VideoFrameRunResult>;

export interface VideoCleanupResult {
  frames: Buffer[];
  comparison: Buffer;
  keyedPixels: number;
  lockedPixels: number;
  width: number;
  height: number;
}

export function replicateVideoInput(
  image: string,
  frameCount: number,
  fps: number,
): Record<string, unknown> {
  return {
    image,
    num_frames: Math.max(81, frameCount),
    frames_per_second: Math.max(5, fps),
  };
}

export function falVideoInput(
  imageUrl: string,
  prompt: string,
  frameCount: number,
  fps: number,
): Record<string, unknown> {
  return {
    image_url: imageUrl,
    prompt,
    num_frames: Math.max(17, frameCount),
    frames_per_second: Math.max(4, fps),
    resolution: "480p",
    aspect_ratio: "1:1",
  };
}

/**
 * Real clip length (seconds) implied by a provider input payload, read straight
 * from the num_frames / frames_per_second the builder actually emitted so the
 * value can never drift from the provider's own floors. Returns 0 when the
 * payload lacks usable timing (caller falls back to its configured duration).
 */
export function videoClipSeconds(input: Record<string, unknown>): number {
  const numFrames = Number(input.num_frames);
  const fps = Number(input.frames_per_second);
  if (
    Number.isFinite(numFrames) &&
    numFrames > 0 &&
    Number.isFinite(fps) &&
    fps > 0
  ) {
    return numFrames / fps;
  }
  return 0;
}

export function buildFfmpegFrameArgs(
  input: string,
  outputPattern: string,
  frameCount: number,
  durationSeconds: number,
): string[] {
  const count = Math.max(1, Math.floor(frameCount));
  const duration =
    Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds
      : 2;
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-vf",
    `fps=${count}/${duration}`,
    "-frames:v",
    String(count),
    outputPattern,
  ];
}

export async function extractVideoFrames(
  clip: Buffer,
  frameCount: number,
  durationSeconds: number,
  deps: {
    runner?: VideoFrameRunner;
    ffmpegPath?: string;
    extension?: string;
  } = {},
): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), "assetgen-video-frames-"));
  const input = join(dir, `clip.${deps.extension || "mp4"}`);
  const pattern = join(dir, "frame-%04d.png");
  try {
    await writeFile(input, clip);
    const runner = deps.runner ?? defaultVideoFrameRunner;
    const result = await runner(
      deps.ffmpegPath ?? process.env.FFMPEG ?? "ffmpeg",
      buildFfmpegFrameArgs(input, pattern, frameCount, durationSeconds),
    );
    if (result.code !== 0)
      throw new Error(
        `ffmpeg frame extraction exited ${result.code}: ${result.stderr.slice(-500)}`,
      );
    const files = (await readdir(dir))
      .filter((name) => /^frame-\d+\.png$/.test(name))
      .sort();
    if (files.length !== Math.max(1, Math.floor(frameCount))) {
      throw new Error(
        `ffmpeg extracted ${files.length} frame(s), expected ${Math.max(1, Math.floor(frameCount))}`,
      );
    }
    return await Promise.all(files.map((name) => readFile(join(dir, name))));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Chroma-key a clip, then lock pixels whose RGBA variation stays below the threshold. */
export async function cleanVideoFrames(
  inputs: readonly Buffer[],
  options: { keyColor: string; staticThreshold?: number },
): Promise<VideoCleanupResult> {
  if (inputs.length === 0) throw new Error("video clip produced no frames");
  const firstMeta = await sharp(inputs[0]!).metadata();
  const width = firstMeta.width;
  const height = firstMeta.height;
  if (!width || !height) throw new Error("video frame is not a readable image");

  const raws: Buffer[] = [];
  for (const input of inputs) {
    raws.push(
      await sharp(input)
        .ensureAlpha()
        .resize(width, height, { fit: "fill", kernel: sharp.kernel.nearest })
        .raw()
        .toBuffer(),
    );
  }

  const key = hexToRgb(options.keyColor);
  let keyedPixels = 0;
  for (const raw of raws) {
    keyedPixels += keyOutMatte(raw, width, height, key);
    hardenAlpha(raw, width, height);
  }

  const threshold = Math.max(
    0,
    Math.min(255, Math.floor(options.staticThreshold ?? 10)),
  );
  let lockedPixels = 0;
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * 4;
    let staticPixel = true;
    const averages = [0, 0, 0, 0];
    for (let channel = 0; channel < 4; channel++) {
      let min = 255;
      let max = 0;
      let sum = 0;
      for (const raw of raws) {
        const value = raw[offset + channel]!;
        min = Math.min(min, value);
        max = Math.max(max, value);
        sum += value;
      }
      if (max - min > threshold) staticPixel = false;
      averages[channel] = Math.round(sum / raws.length);
    }
    if (!staticPixel) continue;
    lockedPixels++;
    for (const raw of raws) {
      for (let channel = 0; channel < 4; channel++)
        raw[offset + channel] = averages[channel]!;
    }
  }

  const frames = await Promise.all(
    raws.map((raw) =>
      sharp(raw, { raw: { width, height, channels: 4 } })
        .png()
        .toBuffer(),
    ),
  );
  const rawFirst = await sharp(inputs[0]!)
    .ensureAlpha()
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
  const comparison = await sharp({
    create: {
      width: width * 2,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: rawFirst, left: 0, top: 0 },
      { input: frames[0]!, left: width, top: 0 },
    ])
    .webp({ lossless: true })
    .toBuffer();

  return { frames, comparison, keyedPixels, lockedPixels, width, height };
}

export const generateVideoClip: VideoClipGenerator = async (request) => {
  if (request.provider === "mock") {
    return {
      provider: "mock",
      model: "mock-video",
      frames: await mockVideoFrames(request),
    };
  }
  if (request.provider === "fal") return generateFalVideo(request);
  if (request.provider === "replicate") return generateReplicateVideo(request);
  throw new Error(
    `video expansion supports provider mock|fal|replicate (received ${request.provider})`,
  );
};

async function mockVideoFrames(request: VideoClipRequest): Promise<Buffer[]> {
  const size = Math.max(16, request.size);
  const subject = await sharp(request.originData)
    .ensureAlpha()
    .resize(Math.round(size * 0.65), Math.round(size * 0.65), {
      fit: "contain",
    })
    .png()
    .toBuffer();
  const key = hexToRgb(request.keyColor);
  const count = Math.max(1, request.frames);
  return await Promise.all(
    Array.from({ length: count }, async (_unused, index) => {
      const phase = count === 1 ? 0 : index / (count - 1);
      const left = Math.round(
        size * 0.175 + Math.sin(phase * Math.PI * 2) * size * 0.04,
      );
      const top = Math.round(
        size * 0.175 + Math.sin(phase * Math.PI) * size * 0.025,
      );
      return await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: key[0], g: key[1], b: key[2], alpha: 1 },
        },
      })
        .composite([{ input: subject, left, top }])
        .png()
        .toBuffer();
    }),
  );
}

async function generateReplicateVideo(
  request: VideoClipRequest,
): Promise<VideoClip> {
  const model =
    request.model === "wan2.2-i2v" || !request.model
      ? DEFAULT_REPLICATE_VIDEO_MODEL
      : request.model;
  const image = await uploadReplicateFile(request.originData);
  const input = replicateVideoInput(image, request.frames, request.fps);
  const asset = await generateReplicateAsset(request.prompt, {
    model,
    input,
    timeoutMs: request.timeoutMs ?? 600_000,
    log: request.log,
  });
  return {
    ...asset,
    provider: "replicate",
    model,
    clipSeconds: videoClipSeconds(input),
  };
}

async function generateFalVideo(request: VideoClipRequest): Promise<VideoClip> {
  const key = getKey(FAL_KEY_CONFIG.envName, FAL_KEY_CONFIG.service);
  if (!key) throw missingKeyMessage(FAL_KEY_CONFIG);
  const model =
    request.model === "wan2.2-i2v" || !request.model
      ? DEFAULT_FAL_VIDEO_MODEL
      : request.model;
  const base = (
    process.env.FAL_QUEUE_BASE_URL || "https://queue.fal.run"
  ).replace(/\/+$/, "");
  const headers = {
    authorization: `Key ${key}`,
    "content-type": "application/json",
  };
  const imageUrl = `data:image/png;base64,${(await sharp(request.originData).png().toBuffer()).toString("base64")}`;
  const input = falVideoInput(
    imageUrl,
    request.prompt,
    request.frames,
    request.fps,
  );
  const submit = await fetch(`${base}/${model}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(120_000),
  });
  if (!submit.ok)
    throw new Error(`fal video ${submit.status}: ${await submit.text()}`);
  const queued = (await submit.json()) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
  };
  if (!queued.request_id || !queued.status_url || !queued.response_url)
    throw new Error("fal video queue response is incomplete");
  assertFalQueueUrl(queued.status_url, base);
  assertFalQueueUrl(queued.response_url, base);

  const deadline = Date.now() + (request.timeoutMs ?? 600_000);
  for (;;) {
    if (Date.now() >= deadline)
      throw new Error("fal video generation timed out");
    const statusResponse = await fetch(queued.status_url, {
      headers: { authorization: `Key ${key}` },
      signal: AbortSignal.timeout(120_000),
    });
    if (!statusResponse.ok)
      throw new Error(
        `fal video status ${statusResponse.status}: ${await statusResponse.text()}`,
      );
    const status = (await statusResponse.json()) as { status?: string };
    request.log?.(`[fal] ${status.status ?? "queued"} ${queued.request_id}\n`);
    if (status.status === "COMPLETED") break;
    if (status.status === "FAILED" || status.status === "CANCELLED")
      throw new Error(`fal video ${status.status.toLowerCase()}`);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  const resultResponse = await fetch(queued.response_url, {
    headers: { authorization: `Key ${key}` },
    signal: AbortSignal.timeout(120_000),
  });
  if (!resultResponse.ok)
    throw new Error(
      `fal video result ${resultResponse.status}: ${await resultResponse.text()}`,
    );
  const json = await resultResponse.json();
  const url = outputUrl(json);
  if (!url) throw new Error("fal video completed without a downloadable video");
  const asset = await downloadGeneratedAsset(url, model, fetch, {
    timeoutMs: 120_000,
  });
  return {
    ...asset,
    provider: "fal",
    model,
    clipSeconds: videoClipSeconds(input),
  };
}

function assertFalQueueUrl(value: string, base: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("fal video queue returned a malformed callback URL");
  }
  if (url.origin !== new URL(base).origin) {
    throw new Error(
      `fal video queue returned an off-origin callback URL: ${url.origin}`,
    );
  }
}

function defaultVideoFrameRunner(
  command: string,
  args: string[],
): Promise<VideoFrameRunResult> {
  return new Promise((resolve) => {
    let stderr = "";
    const child = spawn(command, args);
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) => (stderr += `\n${String(error)}`));
    child.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}
