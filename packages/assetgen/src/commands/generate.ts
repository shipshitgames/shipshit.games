import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
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
import {
  assetsRootForRepo,
  draftsManifestPath,
  draftsRoot,
} from "../drafts.ts";
import {
  assertLargeModelSourceUsesLfs,
  buildModelOptimizeReport,
  modelSha256,
} from "../model-trace.ts";
import { serializeColorGamutReport } from "../soft-grade";
import {
  flag,
  flagValues,
  has,
  intFlag,
  numberFlag,
  shortFlagValues,
} from "./args.ts";
import { defaultRepo } from "./paths.ts";
import { projectAssetsDir, selectedProject } from "./registry.ts";

export async function runGenerate(argv: string[]): Promise<void> {
  const id = flag(argv, "id");
  const prompt = flag(argv, "prompt") ?? "";
  const game = flag(argv, "game", "shared")!;
  const kind = flag(argv, "kind", "sprite")!;
  const spriteMode =
    kind === "sprite" ||
    kind === "sprite-anim" ||
    has(argv, "views") ||
    has(argv, "frames");
  const generationKind = spriteMode ? "sprite" : kind;
  const provider =
    flag(argv, "provider") || defaultProviderForKind(generationKind);
  const model = flag(argv, "model");
  const size = intFlag(argv, "size", 1024);
  const repoFlag = flag(argv, "repo");
  const repo = repoFlag || defaultRepo(game);
  const assetsDirFlag = flag(argv, "assets-dir");
  const referenceImages = [
    ...flagValues(argv, "reference"),
    ...shortFlagValues(argv, "i"),
  ].map((path) => resolve(path));
  // Draft mode (issue #54): stage the asset under src/assets/drafts/ + drafts.json
  // instead of writing the production manifest. Default off — non-draft runs are
  // byte-for-byte unchanged. `assetgen promote` later publishes staged drafts.
  const draft = has(argv, "draft");
  const dryRun = has(argv, "dry-run");
  const usageLog = flag(argv, "usage-log");
  const views = parseViews(flag(argv, "views"));
  const frameCount = intFlag(argv, "frames", 1);
  const fps = intFlag(argv, "fps", 8);
  const anchor = parseAnchor(flag(argv, "anchor"));
  const scale = numberFlag(argv, "scale", 1);
  const licenseTerms = flag(argv, "license");
  const licenseUrl = flag(argv, "license-url");

  // Reproducibility seed (issue #55): only the seedable providers honor it.
  // Parsed permissively so 0 is a valid seed; negatives/junk fall back to unset.
  const seedRaw = flag(argv, "seed");
  const seedParsed =
    seedRaw === undefined ? Number.NaN : Number.parseInt(seedRaw, 10);
  const seed =
    Number.isFinite(seedParsed) && seedParsed >= 0 ? seedParsed : undefined;
  // Human-authorship disclosure (issue #55): --authored marks a person touched it.
  const authored = has(argv, "authored");
  const editKind = flag(argv, "edit-kind");
  const human = authored
    ? { authored: true, ...(editKind ? { editKind } : {}) }
    : undefined;

  // Audio knobs (issue #21): category drives loop default + manifest record.
  const category =
    flag(argv, "category") ||
    (isAudioKind(generationKind) ? generationKind : undefined);
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
  const modelMode =
    !spriteMode && (generationKind === "model" || generationKind === "3d");

  // 3D-model knobs (issue #20): Draco geometry is on by default (the mandatory
  // optimize). Generated rig provenance must come from the provider; arbitrary
  // operator attribution is accepted only by `model register` for imports.
  const ktx2 = has(argv, "ktx2");
  const draco = !has(argv, "no-draco");
  const rigSource = flag(argv, "rig");
  const modelFaceCount = intFlag(argv, "face-count", 300_000);
  const modelPbr = !has(argv, "no-pbr");
  const modelGenerateType = flag(argv, "generate-type", "Normal") as
    "Normal" | "Geometry";
  const maxRuntimeMb = numberFlag(argv, "max-runtime-mb", 20);

  // Outline-tint postprocess (issue #167): opt-in softening of hard black
  // silhouette lines toward the fill they enclose. Off unless --outline-tint;
  // only affects the toWebp path (textures/icons), not sprite-sheet assembly.
  const outlineTint = has(argv, "outline-tint");
  const outlineTintStrength = numberFlag(argv, "outline-tint-strength", 0.5);
  const outlineTintThreshold = intFlag(argv, "outline-tint-threshold", 32);
  // Canonical DESIGN.md-driven soft grade. Its sidecar is advisory only.
  const softGrade = has(argv, "soft-grade");
  if (softGrade && (audioMode || modelMode)) {
    console.warn(
      `[assetgen] --soft-grade applies to image assets; skipped for kind=${generationKind}`,
    );
  }

  if (!id || (!prompt.trim() && !(modelMode && referenceImages.length === 1))) {
    printGenerateUsage();
    process.exit(1);
  }
  if (modelMode && rigSource) {
    console.error(
      "[assetgen] generate derives rig provenance from its provider; use model register --rig <source> for imported models",
    );
    process.exit(1);
  }
  if (modelMode) {
    const { assertModelId } = await import("../model3d.ts");
    assertModelId(id);
  }
  if (
    modelMode &&
    modelGenerateType !== "Normal" &&
    modelGenerateType !== "Geometry"
  ) {
    throw new Error('--generate-type must be "Normal" or "Geometry"');
  }

  // Sprites augment the prompt with a sheet directive so the provider lays out
  // views/frames, then go through the shared pipeline like every other asset.
  const promptInput = spriteMode
    ? `${prompt}. ${spritePromptDirective(views, frameCount)}`
    : prompt;
  const which = dryRun ? "mock" : provider;
  const full = audioMode
    ? buildAudioPrompt({ prompt: promptInput, kind: generationKind })
    : modelMode
      ? promptInput
      : buildPrompt({ prompt: promptInput, game, kind: generationKind });
  console.log(
    `[assetgen] provider=${which}${model ? ` model=${model}` : ""} game=${game} kind=${kind} id=${id}`,
  );
  console.log(`[prompt] ${full}`);
  for (const reference of referenceImages)
    console.log(`[reference] ${reference}`);

  const project =
    modelMode && !repoFlag && !assetsDirFlag ? selectedProject() : undefined;
  const modelAssetsRoot = modelMode
    ? resolve(
        assetsDirFlag ??
          (project ? projectAssetsDir(project) : assetsRootForRepo(repo)),
      )
    : undefined;
  const assetsRoot = modelAssetsRoot ?? assetsRootForRepo(repo);
  const modelOutput = modelAssetsRoot
    ? {
        outputRoot: modelAssetsRoot,
        manifestPath: join(modelAssetsRoot, "assets.json"),
      }
    : {};

  const spritePostprocess: AssetPostprocessHook | undefined = spriteMode
    ? async (asset, context) => {
        // Non-image providers (e.g. audio) fall through untouched.
        if (!asset.mediaType.startsWith("image/")) {
          return {
            data: asset.data,
            mediaType: asset.mediaType,
            extension: asset.extension,
          };
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
          softGrade: context.softGrade,
        });
        const colorGamutReport = sprite.colorGamutReport;
        const meta = sprite.metadata;
        const previewRel = `previews/${context.id}-billboard.html`;
        const colorReportRel = `reports/${context.id}.color-gamut.json`;
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
            ...(colorGamutReport
              ? {
                  colorGrade: {
                    applied: true as const,
                    advisory: true as const,
                    blocking: false as const,
                    report: colorReportRel,
                    outOfGamutRatio: colorGamutReport.summary.outOfGamutRatio,
                    material: colorGamutReport.summary.material,
                  },
                }
              : {}),
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
            if (colorGamutReport) {
              const reportPath = join(outputRoot, colorReportRel);
              await mkdir(dirname(reportPath), { recursive: true });
              await writeFile(
                reportPath,
                serializeColorGamutReport(colorGamutReport),
              );
              console.log(`[color-gamut] advisory ${reportPath}`);
            }
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
          return {
            data: asset.data,
            mediaType: asset.mediaType,
            extension: asset.extension,
          };
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
          entryFields: audioMetadata({
            category: category!,
            volume,
            loop,
            duration: encoded.duration,
          }),
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
        const {
          assertModelRuntimeBudget,
          optimizeGlb,
          MODEL_MEDIA_TYPE,
          MODEL_EXTENSION,
        } = await import("../model3d.ts");
        const result = await optimizeGlb(asset.data, { draco, ktx2 });
        assertModelRuntimeBudget(
          result,
          Math.round(maxRuntimeMb * 1024 * 1024),
        );
        const rigged = result.summary.skins > 0;
        const sourceRelPath = `sources/models/${id}.glb`;
        const traceRelPath = `sources/models/${id}.optimize.json`;
        const predictionRelPath = asset.providerRecord
          ? `sources/models/${id}.prediction.json`
          : undefined;
        const generatedAt = new Date().toISOString();
        const report = buildModelOptimizeReport({
          source: asset.data,
          sourcePath: `${id}.glb`,
          optimized: result,
          outputPath: `../../models/${id}.glb`,
          generatedAt,
        });
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
            pbr: modelPbr && result.summary.textures > 0,
            ...(asset.provider === "replicate"
              ? { faceCount: modelFaceCount }
              : {}),
            modelTrace: {
              source: sourceRelPath,
              report: traceRelPath,
              ...(predictionRelPath ? { prediction: predictionRelPath } : {}),
              sourceSha256: modelSha256(asset.data),
              optimizedSha256: modelSha256(result.data),
            },
          },
          licenseExtra: {
            type: "ai-generated",
            terms:
              licenseTerms ??
              "review 3D model + rig license scope before shipping",
            ...(licenseUrl ? { url: licenseUrl } : {}),
            generatedAt,
            rig: {
              source: rigged ? asset.provider : "none",
              rigged,
              joints: result.summary.joints,
              animations: result.animations,
            },
          },
          writeSidecars: async ({ outputRoot }) => {
            const sourcePath = join(outputRoot, sourceRelPath);
            const reportPath = join(outputRoot, traceRelPath);
            await assertLargeModelSourceUsesLfs({
              assetsRoot,
              sourcePath: sourceRelPath,
              bytes: asset.data.length,
            });
            await mkdir(join(outputRoot, "sources", "models"), {
              recursive: true,
            });
            await writeFile(sourcePath, asset.data);
            await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
            if (predictionRelPath) {
              await writeFile(
                join(outputRoot, predictionRelPath),
                JSON.stringify(asset.providerRecord, null, 2) + "\n",
              );
            }
          },
        };
      }
    : undefined;

  // Draft runs divert the entire asset tree (asset + sidecars + manifest) under
  // src/assets/drafts/. The staging layout mirrors production exactly, so the
  // recorded relative paths are already the post-promote paths.
  const draftOutput = draft
    ? {
        outputRoot: draftsRoot(assetsRoot),
        manifestPath: draftsManifestPath(assetsRoot),
      }
    : {};

  await runAssetPipeline({
    id,
    // Manifest records the raw user prompt; generation uses the augmented one.
    prompt,
    promptForBuild: promptInput,
    game,
    kind: generationKind,
    provider: which,
    model,
    referenceImages,
    size,
    seed,
    modelFaceCount,
    modelPbr,
    modelGenerateType,
    outlineTint,
    outlineTintStrength,
    outlineTintThreshold,
    softGrade,
    human,
    repo,
    ...modelOutput,
    ...draftOutput,
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

  if (draft) {
    const promoteHint = `assetgen promote --id ${id}${game !== "shared" ? ` --game ${game}` : ""}`;
    console.log(
      `[draft] staged under ${draftsRoot(assetsRoot)} — run \`${promoteHint}\` to publish`,
    );
  }
}

function printGenerateUsage(): void {
  const views = Object.entries(GAME_VIEW)
    .map(([slug, v]) => `${slug} (${v})`)
    .join(", ");
  console.error(
    "usage:\n" +
      "  assetgen generate --id <id> --prompt <text> [--game <slug>|shared]\n" +
      "           [--kind sprite|texture|icon|music|sfx|voice|model|3d] [--provider openai|fal|codex|replicate|meshy|tripo|suno|elevenlabs|beatoven|mock]\n" +
      "           [--model <model>] [--size 1024] [--reference <image>|-i <image...>] [--repo <game-repo-path>] [--usage-log <path|off>] [--dry-run]\n" +
      "           [--views front,side,back] [--frames 1] [--fps 8] [--anchor 0.5,1] [--scale 1]\n" +
      "           [--category music|sfx|voice] [--volume 1] [--loop|--no-loop] [--bitrate 128] [--normalize]\n" +
      "           [--ktx2] [--no-draco] [--face-count 300000] [--no-pbr] [--generate-type Normal|Geometry]\n" +
      "           [--max-runtime-mb 20] [--assets-dir <project/packages/assets>]\n" +
      "           [--outline-tint] [--outline-tint-strength 0.5] [--outline-tint-threshold 32] [--soft-grade]\n" +
      "           [--license <terms>] [--license-url <url>] [--seed <n>] [--authored] [--edit-kind <label>]\n" +
      "           [--draft]  (stage under src/assets/drafts/; publish later with `assetgen promote`)\n" +
      "  assetgen --id <id> --prompt <text> [--game <slug>|shared]\n" +
      "           [--kind sprite|texture|icon|music|sfx|voice|model|3d] [--provider openai|fal|codex|replicate|meshy|tripo|suno|elevenlabs|beatoven|mock]\n" +
      "           [--model <model>] [--size 1024] [--reference <image>|-i <image...>] [--repo <game-repo-path>] [--usage-log <path|off>] [--dry-run]\n" +
      "  assetgen matrix [--game <slug>] [--id <entity>] [--provider mock|openai|fal|codex|replicate]\n" +
      "           [--size 1024] [--only-missing] [--dry-run] [--sync-games] [--assets-dir <path>] [--usage-log <path|off>]\n" +
      "  assetgen games [--check] [--games-root <path>] [--assets-dir <path>]\n" +
      "  assetgen tokens [--check] [--repo-only] [--design <path>] [--assets-dir <path>]\n" +
      "  assetgen check-design [--root <repo>]\n" +
      "  assetgen pixelize --in <raw.png> --out <sprite.webp> [--height 110] [--bg 42]\n" +
      "  assetgen promote (--id <id>[,<id>] | --all) [--game <slug>|shared] [--repo <path>]\n" +
      `\n  games: ${views}\n` +
      "  Default game repo lookup prefers ./games/<game> or ../games/<game>.",
  );
}
