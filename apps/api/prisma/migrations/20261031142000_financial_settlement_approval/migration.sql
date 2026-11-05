CREATE TABLE "financial_settlement_approvals" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "assigneeId" TEXT NOT NULL,
  "actedById" TEXT,
  "nodeName" TEXT NOT NULL,
  "roleCode" TEXT,
  "roleName" TEXT,
  "approvalMode" TEXT NOT NULL DEFAULT 'ALL',
  "step" INTEGER NOT NULL,
  "round" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'WAITING',
  "comment" TEXT,
  "actedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "financial_settlement_approvals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "financial_settlement_approvals_settlementId_round_step_idx" ON "financial_settlement_approvals"("settlementId", "round", "step");
CREATE INDEX "financial_settlement_approvals_assigneeId_status_idx" ON "financial_settlement_approvals"("assigneeId", "status");
ALTER TABLE "financial_settlement_approvals" ADD CONSTRAINT "financial_settlement_approvals_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "financial_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_settlement_approvals" ADD CONSTRAINT "financial_settlement_approvals_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_settlement_approvals" ADD CONSTRAINT "financial_settlement_approvals_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
