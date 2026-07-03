import { Injectable } from '@nestjs/common';
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

  async deleteMaterial(id: string) {
    return this.prisma.material.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ===== 仓库 =====

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
}
