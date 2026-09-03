import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const SCOPE_TYPES = [
  'SELF',
  'DEPARTMENT',
  'DEPARTMENT_AND_CHILDREN',
  'COMPANY',
  'SPECIFIED_COMPANIES',
  'ALL',
] as const;

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  findAllRoles() {
    return this.prisma.role.findMany({
      include: {
        permissions: {
          include: { permission: true },
          orderBy: { permission: { code: 'asc' } },
        },
        _count: { select: { assignments: true } },
      },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
  }

  async createRole(data: {
    code: string;
    name: string;
    description?: string;
    type?: string;
    permissionIds?: string[];
  }) {
    const code = data.code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,49}$/.test(code)) {
      throw new BadRequestException('角色编码必须以字母开头，仅包含大写字母、数字和下划线');
    }
    const existing = await this.prisma.role.findUnique({ where: { code } });
    if (existing) throw new ConflictException('角色编码已存在');

    return this.prisma.role.create({
      data: {
        code,
        name: data.name.trim(),
        description: data.description?.trim(),
        type: data.type || 'BUSINESS',
        permissions: data.permissionIds?.length
          ? { create: data.permissionIds.map((permissionId) => ({ permissionId })) }
          : undefined,
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async updateRole(id: string, data: {
    name?: string;
    description?: string;
    type?: string;
    status?: string;
  }) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    if (role.isSystem && data.status === 'INACTIVE') {
      throw new BadRequestException('系统预置角色不能停用');
    }
    return this.prisma.role.update({
      where: { id },
      data: {
        name: data.name?.trim(),
        description: data.description?.trim(),
        type: data.type,
        status: data.status,
      },
    });
  }

  async replaceRolePermissions(roleId: string, permissionIds: string[]) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('角色不存在');
    if (role.code === 'ADMIN') {
      throw new BadRequestException('系统管理员固定拥有全部权限，不能收紧');
    }

    const uniqueIds = [...new Set(permissionIds)];
    const count = await this.prisma.permission.count({ where: { id: { in: uniqueIds } } });
    if (count !== uniqueIds.length) throw new BadRequestException('包含不存在的权限');

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (uniqueIds.length > 0) {
        await tx.rolePermission.createMany({
          data: uniqueIds.map((permissionId) => ({ roleId, permissionId })),
        });
      }
    });
    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async findUserAssignments(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        employee: { select: { id: true, companyId: true, departmentId: true } },
        company: { select: { id: true, code: true, name: true, type: true, partnerId: true } },
        roleAssignments: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
            scopes: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  async replaceUserAssignments(
    userId: string,
    assignments: Array<{
      roleId: string;
      scopeType: string;
      targetCompanyIds?: string[];
      expiresAt?: string | null;
    }>,
    assignedBy: string,
  ) {
    if (!assignments.length) throw new BadRequestException('用户至少需要一个角色');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });
    if (!user) throw new NotFoundException('用户不存在');

    const roleIds = [...new Set(assignments.map((item) => item.roleId))];
    if (roleIds.length !== assignments.length) throw new BadRequestException('同一角色不能重复授权');
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds }, status: 'ACTIVE' },
    });
    if (roles.length !== roleIds.length) throw new BadRequestException('包含不存在或已停用的角色');

    const externalCompany = user.company?.type === 'EXTERNAL' ? user.company : null;
    if (externalCompany && roles.some((role) => role.code === 'ADMIN')) {
      throw new BadRequestException('外部企业账号不能授予平台系统管理员角色');
    }
    const currentAdminAssignment = await this.prisma.userRoleAssignment.findFirst({
      where: { userId, role: { code: 'ADMIN' }, status: 'ACTIVE' },
    });
    if (currentAdminAssignment && !roles.some((role) => role.code === 'ADMIN')) {
      const adminCount = await this.prisma.userRoleAssignment.count({
        where: { role: { code: 'ADMIN' }, status: 'ACTIVE', user: { status: 'ACTIVE' } },
      });
      if (adminCount <= 1) throw new BadRequestException('系统必须至少保留一个有效的系统管理员');
    }

    const normalized = assignments.map((item) => {
      if (!SCOPE_TYPES.includes(item.scopeType as any)) {
        throw new BadRequestException(`无效的数据范围：${item.scopeType}`);
      }
      if (externalCompany) {
        return {
          ...item,
          scopeType: 'COMPANY',
          targetCompanyIds: [externalCompany.id],
        };
      }
      if (item.scopeType === 'COMPANY' && !user.companyId) {
        throw new BadRequestException('用户未关联所属企业，不能配置本企业数据范围');
      }
      return item;
    });

    const targetIds = [...new Set(normalized.flatMap((item) => item.targetCompanyIds || []))];
    if (targetIds.length) {
      const companyCount = await this.prisma.company.count({ where: { id: { in: targetIds } } });
      if (companyCount !== targetIds.length) throw new BadRequestException('数据范围包含不存在的企业');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.deleteMany({ where: { userId } });
      for (const item of normalized) {
        const assignment = await tx.userRoleAssignment.create({
          data: {
            userId,
            roleId: item.roleId,
            scopeType: item.scopeType,
            expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
            assignedBy,
          },
        });
        const companyIds = item.scopeType === 'COMPANY'
          ? (item.targetCompanyIds?.length ? item.targetCompanyIds : user.companyId ? [user.companyId] : [])
          : item.scopeType === 'SPECIFIED_COMPANIES'
            ? (item.targetCompanyIds || [])
            : [];
        if (companyIds.length) {
          await tx.userRoleScope.createMany({
            data: companyIds.map((targetId) => ({
              assignmentId: assignment.id,
              targetType: 'COMPANY',
              targetId,
            })),
          });
        }
      }

      const primaryRole = roles.find((role) => role.code === 'ADMIN') || roles[0];
      await tx.user.update({ where: { id: userId }, data: { role: primaryRole.code } });
    });

    return this.findUserAssignments(userId);
  }

  async getContext(userId: string) {
    const user = await this.findUserAssignments(userId);
    const now = new Date();
    const activeAssignments = user.roleAssignments.filter((assignment) =>
      assignment.status === 'ACTIVE'
      && assignment.role.status === 'ACTIVE'
      && assignment.effectiveAt <= now
      && (!assignment.expiresAt || assignment.expiresAt > now),
    );
    const roleCodes = new Set(activeAssignments.map((assignment) => assignment.role.code));
    const roleNames = new Set(activeAssignments.map((assignment) => assignment.role.name));
    const permissions = new Set(
      activeAssignments.flatMap((assignment) =>
        assignment.role.permissions.map((entry) => entry.permission.code),
      ),
    );
    return {
      user,
      assignments: activeAssignments,
      roleCodes: [...roleCodes],
      roleNames: [...roleNames],
      permissions: [...permissions],
      isAdmin: roleCodes.has('ADMIN'),
      isExternal: user.company?.type === 'EXTERNAL',
      externalPartnerId: user.company?.type === 'EXTERNAL' ? user.company.partnerId : null,
    };
  }

  async assertPermission(userId: string, permissionCode: string) {
    const context = await this.getContext(userId);
    if (!context.isAdmin && !context.permissions.includes(permissionCode)) {
      throw new ForbiddenException(`缺少权限：${permissionCode}`);
    }
    return context;
  }

  async getContractScope(userId: string): Promise<Prisma.ContractWhereInput> {
    const context = await this.getContext(userId);
    if (context.isAdmin) return {};

    if (context.isExternal) {
      if (!context.externalPartnerId) {
        throw new ForbiddenException('外部企业未关联合作伙伴，无法确定数据范围');
      }
      return {
        OR: [
          { sellerId: context.externalPartnerId },
          { buyerId: context.externalPartnerId },
          { signingPartnerId: context.externalPartnerId },
        ],
      };
    }

    if (context.assignments.some((assignment) => assignment.scopeType === 'ALL')) return {};

    const clauses: Prisma.ContractWhereInput[] = [];
    const companyIds = new Set<string>();
    const departmentIds = new Set<string>();
    for (const assignment of context.assignments) {
      if (assignment.scopeType === 'SELF') {
        clauses.push({ createdBy: userId });
      }
      if (assignment.scopeType === 'COMPANY' && context.user.company?.id) {
        companyIds.add(context.user.company.id);
      }
      if (assignment.scopeType === 'SPECIFIED_COMPANIES') {
        assignment.scopes
          .filter((scope) => scope.targetType === 'COMPANY')
          .forEach((scope) => companyIds.add(scope.targetId));
      }
      if (assignment.scopeType === 'DEPARTMENT' && context.user.employee?.departmentId) {
        departmentIds.add(context.user.employee.departmentId);
      }
      if (assignment.scopeType === 'DEPARTMENT_AND_CHILDREN' && context.user.employee?.departmentId) {
        const departments = await this.prisma.department.findMany({
          where: context.user.employee.companyId
            ? { companyId: context.user.employee.companyId }
            : undefined,
          select: { id: true, parentId: true },
        });
        const allowed = new Set([context.user.employee.departmentId]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const department of departments) {
            if (department.parentId && allowed.has(department.parentId) && !allowed.has(department.id)) {
              allowed.add(department.id);
              changed = true;
            }
          }
        }
        allowed.forEach((departmentId) => departmentIds.add(departmentId));
      }
    }
    if (companyIds.size > 0) clauses.push({ companyId: { in: [...companyIds] } });
    if (departmentIds.size > 0) clauses.push({ departmentId: { in: [...departmentIds] } });
    if (clauses.length === 0) return { id: { equals: '__NO_ACCESS__' } };
    return clauses.length === 1 ? clauses[0] : { OR: clauses };
  }

  async getOrderScope(userId: string): Promise<Prisma.OrderWhereInput> {
    return { contract: await this.getContractScope(userId) };
  }

  async getDispatchNoticeScope(userId: string): Promise<Prisma.DispatchNoticeWhereInput> {
    return { order: await this.getOrderScope(userId) };
  }

  async getWaybillScope(userId: string): Promise<Prisma.WaybillWhereInput> {
    return { dispatchNotice: await this.getDispatchNoticeScope(userId) };
  }

  async getWeighTicketScope(userId: string): Promise<Prisma.WeighTicketWhereInput> {
    return { waybill: await this.getWaybillScope(userId) };
  }

  async getQualityInspectionScope(userId: string): Promise<Prisma.QualityInspectionWhereInput> {
    return { weighTicket: await this.getWeighTicketScope(userId) };
  }

  async getQualityTaskScope(userId: string): Promise<Prisma.QualityTaskWhereInput> {
    return { waybill: await this.getWaybillScope(userId) };
  }

  async getInboundReceiptScope(userId: string): Promise<Prisma.InboundReceiptWhereInput> {
    return { waybill: await this.getWaybillScope(userId) };
  }

  async getBusinessInboundScope(userId: string): Promise<Prisma.BusinessInboundWhereInput> {
    return { receipt: await this.getInboundReceiptScope(userId) };
  }

  async getInventoryLotScope(userId: string): Promise<Prisma.InventoryLotWhereInput> {
    return {
      OR: [
        { businessInbound: await this.getBusinessInboundScope(userId) },
        { productionCompletion: { task: await this.getProductionTaskScope(userId) } },
      ],
    };
  }

  async getProductionTaskScope(userId: string): Promise<Prisma.ProductionTaskWhereInput> {
    const context = await this.getContext(userId);
    if (context.isAdmin || context.assignments.some((assignment) => assignment.scopeType === 'ALL')) return {};
    if (context.isExternal) {
      if (!context.externalPartnerId) {
        throw new ForbiddenException('外部企业未关联合作伙伴，无法确定生产任务数据范围');
      }
      return {
        OR: [
          { ownerPartnerId: context.externalPartnerId },
          { processorOrganization: { partnerId: context.externalPartnerId } },
        ],
      };
    }
    const clauses: Prisma.ProductionTaskWhereInput[] = [{ createdBy: userId }];
    if (context.user.company?.partnerId) clauses.push({ ownerPartnerId: context.user.company.partnerId });
    return { OR: clauses };
  }

  async getProductionRecipeScope(userId: string): Promise<Prisma.ProductionRecipeWhereInput> {
    const context = await this.getContext(userId);
    if (context.isAdmin || context.assignments.some((assignment) => assignment.scopeType === 'ALL')) return {};
    if (context.externalPartnerId) return { ownerPartnerId: context.externalPartnerId };
    if (context.user.company?.partnerId) return { ownerPartnerId: context.user.company.partnerId };
    return { createdBy: userId };
  }

  async getInventoryLedgerScope(userId: string): Promise<Prisma.InventoryLedgerWhereInput> {
    return { lot: await this.getInventoryLotScope(userId) };
  }

  async getOutboundReceiptScope(userId: string): Promise<Prisma.OutboundReceiptWhereInput> {
    return { waybill: await this.getWaybillScope(userId) };
  }

  async getSalesOutboundScope(userId: string): Promise<Prisma.SalesOutboundWhereInput> {
    return { receipt: await this.getOutboundReceiptScope(userId) };
  }

  async getInventoryReversalScope(userId: string): Promise<Prisma.InventoryReversalWhereInput> {
    return {
      OR: [
        { businessInbound: await this.getBusinessInboundScope(userId) },
        { salesOutbound: await this.getSalesOutboundScope(userId) },
      ],
    };
  }
}
