ALTER TABLE "dispatch_notices"
ADD COLUMN "qualityRequired" BOOLEAN NOT NULL DEFAULT false;

UPDATE "dispatch_notices"
SET "qualityRequired" = true
WHERE "type" = 'PURCHASE';
