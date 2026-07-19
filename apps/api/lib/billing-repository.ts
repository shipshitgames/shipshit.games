import {
  compareBillingVersions,
  type BillingEntitlements,
  type BillingVersion,
  type SkillsProOneTimeEntitlement,
  type StudioPassEntitlement,
} from "@shipshitgames/shared";
import type { Prisma } from "@/generated/client";

import { db } from "./db";

export type ApplyBillingResult<T> = {
  applied: boolean;
  entitlement: T;
};

export type SkillsProPurchaseRecord = SkillsProOneTimeEntitlement & {
  userId: string;
};

export interface BillingRepository {
  findUserIdByEmail(email: string): Promise<string | null>;
  readEntitlements(userId: string): Promise<BillingEntitlements>;
  findSkillsProByPaymentIntent(
    paymentIntentId: string,
  ): Promise<SkillsProPurchaseRecord | null>;
  applyStudioPass(
    userId: string,
    entitlement: StudioPassEntitlement,
  ): Promise<ApplyBillingResult<StudioPassEntitlement>>;
  applySkillsPro(
    userId: string,
    entitlement: SkillsProOneTimeEntitlement,
  ): Promise<ApplyBillingResult<SkillsProOneTimeEntitlement>>;
  recordStudioFulfillment(
    userId: string,
    result: {
      skoolInviteSentAt?: string;
      accessEmailSentAt?: string;
      fulfillmentError?: string | null;
    },
  ): Promise<StudioPassEntitlement>;
  recordSkillsProFulfillment(
    userId: string,
    result: {
      accessEmailSentAt?: string;
      fulfillmentError?: string | null;
    },
  ): Promise<SkillsProOneTimeEntitlement>;
}

function versionOf(value: {
  stripeEventCreatedAt: bigint;
  stripeEventRank: number;
  stripeEventId: string;
}): BillingVersion {
  return {
    stripeEventCreatedAt: Number(value.stripeEventCreatedAt),
    stripeEventRank: value.stripeEventRank,
    stripeEventId: value.stripeEventId,
  };
}

function studioPassFromRow(row: {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  status: string;
  active: boolean;
  currentPeriodEnd: Date | null;
  checkoutSessionId: string | null;
  claimedAt: Date | null;
  stripeEventCreatedAt: bigint;
  stripeEventRank: number;
  stripeEventId: string;
  skoolInviteSentAt: Date | null;
  accessEmailSentAt: Date | null;
  fulfillmentError: string | null;
  updatedAt: Date;
}): StudioPassEntitlement {
  return {
    productKey: "studio-pass",
    active: row.active,
    status: row.status,
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    stripePriceId: row.stripePriceId ?? undefined,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString(),
    checkoutSessionId: row.checkoutSessionId ?? undefined,
    claimedAt: row.claimedAt?.toISOString(),
    ...versionOf(row),
    updatedAt: row.updatedAt.toISOString(),
    skoolInviteSentAt: row.skoolInviteSentAt?.toISOString(),
    accessEmailSentAt: row.accessEmailSentAt?.toISOString(),
    fulfillmentError: row.fulfillmentError ?? undefined,
  };
}

function skillsProFromRow(row: {
  userId: string;
  active: boolean;
  stripeCustomerId: string | null;
  stripePaymentIntentId: string | null;
  checkoutSessionId: string | null;
  purchasedAt: Date;
  stripeEventCreatedAt: bigint;
  stripeEventRank: number;
  stripeEventId: string;
  accessEmailSentAt: Date | null;
  fulfillmentError: string | null;
  updatedAt: Date;
}): SkillsProPurchaseRecord {
  return {
    userId: row.userId,
    productKey: "games-skills-pro",
    active: row.active,
    source: "one-time",
    stripeCustomerId: row.stripeCustomerId ?? undefined,
    stripePaymentIntentId: row.stripePaymentIntentId ?? undefined,
    checkoutSessionId: row.checkoutSessionId ?? undefined,
    purchasedAt: row.purchasedAt.toISOString(),
    ...versionOf(row),
    updatedAt: row.updatedAt.toISOString(),
    accessEmailSentAt: row.accessEmailSentAt?.toISOString(),
    fulfillmentError: row.fulfillmentError ?? undefined,
  };
}

async function lockBillingUser(
  transaction: Prisma.TransactionClient,
  userId: string,
) {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtext(${"billing:" + userId}))
  `;
}

export const billingRepository: BillingRepository = {
  async findUserIdByEmail(email) {
    const users = await db.user.findMany({
      where: {
        email: { equals: email, mode: "insensitive" },
        deletedAt: null,
      },
      select: { id: true },
      take: 2,
    });
    return users.length === 1 ? users[0]!.id : null;
  },

  async readEntitlements(userId) {
    const [studioPass, skillsProOneTime] = await Promise.all([
      db.studioPassSubscription.findUnique({ where: { userId } }),
      db.skillsProPurchase.findUnique({ where: { userId } }),
    ]);
    const skillsPro = skillsProOneTime
      ? skillsProFromRow(skillsProOneTime)
      : null;
    if (skillsPro) {
      const { userId: _userId, ...entitlement } = skillsPro;
      return {
        studioPass: studioPass ? studioPassFromRow(studioPass) : null,
        skillsProOneTime: entitlement,
      };
    }
    return {
      studioPass: studioPass ? studioPassFromRow(studioPass) : null,
      skillsProOneTime: null,
    };
  },

  async findSkillsProByPaymentIntent(paymentIntentId) {
    const row = await db.skillsProPurchase.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    return row ? skillsProFromRow(row) : null;
  },

  async applyStudioPass(userId, entitlement) {
    return db.$transaction(async (transaction) => {
      await lockBillingUser(transaction, userId);
      const existing = await transaction.studioPassSubscription.findUnique({
        where: { userId },
      });
      if (
        existing &&
        compareBillingVersions(versionOf(existing), entitlement) >= 0
      ) {
        return { applied: false, entitlement: studioPassFromRow(existing) };
      }

      const row = await transaction.studioPassSubscription.upsert({
        where: { userId },
        create: {
          userId,
          stripeCustomerId: entitlement.stripeCustomerId,
          stripeSubscriptionId: entitlement.stripeSubscriptionId,
          stripePriceId: entitlement.stripePriceId,
          status: entitlement.status,
          active: entitlement.active,
          currentPeriodEnd: entitlement.currentPeriodEnd,
          checkoutSessionId: entitlement.checkoutSessionId,
          claimedAt: entitlement.claimedAt,
          stripeEventCreatedAt: BigInt(entitlement.stripeEventCreatedAt),
          stripeEventRank: entitlement.stripeEventRank,
          stripeEventId: entitlement.stripeEventId,
        },
        update: {
          stripeCustomerId: entitlement.stripeCustomerId,
          stripeSubscriptionId: entitlement.stripeSubscriptionId,
          stripePriceId: entitlement.stripePriceId,
          status: entitlement.status,
          active: entitlement.active,
          currentPeriodEnd: entitlement.currentPeriodEnd,
          checkoutSessionId:
            entitlement.checkoutSessionId ?? existing?.checkoutSessionId,
          claimedAt: existing?.claimedAt ?? entitlement.claimedAt,
          stripeEventCreatedAt: BigInt(entitlement.stripeEventCreatedAt),
          stripeEventRank: entitlement.stripeEventRank,
          stripeEventId: entitlement.stripeEventId,
          fulfillmentError: null,
        },
      });
      return { applied: true, entitlement: studioPassFromRow(row) };
    });
  },

  async applySkillsPro(userId, entitlement) {
    return db.$transaction(async (transaction) => {
      await lockBillingUser(transaction, userId);
      const existing = await transaction.skillsProPurchase.findUnique({
        where: { userId },
      });
      if (
        existing &&
        compareBillingVersions(versionOf(existing), entitlement) >= 0
      ) {
        return { applied: false, entitlement: skillsProFromRow(existing) };
      }

      const row = await transaction.skillsProPurchase.upsert({
        where: { userId },
        create: {
          userId,
          active: entitlement.active,
          stripeCustomerId: entitlement.stripeCustomerId,
          stripePaymentIntentId: entitlement.stripePaymentIntentId,
          checkoutSessionId: entitlement.checkoutSessionId,
          purchasedAt: entitlement.purchasedAt,
          stripeEventCreatedAt: BigInt(entitlement.stripeEventCreatedAt),
          stripeEventRank: entitlement.stripeEventRank,
          stripeEventId: entitlement.stripeEventId,
        },
        update: {
          active: entitlement.active,
          stripeCustomerId:
            entitlement.stripeCustomerId ?? existing?.stripeCustomerId,
          stripePaymentIntentId:
            entitlement.stripePaymentIntentId ??
            existing?.stripePaymentIntentId,
          checkoutSessionId:
            entitlement.checkoutSessionId ?? existing?.checkoutSessionId,
          purchasedAt: existing?.purchasedAt ?? entitlement.purchasedAt,
          stripeEventCreatedAt: BigInt(entitlement.stripeEventCreatedAt),
          stripeEventRank: entitlement.stripeEventRank,
          stripeEventId: entitlement.stripeEventId,
          fulfillmentError: null,
        },
      });
      return { applied: true, entitlement: skillsProFromRow(row) };
    });
  },

  async recordStudioFulfillment(userId, result) {
    const row = await db.studioPassSubscription.update({
      where: { userId },
      data: {
        skoolInviteSentAt: result.skoolInviteSentAt,
        accessEmailSentAt: result.accessEmailSentAt,
        fulfillmentError: result.fulfillmentError,
      },
    });
    return studioPassFromRow(row);
  },

  async recordSkillsProFulfillment(userId, result) {
    const row = await db.skillsProPurchase.update({
      where: { userId },
      data: {
        accessEmailSentAt: result.accessEmailSentAt,
        fulfillmentError: result.fulfillmentError,
      },
    });
    return skillsProFromRow(row);
  },
};
