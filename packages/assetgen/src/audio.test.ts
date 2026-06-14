import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";

import {
  audioMetadata,
  buildAudioPrompt,
  buildFfmpegAudioArgs,
  buildFfprobeDurationArgs,
  clampBitrate,
  clampVolume,
  DEFAULT_AUDIO_BITRATE,
  defaultLoopForCategory,
  encodeAudioWebm,
  isAudioKind,
  parseFfmpegDuration,
  parseFfprobeDuration,
} from "./audio.ts";

test("buildFfmpegAudioArgs mirrors the desktop transcode argv (default)", () => {
  const args = buildFfmpegAudioArgs("/in.wav", "/out.webm", {});
  assert.deepEqual(args, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    "/in.wav",
    "-map",
    "0:a",
    "-c:a",
    "libopus",
    "-b:a",
    `${DEFAULT_AUDIO_BITRATE}k`,
    "/out.webm",
  ]);
});

test("buildFfmpegAudioArgs appends loudnorm only when normalize is set", () => {
  const args = buildFfmpegAudioArgs("/in.wav", "/out.webm", { bitrateKbps: 96, normalize: true });
  assert.equal(args.includes("-af"), true);
  assert.equal(args[args.indexOf("-af") + 1], "loudnorm");
  assert.equal(args.includes("96k"), true);
  // loudnorm precedes the output path, which is always last.
  assert.equal(args[args.length - 1], "/out.webm");
});

test("buildFfmpegAudioArgs clamps the bitrate below 32 and above 320", () => {
  const low = buildFfmpegAudioArgs("/in.wav", "/o.webm", { bitrateKbps: 1 });
  assert.equal(low.includes("32k"), true);
  const high = buildFfmpegAudioArgs("/in.wav", "/o.webm", { bitrateKbps: 9999 });
  assert.equal(high.includes("320k"), true);
});

test("parseFfmpegDuration parses HH:MM:SS.ss to seconds, undefined when absent", () => {
  assert.equal(parseFfmpegDuration("  Duration: 00:00:01.50, start: 0.0\n"), 1.5);
  assert.equal(parseFfmpegDuration("  Duration: 00:01:02.25, bitrate: 1k"), 62.25);
  assert.equal(parseFfmpegDuration("no duration here"), undefined);
});

test("parseFfprobeDuration parses bare seconds (2dp), undefined for N/A/empty/junk", () => {
  assert.equal(parseFfprobeDuration("1.508000\n"), 1.51);
  assert.equal(parseFfprobeDuration("62.25"), 62.25);
  assert.equal(parseFfprobeDuration("  0  "), 0);
  assert.equal(parseFfprobeDuration("N/A"), undefined);
  assert.equal(parseFfprobeDuration(""), undefined);
  assert.equal(parseFfprobeDuration("not-a-number"), undefined);
  assert.equal(parseFfprobeDuration("-3"), undefined);
});

test("buildFfprobeDurationArgs requests format=duration as a bare number", () => {
  assert.deepEqual(buildFfprobeDurationArgs("/out.webm"), [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nk=1:nw=1",
    "/out.webm",
  ]);
});

test("clampBitrate clamps and defaults", () => {
  assert.equal(clampBitrate(128), 128);
  assert.equal(clampBitrate(10), 32);
  assert.equal(clampBitrate(500), 320);
  assert.equal(clampBitrate(NaN), DEFAULT_AUDIO_BITRATE);
  assert.equal(clampBitrate(-5), DEFAULT_AUDIO_BITRATE);
});

test("clampVolume clamps to [0,1] and defaults to 1", () => {
  assert.equal(clampVolume(-1), 0);
  assert.equal(clampVolume(2), 1);
  assert.equal(clampVolume(0.5), 0.5);
  assert.equal(clampVolume(NaN), 1);
  assert.equal(clampVolume(0.125), 0.13);
});

test("defaultLoopForCategory loops music only", () => {
  assert.equal(defaultLoopForCategory("music"), true);
  assert.equal(defaultLoopForCategory("sfx"), false);
  assert.equal(defaultLoopForCategory("voice"), false);
});

test("isAudioKind recognizes audio kinds", () => {
  assert.equal(isAudioKind("music"), true);
  assert.equal(isAudioKind("sfx"), true);
  assert.equal(isAudioKind("voice"), true);
  assert.equal(isAudioKind("sprite"), false);
});

test("audioMetadata clamps volume, defaults loop per category, includes/omits duration", () => {
  const music = audioMetadata({ category: "music", volume: 5, duration: 2.5 });
  assert.deepEqual(music, { category: "music", volume: 1, loop: true, duration: 2.5 });

  const sfx = audioMetadata({ category: "sfx" });
  assert.deepEqual(sfx, { category: "sfx", volume: 1, loop: false });

  const explicitLoop = audioMetadata({ category: "sfx", loop: true, volume: 0.5 });
  assert.equal(explicitLoop.loop, true);
  assert.equal(explicitLoop.volume, 0.5);

  const noDuration = audioMetadata({ category: "voice", duration: Number.NaN });
  assert.equal("duration" in noDuration, false);
});

test("buildAudioPrompt produces clean audio direction with no visual vocabulary", () => {
  const music = buildAudioPrompt({ prompt: "tense dungeon theme", kind: "music" });
  assert.match(music, /tense dungeon theme/);
  assert.match(music, /loop/i);

  const sfx = buildAudioPrompt({ prompt: "metallic impact", kind: "sfx" });
  assert.match(sfx, /metallic impact/);
  assert.match(sfx, /sound effect/i);

  const voice = buildAudioPrompt({ prompt: "battle cry", kind: "voice" });
  assert.match(voice, /battle cry/);
  assert.match(voice, /voice line/i);

  const fallback = buildAudioPrompt({ prompt: "  raw text  ", kind: "other" });
  assert.equal(fallback, "raw text");

  for (const out of [music, sfx, voice, fallback]) {
    assert.doesNotMatch(out, /pixel/i);
    assert.doesNotMatch(out, /sprite/i);
    assert.doesNotMatch(out, /PIXEL/);
  }
});

test("encodeAudioWebm runs the injected runner, probes the encoded output for duration", async () => {
  let seenCmd: string | undefined;
  let seenArgs: string[] = [];
  let probeCmd: string | undefined;
  let probeArgs: string[] = [];
  const result = await encodeAudioWebm(
    Buffer.from("fake-input"),
    { bitrateKbps: 96, normalize: true },
    {
      ffmpegPath: "/fake/ffmpeg",
      ffprobePath: "/fake/ffprobe",
      inputExt: "wav",
      runner: async (cmd, args) => {
        seenCmd = cmd;
        seenArgs = args;
        // The runner is responsible for producing the output file at args[last].
        await writeFile(args[args.length - 1]!, Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]));
        // NOTE: empty stderr — a real `-loglevel error` encode prints no "Duration:" banner.
        return { code: 0, stderr: "" };
      },
      probeRunner: async (cmd, args) => {
        probeCmd = cmd;
        probeArgs = args;
        return { code: 0, stdout: "1.508000\n" };
      },
    },
  );
  assert.equal(seenCmd, "/fake/ffmpeg");
  assert.equal(seenArgs.includes("loudnorm"), true);
  assert.equal(probeCmd, "/fake/ffprobe");
  // ffprobe probes the encoded OUTPUT (args[last] of the encode), not the input.
  assert.equal(probeArgs[probeArgs.length - 1], seenArgs[seenArgs.length - 1]);
  assert.equal(result.mediaType, "audio/webm");
  assert.equal(result.extension, "webm");
  assert.equal(result.duration, 1.51);
  assert.ok(result.data.length > 0);
});

test("encodeAudioWebm falls back to the ffmpeg stderr Duration banner when ffprobe yields nothing", async () => {
  const result = await encodeAudioWebm(
    Buffer.from("fake-input"),
    {},
    {
      ffmpegPath: "/fake/ffmpeg",
      ffprobePath: "/fake/ffprobe",
      runner: async (_cmd, args) => {
        await writeFile(args[args.length - 1]!, Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]));
        return { code: 0, stderr: "  Duration: 00:00:02.50, start: 0.0\n" };
      },
      // Simulate ffprobe missing/unreadable → no duration from the probe.
      probeRunner: async () => ({ code: 1, stdout: "" }),
    },
  );
  assert.equal(result.duration, 2.5);
});

test("encodeAudioWebm omits duration when neither ffprobe nor stderr provides one", async () => {
  const result = await encodeAudioWebm(
    Buffer.from("fake-input"),
    {},
    {
      runner: async (_cmd, args) => {
        await writeFile(args[args.length - 1]!, Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]));
        return { code: 0, stderr: "" };
      },
      probeRunner: async () => ({ code: 0, stdout: "N/A\n" }),
    },
  );
  assert.equal("duration" in result, false);
});

test("encodeAudioWebm rejects when the runner reports a non-zero exit", async () => {
  await assert.rejects(
    () =>
      encodeAudioWebm(
        Buffer.from("fake-input"),
        {},
        {
          runner: async () => ({ code: 1, stderr: "boom: codec failure" }),
        },
      ),
    /ffmpeg exited 1/,
  );
});
