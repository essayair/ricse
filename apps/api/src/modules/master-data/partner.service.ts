import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PartnerService {
  constructor(private prisma: PrismaService) {}

  // ========== 合作伙伴 CRUD ==========

  async create(data: {
    code: string;
    name: string;
    shortName?: string;
    shortCode?: string;
    taxId?: string;
    orgType?: string;
    category?: string;
    legalPerson?: string;
    legalPersonType?: string;
    legalIdCard?: string;
    controller?: string;
    controllerTitle?: string;
    controllerPhone?: string;
    contactPerson?: string;
    contactPhone?: string;
    isInternal?: boolean;
    country?: string;
    province?: string;
    city?: string;
    address?: string;
    bizAddress?: string;
    sourceRegion?: string;
    estDate?: string;
    regCapital?: number;
    regCurrency?: string;
    revenueScale?: string;
    groupName?: string;
    isParent?: boolean;
    taxType?: string;
    taxRating?: string;
    invoiceType?: string;
    relatedPartyType?: string;
    industry?: string;
    corpType?: string;
    licenseType?: string;
    licenseExpiry?: string;
    bizScope?: string;
    mainBiz?: string;
    tradingGoods?: string;
    equityStructure?: string;
    intro?: string;
    creditLimit?: number;
    roles: string[];
    remark?: string;
  }, userId?: string) {
    // 校验税号+名称唯一
    if (data.taxId && data.name) {
      const existing = await this.prisma.partner.findFirst({
        where: { taxId: data.taxId, name: data.name, deletedAt: null },
      });
      if (existing) throw new ConflictException('统一信用代码与企业名称组合已存在');
    }

    // 校验编码唯一
    const existingCode = await this.prisma.partner.findUnique({
      where: { code: data.code },
    });
    if (existingCode) throw new ConflictException(`编码 ${data.code} 已存在`);

    // 编码规则校验（由 isInternal 决定，与角色无关）
    const isInternal = data.isInternal ?? false;
    if (isInternal && !/^[A-Za-z0-9]{6}$/.test(data.code)) {
      throw new BadRequestException('内部企业编码必须是 6 位字母数字');
    }
    if (!isInternal && !/^\d{8}$/.test(data.code)) {
      throw new BadRequestException('外部单位编码必须是 8 位数字');
    }

    return this.prisma.partner.create({
      data: {
        code: data.code,
        name: data.name,
        shortName: data.shortName,
        shortCode: data.shortCode,
        taxId: data.taxId,
        orgType: data.orgType,
        category: data.category,
        legalPerson: data.legalPerson,
        legalPersonType: data.legalPersonType,
        legalIdCard: data.legalIdCard,
        controller: data.controller,
        controllerTitle: data.controllerTitle,
        controllerPhone: data.controllerPhone,
        contactPerson: data.contactPerson,
        contactPhone: data.contactPhone,
        isInternal,
        country: data.country,
        province: data.province,
        city: data.city,
        address: data.address,
        bizAddress: data.bizAddress,
        sourceRegion: data.sourceRegion,
        estDate: data.estDate ? new Date(data.estDate) : undefined,
        regCapital: data.regCapital,
        regCurrency: data.regCurrency,
        revenueScale: data.revenueScale,
        groupName: data.groupName,
        isParent: data.isParent,
        taxType: data.taxType,
        taxRating: data.taxRating,
        invoiceType: data.invoiceType,
        relatedPartyType: data.relatedPartyType,
        industry: data.industry,
        corpType: data.corpType,
        licenseType: data.licenseType,
        licenseExpiry: data.licenseExpiry ? new Date(data.licenseExpiry) : undefined,
        bizScope: data.bizScope,
        mainBiz: data.mainBiz,
        tradingGoods: data.tradingGoods,
        equityStructure: data.equityStructure,
        intro: data.intro,
        creditLimit: data.creditLimit,
        roles: data.roles,
        remark: data.remark,
        createdBy: userId,
      },
    });
  }

  async findAll(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    role?: string;
    status?: string;
  }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.PartnerWhereInput = { deletedAt: null };
    if (params.role) where.roles = { has: params.role };
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { code: { contains: params.search } },
        { name: { contains: params.search } },
        { shortName: { contains: params.search } },
        { contactPerson: { contains: params.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.partner.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.partner.count({ where }),
    ]);

    return {
      items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id },
      include: {
        bankAccounts: true,
        vehicles: true,
        warehouses: true,
        attachments: { orderBy: { createdAt: 'desc' } },
        creator: { select: { id: true, name: true } },
      },
    });
    if (!partner || partner.deletedAt) throw new NotFoundException('合作伙伴不存在');
    return partner;
  }

  async update(id: string, data: {
    name?: string;
    shortName?: string;
    taxId?: string;
    legalPerson?: string;
    contactPerson?: string;
    contactPhone?: string;
    address?: string;
    bizAddress?: string;
    sourceRegion?: string;
    creditLimit?: number;
    roles?: string[];
    status?: string;
    remark?: string;
  }) {
    const partner = await this.findOne(id);

    // 如果更新税号+名称，校验唯一
    const newTaxId = data.taxId ?? partner.taxId;
    const newName = data.name ?? partner.name;
    if (newTaxId && newName) {
      const dup = await this.prisma.partner.findFirst({
        where: { taxId: newTaxId, name: newName, id: { not: id }, deletedAt: null },
      });
      if (dup) throw new ConflictException('统一信用代码与企业名称组合已被其他合作伙伴使用');
    }

    return this.prisma.partner.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    // 软删除
    return this.prisma.partner.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ========== 银行账户 ==========

  async createBankAccount(data: {
    partnerId: string;
    accountName: string;
    accountNo: string;
    bankName: string;
    bankCode?: string;
    accountType?: string;
    currency?: string;
    isDefault?: boolean;
  }) {
    // 如果设置为默认，先清除该合作伙伴的其他默认账户
    if (data.isDefault) {
      await this.prisma.bankAccount.updateMany({
        where: { partnerId: data.partnerId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.bankAccount.create({ data });
  }

  async findBankAccounts(partnerId: string) {
    return this.prisma.bankAccount.findMany({
      where: { partnerId },
      orderBy: { isDefault: 'desc' },
    });
  }

  async deleteBankAccount(id: string) {
    return this.prisma.bankAccount.delete({ where: { id } });
  }

  // ========== 车辆 ==========

  async createVehicle(data: {
    plateNo: string;
    vehicleType: string;
    brand?: string;
    loadCapacity: number;
    ownerId?: string;
    ownerType?: string;
    driverName?: string;
    driverPhone?: string;
    remark?: string;
  }) {
    return this.prisma.vehicle.create({ data });
  }

  async findAllVehicles(params: { page?: number; pageSize?: number; status?: string; ownerId?: string }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.VehicleWhereInput = { deletedAt: null };
    if (params.status) where.status = params.status;
    if (params.ownerId) where.ownerId = params.ownerId;

    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        include: { owner: { select: { id: true, code: true, name: true } } },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async deleteVehicle(id: string) {
    return this.prisma.vehicle.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ========== 编码生成 ==========

  async generateNextExternalCode(): Promise<string> {
    const last = await this.prisma.partner.findFirst({
      where: { isInternal: false, deletedAt: null },
      orderBy: { code: 'desc' },
      select: { code: true },
    });

    let nextNum = 1;
    if (last) {
      const num = parseInt(last.code, 10);
      if (!isNaN(num)) nextNum = num + 1;
    }
    return String(nextNum).padStart(8, '0');
  }

  // ========== 附件 ==========

  async createAttachment(data: {
    partnerId: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    size: number;
    category: string;
  }) {
    return this.prisma.attachment.create({ data });
  }

  async findAttachments(partnerId: string) {
    return this.prisma.attachment.findMany({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAttachmentById(id: string) {
    return this.prisma.attachment.findUnique({ where: { id } });
  }

  async deleteAttachment(id: string) {
    return this.prisma.attachment.delete({ where: { id } });
  }
}
