import type { BillingEntitlements } from "@shipshitgames/shared";

import { apiFetch } from "./api";

export async function readBillingEntitlements(): Promise<BillingEntitlements> {
  const response = await apiFetch("/v1/billing/entitlements", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Billing API returned ${response.status}`);
  }
  return response.json() as Promise<BillingEntitlements>;
}
