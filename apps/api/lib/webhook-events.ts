import { Prisma } from "@/generated/client";
import { db } from "./db";

type WebhookSource = "stripe" | "clerk" | "github";

/**
 * Persist a verified webhook delivery. Returns false when the provider
 * already delivered this event (idempotent redelivery) so handlers can skip
 * side effects.
 */
export async function recordWebhookEvent(
  source: WebhookSource,
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

export const WEBHOOK_PROCESSING_LEASE_SECONDS = 5 * 60;
const PROCESSING_LEASE_MS = WEBHOOK_PROCESSING_LEASE_SECONDS * 1000;

type StoredWebhookLease = {
  id: string;
  status: string;
  attempts: number;
  lastAttemptAt: Date | null;
};

export interface WebhookLeaseStore {
  create(input: {
    source: WebhookSource;
    externalId: string;
    type: string;
    payload: unknown;
    eventCreatedAt?: Date;
    now: Date;
  }): Promise<{ id: string; attempts: number } | null>;
  find(source: WebhookSource, externalId: string): Promise<StoredWebhookLease>;
  claim(id: string, staleBefore: Date, now: Date): Promise<boolean>;
}

const databaseWebhookLeaseStore: WebhookLeaseStore = {
  async create(input) {
    try {
      return await db.webhookEvent.create({
        data: {
          source: input.source,
          externalId: input.externalId,
          type: input.type,
          payload: input.payload as Prisma.InputJsonValue,
          status: "processing",
          attempts: 1,
          eventCreatedAt: input.eventCreatedAt,
          lastAttemptAt: input.now,
        },
        select: { id: true, attempts: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return null;
      }
      throw error;
    }
  },

  async find(source, externalId) {
    return db.webhookEvent.findUniqueOrThrow({
      where: { source_externalId: { source, externalId } },
      select: {
        id: true,
        status: true,
        attempts: true,
        lastAttemptAt: true,
      },
    });
  },

  async claim(id, staleBefore, now) {
    const claimed = await db.webhookEvent.updateMany({
      where: {
        id,
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
    return claimed.count > 0;
  },
};

export function webhookLeaseResponse(lease: WebhookLease): Response | null {
  if (lease.state === "claimed") return null;
  if (lease.state === "duplicate") {
    return Response.json({
      received: true,
      duplicate: true,
      attempt: lease.attempt,
    });
  }
  return Response.json(
    {
      received: false,
      processing: true,
      attempt: lease.attempt,
    },
    {
      status: 503,
      headers: {
        "retry-after": String(WEBHOOK_PROCESSING_LEASE_SECONDS),
      },
    },
  );
}

/**
 * Acquire a retryable processing lease for a verified delivery. Completed
 * deliveries are duplicates; failed or stale deliveries can be reclaimed.
 */
export async function beginWebhookEvent(
  source: WebhookSource,
  externalId: string,
  type: string,
  payload: unknown,
  eventCreatedAt?: Date,
  store: WebhookLeaseStore = databaseWebhookLeaseStore,
): Promise<WebhookLease> {
  const now = new Date();
  const created = await store.create({
    source,
    externalId,
    type,
    payload,
    eventCreatedAt,
    now,
  });
  if (created) {
    return { state: "claimed", id: created.id, attempt: created.attempts };
  }

  const existing = await store.find(source, externalId);
  if (existing.status === "processed") {
    return {
      state: "duplicate",
      id: existing.id,
      attempt: existing.attempts,
    };
  }

  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
  const claimed = await store.claim(existing.id, staleBefore, now);
  if (!claimed) {
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
