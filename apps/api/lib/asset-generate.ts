import { createHash, randomUUID } from "node:crypto";

import type { SpritePromptInput } from "./asset-prompt";
import type { AssetRecord, NewAsset } from "./assets";
import {
  generationErrorText,
  GenerationIdempotencyConflictError,
  GenerationLeaseLostError,
  GenerationQuotaExceededError,
  isRetryableGenerationError,
  type GenerationExecutionMode,
  type GenerationJobRecord,
  type GenerationJobStore,
  type ReserveGenerationJobResult,
} from "./generation-jobs";

const PROVIDER = "replicate";
const MODEL = "google/nano-banana-2";
const MAX_BATCH = 4;
const MAX_PROVIDER_ATTEMPTS = 3;
const MAX_PROVIDER_RUN_MS = 30 * 60 * 1000;
const LEASE_MS = 6 * 60 * 1000;

interface AuthenticatedUser {
  userId: string;
}

interface GameOption {
  slug: string;
  title: string;
}

interface GeneratedAsset {
  data: Buffer;
}

interface ReplicatePredictionSnapshot {
  id?: string;
  status?: string;
  output?: unknown;
  urls?: {
    get?: string;
    self?: string;
  };
}

interface ReplicateOptions {
  model: string;
  input: Readonly<Record<string, unknown>>;
  timeoutMs: number;
  pollIntervalMs: number;
  onPrediction?: (
    prediction: Readonly<ReplicatePredictionSnapshot>,
  ) => void | Promise<void>;
}

export interface AssetGenerateDeps {
  requireAuth: (request: Request) => Promise<AuthenticatedUser | Response>;
  games: readonly GameOption[];
  jobs: GenerationJobStore;
  resolveReplicateKey: () => string | undefined;
  missingReplicateKeyMessage: () => Error;
  readAssetImage: (id: string, ownerId: string) => Promise<Buffer | null>;
  uploadReplicateFile: (
    image: Buffer,
    deps: { resolveKey: () => string },
  ) => Promise<string>;
  sheetPoses: readonly string[];
  aspectRatioFor: (sheetPoses?: readonly string[]) => string;
  spritePrompt: (input: SpritePromptInput) => string;
  generateReplicateAsset: (
    prompt: string,
    options: ReplicateOptions,
    deps: { resolveKey: () => string },
  ) => Promise<GeneratedAsset>;
  resumeReplicateAsset: (
    prediction: ReplicatePredictionSnapshot,
    options: ReplicateOptions,
    deps: { resolveKey: () => string },
  ) => Promise<GeneratedAsset>;
  saveAsset: (asset: NewAsset, image: Buffer) => Promise<AssetRecord>;
  assetUrl: (record: Pick<AssetRecord, "id">) => string;
  includedCredits?: number;
  includedResetAt?: (ownerId: string) => Promise<Date | undefined>;
  workerId?: () => string;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface GenerateRequest {
  prompt: string;
  description?: string;
  gameSlug: string;
  pose?: string;
  count: number;
  sourceId?: string;
  sheet: boolean;
}

function requestHash(value: GenerateRequest): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function idempotencyKey(request: Request): string | Response {
  const supplied = request.headers.get("idempotency-key")?.trim();
  if (!supplied) {
    return Response.json(
      { error: "idempotency-key is required" },
      { status: 400 },
    );
  }
  if (supplied.length > 200 || !/^[A-Za-z0-9._:/-]+$/.test(supplied)) {
    return Response.json(
      { error: "idempotency-key must be 1-200 URL-safe characters" },
      { status: 400 },
    );
  }
  return supplied;
}

function defaultIncludedResetAt(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function includedCredits(deps: AssetGenerateDeps): number {
  const environmentValue = Number(process.env.GENERATION_INCLUDED_CREDITS);
  const configured =
    deps.includedCredits ??
    (Number.isFinite(environmentValue) ? environmentValue : 30);
  return Math.max(0, Math.floor(configured));
}

function completedResponse(job: GenerationJobRecord): Response {
  if (
    !job.result ||
    typeof job.result !== "object" ||
    Array.isArray(job.result)
  ) {
    return Response.json(
      {
        error: "generation job completed without a valid result",
        jobId: job.id,
      },
      { status: 500 },
    );
  }
  return Response.json({
    ...(job.result as Record<string, unknown>),
    jobId: job.id,
    idempotent: true,
  });
}

async function runProviderOutput(
  input: {
    jobId: string;
    batchIndex: number;
    prompt: string;
    providerInput: Readonly<Record<string, unknown>>;
    token: string;
    executionMode: GenerationExecutionMode;
    ownerId: string;
    leaseOwner: string;
  },
  deps: AssetGenerateDeps,
): Promise<GeneratedAsset> {
  let resumable = await deps.jobs.findResumableProviderRun(
    input.jobId,
    input.batchIndex,
  );
  let renewAfter = Date.now() + LEASE_MS / 2;
  let retryDelayMs = 500;
  let staleRunPolled = false;

  const renewLease = async (force = false) => {
    if (!force && Date.now() < renewAfter) return;
    const renewed = await deps.jobs.renewLease(
      input.ownerId,
      input.jobId,
      input.leaseOwner,
      new Date(Date.now() + LEASE_MS),
    );
    if (!renewed) throw new GenerationLeaseLostError();
    renewAfter = Date.now() + LEASE_MS / 2;
  };

  while (true) {
    await renewLease(true);
    const run =
      resumable ??
      (await deps.jobs.beginProviderRun({
        jobId: input.jobId,
        batchIndex: input.batchIndex,
        provider: PROVIDER,
        model: MODEL,
        executionMode: input.executionMode,
        request: {
          promptHash: createHash("sha256").update(input.prompt).digest("hex"),
          input: input.providerInput,
        },
      }));
    if (run.attempt > MAX_PROVIDER_ATTEMPTS) {
      const error = new Error("provider retry limit reached");
      await deps.jobs.failProviderRun(run.id, {
        error: error.message,
        retryable: false,
        durationMs: Math.max(0, Date.now() - run.startedAt.getTime()),
      });
      throw error;
    }
    const startedAt = run.startedAt.getTime();
    const runIsStale = Date.now() - startedAt > MAX_PROVIDER_RUN_MS;
    if (
      runIsStale &&
      run.status !== "succeeded" &&
      (!run.externalId || staleRunPolled)
    ) {
      const error = new Error(
        "provider run exceeded the 30 minute durable processing limit",
      );
      await deps.jobs.failProviderRun(run.id, {
        error: error.message,
        retryable: false,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
    if (runIsStale && run.status !== "succeeded") staleRunPolled = true;
    let lastOutput = run.output;
    let lastExternalId = run.externalId;
    let lastPollUrl = run.pollUrl;
    let lastStatus = run.status;
    const options: ReplicateOptions = {
      model: MODEL,
      input: input.providerInput,
      // A stale provider prediction gets one final poll so a terminal result
      // can still be recovered, but it cannot restart unbounded processing.
      timeoutMs: runIsStale ? 0 : 280_000,
      pollIntervalMs: 1_500,
      onPrediction: async (prediction) => {
        lastOutput = prediction.output ?? lastOutput;
        lastExternalId = prediction.id ?? lastExternalId;
        lastPollUrl =
          prediction.urls?.get ?? prediction.urls?.self ?? lastPollUrl;
        lastStatus = prediction.status ?? lastStatus;
        await deps.jobs.recordProviderPrediction(run.id, {
          externalId: prediction.id,
          status: prediction.status,
          pollUrl: prediction.urls?.get ?? prediction.urls?.self,
          output: prediction.output,
        });
        await renewLease();
      },
    };

    try {
      const generated =
        run.externalId && (run.pollUrl || run.status === "succeeded")
          ? await deps.resumeReplicateAsset(
              {
                id: run.externalId,
                status: run.status === "succeeded" ? "succeeded" : "processing",
                output: run.output,
                urls: run.pollUrl ? { get: run.pollUrl } : undefined,
              },
              options,
              { resolveKey: () => input.token },
            )
          : await deps.generateReplicateAsset(input.prompt, options, {
              resolveKey: () => input.token,
            });
      await deps.jobs.completeProviderRun(run.id, {
        output: lastOutput,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
      return generated;
    } catch (error) {
      if (error instanceof GenerationLeaseLostError) throw error;
      const retryable = isRetryableGenerationError(error);
      const predictionCanResume =
        lastExternalId && !["failed", "canceled"].includes(lastStatus);
      if (retryable && predictionCanResume) {
        resumable = {
          ...run,
          status: lastStatus === "succeeded" ? "succeeded" : "processing",
          externalId: lastExternalId,
          pollUrl: lastPollUrl,
          output: lastOutput,
        };
        await (deps.sleep ?? delay)(retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, 5_000);
        continue;
      }
      await deps.jobs.failProviderRun(run.id, {
        error: generationErrorText(error),
        retryable,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
      if (!retryable || run.attempt >= MAX_PROVIDER_ATTEMPTS) throw error;
      resumable = null;
      await (deps.sleep ?? delay)(retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, 5_000);
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function failJobResponse(
  deps: AssetGenerateDeps,
  ownerId: string,
  jobId: string,
  error: unknown,
  status = 502,
  leaseOwner?: string,
): Promise<Response> {
  const message = generationErrorText(error);
  try {
    await deps.jobs.fail(ownerId, jobId, message, leaseOwner);
  } catch (failure) {
    if (failure instanceof GenerationLeaseLostError) {
      return processingResponse(jobId);
    }
    throw failure;
  }
  return Response.json({ error: message, jobId }, { status });
}

function processingResponse(jobId: string): Response {
  return Response.json(
    {
      jobId,
      status: "processing",
      retryable: true,
    },
    { status: 202, headers: { "retry-after": "5" } },
  );
}

export async function handleAssetGenerate(
  request: Request,
  deps: AssetGenerateDeps,
): Promise<Response> {
  const auth = await deps.requireAuth(request);
  if (auth instanceof Response) return auth;

  const body = await request
    .json()
    .catch(() => ({}) as Record<string, unknown>);
  const { prompt, description, gameSlug, pose, count, sourceId, sheet } = body;
  if (typeof prompt !== "string" || !prompt.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }
  const game = deps.games.find((candidate) => candidate.slug === gameSlug);
  if (!game) {
    return Response.json(
      { error: `unknown game: ${gameSlug}` },
      { status: 400 },
    );
  }
  const key = idempotencyKey(request);
  if (key instanceof Response) return key;
  const batch = Math.min(Math.max(Number(count) || 1, 1), MAX_BATCH);
  const token = deps.resolveReplicateKey();
  if (!token) {
    return Response.json(
      { error: deps.missingReplicateKeyMessage().message },
      { status: 503 },
    );
  }

  const normalized: GenerateRequest = {
    prompt: prompt.trim(),
    gameSlug: game.slug,
    count: batch,
    sheet: Boolean(sheet),
    ...(typeof description === "string" && description.trim()
      ? { description: description.trim() }
      : {}),
    ...(typeof pose === "string" ? { pose } : {}),
    ...(sourceId ? { sourceId: String(sourceId) } : {}),
  };
  let source: Buffer | null = null;
  if (normalized.sourceId) {
    source = await deps.readAssetImage(normalized.sourceId, auth.userId);
    if (!source) {
      return Response.json(
        { error: `source asset not found: ${normalized.sourceId}` },
        { status: 404 },
      );
    }
  }

  let reservation: ReserveGenerationJobResult;
  try {
    reservation = await deps.jobs.reserve({
      ownerId: auth.userId,
      idempotencyKey: key,
      requestHash: requestHash(normalized),
      kind: "image",
      request: normalized,
      provider: PROVIDER,
      model: MODEL,
      executionMode: "platform",
      requestedCredits: batch,
      includedAllowance: includedCredits(deps),
      includedResetAt:
        (await deps.includedResetAt?.(auth.userId)) ?? defaultIncludedResetAt(),
    });
  } catch (error) {
    if (error instanceof GenerationQuotaExceededError) {
      return Response.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof GenerationIdempotencyConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  if (reservation.job.status === "succeeded") {
    return completedResponse(reservation.job);
  }
  if (reservation.job.status === "failed") {
    return Response.json(
      {
        error: reservation.job.error ?? "generation failed",
        jobId: reservation.job.id,
      },
      { status: 409 },
    );
  }

  const leaseOwner = deps.workerId?.() ?? randomUUID();
  const claimed = await deps.jobs.claim(
    auth.userId,
    reservation.job.id,
    leaseOwner,
    new Date(Date.now() + LEASE_MS),
  );
  if (claimed.state === "completed") return completedResponse(claimed.job);
  if (claimed.state === "failed") {
    return Response.json(
      {
        error: claimed.job.error ?? "generation failed",
        jobId: claimed.job.id,
      },
      { status: 409 },
    );
  }
  if (claimed.state === "busy") {
    return processingResponse(claimed.job.id);
  }
  let referenceUrl: string | undefined;
  if (source) {
    try {
      referenceUrl = await deps.uploadReplicateFile(source, {
        resolveKey: () => token,
      });
    } catch (error) {
      return failJobResponse(
        deps,
        auth.userId,
        claimed.job.id,
        error,
        502,
        leaseOwner,
      );
    }
  }

  const sheetPoses = normalized.sheet ? [...deps.sheetPoses] : undefined;
  const fullPrompt = deps.spritePrompt({
    subject: normalized.prompt,
    description: normalized.description,
    gameSlug: game.slug,
    pose: normalized.pose,
    sheetPoses,
    fromReference: Boolean(referenceUrl),
  });
  const providerInput: Record<string, unknown> = {
    aspect_ratio: deps.aspectRatioFor(sheetPoses),
  };
  if (referenceUrl) providerInput.image_input = [referenceUrl];

  const results = await Promise.allSettled(
    Array.from({ length: batch }, (_, batchIndex) =>
      runProviderOutput(
        {
          jobId: claimed.job.id,
          batchIndex,
          prompt: fullPrompt,
          providerInput,
          token,
          executionMode: "platform",
          ownerId: auth.userId,
          leaseOwner,
        },
        deps,
      ),
    ),
  );

  if (
    results.some(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof GenerationLeaseLostError,
    )
  ) {
    return processingResponse(claimed.job.id);
  }
  const renewed = await deps.jobs.renewLease(
    auth.userId,
    claimed.job.id,
    leaseOwner,
    new Date(Date.now() + LEASE_MS),
  );
  if (!renewed) return processingResponse(claimed.job.id);

  const saved: Array<AssetRecord & { url: string }> = [];
  const errors: string[] = [];
  for (const [batchIndex, result] of results.entries()) {
    if (result.status === "rejected") {
      errors.push(generationErrorText(result.reason));
      continue;
    }
    try {
      const record = await deps.saveAsset(
        {
          subject: normalized.prompt,
          description: normalized.description ?? null,
          fullPrompt,
          style: "art bible",
          pose: sheetPoses ? null : (normalized.pose ?? null),
          sheetPoses: sheetPoses ?? [],
          gameSlug: game.slug,
          game: game.title,
          model: MODEL,
          ownerId: auth.userId,
          generationJobId: claimed.job.id,
          generationBatchIndex: batchIndex,
        },
        result.value.data,
      );
      saved.push({ ...record, url: deps.assetUrl(record) });
    } catch (error) {
      errors.push(generationErrorText(error));
    }
  }

  if (!saved.length) {
    return failJobResponse(
      deps,
      auth.userId,
      claimed.job.id,
      new Error(errors[0] ?? "generation failed"),
      502,
      leaseOwner,
    );
  }
  const response = {
    assets: saved,
    errors,
    jobId: claimed.job.id,
  };
  try {
    await deps.jobs.complete(
      auth.userId,
      claimed.job.id,
      saved.length,
      response,
      leaseOwner,
    );
  } catch (error) {
    if (error instanceof GenerationLeaseLostError) {
      return processingResponse(claimed.job.id);
    }
    throw error;
  }
  return Response.json(response);
}
