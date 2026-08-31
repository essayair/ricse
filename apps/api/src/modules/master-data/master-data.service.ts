import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export const MATERIAL_REFERENCE_TYPES = {
  TRADING_GOODS: { prefix: 'TRD', label: '贸易商品' },
  RAW_MATERIAL: { prefix: 'RAW', label: '原材料' },
  SEMI_FINISHED: { prefix: 'SFG', label: '半成品' },
  FINISHED_GOODS: { prefix: 'FGD', label: '产成品' },
  AUXILIARY: { prefix: 'AUX', label: '辅助材料' },
  PACKAGING: { prefix: 'PKG', label: '包装材料' },
  SERVICE: { prefix: 'SRV', label: '服务项目' },
  OTHER: { prefix: 'OTH', label: '其他物料' },
} as const;

type MaterialReferenceType = keyof typeof MATERIAL_REFERENCE_TYPES;

function normalizedFingerprintPart(value?: string) {
  return (value || '').trim().replace(/\s+/g, '').toLocaleLowerCase('zh-CN');
}

export function buildStandardCommodityFingerprint(data: {
  categoryId: string; baseName: string; commodityForm?: string;
  coreSpecName?: string; coreSpecOperator?: string; coreSpecValue?: string;
  coreSpecUnit?: string; packageType?: string; unit?: string;
}) {
  return [
    data.categoryId, data.baseName, data.commodityForm, data.coreSpecName,
    data.coreSpecOperator, data.coreSpecValue, data.coreSpecUnit,
    data.packageType, data.unit || '吨',
  ].map(normalizedFingerprintPart).join('|');
}

export function buildStandardCommodityName(data: {
  baseName: string; commodityForm?: string; coreSpecName?: string;
  coreSpecOperator?: string; coreSpecValue?: string; coreSpecUnit?: string;
  packageType?: string;
}) {
  const base = `${data.baseName.trim()}${(data.commodityForm || '').trim()}`;
  const coreSpec = `${(data.coreSpecName || '').trim()}${(data.coreSpecOperator || '').trim()}${(data.coreSpecValue || '').trim()}${(data.coreSpecUnit || '').trim()}`;
  return [base, coreSpec].filter(Boolean).join('-');
}

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

  async generateNextMaterialCode(referenceType = 'TRADING_GOODS'): Promise<string> {
    const config = MATERIAL_REFERENCE_TYPES[referenceType as MaterialReferenceType];
    if (!config) throw new BadRequestException('物料参考类型无效');
    const materials = await this.prisma.material.findMany({
      where: { code: { startsWith: config.prefix, mode: 'insensitive' } },
      select: { code: true },
    });
    const max = materials.reduce((value, item) => {
      const matched = item.code.match(new RegExp(`^${config.prefix}[-_ ]?(\\d+)$`, 'i'));
      return matched ? Math.max(value, Number(matched[1])) : value;
    }, 0);
    const nextNum = max + 1;
    return `${config.prefix}${String(nextNum).padStart(6, '0')}`;
  }

  private async generateNextStandardCommodityCode(): Promise<string> {
    const commodities = await this.prisma.standardCommodity.findMany({
      where: { code: { startsWith: 'STD', mode: 'insensitive' } },
      select: { code: true },
    });
    const max = commodities.reduce((value, item) => {
      const matched = item.code.match(/^STD[-_ ]?(\d+)$/i);
      return matched ? Math.max(value, Number(matched[1])) : value;
    }, 0);
    return `STD${String(max + 1).padStart(6, '0')}`;
  }

  private async findOrCreateStandardCommodity(data: {
    categoryId: string; baseName: string; commodityForm: string;
    coreSpecName: string; coreSpecOperator: string; coreSpecValue: string;
    coreSpecUnit: string; packageType: string; unit: string; status: string;
  }) {
    const fingerprint = buildStandardCommodityFingerprint(data);
    const existing = await this.prisma.standardCommodity.findUnique({ where: { fingerprint } });
    if (existing) return existing;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.standardCommodity.create({
          data: {
            code: await this.generateNextStandardCommodityCode(),
            name: buildStandardCommodityName(data), fingerprint,
            categoryId: data.categoryId, baseName: data.baseName,
            commodityForm: data.commodityForm, coreSpecName: data.coreSpecName,
            coreSpecOperator: data.coreSpecOperator, coreSpecValue: data.coreSpecValue,
            coreSpecUnit: data.coreSpecUnit, packageType: data.packageType,
            unit: data.unit, status: data.status,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const concurrent = await this.prisma.standardCommodity.findUnique({ where: { fingerprint } });
          if (concurrent) return concurrent;
          if (attempt < 3) continue;
        }
        throw error;
      }
    }
    throw new BadRequestException('平台标准商品编码生成冲突，请重新提交');
  }

  async createMaterial(data: {
    code?: string;
    name?: string;
    baseName?: string;
    categoryId: string;
    commodityForm?: string;
    coreSpecName?: string;
    coreSpecOperator?: string;
    coreSpecValue?: string;
    coreSpecUnit?: string;
    referenceType?: string;
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
    qualityTemplateId?: string;
    status?: string;
    remark?: string;
  }) {
    const requestedBaseName = data.baseName?.trim() || data.name?.trim();
    const categoryId = data.categoryId?.trim();
    if (!requestedBaseName) throw new BadRequestException('商品名称不能为空');
    if (!categoryId) throw new BadRequestException('请选择物料大类');
    const referenceType = (data.referenceType || 'TRADING_GOODS') as MaterialReferenceType;
    if (!MATERIAL_REFERENCE_TYPES[referenceType]) throw new BadRequestException('物料参考类型无效');
    const category = await this.prisma.materialCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true },
    });
    if (!category) throw new BadRequestException('所选物料大类不存在或已被删除，请刷新后重新选择');
    if (data.qualityTemplateId) {
      const template = await this.prisma.qualityTemplate.findFirst({
        where: { id: data.qualityTemplateId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!template) throw new BadRequestException('所选质检模板不存在或已停用');
    }
    // 新版结构化建档的基础名称以所选分类名称为准，避免重复录入“分类/品名”。
    const baseName = data.baseName ? category.name?.trim() || requestedBaseName : requestedBaseName;

    const commodityForm = clean(data.commodityForm) || '';
    const coreSpecName = clean(data.coreSpecName) || '';
    const coreSpecOperator = clean(data.coreSpecOperator) || '';
    const coreSpecValue = clean(data.coreSpecValue) || '';
    const coreSpecUnit = clean(data.coreSpecUnit) || '';
    const packageType = clean(data.packageType) || '';
    const unit = clean(data.unit) || '吨';
    if (data.baseName && (!commodityForm || !coreSpecName || !coreSpecValue || !coreSpecUnit || !packageType)) {
      throw new BadRequestException('请完整填写商品形态、核心规格及包装方式');
    }
    const standardCommodity = await this.findOrCreateStandardCommodity({
      categoryId, baseName, commodityForm, coreSpecName, coreSpecOperator,
      coreSpecValue, coreSpecUnit, packageType, unit, status: data.status || 'ACTIVE',
    });
    const duplicate = await this.prisma.material.findFirst({
      where: {
        standardCommodityId: standardCommodity.id, referenceType, deletedAt: null,
      },
      select: { id: true, code: true, name: true },
    });
    if (duplicate) {
      throw new BadRequestException(`该物料已存在：${duplicate.code} ${duplicate.name}`);
    }
    const name = buildStandardCommodityName({
      baseName, commodityForm, coreSpecName, coreSpecOperator,
      coreSpecValue, coreSpecUnit, packageType,
    });
    let code = data.code?.trim() || await this.generateNextMaterialCode(referenceType);
    const systemManagedCode = new RegExp(`^${MATERIAL_REFERENCE_TYPES[referenceType].prefix}[-_ ]?\\d+$`, 'i').test(code);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.material.create({
          data: {
            code, name, categoryId, standardCommodityId: standardCommodity.id,
            referenceType, commodityForm: commodityForm || null,
            grade: clean(data.grade) || `${coreSpecName}${coreSpecOperator}${coreSpecValue}${coreSpecUnit}` || null,
            unit,
            spec: clean(data.spec), sourceRegion: clean(data.sourceRegion),
            packageType: packageType || null, isVirtual: data.isVirtual ?? false,
            specs: data.specs as Prisma.InputJsonValue | undefined,
            hsCode: clean(data.hsCode), taxCode: clean(data.taxCode),
            internalCode: clean(data.internalCode), qcTemplate: clean(data.qcTemplate),
            qualityTemplateId: data.qualityTemplateId || null,
            status: data.status || 'ACTIVE', remark: clean(data.remark),
          },
          include: { category: true, standardCommodity: true, qualityTemplate: true },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          if (systemManagedCode && attempt < 3) {
            code = await this.generateNextMaterialCode(referenceType);
            continue;
          }
          throw new BadRequestException('物料编码已存在，请刷新页面后重试');
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
          throw new BadRequestException('所选物料大类不存在或已失效，请刷新后重新选择');
        }
        throw error;
      }
    }
    throw new BadRequestException('物料编码生成冲突，请重新提交');
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
        { commodityForm: { contains: params.search } },
        { standardCommodity: { code: { contains: params.search } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.material.findMany({
        where,
        include: { category: true, standardCommodity: true, qualityTemplate: true },
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
      include: { category: true, standardCommodity: true, qualityTemplate: true },
    });
    if (!m || m.deletedAt) throw new NotFoundException('物料不存在');
    return m;
  }

  async updateMaterial(id: string, data: {
    isVirtual?: boolean; specs?: object; hsCode?: string | null; taxCode?: string | null;
    internalCode?: string | null; qcTemplate?: string | null; qualityTemplateId?: string | null; status?: string; remark?: string | null;
  }) {
    await this.findMaterialById(id);
    if (data.qualityTemplateId) {
      const template = await this.prisma.qualityTemplate.findFirst({
        where: { id: data.qualityTemplateId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!template) throw new BadRequestException('所选质检模板不存在或已停用');
    }
    try {
      return await this.prisma.material.update({
        where: { id },
        data: {
          isVirtual: data.isVirtual,
          specs: data.specs as Prisma.InputJsonValue | undefined,
          hsCode: cleanForUpdate(data.hsCode),
          taxCode: cleanForUpdate(data.taxCode),
          internalCode: cleanForUpdate(data.internalCode),
          qcTemplate: cleanForUpdate(data.qcTemplate),
          qualityTemplateId: data.qualityTemplateId === undefined ? undefined : data.qualityTemplateId || null,
          status: data.status,
          remark: cleanForUpdate(data.remark),
        },
        include: { category: true, standardCommodity: true, qualityTemplate: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new BadRequestException('所选物料大类不存在或已失效，请刷新后重新选择');
      }
      throw error;
    }
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

function clean(value?: string) {
  return value?.trim() || undefined;
}

function cleanForUpdate(value?: string | null) {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}
