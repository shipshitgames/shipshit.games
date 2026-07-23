import { beforeEach, expect, mock, test } from "bun:test";

import { handleAssetGenerate, type AssetGenerateDeps } from "./asset-generate";
import {
  GenerationIdempotencyConflictError,
  GenerationQuotaExceededError,
  type ClaimGenerationJobResult,
  type GenerationJobRecord,
  type GenerationJobStore,
  type ProviderRunRecord,
  type ReserveGenerationJobInput,
} from "./generation-jobs";

const readAssetImage = mock(async () => null as Buffer | null);
const saveAsset = mock(
  async (
    asset: Parameters<AssetGenerateDeps["saveAsset"]>[0],
    _image: Buffer,
  ) => ({
    id: `asset-${asset.generationBatchIndex ?? 0}`,
    subject: "Warden",
    description: null,
    fullPrompt: "generated prompt",
    style: "art bible",
    pose: null,
    sheetPoses: null,
    gameSlug: "scourge-survivors",
    game: "Scourge Survivors",
    model: "google/nano-banana-2",
    storageKey: null,
    mediaType: "image/png",
    byteSize: 4,
    ownerId: "user-1",
    generationJobId: asset.generationJobId ?? null,
    generationBatchIndex: asset.generationBatchIndex ?? null,
    parentId: null,
    sourceId: asset.sourceId ?? null,
    editInstruction: asset.editInstruction ?? null,
    sliceIndex: null,
    createdAt: "2026-07-20T00:00:00.000Z",
  }),
);
const uploadReplicateFile = mock(
  async () => "https://files.replicate.com/reference.png",
);
const generateReplicateAsset = mock(
  async (
    _prompt: string,
    options: Parameters<AssetGenerateDeps["generateReplicateAsset"]>[1],
  ) => {
    await options.onPrediction?.({
      id: "prediction-1",
      status: "succeeded",
      output: "https://cdn.replicate.delivery/output.png",
    });
    return {
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    };
  },
);
const resumeReplicateAsset = mock(async () => ({
  data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
}));
const buildSpritePrompt = mock(
  ({ subject }: { subject: string }) => `sprite: ${subject}`,
);

function jobRecord(
  input: ReserveGenerationJobInput,
  id: string,
): GenerationJobRecord {
  return {
    id,
    ownerId: input.ownerId,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    status: "queued",
    requestedCredits: input.requestedCredits,
    reservedIncludedCredits: input.requestedCredits,
    reservedPurchasedCredits: 0,
    attemptCount: 0,
    result: null,
    error: null,
    leaseExpiresAt: null,
  };
}

class MemoryGenerationJobs implements GenerationJobStore {
  includedBalance = 30;
  jobs = new Map<string, GenerationJobRecord>();
  idempotency = new Map<string, string>();
  runs: ProviderRunRecord[] = [];
  settledCredits = 0;

  async reserve(input: ReserveGenerationJobInput) {
    const lookup = `${input.ownerId}:${input.idempotencyKey}`;
    const existingId = this.idempotency.get(lookup);
    if (existingId) {
      const existing = this.jobs.get(existingId)!;
      if (existing.requestHash !== input.requestHash) {
        throw new GenerationIdempotencyConflictError();
      }
      return { created: false, job: { ...existing } };
    }
    if (this.includedBalance < input.requestedCredits) {
      throw new GenerationQuotaExceededError(
        input.requestedCredits,
        this.includedBalance,
      );
    }
    this.includedBalance -= input.requestedCredits;
    const id = `job-${this.jobs.size + 1}`;
    const job = jobRecord(input, id);
    this.jobs.set(id, job);
    this.idempotency.set(lookup, id);
    return { created: true, job: { ...job } };
  }

  async find(ownerId: string, jobId: string) {
    const job = this.jobs.get(jobId);
    return job?.ownerId === ownerId ? { ...job } : null;
  }

  async claim(
    ownerId: string,
    jobId: string,
    _leaseOwner: string,
    leaseExpiresAt: Date,
  ): Promise<ClaimGenerationJobResult> {
    const job = this.jobs.get(jobId)!;
    expect(job.ownerId).toBe(ownerId);
    if (job.status === "succeeded") {
      return { state: "completed", job: { ...job } };
    }
    if (job.status === "failed") {
      return { state: "failed", job: { ...job } };
    }
    job.status = "processing";
    job.attemptCount += 1;
    job.leaseExpiresAt = leaseExpiresAt;
    return { state: "claimed", job: { ...job } };
  }

  async renewLease(
    ownerId: string,
    jobId: string,
    _leaseOwner: string,
    leaseExpiresAt: Date,
  ) {
    const job = this.jobs.get(jobId);
    if (!job || job.ownerId !== ownerId || job.status !== "processing") {
      return false;
    }
    job.leaseExpiresAt = leaseExpiresAt;
    return true;
  }

  async requeue(ownerId: string, jobId: string, _leaseOwner: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.ownerId !== ownerId || job.status !== "processing") {
      return false;
    }
    job.status = "queued";
    job.leaseExpiresAt = null;
    return true;
  }

  async findResumableProviderRun(jobId: string, batchIndex: number) {
    return (
      this.runs.find(
        (run) =>
          run.generationJobId === jobId &&
          run.batchIndex === batchIndex &&
          run.externalId &&
          ["processing", "succeeded"].includes(run.status),
      ) ?? null
    );
  }

  async beginProviderRun(input: { jobId: string; batchIndex: number }) {
    const run: ProviderRunRecord = {
      id: `run-${this.runs.length + 1}`,
      generationJobId: input.jobId,
      batchIndex: input.batchIndex,
      attempt:
        this.runs.filter(
          (candidate) =>
            candidate.generationJobId === input.jobId &&
            candidate.batchIndex === input.batchIndex,
        ).length + 1,
      status: "processing",
      externalId: null,
      pollUrl: null,
      output: null,
      startedAt: new Date(),
    };
    this.runs.push(run);
    return { ...run };
  }

  async recordProviderPrediction(
    runId: string,
    prediction: {
      externalId?: string;
      status?: string;
      pollUrl?: string;
      output?: unknown;
    },
  ) {
    Object.assign(
      this.runs.find((run) => run.id === runId)!,
      prediction,
    );
  }

  async completeProviderRun(runId: string, input: { output?: unknown }) {
    Object.assign(
      this.runs.find((run) => run.id === runId)!,
      {
        status: "succeeded",
        output: input.output,
      },
    );
  }

  async failProviderRun(
    runId: string,
    _input: { error: string; retryable: boolean; durationMs: number },
  ) {
    this.runs.find((run) => run.id === runId)!.status = "failed";
  }

  async complete(
    _ownerId: string,
    jobId: string,
    settledCredits: number,
    result: Record<string, unknown>,
    _leaseOwner: string,
  ) {
    const job = this.jobs.get(jobId)!;
    this.includedBalance += job.requestedCredits - settledCredits;
    this.settledCredits += settledCredits;
    job.status = "succeeded";
    job.result = result;
    job.leaseExpiresAt = null;
    return { ...job };
  }

  async fail(
    _ownerId: string,
    jobId: string,
    error: string,
    _leaseOwner?: string,
  ) {
    const job = this.jobs.get(jobId)!;
    if (job.status !== "failed" && job.status !== "succeeded") {
      this.includedBalance += job.requestedCredits;
    }
    job.status = "failed";
    job.error = error;
    job.leaseExpiresAt = null;
    return { ...job };
  }
}

let replicateKey: string | undefined = "unit-key";
let jobs = new MemoryGenerationJobs();
let requestSequence = 0;

function buildDeps(): AssetGenerateDeps {
  return {
    requireAuth: async () => ({ userId: "user-1" }),
    games: [{ slug: "scourge-survivors", title: "Scourge Survivors" }],
    jobs,
    resolveReplicateKey: () => replicateKey,
    missingReplicateKeyMessage: () =>
      new Error(
        "No Replicate key. Set REPLICATE_API_TOKEN, or store it in shipshit-replicate.",
      ),
    readAssetImage,
    uploadReplicateFile,
    sheetPoses: ["idle", "attacking", "running", "jumping"],
    aspectRatioFor: (sheetPoses) => (sheetPoses?.length ? "21:9" : "1:1"),
    spritePrompt: buildSpritePrompt,
    generateReplicateAsset,
    resumeReplicateAsset,
    saveAsset,
    assetUrl: ({ id }) => `/v1/assets/${id}/file`,
    includedCredits: 30,
    includedResetAt: async () => new Date("2026-08-01T00:00:00.000Z"),
    workerId: () => "worker-1",
    sleep: async () => {},
  };
}

beforeEach(() => {
  jobs = new MemoryGenerationJobs();
  requestSequence = 0;
  replicateKey = "unit-key";
  readAssetImage.mockClear();
  saveAsset.mockClear();
  uploadReplicateFile.mockClear();
  generateReplicateAsset.mockClear();
  resumeReplicateAsset.mockClear();
  buildSpritePrompt.mockClear();
  readAssetImage.mockImplementation(async () => null);
  uploadReplicateFile.mockImplementation(
    async () => "https://files.replicate.com/reference.png",
  );
  generateReplicateAsset.mockImplementation(async (_prompt, options) => {
    await options.onPrediction?.({
      id: "prediction-1",
      status: "succeeded",
      output: "https://cdn.replicate.delivery/output.png",
    });
    return {
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    };
  });
  saveAsset.mockImplementation(async (asset) => ({
    id: `asset-${asset.generationBatchIndex ?? 0}`,
    subject: "Warden",
    description: null,
    fullPrompt: "generated prompt",
    style: "art bible",
    pose: null,
    sheetPoses: null,
    gameSlug: "scourge-survivors",
    game: "Scourge Survivors",
    model: "google/nano-banana-2",
    storageKey: null,
    mediaType: "image/png",
    byteSize: 4,
    ownerId: "user-1",
    generationJobId: asset.generationJobId ?? null,
    generationBatchIndex: asset.generationBatchIndex ?? null,
    parentId: null,
    sourceId: asset.sourceId ?? null,
    editInstruction: asset.editInstruction ?? null,
    sliceIndex: null,
    createdAt: "2026-07-20T00:00:00.000Z",
  }));
  buildSpritePrompt.mockImplementation(({ subject }) => `sprite: ${subject}`);
});

async function post(
  body: Record<string, unknown>,
  key?: string,
): Promise<Response> {
  requestSequence += 1;
  return handleAssetGenerate(
    new Request("https://api.shipshit.games/v1/assets/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key ?? `test:${requestSequence}`,
      },
      body: JSON.stringify(body),
    }),
    buildDeps(),
  );
}

test("generate route preserves validation and pre-reservation error statuses", async () => {
  let response = await post({ gameSlug: "scourge-survivors" });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "prompt is required" });

  response = await post({ prompt: "Warden", gameSlug: "unknown-game" });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "unknown game: unknown-game",
  });

  replicateKey = undefined;
  response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
  });
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain("No Replicate key.");
  expect(jobs.jobs.size).toBe(0);

  replicateKey = "unit-key";
  response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
    sourceId: "3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2",
  });
  expect(response.status).toBe(404);
  expect((await response.json()).error).toContain("source asset not found");
  expect(jobs.jobs.size).toBe(0);
});

test("generate route persists provider runs and settles only successful outputs", async () => {
  generateReplicateAsset.mockImplementationOnce(async () => {
    throw new Error("invalid provider input");
  });

  const response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
    sheet: true,
    count: 2,
  });
  const json = await response.json();

  expect(response.status).toBe(200);
  expect(json.jobId).toBe("job-1");
  expect(json.assets).toHaveLength(1);
  expect(json.errors).toEqual(["invalid provider input"]);
  expect(jobs.settledCredits).toBe(1);
  expect(jobs.includedBalance).toBe(29);
  expect(jobs.runs.map((run) => run.status)).toEqual(["failed", "succeeded"]);
});

test("retryable provider failures are retried under one reservation", async () => {
  generateReplicateAsset
    .mockImplementationOnce(async () => {
      throw new Error("replicate 503: unavailable");
    })
    .mockImplementationOnce(async () => {
      throw new Error("replicate 429: rate limit");
    });

  const response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
  });

  expect(response.status).toBe(200);
  expect(generateReplicateAsset).toHaveBeenCalledTimes(3);
  expect(jobs.jobs.size).toBe(1);
  expect(jobs.runs.map((run) => run.status)).toEqual([
    "failed",
    "failed",
    "succeeded",
  ]);
  expect(jobs.settledCredits).toBe(1);
});

test("a reclaimed job resumes its persisted provider prediction", async () => {
  jobs.runs.push({
    id: "run-resumable",
    generationJobId: "job-1",
    batchIndex: 0,
    attempt: 1,
    status: "processing",
    externalId: "prediction-resumable",
    pollUrl: "https://api.replicate.com/v1/predictions/prediction-resumable",
    output: null,
    startedAt: new Date(),
  });

  const response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
  });

  expect(response.status).toBe(200);
  expect(resumeReplicateAsset).toHaveBeenCalledTimes(1);
  expect(generateReplicateAsset).not.toHaveBeenCalled();
});

test("a stale succeeded prediction remains downloadable on a later visit", async () => {
  jobs.runs.push({
    id: "run-succeeded",
    generationJobId: "job-1",
    batchIndex: 0,
    attempt: 1,
    status: "succeeded",
    externalId: "prediction-succeeded",
    pollUrl: "https://api.replicate.com/v1/predictions/prediction-succeeded",
    output: "https://cdn.replicate.delivery/succeeded-output.png",
    startedAt: new Date(Date.now() - 31 * 60 * 1000),
  });

  const response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
  });

  expect(response.status).toBe(200);
  expect(resumeReplicateAsset).toHaveBeenCalledTimes(1);
  expect(generateReplicateAsset).not.toHaveBeenCalled();
});

test("a transient download failure reuses the succeeded prediction", async () => {
  generateReplicateAsset.mockImplementationOnce(async (_prompt, options) => {
    await options.onPrediction?.({
      id: "prediction-paid",
      status: "succeeded",
      output: "https://cdn.replicate.delivery/paid-output.png",
    });
    throw new TypeError("fetch failed");
  });

  const response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
  });

  expect(response.status).toBe(200);
  expect(generateReplicateAsset).toHaveBeenCalledTimes(1);
  expect(resumeReplicateAsset).toHaveBeenCalledTimes(1);
  expect(jobs.runs).toHaveLength(1);
  expect(jobs.runs[0]?.status).toBe("succeeded");
});

test("same idempotency key returns the stored result without duplicate spend", async () => {
  const body = {
    prompt: "Warden",
    gameSlug: "scourge-survivors",
    count: 1,
  };
  const first = await post(body, "asset-lab:request-1");
  const second = await post(body, "asset-lab:request-1");

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(await second.json()).toMatchObject({
    jobId: "job-1",
    idempotent: true,
  });
  expect(generateReplicateAsset).toHaveBeenCalledTimes(1);
  expect(jobs.includedBalance).toBe(29);
});

test("same idempotency key rejects a different payload", async () => {
  await post(
    { prompt: "Warden", gameSlug: "scourge-survivors" },
    "asset-lab:request-1",
  );
  const response = await post(
    { prompt: "Husk", gameSlug: "scourge-survivors" },
    "asset-lab:request-1",
  );

  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain(
    "different generation request",
  );
});

test("asset persistence failure keeps paid provider output retryable", async () => {
  saveAsset.mockImplementationOnce(async () => {
    throw new Error("object storage unavailable");
  });
  const body = {
    prompt: "Warden",
    gameSlug: "scourge-survivors",
  };

  const first = await post(body, "asset-lab:persistence-retry");
  expect(first.status).toBe(202);
  expect(await first.json()).toMatchObject({
    jobId: "job-1",
    status: "processing",
    retryable: true,
  });
  expect(jobs.jobs.get("job-1")?.status).toBe("queued");
  expect(jobs.includedBalance).toBe(29);

  const second = await post(body, "asset-lab:persistence-retry");
  expect(second.status).toBe(200);
  expect(generateReplicateAsset).toHaveBeenCalledTimes(1);
  expect(resumeReplicateAsset).toHaveBeenCalledTimes(1);
  expect(jobs.settledCredits).toBe(1);
  expect(jobs.includedBalance).toBe(29);
});

test("terminal provider failure releases the reservation", async () => {
  generateReplicateAsset.mockImplementationOnce(async () => {
    throw new Error("invalid provider input");
  });

  const response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
  });

  expect(response.status).toBe(502);
  expect(jobs.includedBalance).toBe(30);
  expect(jobs.jobs.get("job-1")?.status).toBe("failed");
});

test("concurrent requests cannot oversubscribe the available credits", async () => {
  jobs.includedBalance = 1;
  const body = {
    prompt: "Warden",
    gameSlug: "scourge-survivors",
  };

  const responses = await Promise.all([
    post(body, "concurrent:1"),
    post(body, "concurrent:2"),
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 429,
  ]);
  expect(generateReplicateAsset).toHaveBeenCalledTimes(1);
  expect(jobs.includedBalance).toBe(0);
});

test("generate route validates edit requests before provider spend", async () => {
  let response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
    editInstruction: "add shoulder armor",
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "sourceId is required when editInstruction is set",
  });

  response = await post({
    prompt: "Warden",
    gameSlug: "scourge-survivors",
    sourceId: "3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2",
    editInstruction: " ",
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "editInstruction must not be empty",
  });
  expect(readAssetImage).not.toHaveBeenCalled();
  expect(generateReplicateAsset).not.toHaveBeenCalled();
});

test("generate route preserves edit lineage and supports edit batches", async () => {
  readAssetImage.mockImplementationOnce(async () => Buffer.from([1, 2, 3]));

  const response = await post({
    prompt: "Warden",
    description: "bone armor",
    gameSlug: "scourge-survivors",
    sourceId: "3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2",
    editInstruction: "  add a glowing toxic core  ",
    count: 3,
  });

  expect(response.status).toBe(200);
  expect(generateReplicateAsset).toHaveBeenCalledTimes(3);
  expect(buildSpritePrompt).toHaveBeenCalledWith(
    expect.objectContaining({
      fromReference: true,
      editInstruction: "add a glowing toxic core",
    }),
  );
  expect(saveAsset).toHaveBeenCalledTimes(3);
  for (const call of saveAsset.mock.calls) {
    expect(call[0]).toMatchObject({
      sourceId: "3d0a0cf5-b7a2-4cf0-8b4a-dc0ec45b2ec2",
      editInstruction: "add a glowing toxic core",
    });
  }
});
