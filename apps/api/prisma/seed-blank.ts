import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const flowDefinitions = [
  {
    contractType: 'PURCHASE',
    name: '采购合同四级审批流',
    amountThreshold: null,
    nodes: [
      { step: 1, nodeName: '运营经理', roleCode: 'BUSINESS_MANAGER', scopeType: 'BUSINESS_UNIT', condition: 'ALWAYS' },
      { step: 2, nodeName: '风控/财务经理', roleCode: 'RISK_MANAGER', scopeType: 'ALL', condition: 'ALWAYS' },
      { step: 3, nodeName: '业务责任人', roleCode: 'BUSINESS_OWNER', scopeType: 'BUSINESS_UNIT', condition: 'ALWAYS' },
      { step: 4, nodeName: '总经理', roleCode: 'GENERAL_MANAGER', scopeType: 'ALL', condition: 'ALWAYS' },
    ],
  },
  {
    contractType: 'SALES',
    name: '销售合同四级审批流',
    amountThreshold: null,
    nodes: [
      { step: 1, nodeName: '运营经理', roleCode: 'BUSINESS_MANAGER', scopeType: 'BUSINESS_UNIT', condition: 'ALWAYS' },
      { step: 2, nodeName: '风控/财务经理', roleCode: 'RISK_MANAGER', scopeType: 'ALL', condition: 'ALWAYS' },
      { step: 3, nodeName: '业务责任人', roleCode: 'BUSINESS_OWNER', scopeType: 'BUSINESS_UNIT', condition: 'ALWAYS' },
      { step: 4, nodeName: '总经理', roleCode: 'GENERAL_MANAGER', scopeType: 'ALL', condition: 'ALWAYS' },
    ],
  },
  {
    contractType: 'BILATERAL',
    name: '双边合同四级审批流',
    amountThreshold: null,
    nodes: [
      { step: 1, nodeName: '运营经理', roleCode: 'BUSINESS_MANAGER', scopeType: 'BUSINESS_UNIT', condition: 'ALWAYS' },
      { step: 2, nodeName: '风控/财务经理', roleCode: 'RISK_MANAGER', scopeType: 'ALL', condition: 'ALWAYS' },
      { step: 3, nodeName: '业务责任人', roleCode: 'BUSINESS_OWNER', scopeType: 'BUSINESS_UNIT', condition: 'ALWAYS' },
      { step: 4, nodeName: '总经理', roleCode: 'GENERAL_MANAGER', scopeType: 'ALL', condition: 'ALWAYS' },
    ],
  },
];

function adminPassword() {
  const configured = process.env.SEED_ADMIN_PASSWORD;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('线上执行空白初始化前必须配置 SEED_ADMIN_PASSWORD');
  }
  return 'admin123';
}

async function main() {
  const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
  if (!adminRole) throw new Error('缺少系统管理员角色，请先执行数据库迁移');

  const password = await bcrypt.hash(adminPassword(), 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      password,
      name: '系统管理员',
      role: 'ADMIN',
      status: 'ACTIVE',
      companyId: null,
      employeeId: null,
      refreshToken: null,
    },
    create: {
      username: 'admin',
      password,
      name: '系统管理员',
      role: 'ADMIN',
    },
  });

  await prisma.userRoleAssignment.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: { scopeType: 'ALL', status: 'ACTIVE', expiresAt: null },
    create: { userId: admin.id, roleId: adminRole.id, scopeType: 'ALL' },
  });

  const approvalRoles = await prisma.role.findMany({
    where: { code: { in: ['BUSINESS_MANAGER', 'RISK_MANAGER', 'BUSINESS_OWNER', 'GENERAL_MANAGER'] } },
  });
  const roleByCode = new Map(approvalRoles.map(role => [role.code, role]));

  for (const definition of flowDefinitions) {
    const flow = await prisma.approvalFlow.upsert({
      where: { contractType: definition.contractType },
      update: {
        name: definition.name,
        amountThreshold: definition.amountThreshold,
        status: 'ACTIVE',
      },
      create: {
        name: definition.name,
        contractType: definition.contractType,
        amountThreshold: definition.amountThreshold,
        status: 'ACTIVE',
      },
    });

    for (const node of definition.nodes) {
      const role = roleByCode.get(node.roleCode);
      if (!role) throw new Error(`缺少审批角色 ${node.roleCode}，请先执行数据库迁移`);
      await prisma.approvalFlowNode.upsert({
        where: { flowId_step: { flowId: flow.id, step: node.step } },
        update: {
          nodeName: node.nodeName,
          roleId: role.id,
          approvalMode: 'ANY',
          scopeType: node.scopeType,
          condition: node.condition,
          enabled: true,
        },
        create: {
          flowId: flow.id,
          step: node.step,
          nodeName: node.nodeName,
          roleId: role.id,
          approvalMode: 'ANY',
          scopeType: node.scopeType,
          condition: node.condition,
          enabled: true,
        },
      });
    }
    await prisma.approvalFlowNode.deleteMany({
      where: { flowId: flow.id, step: { notIn: definition.nodes.map((node) => node.step) } },
    });
  }

  console.log('空白系统初始化完成：仅保留系统配置、默认审批模板和 admin 管理员。');
}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
