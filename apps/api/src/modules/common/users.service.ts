import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,49}$/;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    username: string; password: string; name: string;
    role?: string; employeeId?: string; companyId?: string; businessGroupId?: string;
  }) {
    const username = data.username.trim();
    if (!USERNAME_PATTERN.test(username)) {
      throw new BadRequestException('用户名须以字母或数字开头，可包含字母、数字、点、下划线和短横线，长度3-50位');
    }
    if (!data.password || data.password.length < 6) {
      throw new BadRequestException('密码至少6位');
    }
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) throw new ConflictException('用户名已存在');

    const hashed = await bcrypt.hash(data.password, 10);
    const roleCode = data.role || 'USER';
    const [role, company, employee] = await Promise.all([
      this.prisma.role.findUnique({ where: { code: roleCode } }),
      data.companyId ? this.prisma.company.findUnique({ where: { id: data.companyId } }) : null,
      data.employeeId ? this.prisma.employee.findUnique({ where: { id: data.employeeId } }) : null,
    ]);
    if (!role || role.status !== 'ACTIVE') throw new BadRequestException('指定角色不存在或已停用');
    if (data.companyId && !company) throw new BadRequestException('所属企业不存在');
    if (employee && data.companyId && employee.companyId !== data.companyId) {
      throw new BadRequestException('员工与所属企业不一致');
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
          name: data.name.trim(),
          role: roleCode,
          employeeId: data.employeeId,
          companyId: data.companyId,
          businessGroupId: data.businessGroupId,
        },
      });
      const assignment = await tx.userRoleAssignment.create({
        data: {
          userId: user.id,
          roleId: role.id,
          scopeType: company?.type === 'EXTERNAL' ? 'COMPANY' : 'ALL',
        },
      });
      if (company?.type === 'EXTERNAL') {
        await tx.userRoleScope.create({
          data: {
            assignmentId: assignment.id,
            targetType: 'COMPANY',
            targetId: company.id,
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
            departmentId: true,
            department: { select: { id: true, name: true, companyId: true } },
          },
        },
        company: { select: { id: true, code: true, name: true, type: true, partnerId: true } },
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
            departmentId: true,
            department: { select: { id: true, name: true, companyId: true } },
          },
        },
        company: { select: { id: true, code: true, name: true, type: true, partnerId: true } },
        roleAssignments: {
          where: { status: 'ACTIVE' },
          include: { role: true, scopes: true },
        },
      },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async findByRefreshToken(refreshToken: string) {
    const users = await this.prisma.user.findMany({
      where: { refreshToken: { not: null } },
      select: { id: true, username: true, name: true, role: true, refreshToken: true },
    });

    for (const user of users) {
      if (user.refreshToken && (await bcrypt.compare(refreshToken, user.refreshToken))) {
        return user;
      }
    }
    return null;
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
      select: { role: { select: { code: true, permissions: { select: { permission: { select: { code: true } } } } } } },
    });
    return {
      roles: [...new Set(assignments.map((item) => item.role.code))],
      permissions: [...new Set(assignments.flatMap((item) => item.role.permissions.map((entry) => entry.permission.code)))],
    };
  }

  async update(id: string, data: { role?: string; status?: string; name?: string; username?: string; phone?: string; email?: string }) {
    const username = data.username?.trim();
    if (username !== undefined) {
      if (!USERNAME_PATTERN.test(username)) {
        throw new BadRequestException('用户名须以字母或数字开头，可包含字母、数字、点、下划线和短横线，长度3-50位');
      }
      const existing = await this.prisma.user.findUnique({ where: { username } });
      if (existing && existing.id !== id) throw new ConflictException('用户名已存在');
      const [currentUser, phoneOwner] = await Promise.all([
        this.prisma.user.findUnique({ where: { id }, select: { employeeId: true } }),
        this.prisma.employee.findFirst({ where: { phone: username }, select: { id: true } }),
      ]);
      if (phoneOwner && phoneOwner.id !== currentUser?.employeeId) {
        throw new ConflictException('用户名已被其他员工手机号占用');
      }
    }
    return this.prisma.user.update({
      where: { id },
      data: { ...data, username, name: data.name?.trim() },
      select: { id: true, username: true, name: true, role: true, status: true, phone: true, email: true, updatedAt: true },
    });
  }

  async resetPassword(id: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) throw new BadRequestException('密码至少6位');
    const hashed = await bcrypt.hash(newPassword, 10);
    return this.prisma.user.update({
      where: { id },
      data: { password: hashed, refreshToken: null },
      select: { id: true, username: true, name: true },
    });
  }
}
