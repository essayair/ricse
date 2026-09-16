import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isExternalBusinessPermission } from '../common/external-permission-policy';

const SCOPE_TYPES = [
  'SELF',
  'DEPARTMENT',
  'DEPARTMENT_AND_CHILDREN',
  'COMPANY',
  'SPECIFIED_COMPANIES',
  'BUSINESS_UNIT',
  'ALL',
] as const;

const PROTECTED_PERMISSION_ROLE_CODES = new Set([
  'ADMIN',
  'BUSINESS_MANAGER',
  'RISK_MANAGER',
  'BUSINESS_OWNER',
  'GENERAL_MANAGER',
]);

const INTERNAL_APPROVAL_ROLE_CODES = new Set([
  'BUSINESS_MANAGER',
  'RISK_MANAGER',
  'BUSINESS_OWNER',
  'GENERAL_MANAGER',
]);

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
        _count: {
          select: {
            assignments: {
              where: { status: 'ACTIVE', user: { status: 'ACTIVE' } },
            },
          },
        },
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
    if (PROTECTED_PERMISSION_ROLE_CODES.has(role.code)) {
      throw new BadRequestException('系统管理员和审批路由角色使用受控权限模板，不能在页面中直接修改');
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
        businessUnits: {
          include: { businessUnit: true },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
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
      targetBusinessUnitIds?: string[];
      expiresAt?: string | null;
    }>,
    assignedBy: string,
    membership?: { businessUnitIds?: string[]; defaultBusinessUnitId?: string | null },
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
      include: { permissions: { include: { permission: true } } },
    });
    if (roles.length !== roleIds.length) throw new BadRequestException('包含不存在或已停用的角色');
    const adminRole = roles.find((role) => role.code === 'ADMIN');
    if (adminRole && roles.length > 1) {
      throw new BadRequestException('系统管理员已经拥有全部权限，不能再叠加其他角色');
    }

    const externalCompany = user.company?.type === 'EXTERNAL' ? user.company : null;
    if (externalCompany && roles.some((role) => role.code === 'ADMIN')) {
      throw new BadRequestException('外部企业账号不能授予平台系统管理员角色');
    }
    if (externalCompany && roles.some((role) => INTERNAL_APPROVAL_ROLE_CODES.has(role.code))) {
      throw new BadRequestException('外部企业账号不能授予内部合同审批角色');
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

    const currentMemberships = (await this.prisma.userBusinessUnit.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { businessUnitId: true, isDefault: true },
    })) || [];
    const businessUnitIds = [...new Set(
      membership?.businessUnitIds === undefined
        ? currentMemberships.map((item) => item.businessUnitId)
        : membership.businessUnitIds,
    )];
    const defaultBusinessUnitId = membership?.defaultBusinessUnitId === undefined
      ? currentMemberships.find((item) => item.isDefault)?.businessUnitId || businessUnitIds[0] || null
      : membership.defaultBusinessUnitId;
    if (externalCompany && businessUnitIds.length > 0) {
      throw new BadRequestException('外部企业账号不配置内部业务单元');
    }
    if (!externalCompany && user.companyId && businessUnitIds.length === 0) {
      throw new BadRequestException('内部企业账号至少需要归属一个业务单元');
    }
    if (defaultBusinessUnitId && !businessUnitIds.includes(defaultBusinessUnitId)) {
      throw new BadRequestException('默认业务单元必须包含在所属业务单元中');
    }
    if (businessUnitIds.length) {
      const units = await this.prisma.businessUnit.findMany({
        where: { id: { in: businessUnitIds }, status: 'ACTIVE', company: { type: 'INTERNAL', status: 'ACTIVE' } },
        select: { id: true },
      });
      if (units.length !== businessUnitIds.length) throw new BadRequestException('所属业务单元包含不存在或已停用的数据');
    }
    for (const item of normalized) {
      if (item.scopeType !== 'BUSINESS_UNIT') continue;
      const unitIds = [...new Set(item.targetBusinessUnitIds || [])];
      if (unitIds.length === 0) throw new BadRequestException('业务单元范围至少选择一个业务单元');
      if (unitIds.some((id) => !businessUnitIds.includes(id))) {
        throw new BadRequestException('角色适用业务单元必须包含在用户所属业务单元中');
      }
    }

    const targetIds = [...new Set(normalized.flatMap((item) => item.targetCompanyIds || []))];
    if (targetIds.length) {
      const companyCount = await this.prisma.company.count({ where: { id: { in: targetIds } } });
      if (companyCount !== targetIds.length) throw new BadRequestException('数据范围包含不存在的企业');
    }

    await this.prisma.$transaction(async (tx) => {
      if (membership?.businessUnitIds !== undefined && !externalCompany) {
        await tx.userBusinessUnit.deleteMany({ where: { userId } });
        if (businessUnitIds.length) {
          await tx.userBusinessUnit.createMany({
            data: businessUnitIds.map((businessUnitId) => ({
              userId,
              businessUnitId,
              isDefault: businessUnitId === defaultBusinessUnitId,
            })),
          });
        }
      }
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
        if (item.scopeType === 'BUSINESS_UNIT' && item.targetBusinessUnitIds?.length) {
          await tx.userRoleScope.createMany({
            data: [...new Set(item.targetBusinessUnitIds)].map((targetId) => ({
              assignmentId: assignment.id,
              targetType: 'BUSINESS_UNIT',
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
    let permissionCodes = activeAssignments.flatMap((assignment) =>
      assignment.role.permissions.map((entry) => entry.permission.code),
    );
    if (user.company?.type === 'EXTERNAL') {
      permissionCodes = permissionCodes.filter(isExternalBusinessPermission);
    }
    const permissions = new Set(
      permissionCodes,
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

  async getBusinessUnitOptions(userId: string, permissionCode?: string) {
    const context = await this.getContext(userId);
    const now = new Date();
    if (context.isExternal) return [];
    if (context.isAdmin) {
      return this.prisma.businessUnit.findMany({
        where: { status: 'ACTIVE' },
        include: { company: { select: { id: true, code: true, name: true } } },
        orderBy: [{ companyId: 'asc' }, { code: 'asc' }],
      });
    }

    const membershipIds = context.user.businessUnits
      .filter((item) => item.status === 'ACTIVE'
        && item.effectiveAt <= now
        && (!item.expiresAt || item.expiresAt > now))
      .map((item) => item.businessUnitId);
    const assignments = permissionCode
      ? context.assignments.filter((assignment) =>
        assignment.role.permissions.some((entry) => entry.permission.code === permissionCode))
      : context.assignments;
    const allowedIds = new Set<string>();
    const companyIds = new Set<string>();
    let allMemberships = false;
    for (const assignment of assignments) {
      if (assignment.scopeType === 'ALL') allMemberships = true;
      if (assignment.scopeType === 'BUSINESS_UNIT') {
        assignment.scopes
          .filter((scope) => scope.targetType === 'BUSINESS_UNIT')
          .forEach((scope) => allowedIds.add(scope.targetId));
      }
      // 内部账号的“本企业”权限在新模型中表示其管理组织内的全部已加入事业部，
      // 不再拿签约法律主体与事业部做归属匹配。
      if (assignment.scopeType === 'COMPANY') allMemberships = true;
      if (assignment.scopeType === 'SPECIFIED_COMPANIES') {
        assignment.scopes
          .filter((scope) => scope.targetType === 'COMPANY')
          .forEach((scope) => companyIds.add(scope.targetId));
      }
      if (['SELF', 'DEPARTMENT', 'DEPARTMENT_AND_CHILDREN'].includes(assignment.scopeType)) allMemberships = true;
    }
    const units = context.user.businessUnits
      .filter((item) => membershipIds.includes(item.businessUnitId))
      .filter((item) => allMemberships || allowedIds.has(item.businessUnitId) || companyIds.has(item.businessUnit.companyId))
      .map((item) => ({ ...item.businessUnit, isDefault: item.isDefault }));
    return units;
  }

  async getContractScope(userId: string, permissionCode = 'contract.view'): Promise<Prisma.ContractWhereInput> {
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
          {
            status: 'DRAFT',
            creator: { companyId: context.user.company!.id },
          },
        ],
      };
    }

    const permissionAssignments = context.assignments.filter((assignment) =>
      assignment.role.permissions.some((entry) => entry.permission.code === permissionCode),
    );
    if (permissionAssignments.some((assignment) => assignment.scopeType === 'ALL')) return {};

    const clauses: Prisma.ContractWhereInput[] = [];
    const companyIds = new Set<string>();
    const departmentIds = new Set<string>();
    const businessUnitIds = new Set<string>();
    for (const assignment of permissionAssignments) {
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
      if (assignment.scopeType === 'BUSINESS_UNIT') {
        assignment.scopes
          .filter((scope) => scope.targetType === 'BUSINESS_UNIT')
          .forEach((scope) => businessUnitIds.add(scope.targetId));
      }
    }
    if (companyIds.size > 0) clauses.push({ companyId: { in: [...companyIds] } });
    if (departmentIds.size > 0) clauses.push({ departmentId: { in: [...departmentIds] } });
    if (businessUnitIds.size > 0) clauses.push({ businessUnitId: { in: [...businessUnitIds] } });
    if (clauses.length === 0) return { id: { equals: '__NO_ACCESS__' } };
    return clauses.length === 1 ? clauses[0] : { OR: clauses };
  }

  async getOrderScope(userId: string, permissionCode = 'execution.view'): Promise<Prisma.OrderWhereInput> {
    return { contract: await this.getContractScope(userId, permissionCode) };
  }

  async getDispatchNoticeScope(userId: string, permissionCode = 'execution.view'): Promise<Prisma.DispatchNoticeWhereInput> {
    return { order: await this.getOrderScope(userId, permissionCode) };
  }

  async getWaybillScope(userId: string, permissionCode = 'logistics.view'): Promise<Prisma.WaybillWhereInput> {
    return { dispatchNotice: await this.getDispatchNoticeScope(userId, permissionCode) };
  }

  async getWeighTicketScope(userId: string, permissionCode = 'quality.view'): Promise<Prisma.WeighTicketWhereInput> {
    return { waybill: await this.getWaybillScope(userId, permissionCode) };
  }

  async getQualityInspectionScope(userId: string, permissionCode = 'quality.view'): Promise<Prisma.QualityInspectionWhereInput> {
    return { weighTicket: await this.getWeighTicketScope(userId, permissionCode) };
  }

  async getQualityTaskScope(userId: string, permissionCode = 'quality.view'): Promise<Prisma.QualityTaskWhereInput> {
    return { waybill: await this.getWaybillScope(userId, permissionCode) };
  }

  async getInboundReceiptScope(userId: string, permissionCode = 'inventory.view'): Promise<Prisma.InboundReceiptWhereInput> {
    return { waybill: await this.getWaybillScope(userId, permissionCode) };
  }

  async getBusinessInboundScope(userId: string, permissionCode = 'inventory.view'): Promise<Prisma.BusinessInboundWhereInput> {
    return { receipt: await this.getInboundReceiptScope(userId, permissionCode) };
  }

  async getInventoryLotScope(userId: string, permissionCode = 'inventory.view'): Promise<Prisma.InventoryLotWhereInput> {
    return {
      OR: [
        { businessInbound: await this.getBusinessInboundScope(userId, permissionCode) },
        { productionCompletion: { task: await this.getProductionTaskScope(userId, permissionCode) } },
      ],
    };
  }

  async getProductionTaskScope(userId: string, permissionCode = 'production.view'): Promise<Prisma.ProductionTaskWhereInput> {
    const context = await this.getContext(userId);
    const permissionAssignments = context.assignments.filter((assignment) =>
      assignment.role.permissions.some((entry) => entry.permission.code === permissionCode),
    );
    if (context.isAdmin || permissionAssignments.some((assignment) => assignment.scopeType === 'ALL')) return {};
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
    const clauses: Prisma.ProductionTaskWhereInput[] = [];
    const businessUnitIds = new Set<string>();
    const companyIds = new Set<string>();
    for (const assignment of permissionAssignments) {
      if (assignment.scopeType === 'SELF') clauses.push({ createdBy: userId });
      if (assignment.scopeType === 'BUSINESS_UNIT') {
        assignment.scopes
          .filter(scope => scope.targetType === 'BUSINESS_UNIT')
          .forEach(scope => businessUnitIds.add(scope.targetId));
      }
      if (assignment.scopeType === 'COMPANY' && context.user.employee?.companyId) {
        companyIds.add(context.user.employee.companyId);
      }
      if (assignment.scopeType === 'SPECIFIED_COMPANIES') {
        assignment.scopes
          .filter(scope => scope.targetType === 'COMPANY')
          .forEach(scope => companyIds.add(scope.targetId));
      }
      if (assignment.scopeType === 'DEPARTMENT' && context.user.employee?.departmentId) {
        clauses.push({ creator: { employee: { departmentId: context.user.employee.departmentId } } });
      }
    }
    if (businessUnitIds.size) clauses.push({ businessUnitId: { in: [...businessUnitIds] } });
    if (companyIds.size) clauses.push({ businessUnit: { companyId: { in: [...companyIds] } } });
    return clauses.length ? { OR: clauses } : { id: { equals: '__NO_ACCESS__' } };
  }

  async getProductionRecipeScope(userId: string, permissionCode = 'production.view'): Promise<Prisma.ProductionRecipeWhereInput> {
    const context = await this.getContext(userId);
    const permissionAssignments = context.assignments.filter((assignment) =>
      assignment.role.permissions.some((entry) => entry.permission.code === permissionCode),
    );
    if (context.isAdmin || permissionAssignments.some((assignment) => assignment.scopeType === 'ALL')) return {};
    if (context.externalPartnerId) return { ownerPartnerId: context.externalPartnerId };
    // 生产方案以法律/货权主体维护，但内部授权按管理组织和业务单元控制。
    // 不能再用账号所属企业的 partnerId 限制方案，否则其他内部签约主体的方案无法使用。
    if (permissionAssignments.some((assignment) => assignment.scopeType !== 'SELF')) {
      return { ownerPartner: { isInternal: true, status: 'ACTIVE', deletedAt: null } };
    }
    return { createdBy: userId };
  }

  async getInventoryLedgerScope(userId: string, permissionCode = 'inventory.view'): Promise<Prisma.InventoryLedgerWhereInput> {
    return { lot: await this.getInventoryLotScope(userId, permissionCode) };
  }

  async getOutboundReceiptScope(userId: string, permissionCode = 'inventory.view'): Promise<Prisma.OutboundReceiptWhereInput> {
    return { waybill: await this.getWaybillScope(userId, permissionCode) };
  }

  async getSalesOutboundScope(userId: string, permissionCode = 'inventory.view'): Promise<Prisma.SalesOutboundWhereInput> {
    return { receipt: await this.getOutboundReceiptScope(userId, permissionCode) };
  }

  async getInventoryReversalScope(userId: string, permissionCode = 'inventory.view'): Promise<Prisma.InventoryReversalWhereInput> {
    return {
      OR: [
        { businessInbound: await this.getBusinessInboundScope(userId, permissionCode) },
        { salesOutbound: await this.getSalesOutboundScope(userId, permissionCode) },
      ],
    };
  }
}
