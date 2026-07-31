import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const EMPLOYEE_PHONE_PATTERN = /^1[3-9][0-9]{9}$/;

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
    return this.prisma.company.update({ where: { id }, data });
  }

  // ========== 部门 ==========

  async createDepartment(data: { name: string; companyId: string; parentId?: string; sort?: number }) {
    return this.prisma.department.create({ data });
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
    return this.prisma.department.update({ where: { id }, data });
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
  }) {
    const phone = this.normalizeEmployeePhone(data.phone);
    const [existingEmployee, conflictingUser] = await Promise.all([
      this.prisma.employee.findFirst({ where: { phone }, select: { id: true } }),
      this.prisma.user.findFirst({ where: { username: phone }, select: { employeeId: true } }),
    ]);
    if (existingEmployee) throw new ConflictException('员工手机号已存在');
    if (conflictingUser) throw new ConflictException('该手机号已被其他登录用户名占用');

    return this.prisma.employee.create({
      data: {
        ...data,
        name: data.name.trim(),
        phone,
        position: data.position?.trim() || undefined,
        email: data.email?.trim() || undefined,
      },
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

  async updateEmployee(id: string, data: {
    name?: string; departmentId?: string; companyId?: string;
    phone?: string; position?: string; email?: string; status?: string;
  }) {
    await this.findEmployeeById(id);
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
    return this.prisma.employee.update({
      where: { id },
      data: {
        ...data,
        name: data.name?.trim(),
        phone,
        position: data.position === undefined ? undefined : data.position.trim() || null,
        email: data.email === undefined ? undefined : data.email.trim() || null,
      },
      include: {
        company: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, name: true } },
        user: { select: { id: true, username: true, status: true, role: true, createdAt: true } },
      },
    });
  }

  async deleteEmployee(id: string) {
    return this.prisma.employee.delete({ where: { id } });
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
