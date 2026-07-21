import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";

import sharp from "sharp";

import {
  buildFfmpegFrameArgs,
  cleanVideoFrames,
  extractVideoFrames,
  falVideoInput,
  generateVideoClip,
  replicateVideoInput,
} from "./video-expand.ts";

async function keyedFrame(subject: number): Promise<Buffer> {
  const width = 8;
  const height = 8;
  const data = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * 4;
    data[offset] = 0;
    data[offset + 1] = 255;
    data[offset + 2] = 0;
    data[offset + 3] = 255;
  }
  for (let y = 2; y < 6; y++) {
    for (let x = 2; x < 6; x++) {
      const offset = (y * width + x) * 4;
      data[offset] = subject;
      data[offset + 1] = 20;
      data[offset + 2] = 20;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

test("buildFfmpegFrameArgs samples the requested frame count across the clip duration", () => {
  assert.deepEqual(buildFfmpegFrameArgs("in.mp4", "frame-%04d.png", 6, 2), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    "in.mp4",
    "-vf",
    "fps=6/2",
    "-frames:v",
    "6",
    "frame-%04d.png",
  ]);
});

test("video provider inputs honor the official Wan 2.2 minimums", () => {
  assert.deepEqual(replicateVideoInput("https://x.test/origin.png", 4, 2), {
    image: "https://x.test/origin.png",
    num_frames: 81,
    frames_per_second: 5,
  });
  assert.deepEqual(falVideoInput("data:image/png;base64,eA==", "run", 4, 2), {
    image_url: "data:image/png;base64,eA==",
    prompt: "run",
    num_frames: 17,
    frames_per_second: 4,
    resolution: "480p",
    aspect_ratio: "1:1",
  });
});

test("extractVideoFrames owns temp files and accepts the shared injectable runner pattern", async () => {
  const frame = await keyedFrame(190);
  let seenCommand = "";
  let seenArgs: string[] = [];
  const frames = await extractVideoFrames(Buffer.from("stub-video"), 2, 1, {
    ffmpegPath: "/fake/ffmpeg",
    runner: async (command, args) => {
      seenCommand = command;
      seenArgs = args;
      const pattern = args.at(-1)!;
      await writeFile(pattern.replace("%04d", "0001"), frame);
      await writeFile(pattern.replace("%04d", "0002"), frame);
      return { code: 0, stderr: "" };
    },
  });
  assert.equal(seenCommand, "/fake/ffmpeg");
  assert.equal(seenArgs.includes("fps=2/1"), true);
  assert.equal(frames.length, 2);
});

test("cleanVideoFrames keys the matte, locks low-variance pixels, and emits a comparison", async () => {
  const result = await cleanVideoFrames(
    [await keyedFrame(190), await keyedFrame(194)],
    {
      keyColor: "#00ff00",
      staticThreshold: 10,
    },
  );
  assert.ok(result.keyedPixels > 0);
  assert.ok(result.lockedPixels > 0);
  assert.equal(result.frames.length, 2);
  const first = await sharp(result.frames[0]!).ensureAlpha().raw().toBuffer();
  const second = await sharp(result.frames[1]!).ensureAlpha().raw().toBuffer();
  assert.equal(first[3], 0, "green matte becomes transparent");
  const subjectOffset = (3 * 8 + 3) * 4;
  assert.equal(
    first[subjectOffset],
    second[subjectOffset],
    "static subject colour is locked across frames",
  );
  const comparison = await sharp(result.comparison).metadata();
  assert.equal(comparison.format, "webp");
  assert.equal(comparison.width, 16);
});

test("mock video generation returns a keyless clip with the requested decoded frame count", async () => {
  const origin = await keyedFrame(180);
  const clip = await generateVideoClip({
    originData: origin,
    prompt: "run",
    provider: "mock",
    frames: 3,
    fps: 8,
    size: 32,
    keyColor: "#00ff00",
  });
  assert.equal(clip.provider, "mock");
  assert.equal(clip.model, "mock-video");
  assert.equal(clip.frames?.length, 3);
});
