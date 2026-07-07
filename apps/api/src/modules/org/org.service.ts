import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrgService {
  constructor(private prisma: PrismaService) {}

  // ========== 企业 ==========

  async createCompany(data: {
    code: string; name: string; shortName?: string;
    type?: string; partnerId?: string; parentId?: string;
  }) {
    const exists = await this.prisma.company.findUnique({ where: { code: data.code } });
    if (exists) throw new ConflictException(`企业编码 ${data.code} 已存在`);
    return this.prisma.company.create({ data });
  }

  async findAllCompanies(type?: string) {
    return this.prisma.company.findMany({
      where: type ? { type } : undefined,
      include: {
        departments: { select: { id: true, name: true } },
        partner: { select: { id: true, code: true, name: true } },
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

  async deleteDepartment(id: string) {
    return this.prisma.department.delete({ where: { id } });
  }

  // ========== 员工 ==========

  async createEmployee(data: {
    name: string; departmentId: string; companyId: string;
    position?: string; phone?: string; email?: string;
  }) {
    return this.prisma.employee.create({ data });
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
