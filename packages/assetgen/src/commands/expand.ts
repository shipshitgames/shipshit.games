import { basename, extname, join } from "node:path";
import { expandSprite, parseActions, resolveDirections } from "../expand.ts";
import { parseAnchor } from "../sprites.ts";
import { normalizeScale } from "../upscale.ts";
import { flag, has, intFlag, numberFlag } from "./args.ts";
import { defaultRepo } from "./paths.ts";

export async function runExpand(argv: string[]): Promise<void> {
  const origin = flag(argv, "in");
  if (!origin) {
    printExpandUsage();
    process.exit(1);
  }

  const game = flag(argv, "game", "shared")!;
  const id = flag(argv, "id") || slugFromPath(origin);
  const dirs = intFlag(argv, "dirs", 4);
  const defaultFrames = intFlag(argv, "frames", 4);
  const actions = parseActions(flag(argv, "actions"), defaultFrames);
  let directions: string[];
  try {
    directions = resolveDirections(dirs);
  } catch (error) {
    console.error(`[expand] ${(error as Error).message}`);
    process.exit(1);
  }

  const dryRun = has(argv, "dry-run");
  // Like `matrix`, expand defaults to the keyless mock provider so the whole
  // action×facing×frame grid can be filled with no API keys; pass --provider for real art.
  const provider = dryRun ? "mock" : flag(argv, "provider", "mock")!;
  const model = flag(argv, "model");
  const method = flag(argv, "method");
  const fps = intFlag(argv, "fps", 8);
  const size = intFlag(argv, "size", 256);
  const height = intFlag(argv, "height", 110);
  const anchor = parseAnchor(flag(argv, "anchor"));
  const scale = numberFlag(argv, "scale", 1);
  const repo = flag(argv, "repo") || defaultRepo(game);
  const outputRoot = flag(argv, "out") || join(repo, "src/assets");
  const usageLog = flag(argv, "usage-log");
  const licenseTerms = flag(argv, "license");
  const licenseUrl = flag(argv, "license-url");
  const upscale = has(argv, "upscale")
    ? { scale: normalizeScale(intFlag(argv, "upscale-scale", 4)), model: flag(argv, "upscale-model") }
    : undefined;
  const video = method === "video"
    ? {
        duration: numberFlag(argv, "video-duration", 2),
        keyColor: flag(argv, "key", "#00ff00"),
        staticThreshold: intFlag(argv, "static-threshold", 10),
        ffmpegPath: flag(argv, "ffmpeg"),
      }
    : undefined;

  const totalFrames = actions.reduce((sum, a) => sum + a.frames, 0) * directions.length;
  console.log(
    `[assetgen] expand provider=${provider}${model ? ` model=${model}` : ""}${method ? ` method=${method}` : ""} game=${game} id=${id}`,
  );
  console.log(
    `[expand] origin=${origin} actions=${actions.map((a) => `${a.name}:${a.frames}`).join(",")} dirs=${dirs} → ${totalFrames} frame(s)`,
  );
  if (upscale) {
    console.log(`[expand] upscale ×${upscale.scale} pre-pass enabled (per frame; needs realesrgan-ncnn-vulkan)`);
  }

  await expandSprite({
    id,
    origin,
    game,
    actions,
    directions,
    provider,
    model,
    method,
    fps,
    size,
    height,
    anchor,
    scale,
    upscale,
    video,
    outputRoot,
    usageLogPath: usageLog,
    licenseTerms,
    licenseUrl,
    dryRun,
    log: (chunk) => process.stdout.write(chunk),
  });
}

function slugFromPath(p: string): string {
  return basename(p, extname(p)).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "sprite";
}

function printExpandUsage(): void {
  console.error(
    "usage:\n" +
      "  assetgen expand --in <origin.png> [--actions idle,run:6,attack] [--dirs 1|4|8]\n" +
      "           [--id <id>] [--game <slug>|shared] [--provider mock|openai|fal|codex|replicate]\n" +
      "           [--model <model>] [--method controlnet|pixellab|animdrawings|video]\n" +
      "           [--frames 4] [--fps 8] [--size 256] [--height 110] [--anchor 0.5,1] [--scale 1]\n" +
      "           [--upscale] [--upscale-scale 2|4] [--upscale-model <name>]\n" +
      "           [--video-duration 2] [--key '#00ff00'] [--static-threshold 10] [--ffmpeg <path>]\n" +
      "           [--repo <game-repo-path>] [--out <assets-root>] [--usage-log <path|off>]\n" +
      "           [--license <terms>] [--license-url <url>] [--dry-run]\n" +
      "\n  Expands ONE origin sprite into a directional sprite-anim sheet + frame map.\n" +
      "  Per-action frame counts: --actions idle:2,run:6,attack:4 (falls back to --frames).\n" +
      "  --method video accepts mock, fal (fal-ai/wan/v2.2-a14b/image-to-video), or Replicate (wan-video/wan-2.2-i2v-fast).\n" +
      "  --upscale runs Real-ESRGAN on each raw frame BEFORE pixelize downscales it;\n" +
      "  a no-op (never fails) when realesrgan-ncnn-vulkan is not installed.",
  );
}
