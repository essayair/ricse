import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 创建默认用户
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

  console.log('✅ 用户创建完成:', admin.username);

  // 创建示例主数据
  const supplier = await prisma.supplier.upsert({
    where: { code: 'SUP001' },
    update: {},
    create: { code: 'SUP001', name: '示例供应商', contactPerson: '张三', contactPhone: '13800138001' },
  });

  const material = await prisma.material.upsert({
    where: { code: 'MAT001' },
    update: {},
    create: { code: 'MAT001', name: '示例物料-煤炭', category: '能源', unit: 'TON' },
  });

  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'WH001' },
    update: {},
    create: { code: 'WH001', name: '主仓库', address: '示例地址' },
  });

  console.log('✅ 主数据创建完成:', supplier.name, material.name, warehouse.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
