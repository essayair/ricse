import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MasterDataService {
  constructor(private prisma: PrismaService) {}

  // ---------- 供应商 ----------

  async createSupplier(data: { code: string; name: string; contactPerson?: string; contactPhone?: string; address?: string }) {
    return this.prisma.supplier.create({ data });
  }

  async findAllSuppliers(params: { page?: number; pageSize?: number; search?: string }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where = params.search
      ? {
          OR: [
            { name: { contains: params.search } },
            { code: { contains: params.search } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.supplier.count({ where }),
    ]);

    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  // ---------- 物料 ----------

  async createMaterial(data: { code: string; name: string; category: string; unit?: string; spec?: string }) {
    return this.prisma.material.create({ data });
  }

  async findAllMaterials(params: { page?: number; pageSize?: number; search?: string; category?: string }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (params.search) {
      where.OR = [
        { name: { contains: params.search } },
        { code: { contains: params.search } },
      ];
    }
    if (params.category) where.category = params.category;

    const [items, total] = await Promise.all([
      this.prisma.material.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.material.count({ where }),
    ]);

    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  // ---------- 仓库 ----------

  async createWarehouse(data: { code: string; name: string; address?: string }) {
    return this.prisma.warehouse.create({ data });
  }

  async findAllWarehouses() {
    return this.prisma.warehouse.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
