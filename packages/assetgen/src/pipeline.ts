import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildPrompt } from "./style.ts";
import { assetProviders, generateAsset } from "./providers.ts";
import type { AssetKind, GeneratedAsset, ProviderId } from "./providers.ts";
import { toWebp } from "./postprocess.ts";
import { register } from "./manifest.ts";
import type { AssetEntry, AssetLicenseRecord } from "./manifest.ts";
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
    optionalFields: readonly ["provider", "model", "size"];
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
}

export type AssetPostprocessHook = (
  asset: GeneratedAsset & { provider: ProviderId },
  context: AssetPipelineContext,
) => Promise<OptimizedAsset> | OptimizedAsset;

export interface AssetPipelineOptions {
  id: string;
  prompt: string;
  game: string;
  kind: AssetKind;
  provider: string;
  size: number;
  repo?: string;
  outputRoot?: string;
  manifestPath?: string;
  model?: string;
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
      optionalFields: ["provider", "model", "size"],
    },
    credentialVault: Object.values(assetProviders).map((provider) => ({
      provider: provider.id,
      label: provider.label,
      keyed: Boolean(provider.key),
      envName: provider.key?.envName,
      service: provider.key?.service,
    })),
    manifest: {
      requiredLicenseFields: ["tool", "plan", "date", "kind"],
    },
    previewPane: {
      emits: ["path", "mediaType", "dataUrl"],
    },
  };
}

export async function runAssetPipeline(opts: AssetPipelineOptions): Promise<AssetPipelineResult> {
  const outputRoot = opts.outputRoot ?? join(requiredRepo(opts.repo), "src/assets");
  const manifestPath = opts.manifestPath ?? join(outputRoot, "assets.json");
  const relPath = `${assetSubdirForKind(opts.kind)}/${opts.id}`;
  const log = opts.log ?? (() => {});
  const started = Date.now();
  let ok = false;
  let usageError: unknown;
  let outputPath: string | undefined;
  let selectedProvider = opts.provider;
  let usedModel = opts.model;

  try {
    const fullPrompt = await runStep(opts, "prompt", "build prompt", async () =>
      buildPrompt({ prompt: opts.prompt, game: opts.game, kind: opts.kind }),
    );

    const generated = await runStep(opts, "generate", `generate ${opts.kind}`, async () =>
      generateAsset(opts.kind, fullPrompt, {
        provider: opts.provider,
        size: `${opts.size}x${opts.size}`,
        model: opts.model,
        log,
      }),
    );
    selectedProvider = generated.provider;
    usedModel = generated.model;

    const context: AssetPipelineContext = {
      id: opts.id,
      prompt: opts.prompt,
      fullPrompt,
      game: opts.game,
      kind: opts.kind,
      size: opts.size,
      provider: generated.provider,
      model: generated.model,
    };
    const optimized = await runStep(opts, "postprocess", "post-process output", async () =>
      (opts.postprocess ?? defaultPostprocess)(generated, context),
    );

    const finalRelPath = `${relPath}.${optimized.extension}`;
    outputPath = join(outputRoot, finalRelPath);
    const entry = await runStep(opts, "register", "write asset and manifest", async () => {
      await mkdir(dirname(outputPath!), { recursive: true });
      await writeFile(outputPath!, optimized.data);
      log(`[wrote] ${outputPath} (${(optimized.data.length / 1024).toFixed(1)} kb, ${optimized.mediaType})\n`);
      const registered: AssetEntry = {
        id: opts.id,
        kind: opts.kind,
        game: opts.game,
        path: finalRelPath,
        prompt: opts.prompt,
        provider: generated.provider,
        license: licenseForGeneration({
          provider: generated.provider,
          model: generated.model,
          kind: opts.kind,
          date: opts.now?.() ?? new Date(),
        }),
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

    ok = true;
    return {
      fullPrompt,
      outputPath,
      relPath: finalRelPath,
      manifestPath,
      mediaType: optimized.mediaType,
      entry,
      preview,
    };
  } catch (error) {
    usageError = error;
    throw error;
  } finally {
    try {
      const logPath = await appendUsageLog(
        {
          command: opts.usageCommand ?? "generate",
          provider: selectedProvider,
          kind: opts.kind,
          game: opts.game,
          id: opts.id,
          model: usedModel,
          size: opts.size,
          outputPath,
          prompt: opts.prompt,
          success: ok,
          durationMs: Date.now() - started,
          error: usageError,
        },
        opts.usageLogPath,
      );
      if (logPath) log(`[usage] ${logPath}\n`);
    } catch (error) {
      log(`[usage] failed to write usage log: ${String((error as Error)?.message ?? error)}\n`);
    }
  }
}

export async function defaultPostprocess(asset: GeneratedAsset, context: AssetPipelineContext): Promise<OptimizedAsset> {
  if (!asset.mediaType.startsWith("image/")) {
    return {
      data: asset.data,
      mediaType: asset.mediaType,
      extension: asset.extension,
    };
  }
  return {
    data: await toWebp(asset.data, { size: context.size }),
    mediaType: "image/webp",
    extension: "webp",
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
  if (kind === "sprite") return "sprites";
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
