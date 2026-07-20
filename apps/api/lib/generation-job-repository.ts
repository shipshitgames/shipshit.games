import type { GenerationJob, Prisma, ProviderRun } from "@/generated/client";

import { db } from "./db";
import {
  GenerationIdempotencyConflictError,
  GenerationLeaseLostError,
  planCreditReservation,
  type GenerationJobRecord,
  type GenerationJobStore,
  type ProviderRunRecord,
  type ReserveGenerationJobInput,
} from "./generation-jobs";

const TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;
const STALE_RESERVATION_MS = 24 * 60 * 60 * 1000;

function toJob(row: GenerationJob): GenerationJobRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    status: row.status as GenerationJobRecord["status"],
    requestedCredits: row.requestedCredits,
    reservedIncludedCredits: row.reservedIncludedCredits,
    reservedPurchasedCredits: row.reservedPurchasedCredits,
    attemptCount: row.attemptCount,
    result: row.result,
    error: row.error,
    leaseExpiresAt: row.leaseExpiresAt,
  };
}

function toProviderRun(row: ProviderRun): ProviderRunRecord {
  return {
    id: row.id,
    generationJobId: row.generationJobId,
    batchIndex: row.batchIndex,
    attempt: row.attempt,
    status: row.status,
    externalId: row.externalId,
    pollUrl: row.pollUrl,
    output: row.output,
    startedAt: row.startedAt,
  };
}

async function lockGenerationCredits(
  transaction: Prisma.TransactionClient,
  ownerId: string,
) {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtext(${"generation-credits:" + ownerId}))
  `;
}

async function creditAccountForReservation(
  transaction: Prisma.TransactionClient,
  input: ReserveGenerationJobInput,
) {
  const existing = await transaction.generationCreditAccount.findUnique({
    where: { ownerId: input.ownerId },
  });
  if (!existing) {
    return transaction.generationCreditAccount.create({
      data: {
        ownerId: input.ownerId,
        includedBalance: input.includedAllowance,
        includedResetAt: input.includedResetAt,
      },
    });
  }
  if (existing.includedResetAt <= new Date()) {
    return transaction.generationCreditAccount.update({
      where: { ownerId: input.ownerId },
      data: {
        includedBalance: input.includedAllowance,
        includedResetAt: input.includedResetAt,
      },
    });
  }
  return existing;
}

async function appendCreditEntries(
  transaction: Prisma.TransactionClient,
  input: {
    ownerId: string;
    jobId: string;
    action: "reserve" | "settle" | "release" | "expire";
    included: number;
    purchased: number;
  },
) {
  const rows = [
    { source: "included", credits: input.included },
    { source: "purchased", credits: input.purchased },
  ].filter((row) => row.credits > 0);
  if (!rows.length) return;
  await transaction.generationCreditLedger.createMany({
    data: rows.map((row) => ({
      ownerId: input.ownerId,
      generationJobId: input.jobId,
      entryKey: `${input.jobId}:${input.action}:${row.source}`,
      action: input.action,
      source: row.source,
      credits: row.credits,
    })),
    skipDuplicates: true,
  });
}

async function reapExpiredReservations(
  transaction: Prisma.TransactionClient,
  ownerId: string,
) {
  const staleBefore = new Date(Date.now() - STALE_RESERVATION_MS);
  const staleJobs = await transaction.generationJob.findMany({
    where: {
      ownerId,
      OR: [
        {
          status: "processing",
          leaseExpiresAt: { lte: staleBefore },
        },
        {
          status: "queued",
          createdAt: { lte: staleBefore },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  if (!staleJobs.length) return;

  for (const job of staleJobs) {
    const expired = await transaction.generationJob.updateMany({
      where: {
        id: job.id,
        ownerId,
        OR: [
          {
            status: "processing",
            leaseExpiresAt: { lte: staleBefore },
          },
          {
            status: "queued",
            createdAt: { lte: staleBefore },
          },
        ],
      },
      data: {
        status: "failed",
        error: "generation job expired after 24 hours without a worker",
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: new Date(),
      },
    });
    if (!expired.count) continue;

    const account = await transaction.generationCreditAccount.findUniqueOrThrow(
      {
        where: { ownerId },
      },
    );
    const refundableIncluded =
      account.includedResetAt.getTime() === job.includedPeriodEndsAt.getTime()
        ? job.reservedIncludedCredits
        : 0;
    await transaction.generationCreditAccount.update({
      where: { ownerId },
      data: {
        includedBalance: { increment: refundableIncluded },
        purchasedBalance: {
          increment: job.reservedPurchasedCredits,
        },
      },
    });
    await appendCreditEntries(transaction, {
      ownerId,
      jobId: job.id,
      action: "release",
      included: refundableIncluded,
      purchased: job.reservedPurchasedCredits,
    });
    await appendCreditEntries(transaction, {
      ownerId,
      jobId: job.id,
      action: "expire",
      included: job.reservedIncludedCredits - refundableIncluded,
      purchased: 0,
    });
  }
}

export const generationJobRepository: GenerationJobStore = {
  async reserve(input) {
    return db.$transaction(async (transaction) => {
      await lockGenerationCredits(transaction, input.ownerId);
      const existing = await transaction.generationJob.findUnique({
        where: {
          ownerId_idempotencyKey: {
            ownerId: input.ownerId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.requestHash !== input.requestHash) {
          throw new GenerationIdempotencyConflictError();
        }
        return { created: false, job: toJob(existing) };
      }

      await creditAccountForReservation(transaction, input);
      await reapExpiredReservations(transaction, input.ownerId);
      const account =
        await transaction.generationCreditAccount.findUniqueOrThrow({
          where: { ownerId: input.ownerId },
        });
      const reservation = planCreditReservation(
        account.includedBalance,
        account.purchasedBalance,
        input.requestedCredits,
      );
      await transaction.generationCreditAccount.update({
        where: { ownerId: input.ownerId },
        data: {
          includedBalance: { decrement: reservation.included },
          purchasedBalance: { decrement: reservation.purchased },
        },
      });
      const job = await transaction.generationJob.create({
        data: {
          ownerId: input.ownerId,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          kind: input.kind,
          request: input.request as Prisma.InputJsonValue,
          provider: input.provider,
          model: input.model,
          executionMode: input.executionMode,
          requestedCredits: input.requestedCredits,
          reservedIncludedCredits: reservation.included,
          reservedPurchasedCredits: reservation.purchased,
          includedPeriodEndsAt: account.includedResetAt,
        },
      });
      await appendCreditEntries(transaction, {
        ownerId: input.ownerId,
        jobId: job.id,
        action: "reserve",
        included: reservation.included,
        purchased: reservation.purchased,
      });
      return { created: true, job: toJob(job) };
    }, TRANSACTION_OPTIONS);
  },

  async find(ownerId, jobId) {
    const row = await db.generationJob.findFirst({
      where: { id: jobId, ownerId },
    });
    return row ? toJob(row) : null;
  },

  async claim(ownerId, jobId, leaseOwner, leaseExpiresAt) {
    const now = new Date();
    const existing = await db.generationJob.findFirst({
      where: { id: jobId, ownerId },
    });
    if (!existing) throw new Error("generation job not found");
    if (existing.status === "succeeded") {
      return { state: "completed", job: toJob(existing) };
    }
    if (existing.status === "failed") {
      return { state: "failed", job: toJob(existing) };
    }
    if (
      existing.status === "processing" &&
      (!existing.leaseExpiresAt || existing.leaseExpiresAt > now)
    ) {
      return { state: "busy", job: toJob(existing) };
    }
    const claimed = await db.generationJob.updateMany({
      where: {
        id: jobId,
        ownerId,
        OR: [
          {
            status: "queued",
            AND: [{ OR: [{ retryAt: null }, { retryAt: { lte: now } }] }],
          },
          {
            status: "processing",
            leaseExpiresAt: { lte: now },
          },
        ],
      },
      data: {
        status: "processing",
        attemptCount: { increment: 1 },
        leaseOwner,
        leaseExpiresAt,
        retryAt: null,
        error: null,
        startedAt: existing.startedAt ?? now,
      },
    });
    if (!claimed.count) {
      const busy = await db.generationJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      return { state: "busy", job: toJob(busy) };
    }
    const job = await db.generationJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    return { state: "claimed", job: toJob(job) };
  },

  async renewLease(ownerId, jobId, leaseOwner, leaseExpiresAt) {
    const renewed = await db.generationJob.updateMany({
      where: {
        id: jobId,
        ownerId,
        status: "processing",
        leaseOwner,
      },
      data: { leaseExpiresAt },
    });
    return renewed.count === 1;
  },

  async findResumableProviderRun(jobId, batchIndex) {
    const row = await db.providerRun.findFirst({
      where: {
        generationJobId: jobId,
        batchIndex,
        status: { in: ["processing", "succeeded"] },
        externalId: { not: null },
      },
      orderBy: { attempt: "desc" },
    });
    return row ? toProviderRun(row) : null;
  },

  async beginProviderRun(input) {
    const latest = await db.providerRun.findFirst({
      where: {
        generationJobId: input.jobId,
        batchIndex: input.batchIndex,
      },
      select: { attempt: true },
      orderBy: { attempt: "desc" },
    });
    const row = await db.providerRun.create({
      data: {
        generationJobId: input.jobId,
        batchIndex: input.batchIndex,
        attempt: (latest?.attempt ?? 0) + 1,
        provider: input.provider,
        model: input.model,
        executionMode: input.executionMode,
        request: input.request as Prisma.InputJsonValue,
      },
    });
    return toProviderRun(row);
  },

  async recordProviderPrediction(runId, prediction) {
    await db.providerRun.update({
      where: { id: runId },
      data: {
        externalId: prediction.externalId,
        status:
          prediction.status === undefined
            ? undefined
            : prediction.status === "succeeded"
              ? "succeeded"
              : ["failed", "canceled"].includes(prediction.status)
                ? "failed"
                : "processing",
        pollUrl: prediction.pollUrl,
        output:
          prediction.output == null
            ? undefined
            : (prediction.output as Prisma.InputJsonValue),
        costMicros: prediction.costMicros,
      },
    });
  },

  async completeProviderRun(runId, input) {
    await db.providerRun.update({
      where: { id: runId },
      data: {
        status: "succeeded",
        output:
          input.output == null
            ? undefined
            : (input.output as Prisma.InputJsonValue),
        costMicros: input.costMicros,
        durationMs: input.durationMs,
        retryable: false,
        error: null,
        completedAt: new Date(),
      },
    });
  },

  async failProviderRun(runId, input) {
    await db.providerRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        error: input.error,
        retryable: input.retryable,
        durationMs: input.durationMs,
        completedAt: new Date(),
      },
    });
  },

  async complete(ownerId, jobId, settledCredits, result, leaseOwner) {
    return db.$transaction(async (transaction) => {
      await lockGenerationCredits(transaction, ownerId);
      const job = await transaction.generationJob.findFirstOrThrow({
        where: { id: jobId, ownerId },
      });
      if (job.status === "succeeded") return toJob(job);
      if (job.status === "failed") {
        throw new Error("cannot complete a failed generation job");
      }
      if (job.leaseOwner !== leaseOwner) {
        throw new GenerationLeaseLostError();
      }
      if (
        !Number.isSafeInteger(settledCredits) ||
        settledCredits <= 0 ||
        settledCredits > job.requestedCredits
      ) {
        throw new Error(
          "settledCredits must be within the reserved credit total",
        );
      }

      const settledIncluded = Math.min(
        job.reservedIncludedCredits,
        settledCredits,
      );
      const settledPurchased = settledCredits - settledIncluded;
      const releasedIncluded = job.reservedIncludedCredits - settledIncluded;
      const releasedPurchased = job.reservedPurchasedCredits - settledPurchased;
      const account =
        await transaction.generationCreditAccount.findUniqueOrThrow({
          where: { ownerId },
        });
      const refundableIncluded =
        account.includedResetAt.getTime() === job.includedPeriodEndsAt.getTime()
          ? releasedIncluded
          : 0;
      if (releasedIncluded || releasedPurchased) {
        await transaction.generationCreditAccount.update({
          where: { ownerId },
          data: {
            includedBalance: { increment: refundableIncluded },
            purchasedBalance: { increment: releasedPurchased },
          },
        });
      }
      await appendCreditEntries(transaction, {
        ownerId,
        jobId,
        action: "settle",
        included: settledIncluded,
        purchased: settledPurchased,
      });
      await appendCreditEntries(transaction, {
        ownerId,
        jobId,
        action: "release",
        included: refundableIncluded,
        purchased: releasedPurchased,
      });
      await appendCreditEntries(transaction, {
        ownerId,
        jobId,
        action: "expire",
        included: releasedIncluded - refundableIncluded,
        purchased: 0,
      });
      const completed = await transaction.generationJob.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          result: result as Prisma.InputJsonValue,
          error: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: new Date(),
        },
      });
      return toJob(completed);
    }, TRANSACTION_OPTIONS);
  },

  async fail(ownerId, jobId, error, leaseOwner) {
    return db.$transaction(async (transaction) => {
      await lockGenerationCredits(transaction, ownerId);
      const job = await transaction.generationJob.findFirstOrThrow({
        where: { id: jobId, ownerId },
      });
      if (leaseOwner && job.leaseOwner !== leaseOwner) {
        throw new GenerationLeaseLostError();
      }
      if (job.status === "failed" || job.status === "succeeded") {
        return toJob(job);
      }
      const account =
        await transaction.generationCreditAccount.findUniqueOrThrow({
          where: { ownerId },
        });
      const refundableIncluded =
        account.includedResetAt.getTime() === job.includedPeriodEndsAt.getTime()
          ? job.reservedIncludedCredits
          : 0;
      await transaction.generationCreditAccount.update({
        where: { ownerId },
        data: {
          includedBalance: {
            increment: refundableIncluded,
          },
          purchasedBalance: {
            increment: job.reservedPurchasedCredits,
          },
        },
      });
      await appendCreditEntries(transaction, {
        ownerId,
        jobId,
        action: "release",
        included: refundableIncluded,
        purchased: job.reservedPurchasedCredits,
      });
      await appendCreditEntries(transaction, {
        ownerId,
        jobId,
        action: "expire",
        included: job.reservedIncludedCredits - refundableIncluded,
        purchased: 0,
      });
      const failed = await transaction.generationJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          error,
          leaseOwner: null,
          leaseExpiresAt: null,
          completedAt: new Date(),
        },
      });
      return toJob(failed);
    }, TRANSACTION_OPTIONS);
  },
};
