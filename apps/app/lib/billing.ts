import type { BillingEntitlements } from "@shipshitgames/shared";

import { apiFetch } from "./api";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBillingEntitlements(value: unknown): value is BillingEntitlements {
  if (!isRecord(value)) return false;
  const studioPass = value.studioPass;
  const skillsProOneTime = value.skillsProOneTime;
  return (
    (studioPass === null || isRecord(studioPass)) &&
    (skillsProOneTime === null || isRecord(skillsProOneTime))
  );
}

export async function readBillingEntitlements(
  expectedUserId: string,
): Promise<BillingEntitlements> {
  const response = await apiFetch("/v1/billing/entitlements", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Billing API returned ${response.status}`);
  }
  const body: unknown = await response.json();
  if (
    !isRecord(body) ||
    typeof body.userId !== "string" ||
    !isBillingEntitlements(body.entitlements)
  ) {
    throw new Error("Billing API returned an invalid response");
  }
  if (body.userId !== expectedUserId) {
    throw new Error("Billing API subject mismatch");
  }
  return body.entitlements;
}
