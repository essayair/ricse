-- 系统必需的默认合同审批流不能依赖演示数据 seed。
-- 线上发布只执行 prisma migrate deploy，因此在数据迁移中幂等初始化。
-- 已存在的流程和节点保持不变；缺失项使用当前有效审批用户补齐。
DO $$
DECLARE
  default_assignee_id TEXT;
  business_assignee_id TEXT;
  risk_assignee_id TEXT;
  general_assignee_id TEXT;
  purchase_flow_id TEXT;
  sales_flow_id TEXT;
  bilateral_flow_id TEXT;
BEGIN
  INSERT INTO "approval_flows"
    ("id", "name", "contractType", "amountThreshold", "status", "createdAt", "updatedAt")
  VALUES
    (
      'approval_flow_purchase_default',
      '采购合同审批流',
      'PURCHASE',
      1000000,
      'ACTIVE',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'approval_flow_sales_default',
      '销售合同审批流',
      'SALES',
      NULL,
      'ACTIVE',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'approval_flow_bilateral_default',
      '双边合同审批流',
      'BILATERAL',
      0,
      'ACTIVE',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  ON CONFLICT ("contractType") DO NOTHING;

  SELECT u."id"
    INTO default_assignee_id
  FROM "users" u
  WHERE u."status" = 'ACTIVE'
    AND (
      u."role" IN ('ADMIN', 'APPROVER')
      OR EXISTS (
        SELECT 1
        FROM "user_role_assignments" a
        JOIN "roles" r ON r."id" = a."roleId"
        WHERE a."userId" = u."id"
          AND a."status" = 'ACTIVE'
          AND a."effectiveAt" <= CURRENT_TIMESTAMP
          AND (a."expiresAt" IS NULL OR a."expiresAt" > CURRENT_TIMESTAMP)
          AND r."status" = 'ACTIVE'
          AND r."code" IN ('ADMIN', 'APPROVER')
      )
    )
  ORDER BY
    CASE WHEN u."role" = 'ADMIN' THEN 0 WHEN u."role" = 'APPROVER' THEN 1 ELSE 2 END,
    u."createdAt" ASC
  LIMIT 1;

  IF default_assignee_id IS NULL THEN
    RAISE NOTICE
      '已初始化默认审批流程；当前没有有效 ADMIN 或 APPROVER 用户，暂不初始化审批节点';
    RETURN;
  END IF;

  business_assignee_id := COALESCE(
    (
      SELECT u."id"
      FROM "users" u
      WHERE u."username" = 'business_manager'
        AND u."status" = 'ACTIVE'
        AND u."role" IN ('ADMIN', 'APPROVER')
      LIMIT 1
    ),
    default_assignee_id
  );
  risk_assignee_id := COALESCE(
    (
      SELECT u."id"
      FROM "users" u
      WHERE u."username" = 'risk_manager'
        AND u."status" = 'ACTIVE'
        AND u."role" IN ('ADMIN', 'APPROVER')
      LIMIT 1
    ),
    default_assignee_id
  );
  general_assignee_id := COALESCE(
    (
      SELECT u."id"
      FROM "users" u
      WHERE u."username" = 'general_manager'
        AND u."status" = 'ACTIVE'
        AND u."role" IN ('ADMIN', 'APPROVER')
      LIMIT 1
    ),
    default_assignee_id
  );

  SELECT "id" INTO purchase_flow_id
  FROM "approval_flows"
  WHERE "contractType" = 'PURCHASE';

  SELECT "id" INTO sales_flow_id
  FROM "approval_flows"
  WHERE "contractType" = 'SALES';

  SELECT "id" INTO bilateral_flow_id
  FROM "approval_flows"
  WHERE "contractType" = 'BILATERAL';

  INSERT INTO "approval_flow_nodes"
    ("id", "flowId", "nodeName", "step", "assigneeId", "condition", "enabled", "createdAt", "updatedAt")
  VALUES
    (
      'approval_node_purchase_business_default',
      purchase_flow_id,
      '业务主管',
      1,
      business_assignee_id,
      'ALWAYS',
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'approval_node_purchase_risk_default',
      purchase_flow_id,
      '风控经理',
      2,
      risk_assignee_id,
      'ALWAYS',
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'approval_node_purchase_general_default',
      purchase_flow_id,
      '总经理',
      3,
      general_assignee_id,
      'AMOUNT_GTE_THRESHOLD',
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  ON CONFLICT ("flowId", "step") DO NOTHING;

  INSERT INTO "approval_flow_nodes"
    ("id", "flowId", "nodeName", "step", "assigneeId", "condition", "enabled", "createdAt", "updatedAt")
  VALUES
    (
      'approval_node_sales_business_default',
      sales_flow_id,
      '业务主管',
      1,
      business_assignee_id,
      'ALWAYS',
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'approval_node_sales_risk_default',
      sales_flow_id,
      '风控经理',
      2,
      risk_assignee_id,
      'ALWAYS',
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  ON CONFLICT ("flowId", "step") DO NOTHING;

  INSERT INTO "approval_flow_nodes"
    ("id", "flowId", "nodeName", "step", "assigneeId", "condition", "enabled", "createdAt", "updatedAt")
  VALUES
    (
      'approval_node_bilateral_business_default',
      bilateral_flow_id,
      '业务主管',
      1,
      business_assignee_id,
      'ALWAYS',
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'approval_node_bilateral_risk_default',
      bilateral_flow_id,
      '风控经理',
      2,
      risk_assignee_id,
      'ALWAYS',
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'approval_node_bilateral_general_default',
      bilateral_flow_id,
      '总经理',
      3,
      general_assignee_id,
      'ALWAYS',
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  ON CONFLICT ("flowId", "step") DO NOTHING;
END $$;
