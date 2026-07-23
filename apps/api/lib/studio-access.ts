import {
  evaluateStudioPassAccess,
  type BillingEntitlements,
} from "@shipshitgames/shared";

import {
  recordApiAccessEvent,
  requestRoute,
  safelyAuditApiAccess,
  type ApiAccessAudit,
} from "./api-access-audit";
import {
  billingRepository,
  type BillingRepository,
} from "./billing-repository";
import type { AuthContext } from "./auth";

export interface StudioAccessDependencies {
  billing?: Pick<BillingRepository, "readEntitlements">;
  audit?: ApiAccessAudit;
}

export async function requireStudioPass(
  auth: AuthContext,
  request: Request,
  dependencies: StudioAccessDependencies = {},
): Promise<Response | null> {
  const billing = dependencies.billing ?? billingRepository;
  const audit = dependencies.audit ?? recordApiAccessEvent;
  const route = requestRoute(request);
  let entitlements: BillingEntitlements;

  try {
    entitlements = await billing.readEntitlements(auth.userId);
  } catch {
    await safelyAuditApiAccess(audit, {
      boundary: "studio-pass",
      outcome: "unavailable",
      reason: "entitlement-store-error",
      route,
      userId: auth.userId,
    });
    return Response.json(
      { error: "entitlement check unavailable" },
      { status: 503 },
    );
  }

  const decision = evaluateStudioPassAccess(entitlements);
  await safelyAuditApiAccess(audit, {
    boundary: "studio-pass",
    outcome: decision.allowed ? "granted" : "denied",
    reason: decision.reason,
    route,
    userId: auth.userId,
  });
  if (!decision.allowed) {
    return Response.json(
      { error: "studio pass required" },
      { status: 403 },
    );
  }
  return null;
}
