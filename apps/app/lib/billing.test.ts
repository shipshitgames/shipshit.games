import { beforeEach, expect, mock, test } from "bun:test";
import type { BillingEntitlements } from "@shipshitgames/shared";

const apiFetch = mock(async () => Response.json({}));

mock.module("./api", () => ({ apiFetch }));

const { readBillingEntitlements } = await import("./billing");

beforeEach(() => {
  apiFetch.mockClear();
});

test("returns entitlements only when the API subject matches the expected user", async () => {
  const entitlements = {
    studioPass: null,
    skillsProOneTime: {
      productKey: "games-skills-pro",
      active: true,
      source: "one-time",
      purchasedAt: "2026-07-19T00:00:00.000Z",
      stripeEventCreatedAt: 1,
      stripeEventRank: 10,
      stripeEventId: "evt_1",
      updatedAt: "2026-07-19T00:00:00.000Z",
    },
  } satisfies BillingEntitlements;
  apiFetch.mockImplementationOnce(async () =>
    Response.json({ userId: "user_signed", entitlements }),
  );

  await expect(readBillingEntitlements("user_signed")).resolves.toEqual(
    entitlements,
  );
  expect(apiFetch).toHaveBeenCalledWith("/v1/billing/entitlements", {
    cache: "no-store",
  });
});

test("rejects entitlements authenticated for a different subject", async () => {
  apiFetch.mockImplementationOnce(async () =>
    Response.json({
      userId: "user_caller",
      entitlements: {
        studioPass: null,
        skillsProOneTime: {
          productKey: "games-skills-pro",
          active: true,
        },
      },
    }),
  );

  await expect(
    readBillingEntitlements("user_signed"),
  ).rejects.toThrow("Billing API subject mismatch");
});
