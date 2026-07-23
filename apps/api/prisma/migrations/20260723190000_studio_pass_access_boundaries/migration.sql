ALTER TABLE "User"
ADD COLUMN "studioPassInternalGrant" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ApiAccessEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "boundary" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiAccessEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiAccessEvent_userId_createdAt_idx"
ON "ApiAccessEvent"("userId", "createdAt" DESC);

CREATE INDEX "ApiAccessEvent_boundary_outcome_createdAt_idx"
ON "ApiAccessEvent"("boundary", "outcome", "createdAt" DESC);
