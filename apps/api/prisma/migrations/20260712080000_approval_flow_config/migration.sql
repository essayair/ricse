CREATE TABLE "approval_flows" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contractType" TEXT NOT NULL,
  "amountThreshold" DECIMAL(15,2),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approval_flows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_flow_nodes" (
  "id" TEXT NOT NULL,
  "flowId" TEXT NOT NULL,
  "nodeName" TEXT NOT NULL,
  "step" INTEGER NOT NULL,
  "assigneeId" TEXT NOT NULL,
  "condition" TEXT NOT NULL DEFAULT 'ALWAYS',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approval_flow_nodes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "approval_flows_contractType_key" ON "approval_flows"("contractType");
CREATE UNIQUE INDEX "approval_flow_nodes_flowId_step_key" ON "approval_flow_nodes"("flowId", "step");
CREATE INDEX "approval_flow_nodes_assigneeId_idx" ON "approval_flow_nodes"("assigneeId");
ALTER TABLE "approval_flow_nodes" ADD CONSTRAINT "approval_flow_nodes_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "approval_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_flow_nodes" ADD CONSTRAINT "approval_flow_nodes_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
