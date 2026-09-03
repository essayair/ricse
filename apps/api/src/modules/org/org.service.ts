import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const EMPLOYEE_PHONE_PATTERN = /^1[3-9][0-9]{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORG_STATUSES = ['ACTIVE', 'DISABLED'] as const;
const EMPLOYEE_STATUSES = ['ACTIVE', 'DISABLED', 'RESIGNED'] as const;

@Injectable()
export class OrgService {
  constructor(private prisma: PrismaService) {}

  private normalizeEmployeePhone(phone: string) {
    const normalized = phone?.trim();
    if (!normalized) {
      throw new BadRequestException('请填写员工手机号');
    }
    if (!EMPLOYEE_PHONE_PATTERN.test(normalized)) {
      throw new BadRequestException('员工手机号必须为11位中国大陆手机号');
    }
    return normalized;
  }

  private normalizeName(name: string | undefined, label: string) {
    const normalized = name?.trim();
    if (!normalized) throw new BadRequestException(`请填写${label}`);
    return normalized;
  }

  private normalizeEmail(email: string | undefined) {
    const normalized = email?.trim();
    if (!normalized) return undefined;
    if (!EMAIL_PATTERN.test(normalized)) throw new BadRequestException('请填写有效的邮箱地址');
    return normalized;
  }

  private validateStatus(status: string | undefined, label: string) {
    const allowedStatuses = label === '员工' ? EMPLOYEE_STATUSES : ORG_STATUSES;
    if (status !== undefined && !(allowedStatuses as readonly string[]).includes(status)) {
      throw new BadRequestException(`无效的${label}状态`);
    }
  }

  private async validateCompanyAndDepartment(companyId: string, departmentId: string) {
    const [company, department] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, status: true, type: true } }),
      this.prisma.department.findUnique({ where: { id: departmentId }, select: { id: true, companyId: true } }),
    ]);
    if (!company) throw new BadRequestException('所属企业不存在');
    if (company.status !== 'ACTIVE') throw new BadRequestException('所属企业已停用');
    if (!department) throw new BadRequestException('所属部门不存在');
    if (department.companyId !== companyId) throw new BadRequestException('所属部门不属于所选企业');
    return company;
  }

  // ========== 企业 ==========

  async createCompany(data: {
    partnerId: string; parentId?: string;
  }) {
    // 从合作伙伴拉取基本信息
    const partner = await this.prisma.partner.findUnique({
      where: { id: data.partnerId },
      select: { code: true, name: true, shortName: true, isInternal: true },
    });
    if (!partner) throw new NotFoundException('合作伙伴不存在');

    const code = partner.code;
    const exists = await this.prisma.company.findUnique({ where: { code } });
    if (exists) throw new ConflictException(`企业编码 ${code} 已存在`);

    return this.prisma.company.create({
      data: {
        code,
        name: partner.name,
        shortName: partner.shortName,
        type: partner.isInternal ? 'INTERNAL' : 'EXTERNAL',
        partnerId: data.partnerId,
        parentId: data.parentId,
      },
      include: { partner: { select: { id: true, code: true, name: true } } },
    });
  }

  async findAllCompanies(type?: string) {
    return this.prisma.company.findMany({
      where: type ? { type } : undefined,
      include: {
        departments: { select: { id: true, name: true } },
        partner: { select: { id: true, code: true, name: true } },
        _count: { select: { departments: true, employees: true, users: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findCompanyTree() {
    return this.prisma.company.findMany({
      where: { parentId: null },
      include: {
        children: { include: { children: true } },
        departments: {
          where: { parentId: null },
          include: { children: true },
          orderBy: { sort: 'asc' },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findCompanyById(id: string) {
    const c = await this.prisma.company.findUnique({
      where: { id },
      include: {
        partner: { select: { id: true, code: true, name: true } },
        departments: { orderBy: { sort: 'asc' } },
        employees: { include: { department: { select: { id: true, name: true } } } },
      },
    });
    if (!c) throw new NotFoundException('企业不存在');
    return c;
  }

  async updateCompany(id: string, data: { name?: string; shortName?: string; status?: string; parentId?: string }) {
    await this.findCompanyById(id);
    this.validateStatus(data.status, '企业');
    if (data.status === 'DISABLED') {
      const [companyAdminCount, otherAdminCount] = await Promise.all([
        this.prisma.userRoleAssignment.count({
          where: {
            role: { code: 'ADMIN' }, status: 'ACTIVE',
            user: {
              companyId: id, status: 'ACTIVE',
              OR: [{ employeeId: null }, { employee: { is: { status: 'ACTIVE' } } }],
            },
          },
        }),
        this.prisma.userRoleAssignment.count({
          where: {
            role: { code: 'ADMIN' }, status: 'ACTIVE',
            user: {
              status: 'ACTIVE',
              AND: [
                { OR: [{ employeeId: null }, { employee: { is: { status: 'ACTIVE' } } }] },
                { OR: [{ companyId: null }, { companyId: { not: id }, company: { is: { status: 'ACTIVE' } } }] },
              ],
            },
          },
        }),
      ]);
      if (companyAdminCount > 0 && otherAdminCount === 0) {
        throw new BadRequestException('停用该企业将导致系统无有效管理员，请先调整管理员归属');
      }
    }
    return this.prisma.company.update({ where: { id }, data });
  }

  // ========== 部门 ==========

  async createDepartment(data: { name: string; companyId: string; parentId?: string; sort?: number }) {
    const company = await this.prisma.company.findUnique({ where: { id: data.companyId }, select: { id: true, status: true } });
    if (!company) throw new BadRequestException('所属企业不存在');
    if (company.status !== 'ACTIVE') throw new BadRequestException('所属企业已停用');
    if (data.parentId) {
      const parent = await this.prisma.department.findUnique({ where: { id: data.parentId }, select: { companyId: true } });
      if (!parent || parent.companyId !== data.companyId) throw new BadRequestException('上级部门不属于所选企业');
    }
    return this.prisma.department.create({ data: { ...data, name: this.normalizeName(data.name, '部门名称') } });
  }

  async findAllDepartments(companyId?: string) {
    return this.prisma.department.findMany({
      where: companyId ? { companyId } : undefined,
      include: { company: { select: { id: true, code: true, name: true } } },
      orderBy: { sort: 'asc' },
    });
  }

  async getDepartmentTree(companyId: string) {
    return this.prisma.department.findMany({
      where: { companyId, parentId: null },
      include: {
        children: {
          include: { children: true },
          orderBy: { sort: 'asc' },
        },
      },
      orderBy: { sort: 'asc' },
    });
  }

  async updateDepartment(id: string, data: { name?: string; parentId?: string; sort?: number }) {
    const current = await this.prisma.department.findUnique({ where: { id }, select: { companyId: true } });
    if (!current) throw new NotFoundException('部门不存在');
    if (data.parentId === id) throw new BadRequestException('部门不能作为自己的上级部门');
    if (data.parentId) {
      const parent = await this.prisma.department.findUnique({ where: { id: data.parentId }, select: { companyId: true } });
      if (!parent || parent.companyId !== current.companyId) throw new BadRequestException('上级部门与当前部门不属于同一企业');
    }
    return this.prisma.department.update({
      where: { id },
      data: { ...data, name: data.name === undefined ? undefined : this.normalizeName(data.name, '部门名称') },
    });
  }

  async reorderDepartments(companyId: string, orderedIds: string[]) {
    const updates = orderedIds.map((id, index) =>
      this.prisma.department.update({
        where: { id },
        data: { sort: index },
      })
    );
    return this.prisma.$transaction(updates);
  }

  async deleteDepartment(id: string) {
    return this.prisma.department.delete({ where: { id } });
  }

  // ========== 员工 ==========

  async createEmployee(data: {
    name: string; departmentId: string; companyId: string;
    phone: string; position?: string; email?: string; status?: string;
  }, operatedBy?: string) {
    this.validateStatus(data.status, '员工');
    const phone = this.normalizeEmployeePhone(data.phone);
    const name = this.normalizeName(data.name, '员工姓名');
    const email = this.normalizeEmail(data.email);
    await this.validateCompanyAndDepartment(data.companyId, data.departmentId);
    const [existingEmployee, conflictingUser] = await Promise.all([
      this.prisma.employee.findFirst({ where: { phone }, select: { id: true } }),
      this.prisma.user.findFirst({ where: { username: phone }, select: { employeeId: true } }),
    ]);
    if (existingEmployee) throw new ConflictException('员工手机号已存在');
    if (conflictingUser) throw new ConflictException('该手机号已被其他登录用户名占用');

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: { ...data, name, phone, position: data.position?.trim() || undefined, email },
      });
      if (operatedBy) {
        await tx.businessOperationLog.create({
          data: {
            businessType: 'EMPLOYEE', businessId: employee.id, action: 'CREATE', actionLabel: '创建员工', operatorId: operatedBy,
            details: { companyId: data.companyId, departmentId: data.departmentId },
          },
        });
      }
      return employee;
    });
  }

  async findAllEmployees(companyId?: string, departmentId?: string) {
    return this.prisma.employee.findMany({
      where: {
        ...(companyId && { companyId }),
        ...(departmentId && { departmentId }),
      },
      include: {
        company: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, name: true } },
        user: { select: { id: true, username: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findEmployeeById(id: string) {
    const emp = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, name: true } },
        user: { select: { id: true, username: true, status: true, role: true, createdAt: true } },
      },
    });
    if (!emp) throw new NotFoundException('员工不存在');
    return emp;
  }

  async findEmployeeOperationLogs(id: string) {
    const employee = await this.findEmployeeById(id);
    return this.prisma.businessOperationLog.findMany({
      where: {
        OR: [
          { businessType: 'EMPLOYEE', businessId: id },
          ...(employee.user ? [{ businessType: 'USER', businessId: employee.user.id }] : []),
        ],
      },
      include: { operator: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateEmployee(id: string, data: {
    name?: string; departmentId?: string; companyId?: string;
    phone?: string; position?: string; email?: string; status?: string;
  }, operatedBy?: string) {
    const current = await this.findEmployeeById(id);
    this.validateStatus(data.status, '员工');
    const companyId = data.companyId ?? current.company?.id;
    const departmentId = data.departmentId ?? current.department?.id;
    const targetEmployeeStatus = data.status ?? current.status;
    if (!companyId || !departmentId) throw new BadRequestException('员工必须关联企业和部门');
    const targetCompany = await this.validateCompanyAndDepartment(companyId, departmentId);
    if (current.user && companyId !== current.company?.id && targetCompany.type === 'EXTERNAL') {
      const [adminAssignment, activeAccountCount] = await Promise.all([
        this.prisma.userRoleAssignment.findFirst({
          where: { userId: current.user.id, status: 'ACTIVE', role: { code: 'ADMIN' } },
          select: { id: true },
        }),
        this.prisma.user.count({ where: { companyId, status: 'ACTIVE' } }),
      ]);
      if (adminAssignment) throw new BadRequestException('系统管理员不能调入外部企业，请先调整账号角色');
      if (current.user.status === 'ACTIVE' && targetEmployeeStatus === 'ACTIVE' && activeAccountCount >= 6) {
        throw new BadRequestException('目标外部企业已达到 6 个有效账号上限');
      }
    }
    if (current.user && current.status === 'ACTIVE' && data.status !== undefined && data.status !== 'ACTIVE') {
      const adminAssignment = await this.prisma.userRoleAssignment.findFirst({
        where: { userId: current.user.id, status: 'ACTIVE', role: { code: 'ADMIN' } },
        select: { id: true },
      });
      if (adminAssignment) {
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
    }
    const name = data.name === undefined ? undefined : this.normalizeName(data.name, '员工姓名');
    const email = data.email === undefined ? undefined : this.normalizeEmail(data.email) || null;
    const phone = data.phone === undefined ? undefined : this.normalizeEmployeePhone(data.phone);
    if (phone !== undefined) {
      const [existingEmployee, conflictingUser] = await Promise.all([
        this.prisma.employee.findFirst({
          where: { phone, id: { not: id } },
          select: { id: true },
        }),
        this.prisma.user.findFirst({
          where: { username: phone, employeeId: { not: id } },
          select: { id: true },
        }),
      ]);
      if (existingEmployee) throw new ConflictException('员工手机号已存在');
      if (conflictingUser) throw new ConflictException('该手机号已被其他登录用户名占用');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id },
        data: {
          ...data,
          name,
          phone,
          position: data.position === undefined ? undefined : data.position.trim() || null,
          email,
        },
        include: {
          company: { select: { id: true, code: true, name: true } },
          department: { select: { id: true, name: true } },
          user: { select: { id: true, username: true, status: true, role: true, createdAt: true } },
        },
      });

      if (current.user) {
        await tx.user.update({
          where: { id: current.user.id },
          data: {
            companyId,
            name,
            phone,
            email,
            ...(data.status !== undefined && data.status !== 'ACTIVE' ? { status: 'DISABLED', refreshToken: null } : {}),
          },
        });
        if (companyId !== current.company?.id) {
          const assignments = await tx.userRoleAssignment.findMany({
            where: { userId: current.user.id },
            include: { role: { select: { code: true } } },
          });
          for (const assignment of assignments) {
            if (assignment.role.code === 'ADMIN') continue;
            await tx.userRoleAssignment.update({ where: { id: assignment.id }, data: { scopeType: 'COMPANY' } });
            await tx.userRoleScope.deleteMany({ where: { assignmentId: assignment.id } });
            await tx.userRoleScope.create({
              data: { assignmentId: assignment.id, targetType: 'COMPANY', targetId: companyId },
            });
          }
        }
      }
      if (operatedBy) {
        const action = data.status === 'RESIGNED'
          ? 'RESIGN'
          : data.status === 'DISABLED'
            ? 'DISABLE'
            : data.status === 'ACTIVE'
              ? current.status === 'RESIGNED' ? 'REHIRE' : 'ENABLE'
              : 'UPDATE';
        const actionLabel = data.status === 'RESIGNED'
          ? '办理员工离职'
          : data.status === 'DISABLED'
            ? '停用员工'
            : data.status === 'ACTIVE'
              ? current.status === 'RESIGNED' ? '重新入职' : '恢复员工'
              : '修改员工';
        await tx.businessOperationLog.create({
          data: {
            businessType: 'EMPLOYEE', businessId: id, action, actionLabel, operatorId: operatedBy,
            details: { changedFields: Object.keys(data), accountDisabled: data.status !== undefined && data.status !== 'ACTIVE' && Boolean(current.user) },
          },
        });
      }
      return updated;
    });
  }

  async deleteEmployee(id: string, operatedBy?: string) {
    const employee = await this.findEmployeeById(id);
    if (employee.user) {
      throw new BadRequestException('该员工已开通账号，请改为停用，不能删除历史档案');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.employee.delete({ where: { id } });
      if (operatedBy) {
        await tx.businessOperationLog.create({
          data: {
            businessType: 'EMPLOYEE', businessId: id, action: 'DELETE', actionLabel: '删除误建员工', operatorId: operatedBy,
            details: { name: employee.name, companyId: employee.company?.id, departmentId: employee.department?.id },
          },
        });
      }
    });
  }

  // ========== 业务组 ==========

  async createBusinessGroup(data: { name: string; description?: string; companyIds?: string[] }) {
    return this.prisma.businessGroup.create({
      data: {
        name: data.name,
        description: data.description,
        companies: data.companyIds
          ? { create: data.companyIds.map((cid) => ({ companyId: cid })) }
          : undefined,
      },
      include: { companies: { include: { company: { select: { id: true, code: true, name: true } } } } },
    });
  }

  async findAllBusinessGroups() {
    return this.prisma.businessGroup.findMany({
      include: {
        companies: { include: { company: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateBusinessGroup(id: string, data: { name?: string; description?: string; companyIds?: string[] }) {
    if (data.companyIds) {
      await this.prisma.businessGroupCompany.deleteMany({ where: { businessGroupId: id } });
      await this.prisma.businessGroupCompany.createMany({
        data: data.companyIds.map((cid) => ({ businessGroupId: id, companyId: cid })),
      });
    }
    return this.prisma.businessGroup.update({
      where: { id },
      data: { name: data.name, description: data.description },
      include: { companies: { include: { company: { select: { id: true, code: true, name: true } } } } },
    });
  }

  async deleteBusinessGroup(id: string) {
    return this.prisma.businessGroup.delete({ where: { id } });
  }
}
