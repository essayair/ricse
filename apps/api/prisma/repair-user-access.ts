import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const orphanAccounts = await tx.user.findMany({
      where: { companyId: { not: null }, employeeId: null },
      select: {
        id: true,
        username: true,
        status: true,
        roleAssignments: {
          where: { status: 'ACTIVE', role: { code: 'ADMIN', status: 'ACTIVE' } },
          select: { id: true },
        },
      },
    });
    const activeOrphanAdminCount = orphanAccounts.filter(
      (user) => user.status === 'ACTIVE' && user.roleAssignments.length > 0,
    ).length;
    if (activeOrphanAdminCount > 0) {
      const survivingAdminCount = await tx.user.count({
        where: {
          status: 'ACTIVE',
          OR: [{ companyId: null }, { employeeId: { not: null } }],
          roleAssignments: {
            some: { status: 'ACTIVE', role: { code: 'ADMIN', status: 'ACTIVE' } },
          },
        },
      });
      if (survivingAdminCount === 0) {
        throw new Error('检测到孤立的系统管理员账号，且没有其他有效管理员。为避免锁死系统，已取消修复；请先恢复管理员员工档案及关联。');
      }
    }
    const orphanRepair = await tx.user.updateMany({
      where: { companyId: { not: null }, employeeId: null },
      data: { status: 'DISABLED', refreshToken: null },
    });

    const legacyUsers = await tx.user.findMany({
      where: { roleAssignments: { none: {} } },
      select: { id: true, role: true, companyId: true },
    });
    let createdAssignments = 0;
    for (const user of legacyUsers) {
      const role = await tx.role.findUnique({ where: { code: user.role } });
      if (!role || role.status !== 'ACTIVE') continue;
      const scopeType = role.code === 'ADMIN' ? 'ALL' : user.companyId ? 'COMPANY' : 'SELF';
      const assignment = await tx.userRoleAssignment.create({
        data: { userId: user.id, roleId: role.id, scopeType },
      });
      if (scopeType === 'COMPANY' && user.companyId) {
        await tx.userRoleScope.create({
          data: { assignmentId: assignment.id, targetType: 'COMPANY', targetId: user.companyId },
        });
      }
      createdAssignments += 1;
    }

    const legacyAllAssignments = await tx.userRoleAssignment.findMany({
      where: {
        scopeType: 'ALL',
        assignedBy: null,
        role: { code: { not: 'ADMIN' } },
        user: { companyId: { not: null } },
      },
      select: { id: true, user: { select: { companyId: true } } },
    });
    let narrowedAssignments = 0;
    for (const assignment of legacyAllAssignments) {
      if (!assignment.user.companyId) continue;
      await tx.userRoleAssignment.update({ where: { id: assignment.id }, data: { scopeType: 'COMPANY' } });
      await tx.userRoleScope.deleteMany({ where: { assignmentId: assignment.id } });
      await tx.userRoleScope.create({
        data: { assignmentId: assignment.id, targetType: 'COMPANY', targetId: assignment.user.companyId },
      });
      narrowedAssignments += 1;
    }
    return { createdAssignments, narrowedAssignments, disabledOrphanAccounts: orphanRepair.count };
  });

  console.info(`账号权限修复完成：停用孤立账号 ${result.disabledOrphanAccounts} 条，补建授权 ${result.createdAssignments} 条，收紧历史数据范围 ${result.narrowedAssignments} 条。`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
