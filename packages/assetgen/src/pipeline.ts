import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildAudioPrompt, isAudioKind } from "./audio.ts";
import { buildPrompt, STYLE_SUFFIX } from "./style.ts";
import { assetProviders, generateAsset } from "./providers.ts";
import type { AssetKind, GeneratedAsset, ProviderId } from "./providers.ts";
import { toWebpDetailed } from "./postprocess.ts";
import { serializeColorGamutReport } from "./soft-grade";
import { register, REQUIRED_LICENSE_FIELDS } from "./manifest.ts";
import type { AssetEntry, AssetLicenseRecord } from "./manifest.ts";
import { buildProvenance } from "./provenance.ts";
import type { AssetHumanAuthorship, AssetProvenance } from "./provenance.ts";
import { appendUsageLog } from "./usage.ts";
import type { UsageLogEvent } from "./usage.ts";

export const GAME_ASSET_PIPELINE_STEPS = ["prompt", "generate", "postprocess", "register", "preview"] as const;

export type GameAssetPipelineStep = (typeof GAME_ASSET_PIPELINE_STEPS)[number];
export type PipelineStepStatus = "start" | "success";

export interface PipelineStepEvent {
  step: GameAssetPipelineStep;
  status: PipelineStepStatus;
  message?: string;
}

export interface PipelineCredentialVaultEntry {
  provider: ProviderId;
  label: string;
  keyed: boolean;
  envName?: string;
  service?: string;
}

export interface PipelineContract {
  steps: readonly GameAssetPipelineStep[];
  promptPanel: {
    requiredFields: readonly ["id", "prompt", "game", "kind"];
    optionalFields: readonly ["provider", "model", "size", "referenceImages"];
  };
  credentialVault: PipelineCredentialVaultEntry[];
  manifest: {
    requiredLicenseFields: readonly ["tool", "plan", "date", "kind"];
  };
  previewPane: {
    emits: readonly ["path", "mediaType", "dataUrl"];
  };
}

export interface OptimizedAsset {
  data: Buffer;
  mediaType: string;
  extension: string;
  /** Manifest kind override (e.g. "sprite" -> "sprite-anim"). */
  kindOverride?: string;
  /** Extra manifest fields merged into the registered AssetEntry (e.g. sprite geometry). */
  entryFields?: Partial<AssetEntry>;
  /** Extra license-disclosure fields merged into the provenance license. */
  licenseExtra?: Partial<AssetLicenseRecord>;
  /** Write any sidecar files (e.g. a sprite billboard preview) next to the asset. */
  writeSidecars?: (ctx: { outputRoot: string; relPath: string }) => Promise<void>;
}

export interface AssetPipelineContext {
  id: string;
  prompt: string;
  fullPrompt: string;
  game: string;
  kind: AssetKind;
  size: number;
  provider: ProviderId;
  model?: string;
  /** Local image references used for style/source-guided generations. */
  referenceImages?: readonly string[];
  /** Opt-in outline-tint postprocess (see `ToWebpOptions.outlineTint`). Default off. */
  outlineTint?: boolean;
  outlineTintStrength?: number;
  outlineTintThreshold?: number;
  /** Opt-in canonical soft color grade + advisory gamut report. */
  softGrade?: boolean;
}

export type AssetPostprocessHook = (
  asset: GeneratedAsset & { provider: ProviderId },
  context: AssetPipelineContext,
) => Promise<OptimizedAsset> | OptimizedAsset;

export interface AssetPipelineOptions {
  id: string;
  prompt: string;
  /** Override the text fed to buildPrompt (e.g. a sprite-sheet directive); the manifest still records `prompt`. */
  promptForBuild?: string;
  game: string;
  kind: AssetKind;
  provider: string;
  size: number;
  repo?: string;
  outputRoot?: string;
  manifestPath?: string;
  model?: string;
  /** Local image references used for style/source-guided generations. */
  referenceImages?: readonly string[];
  /** Reproducibility seed forwarded to seedable providers (openai/fal). */
  seed?: number;
  modelFaceCount?: number;
  modelPbr?: boolean;
  modelGenerateType?: "Normal" | "Geometry";
  /** Opt-in outline-tint postprocess (see `ToWebpOptions.outlineTint`). Default off. */
  outlineTint?: boolean;
  outlineTintStrength?: number;
  outlineTintThreshold?: number;
  /** Opt-in canonical soft color grade + advisory gamut report. */
  softGrade?: boolean;
  /** Human-authorship disclosure recorded alongside provenance. */
  human?: AssetHumanAuthorship;
  usageLogPath?: string | null;
  usageCommand?: UsageLogEvent["command"];
  includePreviewDataUrl?: boolean;
  now?: () => Date;
  postprocess?: AssetPostprocessHook;
  log?: (chunk: string) => void;
  onStep?: (event: PipelineStepEvent) => void;
}

export interface AssetPreview {
  path: string;
  relPath: string;
  mediaType: string;
  dataUrl?: string;
}

export interface AssetPipelineResult {
  fullPrompt: string;
  outputPath: string;
  relPath: string;
  manifestPath: string;
  mediaType: string;
  entry: AssetEntry;
  preview: AssetPreview;
}

export function describeAssetPipeline(): PipelineContract {
  return {
    steps: GAME_ASSET_PIPELINE_STEPS,
    promptPanel: {
      requiredFields: ["id", "prompt", "game", "kind"],
      optionalFields: ["provider", "model", "size", "referenceImages"],
    },
    credentialVault: Object.values(assetProviders).map((provider) => ({
      provider: provider.id,
      label: provider.label,
      keyed: Boolean(provider.key),
      envName: provider.key?.envName,
      service: provider.key?.service,
    })),
    manifest: {
      // Single source of truth — mirror the validator's required set, never re-list it.
      requiredLicenseFields: [...REQUIRED_LICENSE_FIELDS],
    },
    previewPane: {
      emits: ["path", "mediaType", "dataUrl"],
    },
  };
}

/** Options for the per-asset core shared by `runAssetPipeline` and `runMatrix`. */
export interface GenerateOneOptions {
  id: string;
  prompt: string;
  /** Override the text fed to buildPrompt (e.g. a sprite-sheet directive); `prompt` is still what callers record. */
  promptForBuild?: string;
  game: string;
  kind: AssetKind;
  provider: string;
  size: number;
  model?: string;
  /** Local image references used for style/source-guided generations. */
  referenceImages?: readonly string[];
  /** Reproducibility seed forwarded to seedable providers (openai/fal). */
  seed?: number;
  modelFaceCount?: number;
  modelPbr?: boolean;
  modelGenerateType?: "Normal" | "Geometry";
  /** Opt-in outline-tint postprocess (see `ToWebpOptions.outlineTint`). Default off. */
  outlineTint?: boolean;
  outlineTintStrength?: number;
  outlineTintThreshold?: number;
  /** Opt-in canonical soft color grade + advisory gamut report. */
  softGrade?: boolean;
  /** Injectable clock so the provenance date matches the caller's license date. */
  now?: () => Date;
  postprocess?: AssetPostprocessHook;
  /** Fires right after the provider responds, before postprocess, so callers can record the actually-used provider/model even if postprocess fails. */
  onGenerated?: (generated: GeneratedAsset & { provider: ProviderId }) => void;
  log?: (chunk: string) => void;
  onStep?: (event: PipelineStepEvent) => void;
}

export interface GenerateOneResult {
  fullPrompt: string;
  generated: GeneratedAsset & { provider: ProviderId };
  optimized: OptimizedAsset;
  context: AssetPipelineContext;
  /** Reproducibility provenance computed from the prompt, style canon, and provider meta. */
  provenance: AssetProvenance;
}

/** The shared per-asset core: build prompt, generate, post-process. */
export async function generateOne(opts: GenerateOneOptions): Promise<GenerateOneResult> {
  const fullPrompt = await runStep(opts, "prompt", "build prompt", async () => {
    const promptText = opts.promptForBuild ?? opts.prompt;
    if (isAudioKind(opts.kind)) return buildAudioPrompt({ prompt: promptText, kind: opts.kind });
    // 3D models (issue #20) drive mesh providers (Meshy/Tripo); the 2D pixel-art
    // style suffix would fight a 3D generator, so feed the raw prompt through.
    if (opts.kind === "model" || opts.kind === "3d") return promptText;
    return buildPrompt({ prompt: promptText, game: opts.game, kind: opts.kind });
  });

  const generated = await runStep(opts, "generate", `generate ${opts.kind}`, async () =>
    generateAsset(opts.kind, fullPrompt, {
      provider: opts.provider,
      size: `${opts.size}x${opts.size}`,
      model: opts.model,
      referenceImages: opts.referenceImages,
      seed: opts.seed,
      modelFaceCount: opts.modelFaceCount,
      modelPbr: opts.modelPbr,
      modelGenerateType: opts.modelGenerateType,
      log: opts.log ?? (() => {}),
    }),
  );
  opts.onGenerated?.(generated);

  const context: AssetPipelineContext = {
    id: opts.id,
    prompt: opts.prompt,
    fullPrompt,
    game: opts.game,
    kind: opts.kind,
    size: opts.size,
    provider: generated.provider,
    model: generated.model,
    outlineTint: opts.outlineTint,
    outlineTintStrength: opts.outlineTintStrength,
    outlineTintThreshold: opts.outlineTintThreshold,
    softGrade: opts.softGrade,
  };
  const optimized = await runStep(opts, "postprocess", "post-process output", async () =>
    (opts.postprocess ?? defaultPostprocess)(generated, context),
  );

  // promptHash always covers the raw user prompt; the style hash is empty for
  // kinds without a style suffix (audio), and the canon string for image kinds.
  const provenance = buildProvenance({
    provider: generated.provider,
    prompt: opts.prompt,
    styleSuffix:
      isAudioKind(opts.kind) || opts.kind === "model" || opts.kind === "3d"
        ? ""
        : STYLE_SUFFIX,
    date: opts.now?.() ?? new Date(),
    meta: generated.meta,
  });

  return { fullPrompt, generated, optimized, context, provenance };
}

export interface UsageAccountingOptions {
  usageLogPath?: string | null;
  log?: (chunk: string) => void;
  /**
   * The caller's logging convention: "stream" callers receive newline-terminated
   * chunks plus an `[usage] <path>` echo after a successful write (the CLI pipes
   * these to stdout); "line" callers receive bare lines (matrix logs via console.log).
   */
  logStyle: "stream" | "line";
  /** Rebuilt when the task settles, so mutations made during `fn` (selected provider/model, output path) are captured; success/durationMs/error are filled in here. */
  event: () => Omit<UsageLogEvent, "success" | "durationMs" | "error">;
}

/** Run `fn` inside the try/finally usage-log accounting shared by `runAssetPipeline` and `runMatrix`. */
export async function withUsageAccounting<T>(opts: UsageAccountingOptions, fn: () => Promise<T>): Promise<T> {
  const log = opts.log ?? (() => {});
  const started = Date.now();
  let ok = false;
  let usageError: unknown;
  try {
    const result = await fn();
    ok = true;
    return result;
  } catch (error) {
    usageError = error;
    throw error;
  } finally {
    try {
      const logPath = await appendUsageLog(
        { ...opts.event(), success: ok, durationMs: Date.now() - started, error: usageError },
        opts.usageLogPath,
      );
      if (opts.logStyle === "stream" && logPath) log(`[usage] ${logPath}\n`);
    } catch (error) {
      log(`[usage] failed to write usage log: ${String((error as Error)?.message ?? error)}${opts.logStyle === "stream" ? "\n" : ""}`);
    }
  }
}

export async function runAssetPipeline(opts: AssetPipelineOptions): Promise<AssetPipelineResult> {
  const outputRoot = opts.outputRoot ?? join(requiredRepo(opts.repo), "src/assets");
  const manifestPath = opts.manifestPath ?? join(outputRoot, "assets.json");
  const relPath = `${assetSubdirForKind(opts.kind)}/${opts.id}`;
  const log = opts.log ?? (() => {});
  let outputPath: string | undefined;
  let selectedProvider = opts.provider;
  let usedModel = opts.model;
  let requestId: string | undefined;

  return withUsageAccounting(
    {
      usageLogPath: opts.usageLogPath,
      log,
      logStyle: "stream",
      event: () => ({
        command: opts.usageCommand ?? "generate",
        provider: selectedProvider,
        kind: opts.kind,
        game: opts.game,
        id: opts.id,
        model: usedModel,
        requestId,
        size: opts.size,
        outputPath,
        prompt: opts.prompt,
      }),
    },
    async () => {
      const { fullPrompt, generated, optimized, provenance } = await generateOne({
        id: opts.id,
        prompt: opts.prompt,
        promptForBuild: opts.promptForBuild,
        game: opts.game,
        kind: opts.kind,
        provider: opts.provider,
        size: opts.size,
        model: opts.model,
        referenceImages: opts.referenceImages,
        seed: opts.seed,
        modelFaceCount: opts.modelFaceCount,
        modelPbr: opts.modelPbr,
        modelGenerateType: opts.modelGenerateType,
        outlineTint: opts.outlineTint,
        outlineTintStrength: opts.outlineTintStrength,
        outlineTintThreshold: opts.outlineTintThreshold,
        softGrade: opts.softGrade,
        now: opts.now,
        postprocess: opts.postprocess,
        onGenerated: (asset) => {
          selectedProvider = asset.provider;
          usedModel = asset.model;
          requestId = asset.meta?.requestId;
        },
        log,
        onStep: opts.onStep,
      });

      const finalRelPath = `${relPath}.${optimized.extension}`;
      outputPath = join(outputRoot, finalRelPath);
      const entry = await runStep(opts, "register", "write asset and manifest", async () => {
        await mkdir(dirname(outputPath!), { recursive: true });
        if (optimized.writeSidecars) {
          await optimized.writeSidecars({ outputRoot, relPath: finalRelPath });
        }
        await writeFile(outputPath!, optimized.data);
        log(`[wrote] ${outputPath} (${(optimized.data.length / 1024).toFixed(1)} kb, ${optimized.mediaType})\n`);
        const registered: AssetEntry = {
          id: opts.id,
          kind: optimized.kindOverride ?? opts.kind,
          game: opts.game,
          path: finalRelPath,
          prompt: opts.prompt,
          provider: generated.provider,
          ...(opts.referenceImages && opts.referenceImages.length > 0
            ? { referenceImages: [...opts.referenceImages] }
            : {}),
          ...(optimized.entryFields ?? {}),
          provenance,
          ...(opts.human ? { human: opts.human } : {}),
          license: {
            ...licenseForGeneration({
              provider: generated.provider,
              model: generated.model,
              kind: opts.kind,
              date: opts.now?.() ?? new Date(),
            }),
            ...(optimized.licenseExtra ?? {}),
          },
        };
        await register(manifestPath, registered);
        log(`[manifest] ${manifestPath} updated\n`);
        return registered;
      });

      const preview = await runStep(opts, "preview", "prepare hot preview", async () => {
        const next: AssetPreview = {
          path: outputPath!,
          relPath: finalRelPath,
          mediaType: optimized.mediaType,
        };
        if (opts.includePreviewDataUrl) {
          next.dataUrl = `data:${optimized.mediaType};base64,${(await readFile(outputPath!)).toString("base64")}`;
        }
        log(`[preview] ${outputPath}\n`);
        return next;
      });

      return {
        fullPrompt,
        outputPath,
        relPath: finalRelPath,
        manifestPath,
        mediaType: optimized.mediaType,
        entry,
        preview,
      };
    },
  );
}

export async function defaultPostprocess(asset: GeneratedAsset, context: AssetPipelineContext): Promise<OptimizedAsset> {
  if (!asset.mediaType.startsWith("image/")) {
    return {
      data: asset.data,
      mediaType: asset.mediaType,
      extension: asset.extension,
    };
  }
  const processed = await toWebpDetailed(asset.data, {
    size: context.size,
    outlineTint: context.outlineTint,
    outlineTintStrength: context.outlineTintStrength,
    outlineTintThreshold: context.outlineTintThreshold,
    softGrade: context.softGrade,
  });
  if (!processed.colorGamutReport) {
    return { data: processed.data, mediaType: "image/webp", extension: "webp" };
  }
  const reportPath = `reports/${context.id}.color-gamut.json`;
  return {
    data: processed.data,
    mediaType: "image/webp",
    extension: "webp",
    entryFields: {
      colorGrade: {
        applied: true,
        advisory: true,
        blocking: false,
        report: reportPath,
        outOfGamutRatio: processed.colorGamutReport.summary.outOfGamutRatio,
        material: processed.colorGamutReport.summary.material,
      },
    },
    writeSidecars: async ({ outputRoot }) => {
      const absolute = join(outputRoot, reportPath);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, serializeColorGamutReport(processed.colorGamutReport!));
    },
  };
}

export function licenseForGeneration(opts: {
  provider: string;
  model?: string;
  kind: string;
  date: Date | string;
}): AssetLicenseRecord {
  return {
    tool: opts.provider,
    plan: opts.model || opts.provider,
    date: licenseDate(opts.date),
    kind: opts.kind,
  };
}

export function assetSubdirForKind(kind: string): string {
  if (kind === "sprite" || kind === "sprite-anim") return "sprites";
  if (kind === "texture") return "textures";
  if (kind === "icon") return "icons";
  if (kind === "music" || kind === "sfx" || kind === "voice") return `audio/${kind}`;
  if (kind === "model" || kind === "3d") return "models";
  return kind;
}

async function runStep<T>(
  opts: Pick<AssetPipelineOptions, "onStep">,
  step: GameAssetPipelineStep,
  message: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  opts.onStep?.({ step, status: "start", message });
  const result = await fn();
  opts.onStep?.({ step, status: "success", message });
  return result;
}

function requiredRepo(repo?: string): string {
  if (!repo) throw new Error("asset pipeline requires repo or outputRoot");
  return repo;
}

function licenseDate(value: Date | string): string {
  const iso = value instanceof Date ? value.toISOString() : value;
  return iso.includes("T") ? iso.slice(0, 10) : iso;
}
