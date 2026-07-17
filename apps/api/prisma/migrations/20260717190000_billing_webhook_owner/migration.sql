ALTER TABLE "WebhookEvent"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "eventCreatedAt" TIMESTAMP(3),
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "processedAt" TIMESTAMP(3),
ADD COLUMN "error" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "WebhookEvent"
SET "status" = 'processed',
    "processedAt" = "receivedAt";

CREATE INDEX "WebhookEvent_source_status_idx"
ON "WebhookEvent"("source", "status");

CREATE TABLE "StudioPassSubscription" (
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripePriceId" TEXT,
    "status" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "checkoutSessionId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "stripeEventCreatedAt" BIGINT NOT NULL,
    "stripeEventRank" INTEGER NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "skoolInviteSentAt" TIMESTAMP(3),
    "accessEmailSentAt" TIMESTAMP(3),
    "fulfillmentError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioPassSubscription_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "StudioPassSubscription_stripeSubscriptionId_key"
ON "StudioPassSubscription"("stripeSubscriptionId");
CREATE INDEX "StudioPassSubscription_stripeCustomerId_idx"
ON "StudioPassSubscription"("stripeCustomerId");
CREATE INDEX "StudioPassSubscription_active_status_idx"
ON "StudioPassSubscription"("active", "status");

CREATE TABLE "SkillsProPurchase" (
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stripeCustomerId" TEXT,
    "stripePaymentIntentId" TEXT,
    "checkoutSessionId" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "stripeEventCreatedAt" BIGINT NOT NULL,
    "stripeEventRank" INTEGER NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "accessEmailSentAt" TIMESTAMP(3),
    "fulfillmentError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillsProPurchase_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "SkillsProPurchase_stripePaymentIntentId_key"
ON "SkillsProPurchase"("stripePaymentIntentId");
CREATE UNIQUE INDEX "SkillsProPurchase_checkoutSessionId_key"
ON "SkillsProPurchase"("checkoutSessionId");
CREATE INDEX "SkillsProPurchase_stripeCustomerId_idx"
ON "SkillsProPurchase"("stripeCustomerId");
CREATE INDEX "SkillsProPurchase_active_idx"
ON "SkillsProPurchase"("active");
