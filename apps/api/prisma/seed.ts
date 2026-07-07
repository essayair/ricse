import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // ===== 用户 =====
  const adminPwd = await bcrypt.hash('admin123', 10);
  const userPwd = await bcrypt.hash('user123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password: adminPwd, name: '系统管理员', role: 'ADMIN' },
  });
  await prisma.user.upsert({
    where: { username: 'approver' },
    update: {},
    create: { username: 'approver', password: userPwd, name: '审批员', role: 'APPROVER' },
  });
  console.log('✅ 用户:', admin.username);

  // ===== 内部企业 =====
  const hq = await prisma.partner.upsert({
    where: { code: '100001' },
    update: {},
    create: {
      code: '100001',
      name: '嘉溢运营管理有限公司',
      shortName: '嘉溢',
      isInternal: true,
      roles: ['CUSTOMER', 'SUPPLIER'],
      status: 'ACTIVE',
    },
  });

  await prisma.partner.upsert({
    where: { code: '200001' },
    update: {},
    create: {
      code: '200001',
      name: '嘉溢供应链管理有限公司',
      shortName: '嘉溢供应链',
      isInternal: true,
      roles: ['CUSTOMER', 'SUPPLIER'],
      status: 'ACTIVE',
    },
  });

  // 技术公司（内部企业 300000 段）
  await prisma.partner.upsert({
    where: { code: '300001' },
    update: {},
    create: {
      code: '300001',
      name: '浙江和光云链科技有限公司',
      shortName: '和光云链',
      isInternal: true,
      roles: ['CUSTOMER', 'SUPPLIER'],
      status: 'ACTIVE',
    },
  });
  console.log('✅ 内部企业: 嘉溢 + 供应链 + 和光云链');

  // ===== 合作伙伴（外部供应商/客户）=====
  const supplier1 = await prisma.partner.upsert({
    where: { code: '80000001' },
    update: {},
    create: {
      code: '80000001',
      name: '金华萤石矿业有限公司',
      shortName: '金华萤石',
      taxId: '91330700XXXXXXXX01',
      contactPerson: '张三',
      contactPhone: '13800138001',
      address: '浙江省金华市婺城区',
      sourceRegion: '金华',
      isInternal: false,
      roles: ['SUPPLIER'],
      status: 'ACTIVE',
    },
  });

  await prisma.partner.upsert({
    where: { code: '80000002' },
    update: {},
    create: {
      code: '80000002',
      name: '南京钢铁联合有限公司',
      shortName: '南钢',
      taxId: '91320100XXXXXXXX02',
      contactPerson: '李四',
      contactPhone: '13900139002',
      address: '江苏省南京市六合区',
      isInternal: false,
      roles: ['CUSTOMER'],
      status: 'ACTIVE',
    },
  });

  await prisma.partner.upsert({
    where: { code: '80000003' },
    update: {},
    create: {
      code: '80000003',
      name: '武义氟化工科技有限公司',
      shortName: '武义氟化工',
      taxId: '91330700XXXXXXXX03',
      contactPerson: '王五',
      contactPhone: '13700137003',
      address: '浙江省金华市武义县',
      sourceRegion: '武义',
      isInternal: false,
      roles: ['SUPPLIER', 'CUSTOMER'],
      status: 'ACTIVE',
    },
  });
  console.log('✅ 合作伙伴:', supplier1.name);

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
