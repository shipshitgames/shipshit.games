import { expect, test } from "bun:test";

import {
  beginWebhookEvent,
  WEBHOOK_PROCESSING_LEASE_SECONDS,
  webhookLeaseResponse,
  type WebhookLeaseStore,
} from "./webhook-events";

function contendedStore(
  lastAttemptAt: Date,
  attempts = 1,
): WebhookLeaseStore {
  return {
    async create() {
      return null;
    },
    async find() {
      return {
        id: "webhook_1",
        status: "processing",
        attempts,
        lastAttemptAt,
      };
    },
    async claim(_id, staleBefore) {
      return lastAttemptAt <= staleBefore;
    },
  };
}

test("an active processing lease returns a retriable response", async () => {
  const lease = await beginWebhookEvent(
    "stripe",
    "evt_contended",
    "checkout.session.completed",
    {},
    undefined,
    contendedStore(new Date()),
  );

  expect(lease).toEqual({
    state: "processing",
    id: "webhook_1",
    attempt: 1,
  });

  const response = webhookLeaseResponse(lease);
  expect(response?.status).toBe(503);
  expect(response?.headers.get("retry-after")).toBe(
    String(WEBHOOK_PROCESSING_LEASE_SECONDS),
  );
  expect(await response?.json()).toEqual({
    received: false,
    processing: true,
    attempt: 1,
  });
});

test("a delivery can reclaim a stale lease after the prior worker dies", async () => {
  const staleAttempt = new Date(
    Date.now() - (WEBHOOK_PROCESSING_LEASE_SECONDS + 60) * 1000,
  );
  const lease = await beginWebhookEvent(
    "stripe",
    "evt_crashed",
    "checkout.session.completed",
    {},
    undefined,
    contendedStore(staleAttempt, 3),
  );

  expect(lease).toEqual({
    state: "claimed",
    id: "webhook_1",
    attempt: 4,
  });
  expect(webhookLeaseResponse(lease)).toBeNull();
});
