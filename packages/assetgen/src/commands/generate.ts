import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GAME_VIEW, buildPrompt } from "../style.ts";
import { defaultProviderForKind, generateAsset } from "../providers.ts";
import { toWebp } from "../postprocess.ts";
import { register } from "../manifest.ts";
import {
  manifestKindForSprite,
  parseAnchor,
  parseViews,
  spritePromptDirective,
  toSpriteSheetWebp,
  writeBillboardPreview,
} from "../sprites.ts";
import { appendUsageLog } from "../usage.ts";
import { flag, has, intFlag } from "./args.ts";
import { defaultRepo } from "./paths.ts";

export async function runGenerate(argv: string[]): Promise<void> {
  const id = flag(argv, "id");
  const prompt = flag(argv, "prompt");
  const game = flag(argv, "game", "shared")!;
  const kind = flag(argv, "kind", "sprite")!;
  const spriteMode = kind === "sprite" || kind === "sprite-anim" || has(argv, "views") || has(argv, "frames");
  const generationKind = spriteMode ? "sprite" : kind;
  const provider = flag(argv, "provider") || defaultProviderForKind(generationKind);
  const model = flag(argv, "model");
  const size = intFlag(argv, "size", 1024);
  const repo = flag(argv, "repo") || defaultRepo(game);
  const dryRun = has(argv, "dry-run");
  const usageLog = flag(argv, "usage-log");
  const views = parseViews(flag(argv, "views"));
  const frameCount = intFlag(argv, "frames", 1);
  const fps = intFlag(argv, "fps", 8);
  const anchor = parseAnchor(flag(argv, "anchor"));
  const scale = numberFlag(argv, "scale", 1);
  const licenseTerms = flag(argv, "license");
  const licenseUrl = flag(argv, "license-url");

  if (!id || !prompt) {
    printGenerateUsage();
    process.exit(1);
  }

  const promptInput = spriteMode ? `${prompt}. ${spritePromptDirective(views, frameCount)}` : prompt;
  const full = buildPrompt({ prompt: promptInput, game, kind: generationKind });
  const which = dryRun ? "mock" : provider;
  const start = Date.now();
  let ok = false;
  let outPath: string | undefined;
  let usedModel: string | undefined = model;
  let usageError: unknown;

  console.log(`[assetgen] provider=${which}${model ? ` model=${model}` : ""} game=${game} kind=${kind} id=${id}`);
  console.log(`[prompt] ${full}`);

  try {
    const generated = await generateAsset(generationKind, full, {
      provider: which,
      size: `${size}x${size}`,
      model,
      log: (chunk) => process.stdout.write(chunk),
    });
    usedModel = generated.model;

    let bytes = generated.data;
    let extension = generated.extension;
    let mediaType = generated.mediaType;
    let spriteMetadata: Awaited<ReturnType<typeof toSpriteSheetWebp>>["metadata"] | undefined;
    if (generated.mediaType.startsWith("image/")) {
      if (spriteMode) {
        const sprite = await toSpriteSheetWebp(generated.data, {
          id,
          game,
          prompt,
          provider: generated.provider,
          model: generated.model,
          views,
          frameCount,
          fps,
          anchor,
          scale,
          size,
          licenseTerms,
          licenseUrl,
        });
        bytes = sprite.data;
        spriteMetadata = sprite.metadata;
      } else {
        bytes = await toWebp(generated.data, { size });
      }
      extension = "webp";
      mediaType = "image/webp";
    }

    const rel = `${subdirForKind(kind)}/${id}.${extension}`;
    outPath = join(repo, "src/assets", rel);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, bytes);
    console.log(`[wrote] ${outPath} (${(bytes.length / 1024).toFixed(1)} kb, ${mediaType})`);

    const previewRel = spriteMetadata ? `previews/${id}-billboard.html` : undefined;
    if (spriteMetadata && previewRel) {
      const previewPath = join(repo, "src/assets", previewRel);
      await writeBillboardPreview({
        outPath: previewPath,
        assetHref: `../${rel}`,
        id,
        game,
        metadata: spriteMetadata,
      });
      console.log(`[preview] ${previewPath}`);
    }

    await register(join(repo, "src/assets/assets.json"), {
      id,
      kind: spriteMode ? manifestKindForSprite(kind, frameCount) : kind,
      game,
      path: rel,
      prompt,
      provider: generated.provider,
      model: generated.model,
      ...(spriteMetadata ?? {}),
      ...(previewRel ? { preview: previewRel } : {}),
    });
    console.log(`[manifest] ${join(repo, "src/assets/assets.json")} updated`);
    ok = true;
  } catch (error) {
    usageError = error;
    throw error;
  } finally {
    try {
      const logPath = await appendUsageLog(
        {
          command: "generate",
          provider: which,
          kind,
          game,
          id,
          model: usedModel,
          size,
          outputPath: outPath,
          prompt,
          success: ok,
          durationMs: Date.now() - start,
          error: usageError,
        },
        usageLog,
      );
      if (logPath) console.log(`[usage] ${logPath}`);
    } catch (error) {
      console.warn(`[usage] failed to write usage log: ${String((error as Error)?.message ?? error)}`);
    }
  }
}

function printGenerateUsage(): void {
  const views = Object.entries(GAME_VIEW)
    .map(([slug, v]) => `${slug} (${v})`)
    .join(", ");
  console.error(
    "usage:\n" +
      "  assetgen generate --id <id> --prompt <text> [--game <slug>|shared]\n" +
      "           [--kind sprite|texture|icon|music|sfx|voice|model] [--provider openai|fal|codex|replicate|suno|mock]\n" +
      "           [--model <model>] [--size 1024] [--repo <game-repo-path>] [--usage-log <path|off>] [--dry-run]\n" +
      "           [--views front,side,back] [--frames 1] [--fps 8] [--anchor 0.5,1] [--scale 1]\n" +
      "           [--license <terms>] [--license-url <url>]\n" +
      "  assetgen --id <id> --prompt <text> [--game <slug>|shared]\n" +
      "           [--kind sprite|texture|icon|music|sfx|voice|model] [--provider openai|fal|codex|replicate|suno|mock]\n" +
      "           [--model <model>] [--size 1024] [--repo <game-repo-path>] [--usage-log <path|off>] [--dry-run]\n" +
      "  assetgen matrix [--game <slug>] [--id <entity>] [--provider mock|openai|fal|codex|replicate]\n" +
      "           [--size 1024] [--only-missing] [--dry-run] [--sync-games] [--assets-dir <path>] [--usage-log <path|off>]\n" +
      "  assetgen tokens [--check] [--design <path>] [--assets-dir <path>]\n" +
      "  assetgen check-design [--root <repo>]\n" +
      "  assetgen pixelize --in <raw.png> --out <sprite.webp> [--height 110] [--bg 42]\n" +
      `\n  games: ${views}\n` +
      "  Default game repo lookup prefers ./games/<game> or ../games/<game>.",
  );
}

function subdirForKind(kind: string): string {
  if (kind === "sprite" || kind === "sprite-anim") return "sprites";
  if (kind === "texture") return "textures";
  if (kind === "icon") return "icons";
  if (kind === "music" || kind === "sfx" || kind === "voice") return `audio/${kind}`;
  if (kind === "model" || kind === "3d") return "models";
  return kind;
}

function numberFlag(argv: string[], name: string, def: number): number {
  const raw = flag(argv, name);
  const n = raw === undefined ? def : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : def;
}
