import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class MasterDataService {
  constructor(private prisma: PrismaService) {}

  // ===== 物料分类 =====

  async createCategory(data: { name: string; parentId?: string; sort?: number }) {
    return this.prisma.materialCategory.create({ data });
  }

  async findAllCategories() {
    return this.prisma.materialCategory.findMany({
      where: { parentId: null },
      include: { children: { orderBy: { sort: 'asc' } } },
      orderBy: { sort: 'asc' },
    });
  }

  // ===== 物料 =====

  async generateNextMaterialCode(): Promise<string> {
    const last = await this.prisma.material.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    let nextNum = 1;
    if (last) {
      const num = parseInt(last.code.replace(/\D/g, ''), 10);
      if (!isNaN(num)) nextNum = num + 1;
    }
    return `MAT${String(nextNum).padStart(4, '0')}`;
  }

  async createMaterial(data: {
    code: string;
    name: string;
    categoryId: string;
    grade?: string;
    unit?: string;
    spec?: string;
    sourceRegion?: string;
    packageType?: string;
    isVirtual?: boolean;
    specs?: object;
    hsCode?: string;
    taxCode?: string;
    internalCode?: string;
    qcTemplate?: string;
    remark?: string;
  }) {
    return this.prisma.material.create({
      data,
      include: { category: true },
    });
  }

  async findAllMaterials(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    categoryId?: string;
  }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.MaterialWhereInput = { deletedAt: null };
    if (params.categoryId) where.categoryId = params.categoryId;
    if (params.search) {
      where.OR = [
        { code: { contains: params.search } },
        { name: { contains: params.search } },
        { grade: { contains: params.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.material.findMany({
        where,
        include: { category: true },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.material.count({ where }),
    ]);

    return {
      items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findMaterialById(id: string) {
    const m = await this.prisma.material.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!m || m.deletedAt) throw new NotFoundException('物料不存在');
    return m;
  }

  async updateMaterial(id: string, data: {
    name?: string; categoryId?: string; grade?: string; unit?: string;
    spec?: string; sourceRegion?: string; packageType?: string;
    isVirtual?: boolean; specs?: object; hsCode?: string; taxCode?: string;
    internalCode?: string; qcTemplate?: string; status?: string; remark?: string;
  }) {
    await this.findMaterialById(id);
    return this.prisma.material.update({
      where: { id },
      data,
      include: { category: true },
    });
  }

  async deleteMaterial(id: string) {
    return this.prisma.material.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ===== 仓库 =====

  private async validateWarehouseOperator(type: string, partnerId?: string) {
    if (type !== 'RENT') return;
    if (!partnerId) throw new BadRequestException('租赁仓库必须选择仓储与港口服务商');
    const profile = await this.prisma.serviceOrganization.findFirst({
      where: {
        partnerId,
        organizationType: 'WAREHOUSE_PORT',
        status: 'ACTIVE',
        deletedAt: null,
        partner: { status: 'ACTIVE', deletedAt: null, roles: { has: 'SUPPLIER' } },
      },
    });
    if (!profile) throw new BadRequestException('所选仓储与港口服务商不存在、已停用或合作伙伴不具备供应商角色');
  }

  async createWarehouse(data: {
    code: string;
    name: string;
    type?: string;
    partnerId?: string;
    address?: string;
    manager?: string;
    managerPhone?: string;
    remark?: string;
  }) {
    await this.validateWarehouseOperator(data.type || 'SELF', data.partnerId);
    return this.prisma.warehouse.create({ data });
  }

  async findAllWarehouses() {
    return this.prisma.warehouse.findMany({
      where: { deletedAt: null },
      include: { partner: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteWarehouse(id: string) {
    return this.prisma.warehouse.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findWarehouseById(id: string) {
    const w = await this.prisma.warehouse.findUnique({
      where: { id },
      include: { partner: { select: { id: true, code: true, name: true } } },
    });
    if (!w || w.deletedAt) throw new NotFoundException('仓库不存在');
    return w;
  }

  async updateWarehouse(id: string, data: {
    name?: string; type?: string; partnerId?: string;
    address?: string; manager?: string; managerPhone?: string;
    status?: string; remark?: string;
  }) {
    const warehouse = await this.findWarehouseById(id);
    await this.validateWarehouseOperator(data.type || warehouse.type, data.partnerId ?? warehouse.partnerId ?? undefined);
    return this.prisma.warehouse.update({
      where: { id },
      data,
      include: { partner: { select: { id: true, code: true, name: true } } },
    });
  }

  // ===== 物料分类 =====

  async updateCategory(id: string, data: { name?: string; parentId?: string; sort?: number }) {
    return this.prisma.materialCategory.update({ where: { id }, data });
  }

  async deleteCategory(id: string) {
    return this.prisma.materialCategory.delete({ where: { id } });
  }
}
