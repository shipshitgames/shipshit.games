import { clerkClient, type User } from "@clerk/nextjs/server";
import {
  isActiveSubscriptionStatus,
  SKILLS_PRO_ONETIME,
  STUDIO_PASS,
} from "@shipshitgames/shared";
import type Stripe from "stripe";

export type StudioPassEntitlement = {
  productKey: typeof STUDIO_PASS.productKey;
  active: boolean;
  status: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  currentPeriodEnd?: string;
  checkoutSessionId?: string;
  claimedAt?: string;
  updatedAt: string;
  skoolInviteSentAt?: string;
  accessEmailSentAt?: string;
  fulfillmentError?: string;
};

type MetadataWithStudioPass = {
  studioPass?: Partial<StudioPassEntitlement>;
};

export function primaryEmail(user: User | null | undefined) {
  return (
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses.at(0)?.emailAddress ??
    null
  );
}

export function readStudioPass(metadata: unknown): StudioPassEntitlement | null {
  const value = (metadata as MetadataWithStudioPass | null)?.studioPass;
  if (!value?.status) return null;

  return {
    productKey: STUDIO_PASS.productKey,
    active: Boolean(value.active),
    status: value.status,
    stripeCustomerId: value.stripeCustomerId,
    stripeSubscriptionId: value.stripeSubscriptionId,
    stripePriceId: value.stripePriceId,
    currentPeriodEnd: value.currentPeriodEnd,
    checkoutSessionId: value.checkoutSessionId,
    claimedAt: value.claimedAt,
    updatedAt: value.updatedAt ?? new Date(0).toISOString(),
    skoolInviteSentAt: value.skoolInviteSentAt,
    accessEmailSentAt: value.accessEmailSentAt,
    fulfillmentError: value.fulfillmentError,
  };
}

export function hasActiveStudioPass(metadata: unknown) {
  const pass = readStudioPass(metadata);
  return Boolean(pass?.active && isActiveSubscriptionStatus(pass.status));
}

/**
 * Permanent one-time entitlement for the standalone gaming Skills Pro purchase.
 * Unlike the subscription, it never expires — `active` stays true once bought
 * (a refund/chargeback handler can flip it, but a lapsed sub does not).
 */
export type SkillsProOneTimeEntitlement = {
  productKey: typeof SKILLS_PRO_ONETIME.productKey;
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

type MetadataWithSkillsPro = {
  skillsProOneTime?: Partial<SkillsProOneTimeEntitlement>;
};

export function readSkillsProOneTime(
  metadata: unknown
): SkillsProOneTimeEntitlement | null {
  const value = (metadata as MetadataWithSkillsPro | null)?.skillsProOneTime;
  if (!value?.purchasedAt) return null;

  return {
    productKey: SKILLS_PRO_ONETIME.productKey,
    active: value.active ?? true,
    source: "one-time",
    stripeCustomerId: value.stripeCustomerId,
    stripePaymentIntentId: value.stripePaymentIntentId,
    checkoutSessionId: value.checkoutSessionId,
    purchasedAt: value.purchasedAt,
    updatedAt: value.updatedAt ?? value.purchasedAt,
    accessEmailSentAt: value.accessEmailSentAt,
    fulfillmentError: value.fulfillmentError,
  };
}

function hasSkillsProOneTime(metadata: unknown) {
  return Boolean(readSkillsProOneTime(metadata)?.active);
}

/**
 * True when the user may open the Skills Pro content — either through an active
 * Studio Pass subscription OR a permanent one-time Skills Pro purchase.
 */
export function hasSkillsProContentAccess(metadata: unknown) {
  return hasActiveStudioPass(metadata) || hasSkillsProOneTime(metadata);
}

export async function updateSkillsProOneTimeEntitlement(
  userId: string,
  patch: Partial<SkillsProOneTimeEntitlement>
) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const existing = readSkillsProOneTime(user.privateMetadata);
  const next: SkillsProOneTimeEntitlement = {
    productKey: SKILLS_PRO_ONETIME.productKey,
    active: patch.active ?? existing?.active ?? true,
    source: "one-time",
    stripeCustomerId: patch.stripeCustomerId ?? existing?.stripeCustomerId,
    stripePaymentIntentId:
      patch.stripePaymentIntentId ?? existing?.stripePaymentIntentId,
    checkoutSessionId: patch.checkoutSessionId ?? existing?.checkoutSessionId,
    purchasedAt: existing?.purchasedAt ?? patch.purchasedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    accessEmailSentAt: patch.accessEmailSentAt ?? existing?.accessEmailSentAt,
    fulfillmentError: patch.fulfillmentError,
  };

  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      ...user.privateMetadata,
      skillsProOneTime: next,
    },
  });

  return next;
}

export async function findClerkUserByEmail(email: string) {
  const client = await clerkClient();
  const { data } = await client.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });

  return data.at(0) ?? null;
}

export async function updateStudioPassEntitlement(
  userId: string,
  patch: Partial<StudioPassEntitlement>
) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const existing = readStudioPass(user.privateMetadata);
  const next: StudioPassEntitlement = {
    productKey: STUDIO_PASS.productKey,
    active: patch.active ?? existing?.active ?? false,
    status: patch.status ?? existing?.status ?? "unknown",
    stripeCustomerId: patch.stripeCustomerId ?? existing?.stripeCustomerId,
    stripeSubscriptionId:
      patch.stripeSubscriptionId ?? existing?.stripeSubscriptionId,
    stripePriceId: patch.stripePriceId ?? existing?.stripePriceId,
    currentPeriodEnd: patch.currentPeriodEnd ?? existing?.currentPeriodEnd,
    checkoutSessionId: patch.checkoutSessionId ?? existing?.checkoutSessionId,
    claimedAt: patch.claimedAt ?? existing?.claimedAt,
    updatedAt: new Date().toISOString(),
    skoolInviteSentAt: patch.skoolInviteSentAt ?? existing?.skoolInviteSentAt,
    accessEmailSentAt: patch.accessEmailSentAt ?? existing?.accessEmailSentAt,
    fulfillmentError: patch.fulfillmentError,
  };

  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      ...user.privateMetadata,
      studioPass: next,
    },
  });

  return next;
}

export function entitlementFromSubscription(
  subscription: Stripe.Subscription,
  extra: Partial<StudioPassEntitlement> = {}
): Partial<StudioPassEntitlement> {
  const priceId = subscription.items.data.at(0)?.price.id;
  const periodEnd = (subscription as Stripe.Subscription & {
    current_period_end?: number;
  }).current_period_end;
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  return {
    ...extra,
    active: isActiveSubscriptionStatus(subscription.status),
    status: subscription.status,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    currentPeriodEnd: periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : undefined,
  };
}
