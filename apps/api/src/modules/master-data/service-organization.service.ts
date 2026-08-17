import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const SERVICE_ORGANIZATION_TYPES = [
  'LOGISTICS_CARRIER',
  'QUALITY_INSTITUTION',
  'WAREHOUSE_PORT',
  'PROCESSING_PROVIDER',
] as const;

type OrganizationType = typeof SERVICE_ORGANIZATION_TYPES[number];

export interface ServiceOrganizationInput {
  partnerId: string;
  organizationType: string;
  licenseNo?: string;
  licenseExpiry?: string;
  qualificationNo?: string;
  cmaNo?: string;
  cnasNo?: string;
  serviceScope?: string;
  serviceRegions?: string;
  transportModes?: string[];
  cargoTypes?: string;
  supportedMaterials?: string;
  supportedItems?: string;
  operationType?: string;
  storageCapacity?: number;
  dispatcherName?: string;
  dispatcherPhone?: string;
  contactPerson?: string;
  contactPhone?: string;
  settlementMethod?: string;
  reportCycleDays?: number;
  insuranceInfo?: string;
  status?: string;
  remark?: string;
}

@Injectable()
export class ServiceOrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  private validateType(value: string): asserts value is OrganizationType {
    if (!SERVICE_ORGANIZATION_TYPES.includes(value as OrganizationType)) {
      throw new BadRequestException('不支持的服务生态类型');
    }
  }

  private async requireSupplierPartner(partnerId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, deletedAt: null },
      select: { id: true, code: true, name: true, roles: true, status: true },
    });
    if (!partner) throw new BadRequestException('合作伙伴不存在');
    if (partner.status !== 'ACTIVE') throw new BadRequestException('只能选择有效状态的合作伙伴');
    if (!partner.roles.includes('SUPPLIER')) {
      throw new BadRequestException('服务生态档案对应的合作伙伴必须具备供应商角色');
    }
    return partner;
  }

  private clean(value?: string) {
    const text = value?.trim();
    return text || null;
  }

  private data(input: ServiceOrganizationInput) {
    return {
      licenseNo: this.clean(input.licenseNo),
      licenseExpiry: input.licenseExpiry ? new Date(input.licenseExpiry) : null,
      qualificationNo: this.clean(input.qualificationNo),
      cmaNo: this.clean(input.cmaNo),
      cnasNo: this.clean(input.cnasNo),
      serviceScope: this.clean(input.serviceScope),
      serviceRegions: this.clean(input.serviceRegions),
      transportModes: input.transportModes || [],
      cargoTypes: this.clean(input.cargoTypes),
      supportedMaterials: this.clean(input.supportedMaterials),
      supportedItems: this.clean(input.supportedItems),
      operationType: this.clean(input.operationType),
      storageCapacity: input.storageCapacity === undefined || input.storageCapacity === null
        ? null : Number(input.storageCapacity),
      dispatcherName: this.clean(input.dispatcherName),
      dispatcherPhone: this.clean(input.dispatcherPhone),
      contactPerson: this.clean(input.contactPerson),
      contactPhone: this.clean(input.contactPhone),
      settlementMethod: this.clean(input.settlementMethod),
      reportCycleDays: input.reportCycleDays === undefined || input.reportCycleDays === null
        ? null : Number(input.reportCycleDays),
      insuranceInfo: this.clean(input.insuranceInfo),
      status: input.status || 'ACTIVE',
      remark: this.clean(input.remark),
    };
  }

  private async generateCode(type: OrganizationType) {
    const prefix: Record<OrganizationType, string> = {
      LOGISTICS_CARRIER: 'CY',
      QUALITY_INSTITUTION: 'ZJ',
      WAREHOUSE_PORT: 'CG',
      PROCESSING_PROVIDER: 'JG',
    };
    const count = await this.prisma.serviceOrganization.count({
      where: { organizationType: type },
    });
    return `${prefix[type]}${String(count + 1).padStart(6, '0')}`;
  }

  async create(input: ServiceOrganizationInput) {
    this.validateType(input.organizationType);
    await this.requireSupplierPartner(input.partnerId);
    const existing = await this.prisma.serviceOrganization.findFirst({
      where: {
        partnerId: input.partnerId,
        organizationType: input.organizationType,
        deletedAt: null,
      },
    });
    if (existing) throw new ConflictException('该合作伙伴已维护此类服务生态档案');
    return this.prisma.serviceOrganization.create({
      data: {
        code: await this.generateCode(input.organizationType),
        partnerId: input.partnerId,
        organizationType: input.organizationType,
        ...this.data(input),
      },
      include: { partner: true },
    });
  }

  async findAll(params: {
    type?: string;
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    if (params.type) this.validateType(params.type);
    const page = params.page || 1;
    const pageSize = Math.min(params.pageSize || 50, 200);
    const where: any = { deletedAt: null };
    if (params.type) where.organizationType = params.type;
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { partner: { name: { contains: params.search, mode: 'insensitive' } } },
        { partner: { code: { contains: params.search, mode: 'insensitive' } } },
        { licenseNo: { contains: params.search, mode: 'insensitive' } },
        { qualificationNo: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.serviceOrganization.findMany({
        where,
        include: { partner: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.serviceOrganization.count({ where }),
    ]);
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async findOne(id: string) {
    const item = await this.prisma.serviceOrganization.findFirst({
      where: { id, deletedAt: null },
      include: { partner: true },
    });
    if (!item) throw new NotFoundException('服务生态档案不存在');
    return item;
  }

  async update(id: string, input: Partial<ServiceOrganizationInput>) {
    const current = await this.findOne(id);
    if (input.organizationType && input.organizationType !== current.organizationType) {
      throw new BadRequestException('服务生态类型创建后不能修改');
    }
    if (input.partnerId && input.partnerId !== current.partnerId) {
      throw new BadRequestException('关联合作伙伴创建后不能修改');
    }
    if (input.status && !['ACTIVE', 'INACTIVE', 'BLACKLIST'].includes(input.status)) {
      throw new BadRequestException('服务生态状态无效');
    }
    return this.prisma.serviceOrganization.update({
      where: { id },
      data: this.data({ ...current, ...input } as ServiceOrganizationInput),
      include: { partner: true },
    });
  }
}
