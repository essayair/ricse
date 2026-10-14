import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCapacityProjectDto,
  CreateFluoriteProducerDto,
  CreateFluorochemicalProducerDto,
  CreateIndustryParkDto,
  CreateMineResourceDto,
  IndustryQueryDto,
  UpdateCapacityProjectDto,
  UpdateFluoriteProducerDto,
  UpdateFluorochemicalProducerDto,
  UpdateIndustryParkDto,
  UpdateMineResourceDto,
} from './dto/industry-database.dto';

type Resource = 'fluorite' | 'fluorochemical' | 'mine' | 'capacity' | 'park';

@Injectable()
export class IndustryDatabaseService {
  constructor(private readonly prisma: PrismaService) {}

  private model(resource: Resource): any {
    const models = {
      fluorite: this.prisma.industryFluoriteProducer,
      fluorochemical: this.prisma.industryFluorochemicalProducer,
      mine: this.prisma.industryMineResource,
      capacity: this.prisma.industryCapacityProject,
      park: this.prisma.industryPark,
    };
    return models[resource];
  }

  private cleanText(value?: string | null) {
    const result = value?.trim();
    return result || null;
  }

  private cleanArray(value?: string[]) {
    return [...new Set((value || []).map((item) => item.trim()).filter(Boolean))];
  }

  private page(query: IndustryQueryDto) {
    const pageNo = Math.max(1, query.pageNo || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    return { pageNo, pageSize, skip: (pageNo - 1) * pageSize };
  }

  private where(resource: Resource, query: IndustryQueryDto) {
    const OR: Record<string, unknown>[] = [];
    if (query.search?.trim()) {
      const contains = { contains: query.search.trim(), mode: 'insensitive' };
      OR.push({ name: contains });
      if (['fluorite', 'fluorochemical'].includes(resource)) OR.push({ shortName: contains });
      if (resource === 'mine') OR.push({ operatorName: contains }, { mineralType: contains });
      if (resource === 'capacity') OR.push({ companyName: contains }, { productName: contains });
      if (resource === 'park') OR.push({ level: contains });
    }
    return {
      ...(query.province ? { province: query.province } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(OR.length ? { OR } : {}),
    };
  }

  async list(resource: Resource, query: IndustryQueryDto) {
    const { pageNo, pageSize, skip } = this.page(query);
    const model = this.model(resource);
    const where = this.where(resource, query);
    const [total, list] = await this.prisma.$transaction([
      model.count({ where }),
      model.findMany({ where, skip, take: pageSize, orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }] }),
    ]);
    return { total, list, pageNo, pageSize };
  }

  async get(resource: Resource, id: string) {
    const item = await this.model(resource).findUnique({ where: { id } });
    if (!item) throw new NotFoundException('产业资料不存在');
    return item;
  }

  private common(dto: Partial<CreateFluoriteProducerDto>, userId: string, create: boolean) {
    return {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.shortName !== undefined ? { shortName: this.cleanText(dto.shortName) } : {}),
      ...(dto.province !== undefined ? { province: this.cleanText(dto.province) } : {}),
      ...(dto.city !== undefined ? { city: this.cleanText(dto.city) } : {}),
      ...(dto.address !== undefined ? { address: this.cleanText(dto.address) } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.dataYear !== undefined ? { dataYear: dto.dataYear } : {}),
      ...(dto.source !== undefined ? { source: this.cleanText(dto.source) } : {}),
      ...(dto.description !== undefined ? { description: this.cleanText(dto.description) } : {}),
      ...(dto.remark !== undefined ? { remark: this.cleanText(dto.remark) } : {}),
      ...(create ? { createdById: userId } : {}),
      updatedById: userId,
    };
  }

  private data(resource: Resource, dto: Record<string, any>, userId: string, create: boolean) {
    const common = this.common(dto, userId, create);
    if (resource === 'fluorite') return {
      ...common,
      ...(dto.mainProducts !== undefined ? { mainProducts: this.cleanArray(dto.mainProducts) } : {}),
      ...(dto.designCapacity !== undefined ? { designCapacity: dto.designCapacity } : {}),
      ...(dto.effectiveCapacity !== undefined ? { effectiveCapacity: dto.effectiveCapacity } : {}),
      ...(dto.capacityUnit !== undefined ? { capacityUnit: dto.capacityUnit.trim() } : {}),
    };
    if (resource === 'fluorochemical') return {
      ...common,
      ...(dto.productCategories !== undefined ? { productCategories: this.cleanArray(dto.productCategories) } : {}),
      ...(dto.mainProducts !== undefined ? { mainProducts: this.cleanArray(dto.mainProducts) } : {}),
    };
    if (resource === 'mine') return {
      ...common,
      ...(dto.district !== undefined ? { district: this.cleanText(dto.district) } : {}),
      ...(dto.operatorName !== undefined ? { operatorName: this.cleanText(dto.operatorName) } : {}),
      ...(dto.mineralType !== undefined ? { mineralType: this.cleanText(dto.mineralType) } : {}),
      ...(dto.reserveAmount !== undefined ? { reserveAmount: dto.reserveAmount } : {}),
      ...(dto.reserveUnit !== undefined ? { reserveUnit: dto.reserveUnit.trim() } : {}),
      ...(dto.averageGrade !== undefined ? { averageGrade: dto.averageGrade } : {}),
      ...(dto.miningCapacity !== undefined ? { miningCapacity: dto.miningCapacity } : {}),
      ...(dto.capacityUnit !== undefined ? { capacityUnit: dto.capacityUnit.trim() } : {}),
      ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
      ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
    };
    if (resource === 'capacity') return {
      ...common,
      ...(dto.companyName !== undefined ? { companyName: dto.companyName.trim() } : {}),
      ...(dto.productName !== undefined ? { productName: dto.productName.trim() } : {}),
      ...(dto.designCapacity !== undefined ? { designCapacity: dto.designCapacity } : {}),
      ...(dto.effectiveCapacity !== undefined ? { effectiveCapacity: dto.effectiveCapacity } : {}),
      ...(dto.plannedCapacity !== undefined ? { plannedCapacity: dto.plannedCapacity } : {}),
      ...(dto.capacityUnit !== undefined ? { capacityUnit: dto.capacityUnit.trim() } : {}),
      ...(dto.commissioningDate !== undefined ? { commissioningDate: dto.commissioningDate ? new Date(dto.commissioningDate) : null } : {}),
    };
    return {
      ...common,
      ...(dto.level !== undefined ? { level: this.cleanText(dto.level) } : {}),
      ...(dto.focusIndustries !== undefined ? { focusIndustries: this.cleanArray(dto.focusIndustries) } : {}),
      ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
      ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
    };
  }

  async create(resource: Resource, dto: Record<string, any>, userId: string) {
    try {
      return await this.model(resource).create({ data: this.data(resource, dto, userId, true) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('名称已存在，请勿重复创建');
      }
      throw error;
    }
  }

  async update(resource: Resource, id: string, dto: Record<string, any>, userId: string) {
    await this.get(resource, id);
    try {
      return await this.model(resource).update({ where: { id }, data: this.data(resource, dto, userId, false) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('名称已存在，请检查后再保存');
      }
      throw error;
    }
  }

  async remove(resource: Resource, id: string) {
    await this.get(resource, id);
    await this.model(resource).delete({ where: { id } });
  }

  async summary() {
    const [fluorite, fluorochemical, mines, capacities, parks, provinceRows] = await Promise.all([
      this.prisma.industryFluoriteProducer.count(),
      this.prisma.industryFluorochemicalProducer.count(),
      this.prisma.industryMineResource.count(),
      this.prisma.industryCapacityProject.count(),
      this.prisma.industryPark.count(),
      this.prisma.industryFluoriteProducer.groupBy({ by: ['province'], _count: { _all: true }, where: { province: { not: null } } }),
    ]);
    return {
      counts: { fluorite, fluorochemical, mines, capacities, parks },
      provinceDistribution: provinceRows
        .map((item) => ({ province: item.province, count: item._count._all }))
        .sort((a, b) => b.count - a.count),
    };
  }
}
