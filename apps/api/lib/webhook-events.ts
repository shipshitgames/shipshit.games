import { Prisma } from "@/generated/client";
import { db } from "./db";

/**
 * Persist a verified webhook delivery. Returns false when the provider
 * already delivered this event (idempotent redelivery) so handlers can skip
 * side effects.
 */
export async function recordWebhookEvent(
  source: "stripe" | "clerk" | "github",
  externalId: string | null,
  type: string,
  payload: unknown,
): Promise<boolean> {
  try {
    await db.webhookEvent.create({
      data: {
        source,
        externalId,
        type,
        payload: payload as Prisma.InputJsonValue,
        status: "processed",
        attempts: 1,
        lastAttemptAt: new Date(),
        processedAt: new Date(),
      },
    });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return false; // duplicate delivery
    }
    throw e;
  }
}

export type WebhookLease =
  | { state: "claimed"; id: string; attempt: number }
  | { state: "duplicate"; id: string; attempt: number }
  | { state: "processing"; id: string; attempt: number };

const PROCESSING_LEASE_MS = 5 * 60 * 1000;

/**
 * Acquire a retryable processing lease for a verified delivery. Completed
 * deliveries are duplicates; failed or stale deliveries can be reclaimed.
 */
export async function beginWebhookEvent(
  source: "stripe" | "clerk" | "github",
  externalId: string,
  type: string,
  payload: unknown,
  eventCreatedAt?: Date,
): Promise<WebhookLease> {
  const now = new Date();
  try {
    const created = await db.webhookEvent.create({
      data: {
        source,
        externalId,
        type,
        payload: payload as Prisma.InputJsonValue,
        status: "processing",
        attempts: 1,
        eventCreatedAt,
        lastAttemptAt: now,
      },
      select: { id: true, attempts: true },
    });
    return { state: "claimed", id: created.id, attempt: created.attempts };
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
  }

  const existing = await db.webhookEvent.findUniqueOrThrow({
    where: { source_externalId: { source, externalId } },
    select: {
      id: true,
      status: true,
      attempts: true,
      lastAttemptAt: true,
    },
  });
  if (existing.status === "processed") {
    return {
      state: "duplicate",
      id: existing.id,
      attempt: existing.attempts,
    };
  }

  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
  const claimed = await db.webhookEvent.updateMany({
    where: {
      id: existing.id,
      OR: [
        { status: "failed" },
        { status: "pending" },
        {
          status: "processing",
          lastAttemptAt: { lte: staleBefore },
        },
      ],
    },
    data: {
      status: "processing",
      attempts: { increment: 1 },
      lastAttemptAt: now,
      error: null,
    },
  });
  if (claimed.count === 0) {
    return {
      state: "processing",
      id: existing.id,
      attempt: existing.attempts,
    };
  }

  return {
    state: "claimed",
    id: existing.id,
    attempt: existing.attempts + 1,
  };
}

export async function completeWebhookEvent(id: string) {
  await db.webhookEvent.update({
    where: { id },
    data: {
      status: "processed",
      processedAt: new Date(),
      error: null,
    },
  });
}

export async function failWebhookEvent(id: string, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Webhook processing failed";
  await db.webhookEvent.update({
    where: { id },
    data: {
      status: "failed",
      error: message.slice(0, 2_000),
    },
  });
}
