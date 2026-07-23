-- Prisma 6 cannot express CHECK constraints in schema.prisma. These database
-- guards are intentional migration-owned invariants and must be preserved by
-- future migration diffs.
CREATE TABLE "GenerationCreditAccount" (
    "ownerId" TEXT NOT NULL,
    "includedBalance" INTEGER NOT NULL DEFAULT 0,
    "purchasedBalance" INTEGER NOT NULL DEFAULT 0,
    "includedResetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationCreditAccount_pkey" PRIMARY KEY ("ownerId"),
    CONSTRAINT "GenerationCreditAccount_includedBalance_check" CHECK ("includedBalance" >= 0),
    CONSTRAINT "GenerationCreditAccount_purchasedBalance_check" CHECK ("purchasedBalance" >= 0)
);

CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL DEFAULT 'platform',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "requestedCredits" INTEGER NOT NULL,
    "reservedIncludedCredits" INTEGER NOT NULL DEFAULT 0,
    "reservedPurchasedCredits" INTEGER NOT NULL DEFAULT 0,
    "includedPeriodEndsAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "retryAt" TIMESTAMP(3),
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GenerationJob_requestedCredits_check" CHECK ("requestedCredits" > 0),
    CONSTRAINT "GenerationJob_reservedIncludedCredits_check" CHECK ("reservedIncludedCredits" >= 0),
    CONSTRAINT "GenerationJob_reservedPurchasedCredits_check" CHECK ("reservedPurchasedCredits" >= 0),
    CONSTRAINT "GenerationJob_reservedCredits_check" CHECK (
        "reservedIncludedCredits" + "reservedPurchasedCredits" = "requestedCredits"
    )
);

CREATE TABLE "ProviderRun" (
    "id" TEXT NOT NULL,
    "generationJobId" TEXT NOT NULL,
    "batchIndex" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "executionMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "externalId" TEXT,
    "pollUrl" TEXT,
    "request" JSONB NOT NULL,
    "output" JSONB,
    "creditCost" INTEGER NOT NULL DEFAULT 1,
    "costMicros" BIGINT,
    "durationMs" INTEGER,
    "retryable" BOOLEAN,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderRun_creditCost_check" CHECK ("creditCost" > 0)
);

CREATE TABLE "GenerationCreditLedger" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "generationJobId" TEXT NOT NULL,
    "entryKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationCreditLedger_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GenerationCreditLedger_credits_check" CHECK ("credits" > 0)
);

CREATE UNIQUE INDEX "GenerationJob_ownerId_idempotencyKey_key"
ON "GenerationJob"("ownerId", "idempotencyKey");
CREATE INDEX "GenerationJob_ownerId_createdAt_idx"
ON "GenerationJob"("ownerId", "createdAt" DESC);
CREATE INDEX "GenerationJob_status_retryAt_idx"
ON "GenerationJob"("status", "retryAt");
CREATE INDEX "GenerationJob_status_leaseExpiresAt_idx"
ON "GenerationJob"("status", "leaseExpiresAt");

CREATE UNIQUE INDEX "ProviderRun_generationJobId_batchIndex_attempt_key"
ON "ProviderRun"("generationJobId", "batchIndex", "attempt");
CREATE INDEX "ProviderRun_generationJobId_batchIndex_status_idx"
ON "ProviderRun"("generationJobId", "batchIndex", "status");
CREATE INDEX "ProviderRun_externalId_idx"
ON "ProviderRun"("externalId");

CREATE UNIQUE INDEX "GenerationCreditLedger_entryKey_key"
ON "GenerationCreditLedger"("entryKey");
CREATE INDEX "GenerationCreditLedger_ownerId_createdAt_idx"
ON "GenerationCreditLedger"("ownerId", "createdAt" DESC);
CREATE INDEX "GenerationCreditLedger_generationJobId_idx"
ON "GenerationCreditLedger"("generationJobId");

ALTER TABLE "Asset"
ADD COLUMN "generationJobId" TEXT,
ADD COLUMN "generationBatchIndex" INTEGER;
CREATE INDEX "Asset_generationJobId_idx"
ON "Asset"("generationJobId");
CREATE UNIQUE INDEX "Asset_generationJobId_generationBatchIndex_key"
ON "Asset"("generationJobId", "generationBatchIndex");

ALTER TABLE "ProviderRun"
ADD CONSTRAINT "ProviderRun_generationJobId_fkey"
FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GenerationCreditLedger"
ADD CONSTRAINT "GenerationCreditLedger_generationJobId_fkey"
FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Asset"
ADD CONSTRAINT "Asset_generationJobId_fkey"
FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
