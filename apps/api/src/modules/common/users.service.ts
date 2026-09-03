import { Injectable, ConflictException, NotFoundException, BadRequestException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,49}$/;
const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    username: string; password: string; name: string;
    role?: string; employeeId?: string; companyId?: string; businessGroupId?: string;
  }, options: { allowUnbound?: boolean; operatedBy?: string } = {}) {
    const username = data.username.trim();
    if (!USERNAME_PATTERN.test(username)) {
      throw new BadRequestException('用户名须以字母或数字开头，可包含字母、数字、点、下划线和短横线，长度3-50位');
    }
    if (!data.password || data.password.length < 6) {
      throw new BadRequestException('密码至少6位');
    }
    if (!data.name?.trim()) throw new BadRequestException('请填写用户姓名');
    if (!options.allowUnbound && (!data.employeeId || !data.companyId)) {
      throw new BadRequestException('后台账号必须关联员工和所属企业');
    }
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) throw new ConflictException('用户名已存在');

    const hashed = await bcrypt.hash(data.password, 10);
    const roleCode = data.role || 'USER';
    if (roleCode !== 'USER') {
      const operatorIsAdmin = options.operatedBy
        ? await this.prisma.userRoleAssignment.findFirst({
          where: { userId: options.operatedBy, status: 'ACTIVE', role: { code: 'ADMIN', status: 'ACTIVE' } },
          select: { id: true },
        })
        : null;
      if (!operatorIsAdmin) throw new ForbiddenException('只有系统管理员可以在开通账号时指定业务角色');
    }
    const [role, company, employee] = await Promise.all([
      this.prisma.role.findUnique({ where: { code: roleCode } }),
      data.companyId ? this.prisma.company.findUnique({ where: { id: data.companyId } }) : null,
      data.employeeId ? this.prisma.employee.findUnique({
        where: { id: data.employeeId },
        include: { user: { select: { id: true } } },
      }) : null,
    ]);
    if (!role || role.status !== 'ACTIVE') throw new BadRequestException('指定角色不存在或已停用');
    if (data.companyId && !company) throw new BadRequestException('所属企业不存在');
    if (data.employeeId && !employee) throw new BadRequestException('关联员工不存在');
    if (company && company.status !== 'ACTIVE') throw new BadRequestException('所属企业已停用，不能开通账号');
    if (employee && employee.status !== 'ACTIVE') throw new BadRequestException('员工已停用，不能开通账号');
    if (employee?.user) throw new ConflictException('该员工已关联登录账号');
    if (employee && data.companyId && employee.companyId !== data.companyId) {
      throw new BadRequestException('员工与所属企业不一致');
    }
    if (company?.type === 'EXTERNAL' && roleCode === 'ADMIN') {
      throw new BadRequestException('外部企业账号不能授予系统管理员角色');
    }
    const phoneOwner = await this.prisma.employee.findFirst({
      where: { phone: username },
      select: { id: true },
    });
    if (phoneOwner && phoneOwner.id !== data.employeeId) {
      throw new ConflictException('用户名已被其他员工手机号占用');
    }
    if (company?.type === 'EXTERNAL') {
      const externalAccountCount = await this.prisma.user.count({
        where: { companyId: company.id, status: 'ACTIVE' },
      });
      if (externalAccountCount >= 6) {
        throw new BadRequestException('一个外部企业最多开通 6 个有效账号');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          password: hashed,
          name: employee?.name || data.name.trim(),
          phone: employee?.phone,
          email: employee?.email,
          role: roleCode,
          employeeId: data.employeeId,
          companyId: data.companyId,
          businessGroupId: data.businessGroupId,
        },
      });
      const scopeType = roleCode === 'ADMIN' ? 'ALL' : company ? 'COMPANY' : 'SELF';
      const assignment = await tx.userRoleAssignment.create({
        data: {
          userId: user.id,
          roleId: role.id,
          scopeType,
        },
      });
      if (scopeType === 'COMPANY' && company) {
        await tx.userRoleScope.create({
          data: {
            assignmentId: assignment.id,
            targetType: 'COMPANY',
            targetId: company.id,
          },
        });
      }
      if (options.operatedBy) {
        await tx.businessOperationLog.create({
          data: {
            businessType: 'USER',
            businessId: user.id,
            action: 'CREATE',
            actionLabel: '开通账号',
            operatorId: options.operatedBy,
            details: { username, employeeId: data.employeeId, companyId: data.companyId, role: roleCode, scopeType },
          },
        });
      }
      return tx.user.findUnique({
        where: { id: user.id },
        select: {
          id: true, username: true, name: true, role: true,
          employeeId: true, companyId: true, businessGroupId: true, createdAt: true,
          roleAssignments: { include: { role: true, scopes: true } },
        },
      });
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findByLoginIdentifier(identifier: string) {
    const normalized = identifier.trim();
    const user = await this.prisma.user.findUnique({ where: { username: normalized } });
    if (user) return user;

    const phone = normalized;
    return this.prisma.user.findFirst({
      where: { employee: { is: { phone } } },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true, username: true, name: true, role: true, status: true,
        employeeId: true, companyId: true, businessGroupId: true, createdAt: true,
        employee: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            status: true,
            departmentId: true,
            department: { select: { id: true, name: true, companyId: true } },
          },
        },
        company: { select: { id: true, code: true, name: true, type: true, partnerId: true, status: true } },
        wechatIdentity: { select: { id: true, nickName: true, phone: true, lastLogin: true, linkedAt: true, status: true } },
        roleAssignments: {
          where: { status: 'ACTIVE' },
          include: { role: true, scopes: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, username: true, name: true, role: true, status: true,
        employeeId: true, companyId: true, businessGroupId: true, createdAt: true,
        employee: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            status: true,
            departmentId: true,
            department: { select: { id: true, name: true, companyId: true } },
          },
        },
        company: { select: { id: true, code: true, name: true, type: true, partnerId: true, status: true } },
        wechatIdentity: { select: { id: true, nickName: true, phone: true, lastLogin: true, linkedAt: true, status: true } },
        roleAssignments: {
          where: { status: 'ACTIVE' },
          include: { role: true, scopes: true },
        },
      },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async findOperationLogs(id: string) {
    await this.findById(id);
    return this.prisma.businessOperationLog.findMany({
      where: { businessType: 'USER', businessId: id },
      include: { operator: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByRefreshToken(refreshToken: string, userId?: string) {
    const select = {
      id: true, username: true, name: true, role: true, status: true, refreshToken: true,
      employee: { select: { status: true } },
      company: { select: { status: true } },
    } as const;
    const targetUser = userId
      ? await this.prisma.user.findUnique({ where: { id: userId }, select })
      : null;
    const users = userId
      ? targetUser ? [targetUser] : []
      : await this.prisma.user.findMany({ where: { refreshToken: { not: null } }, select });

    for (const user of users) {
      if (user.refreshToken && (await bcrypt.compare(refreshToken, user.refreshToken))) {
        return user;
      }
    }
    return null;
  }

  async assertActiveForAuthentication(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        employeeId: true,
        companyId: true,
        employee: { select: { status: true } },
        company: { select: { status: true, type: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('账号已停用');
    if (user.companyId && !user.employeeId) throw new UnauthorizedException('账号缺少员工档案，已禁止登录，请联系系统管理员');
    if (user.employeeId && user.employee?.status !== 'ACTIVE') throw new UnauthorizedException('员工已停用');
    if (user.companyId && user.company?.status !== 'ACTIVE') throw new UnauthorizedException('所属企业已停用');
    return user;
  }

  async setRefreshToken(userId: string, hash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hash },
    });
  }

  async clearRefreshToken(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  async getActiveAccess(userId: string) {
    const now = new Date();
    const assignments = await this.prisma.userRoleAssignment.findMany({
      where: { userId, status: 'ACTIVE', effectiveAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], role: { status: 'ACTIVE' } },
      select: { role: { select: { code: true, name: true, permissions: { select: { permission: { select: { code: true } } } } } } },
    });
    return {
      roles: [...new Set(assignments.map((item) => item.role.code))],
      roleNames: [...new Set(assignments.map((item) => item.role.name))],
      permissions: [...new Set(assignments.flatMap((item) => item.role.permissions.map((entry) => entry.permission.code)))],
    };
  }

  async update(id: string, data: { status?: string; name?: string; username?: string; phone?: string; email?: string }, operatedBy?: string) {
    if (data.status !== undefined && !USER_STATUSES.includes(data.status as any)) {
      throw new BadRequestException('无效的账号状态');
    }
    const currentUser = await this.prisma.user.findUnique({
      where: { id },
      include: {
        employee: { select: { status: true } },
        company: { select: { status: true, type: true } },
        roleAssignments: { where: { status: 'ACTIVE' }, include: { role: true } },
      },
    });
    if (!currentUser) throw new NotFoundException('用户不存在');
    if (currentUser.employeeId && (data.name !== undefined || data.phone !== undefined || data.email !== undefined)) {
      throw new BadRequestException('已关联员工的账号，姓名和联系方式请在员工档案中修改');
    }
    if (data.status === 'ACTIVE') {
      if (currentUser.companyId && !currentUser.employeeId) {
        throw new BadRequestException('账号缺少员工档案，不能直接启用；请先恢复员工档案及账号关联');
      }
      if (currentUser.employeeId && currentUser.employee?.status !== 'ACTIVE') {
        throw new BadRequestException('员工已停用，不能启用账号');
      }
      if (currentUser.companyId && currentUser.company?.status !== 'ACTIVE') {
        throw new BadRequestException('所属企业已停用，不能启用账号');
      }
      if (currentUser.companyId && currentUser.company?.type === 'EXTERNAL' && currentUser.status !== 'ACTIVE') {
        const externalAccountCount = await this.prisma.user.count({
          where: { companyId: currentUser.companyId, status: 'ACTIVE' },
        });
        if (externalAccountCount >= 6) throw new BadRequestException('所属外部企业已达到 6 个有效账号上限');
      }
    }
    if (data.status === 'DISABLED' && currentUser.roleAssignments.some((item) => item.role.code === 'ADMIN')) {
      const activeAdminCount = await this.prisma.userRoleAssignment.count({
        where: {
          role: { code: 'ADMIN' }, status: 'ACTIVE',
          user: {
            status: 'ACTIVE',
            AND: [
              { OR: [{ employeeId: null }, { employee: { is: { status: 'ACTIVE' } } }] },
              { OR: [{ companyId: null }, { company: { is: { status: 'ACTIVE' } } }] },
            ],
          },
        },
      });
      if (activeAdminCount <= 1) throw new BadRequestException('系统必须至少保留一个有效的系统管理员');
    }
    const username = data.username?.trim();
    if (username !== undefined) {
      if (!USERNAME_PATTERN.test(username)) {
        throw new BadRequestException('用户名须以字母或数字开头，可包含字母、数字、点、下划线和短横线，长度3-50位');
      }
      const existing = await this.prisma.user.findUnique({ where: { username } });
      if (existing && existing.id !== id) throw new ConflictException('用户名已存在');
      const phoneOwner = await this.prisma.employee.findFirst({ where: { phone: username }, select: { id: true } });
      if (phoneOwner && phoneOwner.id !== currentUser.employeeId) {
        throw new ConflictException('用户名已被其他员工手机号占用');
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...data,
          username,
          name: data.name?.trim(),
          ...(data.status === 'DISABLED' ? { refreshToken: null } : {}),
        },
        select: { id: true, username: true, name: true, role: true, status: true, phone: true, email: true, updatedAt: true },
      });
      if (operatedBy) {
        const action = data.status === 'DISABLED' ? 'DISABLE' : data.status === 'ACTIVE' ? 'ENABLE' : 'UPDATE';
        const actionLabel = data.status === 'DISABLED' ? '禁用账号' : data.status === 'ACTIVE' ? '启用账号' : '修改账号';
        await tx.businessOperationLog.create({
          data: {
            businessType: 'USER', businessId: id, action, actionLabel, operatorId: operatedBy,
            details: { changedFields: Object.keys(data) },
          },
        });
      }
      return updated;
    });
  }

  async resetPassword(id: string, newPassword: string, operatedBy?: string) {
    if (!newPassword || newPassword.length < 6) throw new BadRequestException('密码至少6位');
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('用户不存在');
    const hashed = await bcrypt.hash(newPassword, 10);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { password: hashed, refreshToken: null },
        select: { id: true, username: true, name: true },
      });
      if (operatedBy) {
        await tx.businessOperationLog.create({
          data: { businessType: 'USER', businessId: id, action: 'RESET_PASSWORD', actionLabel: '重置密码', operatorId: operatedBy },
        });
      }
      return updated;
    });
  }
}
