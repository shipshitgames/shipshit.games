export type GenerationExecutionMode = "platform" | "byok";
export type GenerationJobStatus =
  "queued" | "processing" | "succeeded" | "failed";

export interface GenerationJobRecord {
  id: string;
  ownerId: string;
  idempotencyKey: string;
  requestHash: string;
  status: GenerationJobStatus;
  requestedCredits: number;
  reservedIncludedCredits: number;
  reservedPurchasedCredits: number;
  attemptCount: number;
  result: unknown;
  error: string | null;
  leaseExpiresAt: Date | null;
}

export interface ProviderRunRecord {
  id: string;
  generationJobId: string;
  batchIndex: number;
  attempt: number;
  status: string;
  externalId: string | null;
  pollUrl: string | null;
  output: unknown;
  startedAt: Date;
}

export interface ReserveGenerationJobInput {
  ownerId: string;
  idempotencyKey: string;
  requestHash: string;
  kind: string;
  request: Record<string, unknown>;
  provider: string;
  model: string;
  executionMode: GenerationExecutionMode;
  requestedCredits: number;
  includedAllowance: number;
  includedResetAt: Date;
}

export type ReserveGenerationJobResult = {
  created: boolean;
  job: GenerationJobRecord;
};

export type ClaimGenerationJobResult =
  | { state: "claimed"; job: GenerationJobRecord }
  | { state: "busy"; job: GenerationJobRecord }
  | { state: "completed"; job: GenerationJobRecord }
  | { state: "failed"; job: GenerationJobRecord };

export interface GenerationJobStore {
  reserve(
    input: ReserveGenerationJobInput,
  ): Promise<ReserveGenerationJobResult>;
  find(ownerId: string, jobId: string): Promise<GenerationJobRecord | null>;
  claim(
    ownerId: string,
    jobId: string,
    leaseOwner: string,
    leaseExpiresAt: Date,
  ): Promise<ClaimGenerationJobResult>;
  renewLease(
    ownerId: string,
    jobId: string,
    leaseOwner: string,
    leaseExpiresAt: Date,
  ): Promise<boolean>;
  requeue(ownerId: string, jobId: string, leaseOwner: string): Promise<boolean>;
  findResumableProviderRun(
    jobId: string,
    batchIndex: number,
  ): Promise<ProviderRunRecord | null>;
  beginProviderRun(input: {
    jobId: string;
    batchIndex: number;
    provider: string;
    model: string;
    executionMode: GenerationExecutionMode;
    request: Record<string, unknown>;
  }): Promise<ProviderRunRecord>;
  recordProviderPrediction(
    runId: string,
    prediction: {
      externalId?: string;
      status?: string;
      pollUrl?: string;
      output?: unknown;
      costMicros?: bigint;
    },
  ): Promise<void>;
  completeProviderRun(
    runId: string,
    input: { output?: unknown; durationMs: number; costMicros?: bigint },
  ): Promise<void>;
  failProviderRun(
    runId: string,
    input: { error: string; retryable: boolean; durationMs: number },
  ): Promise<void>;
  complete(
    ownerId: string,
    jobId: string,
    settledCredits: number,
    result: Record<string, unknown>,
    leaseOwner: string,
  ): Promise<GenerationJobRecord>;
  fail(
    ownerId: string,
    jobId: string,
    error: string,
    leaseOwner?: string,
  ): Promise<GenerationJobRecord>;
}

export class GenerationQuotaExceededError extends Error {
  constructor(
    readonly requested: number,
    readonly available: number,
  ) {
    super(
      `generation credit balance is too low (${available} available, ${requested} required)`,
    );
    this.name = "GenerationQuotaExceededError";
  }
}

export class GenerationIdempotencyConflictError extends Error {
  constructor() {
    super(
      "idempotency key was already used for a different generation request",
    );
    this.name = "GenerationIdempotencyConflictError";
  }
}

export class GenerationLeaseLostError extends Error {
  constructor() {
    super("generation job lease is no longer owned by this worker");
    this.name = "GenerationLeaseLostError";
  }
}

export interface CreditReservationPlan {
  included: number;
  purchased: number;
}

/**
 * Included credits burn first so purchased packs remain non-expiring fallback.
 * The database repository executes this while holding a per-owner transaction
 * lock and the migration adds non-negative balance checks as a second guard.
 */
export function planCreditReservation(
  includedBalance: number,
  purchasedBalance: number,
  requestedCredits: number,
): CreditReservationPlan {
  if (!Number.isSafeInteger(requestedCredits) || requestedCredits <= 0) {
    throw new Error("requestedCredits must be a positive integer");
  }
  const available = includedBalance + purchasedBalance;
  if (available < requestedCredits) {
    throw new GenerationQuotaExceededError(requestedCredits, available);
  }
  const included = Math.min(includedBalance, requestedCredits);
  return {
    included,
    purchased: requestedCredits - included,
  };
}

export function isRetryableGenerationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (
    error instanceof TypeError &&
    /fetch failed|network|socket|connection/i.test(message)
  )
    return true;
  if (
    /(?:replicate(?: poll)?|http|status)\s+(?:408|409|425|429|5\d\d)\b/i.test(
      message,
    )
  )
    return true;
  return /timed out|timeout|temporarily unavailable|rate limit/i.test(message);
}

export function generationErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.replace(/\s+/g, " ").trim().slice(0, 2_000) || "generation failed"
  );
}
