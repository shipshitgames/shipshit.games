ALTER TABLE "Asset"
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "mediaType" TEXT NOT NULL DEFAULT 'image/png',
  ADD COLUMN "byteSize" INTEGER;

ALTER TABLE "Asset" ALTER COLUMN "image" DROP NOT NULL;

CREATE INDEX "Asset_storageKey_idx" ON "Asset"("storageKey");
