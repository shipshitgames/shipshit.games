-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "fullPrompt" TEXT NOT NULL,
    "style" TEXT,
    "pose" TEXT,
    "sheetPoses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "gameSlug" TEXT,
    "game" TEXT,
    "model" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commit" (
    "id" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "authorLogin" TEXT,
    "authorEmail" TEXT,
    "message" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asset_createdAt_idx" ON "Asset"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Asset_gameSlug_idx" ON "Asset"("gameSlug");

-- CreateIndex
CREATE INDEX "WebhookEvent_source_type_idx" ON "WebhookEvent"("source", "type");

-- CreateIndex
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_source_externalId_key" ON "WebhookEvent"("source", "externalId");

-- CreateIndex
CREATE INDEX "Commit_repo_committedAt_idx" ON "Commit"("repo", "committedAt" DESC);

-- CreateIndex
CREATE INDEX "Commit_authorLogin_idx" ON "Commit"("authorLogin");

-- CreateIndex
CREATE UNIQUE INDEX "Commit_repo_sha_key" ON "Commit"("repo", "sha");
