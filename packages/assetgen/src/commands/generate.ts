import { join } from "node:path";
import { GAME_VIEW, buildPrompt } from "../style.ts";
import { defaultProviderForKind } from "../providers.ts";
import { runAssetPipeline } from "../pipeline.ts";
import type { AssetPostprocessHook } from "../pipeline.ts";
import {
  audioMetadata,
  buildAudioPrompt,
  clampVolume,
  defaultLoopForCategory,
  encodeAudioWebm,
  isAudioKind,
} from "../audio.ts";
import {
  manifestKindForSprite,
  parseAnchor,
  parseViews,
  spritePromptDirective,
  toSpriteSheetWebp,
  writeBillboardPreview,
} from "../sprites.ts";
import { flag, has, intFlag, numberFlag } from "./args.ts";
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

  // Audio knobs (issue #21): category drives loop default + manifest record.
  const category = flag(argv, "category") || (isAudioKind(generationKind) ? generationKind : undefined);
  // volume must accept 0 (muted) — numberFlag rejects non-positives (correct for
  // scale), so parse through clampVolume which preserves 0 and defaults junk to 1.
  const volumeRaw = flag(argv, "volume");
  const volume = volumeRaw === undefined ? 1 : clampVolume(Number(volumeRaw));
  const bitrate = intFlag(argv, "bitrate", 128);
  const normalize = has(argv, "normalize");
  const loop = has(argv, "no-loop")
    ? false
    : has(argv, "loop")
      ? true
      : category
        ? defaultLoopForCategory(category)
        : false;
  const audioMode = !spriteMode && isAudioKind(generationKind);
  const modelMode = !spriteMode && (generationKind === "model" || generationKind === "3d");

  // 3D-model knobs (issue #20): Draco geometry is on by default (the mandatory
  // optimize); KTX2 is encoder-gated; --rig names the rig/retarget provenance.
  const ktx2 = has(argv, "ktx2");
  const draco = !has(argv, "no-draco");
  const rigSource = flag(argv, "rig");

  if (!id || !prompt) {
    printGenerateUsage();
    process.exit(1);
  }

  // Sprites augment the prompt with a sheet directive so the provider lays out
  // views/frames, then go through the shared pipeline like every other asset.
  const promptInput = spriteMode ? `${prompt}. ${spritePromptDirective(views, frameCount)}` : prompt;
  const which = dryRun ? "mock" : provider;
  const full = audioMode
    ? buildAudioPrompt({ prompt: promptInput, kind: generationKind })
    : modelMode
      ? promptInput
      : buildPrompt({ prompt: promptInput, game, kind: generationKind });
  console.log(`[assetgen] provider=${which}${model ? ` model=${model}` : ""} game=${game} kind=${kind} id=${id}`);
  console.log(`[prompt] ${full}`);

  const spritePostprocess: AssetPostprocessHook | undefined = spriteMode
    ? async (asset, context) => {
        // Non-image providers (e.g. audio) fall through untouched.
        if (!asset.mediaType.startsWith("image/")) {
          return { data: asset.data, mediaType: asset.mediaType, extension: asset.extension };
        }
        const sprite = await toSpriteSheetWebp(asset.data, {
          id: context.id,
          game: context.game,
          prompt: context.prompt,
          provider: asset.provider,
          model: asset.model,
          views,
          frameCount,
          fps,
          anchor,
          scale,
          size: context.size,
          licenseTerms,
          licenseUrl,
        });
        const meta = sprite.metadata;
        const previewRel = `previews/${context.id}-billboard.html`;
        return {
          data: sprite.data,
          mediaType: "image/webp",
          extension: "webp",
          kindOverride: manifestKindForSprite(kind, frameCount),
          entryFields: {
            model: asset.model,
            dimensions: meta.dimensions,
            frameSize: meta.frameSize,
            frames: meta.frames,
            fps: meta.fps,
            anchor: meta.anchor,
            scale: meta.scale,
            views: meta.views,
            sheet: meta.sheet,
            preview: previewRel,
          },
          licenseExtra: {
            type: meta.license.type,
            terms: meta.license.terms,
            url: meta.license.url,
            generatedAt: meta.license.generatedAt,
          },
          writeSidecars: async ({ outputRoot, relPath }) => {
            const previewPath = join(outputRoot, previewRel);
            await writeBillboardPreview({
              outPath: previewPath,
              assetHref: `../${relPath}`,
              id: context.id,
              game: context.game,
              metadata: meta,
            });
            console.log(`[billboard] ${previewPath}`);
          },
        };
      }
    : undefined;

  // Audio finals are normalized + encoded to .webm/opus by ffmpeg, then recorded
  // with category/volume/loop and a reviewable license scope (issue #21).
  const audioPostprocess: AssetPostprocessHook | undefined = audioMode
    ? async (asset) => {
        // Defensive: anything non-audio falls through untouched.
        if (!asset.mediaType.startsWith("audio/")) {
          return { data: asset.data, mediaType: asset.mediaType, extension: asset.extension };
        }
        const encoded = await encodeAudioWebm(
          asset.data,
          { bitrateKbps: bitrate, normalize },
          { inputExt: asset.extension },
        );
        return {
          data: encoded.data,
          mediaType: "audio/webm",
          extension: "webm",
          entryFields: audioMetadata({ category: category!, volume, loop, duration: encoded.duration }),
          licenseExtra: {
            type: "ai-generated",
            terms: licenseTerms ?? "review audio license scope before shipping",
            ...(licenseUrl ? { url: licenseUrl } : {}),
            generatedAt: new Date().toISOString(),
          },
        };
      }
    : undefined;

  // 3D models pass the raw provider GLB through the mandatory gltf-transform
  // optimize (Draco geometry, encoder-gated KTX2, else WebP textures) and record
  // optimized/compression/animations plus a license.rig provenance record.
  const modelPostprocess: AssetPostprocessHook | undefined = modelMode
    ? async (asset) => {
        const { optimizeGlb, MODEL_MEDIA_TYPE, MODEL_EXTENSION } = await import("../model3d.ts");
        const result = await optimizeGlb(asset.data, { draco, ktx2 });
        const rigged = result.summary.skins > 0;
        return {
          data: result.data,
          mediaType: MODEL_MEDIA_TYPE,
          extension: MODEL_EXTENSION,
          entryFields: {
            model: asset.model,
            optimized: true,
            compression: result.compression,
            animations: result.animations,
            meshes: result.summary.meshes,
            materials: result.summary.materials,
            textures: result.summary.textures,
            skins: result.summary.skins,
            joints: result.summary.joints,
          },
          licenseExtra: {
            type: "ai-generated",
            terms: licenseTerms ?? "review 3D model + rig license scope before shipping",
            ...(licenseUrl ? { url: licenseUrl } : {}),
            generatedAt: new Date().toISOString(),
            rig: {
              source: rigSource ?? (rigged ? asset.provider : "none"),
              rigged,
              joints: result.summary.joints,
              animations: result.animations,
            },
          },
        };
      }
    : undefined;

  await runAssetPipeline({
    id,
    // Manifest records the raw user prompt; generation uses the augmented one.
    prompt,
    promptForBuild: promptInput,
    game,
    kind: generationKind,
    provider: which,
    model,
    size,
    repo,
    usageLogPath: usageLog,
    postprocess: spriteMode
      ? spritePostprocess
      : audioMode
        ? audioPostprocess
        : modelMode
          ? modelPostprocess
          : undefined,
    log: (chunk) => process.stdout.write(chunk),
  });
}

function printGenerateUsage(): void {
  const views = Object.entries(GAME_VIEW)
    .map(([slug, v]) => `${slug} (${v})`)
    .join(", ");
  console.error(
    "usage:\n" +
      "  assetgen generate --id <id> --prompt <text> [--game <slug>|shared]\n" +
      "           [--kind sprite|texture|icon|music|sfx|voice|model|3d] [--provider openai|fal|codex|replicate|meshy|tripo|suno|elevenlabs|beatoven|mock]\n" +
      "           [--model <model>] [--size 1024] [--repo <game-repo-path>] [--usage-log <path|off>] [--dry-run]\n" +
      "           [--views front,side,back] [--frames 1] [--fps 8] [--anchor 0.5,1] [--scale 1]\n" +
      "           [--category music|sfx|voice] [--volume 1] [--loop|--no-loop] [--bitrate 128] [--normalize]\n" +
      "           [--ktx2] [--no-draco] [--rig <source>]\n" +
      "           [--license <terms>] [--license-url <url>]\n" +
      "  assetgen --id <id> --prompt <text> [--game <slug>|shared]\n" +
      "           [--kind sprite|texture|icon|music|sfx|voice|model|3d] [--provider openai|fal|codex|replicate|meshy|tripo|suno|elevenlabs|beatoven|mock]\n" +
      "           [--model <model>] [--size 1024] [--repo <game-repo-path>] [--usage-log <path|off>] [--dry-run]\n" +
      "  assetgen matrix [--game <slug>] [--id <entity>] [--provider mock|openai|fal|codex|replicate]\n" +
      "           [--size 1024] [--only-missing] [--dry-run] [--sync-games] [--assets-dir <path>] [--usage-log <path|off>]\n" +
      "  assetgen games [--check] [--games-root <path>] [--assets-dir <path>]\n" +
      "  assetgen tokens [--check] [--repo-only] [--design <path>] [--assets-dir <path>]\n" +
      "  assetgen check-design [--root <repo>]\n" +
      "  assetgen pixelize --in <raw.png> --out <sprite.webp> [--height 110] [--bg 42]\n" +
      `\n  games: ${views}\n` +
      "  Default game repo lookup prefers ./games/<game> or ../games/<game>.",
  );
}
