ALTER TABLE "approvals"
ADD COLUMN "nodeName" TEXT NOT NULL DEFAULT '合同审批',
ADD COLUMN "step" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "actedAt" TIMESTAMP(3);

CREATE INDEX "approvals_contractId_round_step_idx"
ON "approvals"("contractId", "round", "step");
