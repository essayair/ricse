UPDATE "contracts"
SET "overfillPct" = 10
WHERE "overfillPct" IS NULL;

UPDATE "contracts"
SET "shortfallPct" = 10
WHERE "shortfallPct" IS NULL;

ALTER TABLE "contracts"
  ALTER COLUMN "overfillPct" SET DEFAULT 10,
  ALTER COLUMN "shortfallPct" SET DEFAULT 10;
