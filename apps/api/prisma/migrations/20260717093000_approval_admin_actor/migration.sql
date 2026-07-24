ALTER TABLE "approvals" ADD COLUMN "actedById" TEXT;
CREATE INDEX "approvals_actedById_idx" ON "approvals"("actedById");
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
