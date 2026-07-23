export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

export type ActiveSubscriptionStatus =
  (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number];

export function isActiveSubscriptionStatus(status?: string | null) {
  return ACTIVE_SUBSCRIPTION_STATUSES.includes(
    status as ActiveSubscriptionStatus,
  );
}

export type BillingVersion = {
  stripeEventCreatedAt: number;
  stripeEventRank: number;
  stripeEventId: string;
};

export function compareBillingVersions(
  left: BillingVersion,
  right: BillingVersion,
) {
  if (left.stripeEventCreatedAt !== right.stripeEventCreatedAt) {
    return left.stripeEventCreatedAt - right.stripeEventCreatedAt;
  }
  if (left.stripeEventRank !== right.stripeEventRank) {
    return left.stripeEventRank - right.stripeEventRank;
  }
  return left.stripeEventId.localeCompare(right.stripeEventId);
}

export type StudioPassEntitlement = BillingVersion & {
  productKey: "studio-pass";
  active: boolean;
  status: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId?: string;
  currentPeriodEnd?: string;
  checkoutSessionId?: string;
  claimedAt?: string;
  updatedAt: string;
  skoolInviteSentAt?: string;
  accessEmailSentAt?: string;
  fulfillmentError?: string;
};

export type SkillsProOneTimeEntitlement = BillingVersion & {
  productKey: "games-skills-pro";
  active: boolean;
  source: "one-time";
  stripeCustomerId?: string;
  stripePaymentIntentId?: string;
  checkoutSessionId?: string;
  purchasedAt: string;
  updatedAt: string;
  accessEmailSentAt?: string;
  fulfillmentError?: string;
};

export type BillingEntitlements = {
  studioPass: StudioPassEntitlement | null;
  skillsProOneTime: SkillsProOneTimeEntitlement | null;
  /** Operator-controlled grant stored on the canonical API user row. */
  studioPassInternalGrant?: boolean;
  /** False when the authenticated Clerk subject has no mirrored API user. */
  accountExists?: boolean;
};

export function hasActiveStudioPass(pass: StudioPassEntitlement | null) {
  return Boolean(pass?.active && isActiveSubscriptionStatus(pass.status));
}

export type StudioPassAccessReason =
  | "active-subscription"
  | "internal-grant"
  | "missing-account"
  | "no-entitlement"
  | "canceled"
  | "inactive";

export type StudioPassAccessDecision =
  | {
      allowed: true;
      reason: "active-subscription" | "internal-grant";
      status: string;
    }
  | {
      allowed: false;
      reason:
        | "missing-account"
        | "no-entitlement"
        | "canceled"
        | "inactive";
      status: string | null;
    };

export function evaluateStudioPassAccess(
  entitlements: BillingEntitlements,
): StudioPassAccessDecision {
  const pass = entitlements.studioPass;
  if (entitlements.accountExists === false) {
    return { allowed: false, reason: "missing-account", status: null };
  }
  if (entitlements.studioPassInternalGrant === true) {
    return { allowed: true, reason: "internal-grant", status: "internal" };
  }
  if (pass && hasActiveStudioPass(pass)) {
    return {
      allowed: true,
      reason: "active-subscription",
      status: pass.status,
    };
  }
  if (!pass) {
    return { allowed: false, reason: "no-entitlement", status: null };
  }
  if (pass.status === "canceled") {
    return {
      allowed: false,
      reason: "canceled",
      status: pass.status,
    };
  }
  return {
    allowed: false,
    reason: "inactive",
    status: pass.status,
  };
}

export function hasStudioPassAccess(
  entitlements: BillingEntitlements,
): boolean {
  return evaluateStudioPassAccess(entitlements).allowed;
}

/**
 * Hosted provider generation is paid Studio Pass functionality. Reading,
 * exporting, and deterministically transforming assets remains available to
 * any authenticated account, but every query must remain owner-scoped.
 */
export const STUDIO_ASSET_ACCESS_POLICY = {
  hostedGeneration: "studio-pass",
  ownedAssetRead: "authenticated-owner",
  ownedAssetExport: "authenticated-owner",
  ownedAssetTransform: "authenticated-owner",
} as const;

export type StudioPassAccessState =
  "active" | "canceled" | "inactive" | "not-claimed";

export function studioPassAccessState(
  pass: StudioPassEntitlement | null,
): StudioPassAccessState {
  if (!pass) return "not-claimed";
  if (hasActiveStudioPass(pass)) return "active";
  if (pass.status === "canceled") return "canceled";
  return "inactive";
}

export function hasSkillsProContentAccess(entitlements: BillingEntitlements) {
  return (
    hasStudioPassAccess(entitlements) ||
    Boolean(entitlements.skillsProOneTime?.active)
  );
}
