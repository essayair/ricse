import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const seedPassword = (key: string, developmentDefault: string) => {
    const value = process.env[key];
    if (value) return value;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`线上执行种子数据前必须配置 ${key}`);
    }
    return developmentDefault;
  };

  // ===== 内部企业（合作伙伴）=====
  const internalPartners = [
    { code: '100001', name: '嘉溢运营管理有限公司', shortName: '嘉溢' },
    { code: '200001', name: '嘉溢供应链管理有限公司', shortName: '嘉溢供应链' },
    { code: '300001', name: '浙江和光云链科技有限公司', shortName: '和光云链' },
  ];
  for (const p of internalPartners) {
    const existing = await prisma.partner.findFirst({ where: { code: p.code } });
    if (!existing) {
      await prisma.partner.create({
        data: { ...p, isInternal: true, roles: ['CUSTOMER', 'SUPPLIER'], status: 'ACTIVE' },
      });
    }
  }
  // Create companies from partners
  for (const p of internalPartners) {
    const partner = await prisma.partner.findFirst({ where: { code: p.code } });
    if (!partner) continue;
    const existing = await prisma.company.findFirst({ where: { code: partner.code } });
    if (!existing) {
      await prisma.company.create({
        data: { code: partner.code, name: partner.name, shortName: partner.shortName, type: 'INTERNAL', partnerId: partner.id },
      });
    }
  }
  console.log('✅ 内部企业: 嘉溢 + 供应链 + 和光云链');

  // ===== 部门（和光云链）=====
  const hgyl = await prisma.company.findFirst({ where: { code: '300001' } });
  const deptData = [
    { id: 'dept-leadership', name: '公司领导', sort: 0 },
    { id: 'dept-office', name: '办公室', sort: 1 },
    { id: 'dept-logistics', name: '物流部', sort: 2 },
    { id: 'dept-business', name: '业务运营部', sort: 3 },
    { id: 'dept-tech', name: '技术创新部', sort: 4 },
  ];
  if (hgyl) {
    for (const d of deptData) {
      const existing = await prisma.department.findFirst({ where: { companyId: hgyl.id, name: d.name } });
      if (!existing) {
        await prisma.department.create({ data: { ...d, companyId: hgyl.id } });
      }
    }
  }
  console.log('✅ 部门（和光云链）');
  const leadershipDept = hgyl ? await prisma.department.findFirst({ where: { companyId: hgyl.id, name: '公司领导' } }) : null;
  const businessDept = hgyl ? await prisma.department.findFirst({ where: { companyId: hgyl.id, name: '业务运营部' } }) : null;

  // ===== 员工 + 用户 =====
  const adminPwd = await bcrypt.hash(seedPassword('SEED_ADMIN_PASSWORD', 'admin123'), 10);
  const approverPwd = await bcrypt.hash(seedPassword('SEED_APPROVER_PASSWORD', 'approver123'), 10);
  const userPwd = await bcrypt.hash(seedPassword('SEED_USER_PASSWORD', 'user123'), 10);

  // Admin employee
  let adminEmp = await prisma.employee.findFirst({ where: { companyId: hgyl?.id, departmentId: leadershipDept?.id, name: '系统管理员' } });
  if (!adminEmp && hgyl && leadershipDept) {
    adminEmp = await prisma.employee.create({
      data: { name: '系统管理员', companyId: hgyl.id, departmentId: leadershipDept.id, position: '系统管理员' },
    });
  }
  // Admin user
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { employeeId: adminEmp?.id, companyId: hgyl?.id },
    create: { username: 'admin', password: adminPwd, name: '系统管理员', role: 'ADMIN', employeeId: adminEmp?.id, companyId: hgyl?.id },
  });

  // Approver employee
  let approverEmp = await prisma.employee.findFirst({ where: { companyId: hgyl?.id, departmentId: leadershipDept?.id, name: '审批管理员' } });
  if (!approverEmp && hgyl && leadershipDept) {
    approverEmp = await prisma.employee.create({
      data: { name: '审批管理员', companyId: hgyl.id, departmentId: leadershipDept.id, position: '审批管理员' },
    });
  }
  await prisma.user.upsert({
    where: { username: 'approver' },
    update: { employeeId: approverEmp?.id, companyId: hgyl?.id },
    create: { username: 'approver', password: approverPwd, name: '审批管理员', role: 'APPROVER', employeeId: approverEmp?.id, companyId: hgyl?.id },
  });

  const approvalAccounts = [
    { username: 'business_manager', name: '业务主管', position: '业务主管', departmentId: businessDept?.id },
    { username: 'risk_manager', name: '风控经理', position: '风控经理', departmentId: leadershipDept?.id },
    { username: 'general_manager', name: '总经理', position: '总经理', departmentId: leadershipDept?.id },
  ];
  for (const account of approvalAccounts) {
    if (!hgyl || !account.departmentId) continue;
    let employee = await prisma.employee.findFirst({
      where: { companyId: hgyl.id, departmentId: account.departmentId, name: account.name },
    });
    if (!employee) {
      employee = await prisma.employee.create({
        data: { name: account.name, companyId: hgyl.id, departmentId: account.departmentId, position: account.position },
      });
    }
    await prisma.user.upsert({
      where: { username: account.username },
      update: { name: account.name, role: 'APPROVER', employeeId: employee.id, companyId: hgyl.id, status: 'ACTIVE' },
      create: { username: account.username, password: approverPwd, name: account.name, role: 'APPROVER', employeeId: employee.id, companyId: hgyl.id },
    });
  }
  const approvalUsers = await prisma.user.findMany({
    where: { username: { in: approvalAccounts.map((item) => item.username) } },
    select: { id: true, username: true },
  });
  const approvalUserByName = new Map(approvalUsers.map((item) => [item.username, item.id]));
  const flowDefinitions = [
    { contractType: 'PURCHASE', name: '采购合同审批流', amountThreshold: 1_000_000, includeGeneralManager: true },
    { contractType: 'SALES', name: '销售合同审批流', amountThreshold: null, includeGeneralManager: false },
    { contractType: 'BILATERAL', name: '双边合同审批流', amountThreshold: 0, includeGeneralManager: true },
  ];
  for (const definition of flowDefinitions) {
    const flow = await prisma.approvalFlow.upsert({
      where: { contractType: definition.contractType },
      update: { name: definition.name },
      create: { name: definition.name, contractType: definition.contractType, amountThreshold: definition.amountThreshold, status: 'ACTIVE' },
    });
    const nodes = [
      { step: 1, nodeName: '业务主管', username: 'business_manager', condition: 'ALWAYS' },
      { step: 2, nodeName: '风控经理', username: 'risk_manager', condition: 'ALWAYS' },
      ...(definition.includeGeneralManager ? [{ step: 3, nodeName: '总经理', username: 'general_manager', condition: definition.contractType === 'PURCHASE' ? 'AMOUNT_GTE_THRESHOLD' : 'ALWAYS' }] : []),
    ];
    for (const node of nodes) {
      const assigneeId = approvalUserByName.get(node.username);
      if (!assigneeId) continue;
      await prisma.approvalFlowNode.upsert({
        where: { flowId_step: { flowId: flow.id, step: node.step } },
        update: { nodeName: node.nodeName },
        create: { flowId: flow.id, step: node.step, nodeName: node.nodeName, assigneeId, condition: node.condition },
      });
    }
  }

  console.log('✅ 管理员及固定审批链账号');

  // ===== 合作伙伴（外部供应商/客户）=====
  const externalPartners = [
    {
      code: '80000001', name: '金华萤石矿业有限公司', shortName: '金华萤石',
      taxId: '91330700XXXXXXXX01', contactPerson: '张三', contactPhone: '13800138001',
      address: '浙江省金华市婺城区', sourceRegion: '金华', roles: ['SUPPLIER'],
    },
    {
      code: '80000002', name: '南京钢铁联合有限公司', shortName: '南钢',
      taxId: '91320100XXXXXXXX02', contactPerson: '李四', contactPhone: '13900139002',
      address: '江苏省南京市六合区', roles: ['CUSTOMER'],
    },
    {
      code: '80000003', name: '武义氟化工科技有限公司', shortName: '武义氟化工',
      taxId: '91330700XXXXXXXX03', contactPerson: '王五', contactPhone: '13700137003',
      address: '浙江省金华市武义县', sourceRegion: '武义', roles: ['SUPPLIER', 'CUSTOMER'],
    },
  ];
  for (const p of externalPartners) {
    const existing = await prisma.partner.findFirst({ where: { code: p.code } });
    if (!existing) {
      await prisma.partner.create({
        data: { ...p, isInternal: false, status: 'ACTIVE' },
      });
    }
  }
  console.log('✅ 合作伙伴（外部）');

  // ===== 物料分类 =====
  const catPowder = await prisma.materialCategory.upsert({
    where: { id: 'cat-powder' },
    update: {},
    create: { id: 'cat-powder', name: '萤石粉', sort: 1 },
  });
  const catLump = await prisma.materialCategory.upsert({
    where: { id: 'cat-lump' },
    update: {},
    create: { id: 'cat-lump', name: '萤石块矿', sort: 2 },
  });
  const catSand = await prisma.materialCategory.upsert({
    where: { id: 'cat-sand' },
    update: {},
    create: { id: 'cat-sand', name: '萤石砂', sort: 3 },
  });

  // ===== 物料 =====
  await prisma.material.upsert({
    where: { code: 'MT-000001' },
    update: {},
    create: {
      code: 'MT-000001', name: '萤石粉', categoryId: catPowder.id,
      grade: 'CaF₂≥97%', unit: 'TON', spec: '-200目', packageType: '吨袋',
    },
  });
  await prisma.material.upsert({
    where: { code: 'MT-000002' },
    update: {},
    create: {
      code: 'MT-000002', name: '萤石粉', categoryId: catPowder.id,
      grade: 'CaF₂≥95%', unit: 'TON', spec: '-200目', packageType: '吨袋',
    },
  });
  await prisma.material.upsert({
    where: { code: 'MT-000003' },
    update: {},
    create: {
      code: 'MT-000003', name: '萤石块矿', categoryId: catLump.id,
      grade: 'CaF₂≥85%', unit: 'TON', packageType: '散装',
    },
  });
  await prisma.material.upsert({
    where: { code: 'MT-000004' },
    update: {},
    create: {
      code: 'MT-000004', name: '萤石砂', categoryId: catSand.id,
      grade: 'CaF₂≥90%', unit: 'TON', packageType: '散装',
    },
  });
  console.log('✅ 物料分类 + 物料');

  // ===== 仓库 =====
  await prisma.warehouse.upsert({
    where: { code: 'WH-001' },
    update: {},
    create: { code: 'WH-001', name: '金华中转仓', type: 'SELF', address: '浙江省金华市婺城区工业园', manager: '赵六', managerPhone: '13600136006' },
  });
  await prisma.warehouse.upsert({
    where: { code: 'WH-002' },
    update: {},
    create: { code: 'WH-002', name: '南京交货仓', type: 'RENT', address: '江苏省南京市六合区钢铁大道', manager: '孙七', managerPhone: '13500135007' },
  });
  console.log('✅ 仓库');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
