import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class MasterDataService {
  constructor(private prisma: PrismaService) {}

  // ===== 物料分类 =====

  async createCategory(data: { name: string; parentId?: string; sort?: number }) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('分类名称不能为空');

    if (data.parentId) {
      const parent = await this.prisma.materialCategory.findUnique({
        where: { id: data.parentId },
        select: { id: true, parentId: true },
      });
      if (!parent) throw new NotFoundException('上级分类不存在');
      if (parent.parentId) throw new BadRequestException('物料分类最多支持两级');
    }

    const duplicate = await this.prisma.materialCategory.findFirst({
      where: { name, parentId: data.parentId || null },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('同级分类名称已存在');

    return this.prisma.materialCategory.create({
      data: {
        name,
        parentId: data.parentId || null,
        sort: data.sort ?? 0,
      },
    });
  }

  async findAllCategories() {
    return this.prisma.materialCategory.findMany({
      where: { parentId: null },
      include: {
        _count: { select: { materials: true } },
        children: {
          include: { _count: { select: { materials: true } } },
          orderBy: [{ sort: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
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

  async updateCategory(id: string, data: { name?: string; parentId?: string | null; sort?: number }) {
    const category = await this.prisma.materialCategory.findUnique({
      where: { id },
      select: { id: true, name: true, parentId: true, _count: { select: { children: true } } },
    });
    if (!category) throw new NotFoundException('物料分类不存在');

    const name = data.name === undefined ? category.name : data.name.trim();
    if (!name) throw new BadRequestException('分类名称不能为空');
    const parentId = data.parentId === undefined ? category.parentId : data.parentId;

    if (parentId === id) throw new BadRequestException('分类不能选择自身作为上级分类');
    if (parentId) {
      const parent = await this.prisma.materialCategory.findUnique({
        where: { id: parentId },
        select: { id: true, parentId: true },
      });
      if (!parent) throw new NotFoundException('上级分类不存在');
      if (parent.parentId) throw new BadRequestException('物料分类最多支持两级');
      if (category._count.children > 0) {
        throw new BadRequestException('含有下级分类的一级分类不能调整为二级分类');
      }
    }

    const duplicate = await this.prisma.materialCategory.findFirst({
      where: { id: { not: id }, name, parentId },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('同级分类名称已存在');

    return this.prisma.materialCategory.update({
      where: { id },
      data: { name, parentId, sort: data.sort },
    });
  }

  async deleteCategory(id: string) {
    const category = await this.prisma.materialCategory.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { children: true, materials: true } },
      },
    });
    if (!category) throw new NotFoundException('物料分类不存在');
    if (category._count.children > 0) {
      throw new BadRequestException('该分类下仍有子分类，请先处理子分类');
    }
    if (category._count.materials > 0) {
      throw new BadRequestException('该分类已被物料引用，不能删除');
    }
    return this.prisma.materialCategory.delete({ where: { id } });
  }
}
