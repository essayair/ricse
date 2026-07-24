ALTER TABLE "contracts" ADD COLUMN "signingPartnerId" TEXT;

CREATE INDEX "contracts_signingPartnerId_idx" ON "contracts"("signingPartnerId");

ALTER TABLE "contracts"
ADD CONSTRAINT "contracts_signingPartnerId_fkey"
FOREIGN KEY ("signingPartnerId") REFERENCES "partners"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
