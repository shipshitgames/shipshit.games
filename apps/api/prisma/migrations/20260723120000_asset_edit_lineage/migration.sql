ALTER TABLE "Asset"
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "editInstruction" TEXT;

CREATE INDEX "Asset_sourceId_idx" ON "Asset"("sourceId");

ALTER TABLE "Asset"
  ADD CONSTRAINT "Asset_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "Asset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
