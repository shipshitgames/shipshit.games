import { expect, test } from "bun:test";

import {
  audioLicense,
  audioSlug,
  resolveFfmpeg,
} from "./audio-transcode";

test("resolveFfmpeg prefers an existing explicit binary", () => {
  expect(
    resolveFfmpeg({
      env: { FFMPEG: "/custom/ffmpeg" },
      pathExists: (candidate) => candidate === "/custom/ffmpeg",
      findOnPath: () => "/path/ffmpeg",
    }),
  ).toBe("/custom/ffmpeg");
});

test("resolveFfmpeg uses PATH discovery and then the executable fallback", () => {
  expect(
    resolveFfmpeg({
      env: {},
      pathExists: () => false,
      findOnPath: () => "/path/ffmpeg",
    }),
  ).toBe("/path/ffmpeg");
  expect(
    resolveFfmpeg({
      env: {},
      pathExists: () => false,
      findOnPath: () => "",
    }),
  ).toBe("ffmpeg");
});

test("audio metadata normalizes ids and records the encoding contract", () => {
  expect(audioSlug("/tmp/Rifle Report (Final).WAV")).toBe(
    "rifle-report-final",
  );
  expect(
    audioLicense(
      "sfx",
      96,
      true,
      new Date("2026-07-18T12:00:00.000Z"),
    ),
  ).toEqual({
    tool: "ffmpeg",
    plan: "libopus-96k-loudnorm",
    date: "2026-07-18",
    kind: "sfx",
  });
});
