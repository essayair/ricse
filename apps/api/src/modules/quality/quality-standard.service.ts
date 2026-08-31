import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import {
  SaveQualityMethodPreferenceDto,
  UpsertQualityIndicatorDefinitionDto,
  UpsertQualityMethodDto,
  UpsertQualityTemplateDto,
} from './dto/quality-standard.dto';

@Injectable()
export class QualityStandardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
  ) {}

  private indicatorInclude = {
    methods: {
      where: { status: 'ACTIVE' },
      include: { method: true },
      orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }],
    },
  };

  private templateInclude = {
    materialCategory: { select: { id: true, name: true } },
    items: {
      include: {
        indicator: { include: this.indicatorInclude },
        defaultMethod: true,
      },
      orderBy: { sort: 'asc' as const },
    },
    _count: { select: { materials: true, qualityTasks: true } },
  };

  async findIndicators(userId: string, search?: string, status?: string) {
    await this.assertAnyPermission(userId, ['quality.view', 'master_data.view']);
    return this.prisma.qualityIndicatorDefinition.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search?.trim() ? {
          OR: [
            { code: { contains: search.trim(), mode: 'insensitive' as const } },
            { name: { contains: search.trim(), mode: 'insensitive' as const } },
            { symbol: { contains: search.trim(), mode: 'insensitive' as const } },
          ],
        } : {}),
      },
      include: this.indicatorInclude,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async createIndicator(dto: UpsertQualityIndicatorDefinitionDto, userId: string) {
    await this.assertAnyPermission(userId, ['quality.manage', 'master_data.manage']);
    return this.saveIndicator(undefined, dto);
  }

  async updateIndicator(id: string, dto: UpsertQualityIndicatorDefinitionDto, userId: string) {
    await this.assertAnyPermission(userId, ['quality.manage', 'master_data.manage']);
    await this.requireIndicator(id);
    return this.saveIndicator(id, dto);
  }

  private async saveIndicator(id: string | undefined, dto: UpsertQualityIndicatorDefinitionDto) {
    const code = dto.code.trim().toUpperCase();
    const methodIds = [...new Set(dto.methodIds || [])];
    if (dto.defaultMethodId && !methodIds.includes(dto.defaultMethodId)) methodIds.unshift(dto.defaultMethodId);
    if (methodIds.length) {
      const methodCount = await this.prisma.qualityMethod.count({ where: { id: { in: methodIds }, status: 'ACTIVE' } });
      if (methodCount !== methodIds.length) throw new BadRequestException('检测方法不存在或已停用');
    }
    return this.prisma.$transaction(async tx => {
      const indicator = id
        ? await tx.qualityIndicatorDefinition.update({
          where: { id },
          data: {
            code, name: dto.name.trim(), symbol: clean(dto.symbol), defaultUnit: dto.defaultUnit.trim(),
            dataType: dto.dataType || 'NUMBER', decimalPlaces: dto.decimalPlaces ?? 4,
            status: dto.status || 'ACTIVE', remark: clean(dto.remark),
          },
        })
        : await tx.qualityIndicatorDefinition.create({
          data: {
            code, name: dto.name.trim(), symbol: clean(dto.symbol), defaultUnit: dto.defaultUnit.trim(),
            dataType: dto.dataType || 'NUMBER', decimalPlaces: dto.decimalPlaces ?? 4,
            status: dto.status || 'ACTIVE', remark: clean(dto.remark),
          },
        });
      if (dto.methodIds !== undefined || dto.defaultMethodId !== undefined) {
        await tx.qualityIndicatorMethod.deleteMany({ where: { indicatorId: indicator.id } });
        if (methodIds.length) {
          await tx.qualityIndicatorMethod.createMany({
            data: methodIds.map(methodId => ({
              indicatorId: indicator.id,
              methodId,
              isDefault: methodId === dto.defaultMethodId,
            })),
          });
        }
      }
      return tx.qualityIndicatorDefinition.findUniqueOrThrow({ where: { id: indicator.id }, include: this.indicatorInclude });
    });
  }

  async findMethods(userId: string, search?: string, status?: string) {
    await this.assertAnyPermission(userId, ['quality.view', 'master_data.view']);
    return this.prisma.qualityMethod.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search?.trim() ? {
          OR: [
            { code: { contains: search.trim(), mode: 'insensitive' as const } },
            { name: { contains: search.trim(), mode: 'insensitive' as const } },
            { standardNo: { contains: search.trim(), mode: 'insensitive' as const } },
          ],
        } : {}),
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  async createMethod(dto: UpsertQualityMethodDto, userId: string) {
    await this.assertAnyPermission(userId, ['quality.manage', 'master_data.manage']);
    return this.prisma.qualityMethod.create({ data: this.methodData(dto) });
  }

  async updateMethod(id: string, dto: UpsertQualityMethodDto, userId: string) {
    await this.assertAnyPermission(userId, ['quality.manage', 'master_data.manage']);
    const existing = await this.prisma.qualityMethod.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('检测方法不存在');
    return this.prisma.qualityMethod.update({ where: { id }, data: this.methodData(dto) });
  }

  private methodData(dto: UpsertQualityMethodDto) {
    return {
      code: dto.code.trim().toUpperCase(), name: dto.name.trim(), standardNo: clean(dto.standardNo),
      standardVersion: clean(dto.standardVersion), description: clean(dto.description), status: dto.status || 'ACTIVE',
    };
  }

  async findTemplates(userId: string, search?: string, status?: string, scene?: string) {
    await this.assertAnyPermission(userId, ['quality.view', 'master_data.view']);
    return this.prisma.qualityTemplate.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(scene ? { businessScene: scene } : {}),
        ...(search?.trim() ? {
          OR: [
            { code: { contains: search.trim(), mode: 'insensitive' as const } },
            { name: { contains: search.trim(), mode: 'insensitive' as const } },
          ],
        } : {}),
      },
      include: this.templateInclude,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async findTemplate(id: string, userId: string) {
    await this.assertAnyPermission(userId, ['quality.view', 'master_data.view']);
    const template = await this.prisma.qualityTemplate.findUnique({ where: { id }, include: this.templateInclude });
    if (!template) throw new NotFoundException('质检模板不存在');
    return template;
  }

  async createTemplate(dto: UpsertQualityTemplateDto, userId: string) {
    await this.assertAnyPermission(userId, ['quality.manage', 'master_data.manage']);
    return this.saveTemplate(undefined, dto);
  }

  async updateTemplate(id: string, dto: UpsertQualityTemplateDto, userId: string) {
    await this.assertAnyPermission(userId, ['quality.manage', 'master_data.manage']);
    const existing = await this.prisma.qualityTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('质检模板不存在');
    return this.saveTemplate(id, dto);
  }

  private async saveTemplate(id: string | undefined, dto: UpsertQualityTemplateDto) {
    if (!dto.items.length) throw new BadRequestException('质检模板至少需要一个检测指标');
    if (new Set(dto.items.map(item => item.indicatorId)).size !== dto.items.length) {
      throw new BadRequestException('同一质检模板不能重复添加检测指标');
    }
    const indicators = await this.prisma.qualityIndicatorDefinition.findMany({
      where: { id: { in: dto.items.map(item => item.indicatorId) }, status: 'ACTIVE' },
      select: { id: true },
    });
    if (indicators.length !== dto.items.length) throw new BadRequestException('检测指标不存在或已停用');
    const methodIds = [...new Set(dto.items.map(item => item.defaultMethodId).filter(Boolean) as string[])];
    if (methodIds.length) {
      const methodCount = await this.prisma.qualityMethod.count({ where: { id: { in: methodIds }, status: 'ACTIVE' } });
      if (methodCount !== methodIds.length) throw new BadRequestException('默认检测方法不存在或已停用');
    }
    const data = {
      code: dto.code.trim().toUpperCase(), name: dto.name.trim(), materialCategoryId: dto.materialCategoryId || null,
      businessScene: dto.businessScene, version: dto.version ?? 1, status: dto.status || 'ACTIVE', remark: clean(dto.remark),
    };
    return this.prisma.$transaction(async tx => {
      const template = id
        ? await tx.qualityTemplate.update({ where: { id }, data })
        : await tx.qualityTemplate.create({ data });
      await tx.qualityTemplateItem.deleteMany({ where: { templateId: template.id } });
      await tx.qualityTemplateItem.createMany({
        data: dto.items.map((item, index) => ({
          templateId: template.id, indicatorId: item.indicatorId, defaultMethodId: item.defaultMethodId || null,
          operator: item.operator, standardValue: item.standardValue, upperValue: item.upperValue,
          fuseValue: item.fuseValue, unit: item.unit.trim(), required: item.required ?? true,
          core: item.core ?? false, participates: item.participates ?? true, sort: item.sort ?? index,
        })),
      });
      return tx.qualityTemplate.findUniqueOrThrow({ where: { id: template.id }, include: this.templateInclude });
    });
  }

  async resolveForMaterial(materialId: string, scene: string, userId: string) {
    await this.assertAnyPermission(userId, ['quality.view', 'master_data.view']);
    const material = await this.prisma.material.findFirst({
      where: { id: materialId, deletedAt: null },
      include: { qualityTemplate: { include: this.templateInclude } },
    });
    if (!material) throw new NotFoundException('物料不存在');
    let template = material.qualityTemplate;
    if (!template || template.status !== 'ACTIVE') {
      template = await this.prisma.qualityTemplate.findFirst({
        where: {
          status: 'ACTIVE',
          materialCategoryId: material.categoryId,
          businessScene: { in: [scene, 'GENERAL'] },
        },
        include: this.templateInclude,
        orderBy: [{ businessScene: 'desc' }, { updatedAt: 'desc' }],
      });
    }
    const preferences = await this.prisma.qualityMethodPreference.findMany({
      where: { userId, materialId },
      select: { indicatorId: true, methodId: true },
    });
    return { material: { id: material.id, name: material.name }, template, preferences };
  }

  async savePreference(dto: SaveQualityMethodPreferenceDto, userId: string) {
    await this.access.assertPermission(userId, 'quality.manage');
    const allowed = await this.prisma.qualityIndicatorMethod.findFirst({
      where: { indicatorId: dto.indicatorId, methodId: dto.methodId, status: 'ACTIVE' },
    });
    if (!allowed) throw new BadRequestException('该检测方法未关联到当前指标');
    return this.prisma.qualityMethodPreference.upsert({
      where: { userId_materialId_indicatorId: { userId, materialId: dto.materialId, indicatorId: dto.indicatorId } },
      create: { userId, materialId: dto.materialId, indicatorId: dto.indicatorId, methodId: dto.methodId },
      update: { methodId: dto.methodId },
    });
  }

  private async requireIndicator(id: string) {
    const indicator = await this.prisma.qualityIndicatorDefinition.findUnique({ where: { id } });
    if (!indicator) throw new NotFoundException('检测指标不存在');
    return indicator;
  }

  private async assertAnyPermission(userId: string, permissions: string[]) {
    const context = await this.access.getContext(userId);
    if (!context.isAdmin && !permissions.some(permission => context.permissions.includes(permission))) {
      throw new ForbiddenException(`缺少权限：${permissions.join(' 或 ')}`);
    }
    return context;
  }
}

function clean(value?: string) {
  return value?.trim() || null;
}
