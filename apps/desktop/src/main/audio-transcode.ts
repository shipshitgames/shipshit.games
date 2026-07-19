import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const AUDIO_CATEGORIES = ["sfx", "music", "voice"];

function resolveFfmpeg(options: any = {}) {
  const env = options.env || process.env;
  const pathExists = options.pathExists || fs.existsSync;
  const findOnPath =
    options.findOnPath ||
    (() => {
      try {
        return execFileSync("/bin/sh", ["-lc", "command -v ffmpeg"])
          .toString()
          .trim();
      } catch {
        return "";
      }
    });
  const candidates = [
    env.FFMPEG,
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ];
  for (const candidate of candidates) {
    if (candidate && pathExists(candidate)) return candidate;
  }
  return findOnPath() || "ffmpeg";
}

function audioSlug(file) {
  return path
    .basename(file)
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function audioLicense(category, bitrate, normalize, now = new Date()) {
  return {
    tool: "ffmpeg",
    plan: `libopus-${bitrate}k${normalize ? "-loudnorm" : ""}`,
    date: now.toISOString().slice(0, 10),
    kind: category,
  };
}

export { AUDIO_CATEGORIES, audioLicense, audioSlug, resolveFfmpeg };
