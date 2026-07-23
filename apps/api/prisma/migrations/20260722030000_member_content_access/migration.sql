CREATE TABLE "ContentAccessEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentAccessEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentAccessEvent_userId_createdAt_idx"
ON "ContentAccessEvent"("userId", "createdAt" DESC);

CREATE INDEX "ContentAccessEvent_resource_resourceId_createdAt_idx"
ON "ContentAccessEvent"("resource", "resourceId", "createdAt" DESC);
