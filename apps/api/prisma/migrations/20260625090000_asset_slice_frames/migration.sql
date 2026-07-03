ALTER TABLE "Asset" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "sliceIndex" INTEGER;

CREATE INDEX "Asset_parentId_idx" ON "Asset"("parentId");
CREATE UNIQUE INDEX "Asset_parentId_sliceIndex_key" ON "Asset"("parentId", "sliceIndex");

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Asset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
