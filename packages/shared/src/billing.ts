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
};

export function hasActiveStudioPass(pass: StudioPassEntitlement | null) {
  return Boolean(pass?.active && isActiveSubscriptionStatus(pass.status));
}

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
    hasActiveStudioPass(entitlements.studioPass) ||
    Boolean(entitlements.skillsProOneTime?.active)
  );
}
