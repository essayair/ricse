import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateVehicleDto, UpdateVehicleDto } from './dto/vehicle.dto';

@Injectable()
export class PartnerService {
  constructor(private prisma: PrismaService) {}

  // ========== 合作伙伴 CRUD ==========

  async create(data: {
    code?: string;
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

    const isInternal = data.isInternal ?? false;

    // 编码：内部企业手动提供并校验，外部单位系统自动生成
    let code: string;
    if (isInternal) {
      if (!data.code) throw new BadRequestException('内部企业必须提供编码');
      code = String(data.code);
      if (!/^[A-Za-z0-9]{6}$/.test(code)) {
        throw new BadRequestException('内部企业编码必须是 6 位字母数字');
      }
    } else {
      code = await this.generateNextExternalCode();
    }

    // 校验编码唯一（排除已软删除）
    const existingCode = await this.prisma.partner.findFirst({
      where: { code, deletedAt: null },
    });
    if (existingCode) throw new ConflictException(`编码 ${code} 已存在`);

    return this.prisma.partner.create({
      data: {
        code,
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
        serviceOrganizations: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        attachments: { orderBy: { createdAt: 'desc' } },
        creator: { select: { id: true, name: true } },
      },
    });
    if (!partner || partner.deletedAt) throw new NotFoundException('合作伙伴不存在');
    return partner;
  }

  async update(id: string, data: {
    name?: string; shortName?: string; shortCode?: string;
    orgType?: string; category?: string;
    legalPerson?: string; legalPersonType?: string; legalIdCard?: string;
    controller?: string; controllerTitle?: string; controllerPhone?: string;
    contactPerson?: string; contactPhone?: string;
    country?: string; province?: string; city?: string;
    address?: string; bizAddress?: string; sourceRegion?: string;
    estDate?: string; regCapital?: number; regCurrency?: string;
    revenueScale?: string; groupName?: string; isParent?: boolean;
    taxType?: string; taxRating?: string; invoiceType?: string;
    relatedPartyType?: string; industry?: string; corpType?: string;
    licenseType?: string; licenseExpiry?: string;
    bizScope?: string; mainBiz?: string; tradingGoods?: string;
    equityStructure?: string; intro?: string;
    creditLimit?: number; roles?: string[]; status?: string; remark?: string;
  }) {
    const partner = await this.findOne(id);

    // 1. 名称变更 → 校验 taxId + name 联合唯一
    if (data.name && data.name !== partner.name) {
      const taxId = partner.taxId;
      if (taxId) {
        const dup = await this.prisma.partner.findFirst({
          where: { taxId, name: data.name, id: { not: id }, deletedAt: null },
        });
        if (dup) throw new ConflictException('统一信用代码与企业名称组合已被其他合作伙伴使用');
      }
    }

    // 2. 合作伙伴角色只允许追加，不允许移除
    if (data.roles) {
      const removed = partner.roles.filter((r: string) => !data.roles!.includes(r));
      if (removed.length > 0) {
        throw new BadRequestException(`不允许移除已有合作伙伴角色: ${removed.join('、')}。合作伙伴角色仅支持追加。`);
      }
    }

    // 3. 停用/黑名单 → 校验无进行中合同
    if (data.status && data.status !== partner.status && data.status !== 'ACTIVE') {
      const activeContracts = await this.prisma.contract.count({
        where: {
          OR: [{ sellerId: id }, { buyerId: id }],
          status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTING'] },
          deletedAt: null,
        },
      });
      if (activeContracts > 0) {
        throw new BadRequestException(`存在 ${activeContracts} 个进行中的合同，无法停用。请先处理相关合同。`);
      }
    }

    // 4. 过滤掉不可修改字段
    const { roles, status, name, ...rest } = data;
    const updateData: any = { ...rest };
    if (name) updateData.name = name;
    if (roles) updateData.roles = roles;
    if (status) updateData.status = status;

    return this.prisma.partner.update({ where: { id }, data: updateData });
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

  private normalizePlateNo(plateNo: string) {
    return plateNo.replace(/\s+/g, '').toUpperCase();
  }

  private async validateVehicleOwner(ownerType: string, ownerId?: string | null) {
    if (ownerType === 'OUTSOURCED' && !ownerId) {
      throw new BadRequestException('外协车辆必须选择所属物流承运商');
    }
    if (!ownerId) return null;
    const owner = await this.prisma.partner.findFirst({
      where: { id: ownerId, status: 'ACTIVE', deletedAt: null },
      select: { id: true, name: true, isInternal: true },
    });
    if (!owner) throw new BadRequestException('车辆所属单位不存在或已停用');
    if (ownerType === 'SELF' && !owner.isInternal) throw new BadRequestException('自有车辆所属单位必须是内部主体');
    if (ownerType === 'OUTSOURCED') {
      const carrier = await this.prisma.serviceOrganization.findFirst({
        where: { partnerId: ownerId, organizationType: 'LOGISTICS_CARRIER', status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      });
      if (!carrier) throw new BadRequestException('外协车辆所属单位必须是有效物流承运商');
    }
    return owner;
  }

  private async validateVehicleDrivers(
    drivers: Array<{ driverId: string; role: string }>,
    ownerType: string,
    ownerId?: string | null,
  ) {
    if (!drivers.length) return [];
    const ids = drivers.map(item => item.driverId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('同一司机不能重复关联车辆');
    if (drivers.filter(item => item.role === 'PRIMARY').length > 1) throw new BadRequestException('一辆车只能设置一名主驾');
    const normalized = drivers.some(item => item.role === 'PRIMARY')
      ? drivers
      : drivers.map((item, index) => ({ ...item, role: index === 0 ? 'PRIMARY' : 'SECONDARY' }));
    const records = await this.prisma.driver.findMany({
      where: { id: { in: ids }, status: 'ACTIVE', deletedAt: null },
      include: { serviceOrganization: { include: { partner: { select: { id: true, isInternal: true } } } } },
    });
    if (records.length !== ids.length) throw new BadRequestException('关联司机不存在或已停用');
    for (const driver of records) {
      if (ownerType === 'OUTSOURCED' && driver.serviceOrganization.partnerId !== ownerId) {
        throw new BadRequestException('外协车辆只能关联所属物流承运商的司机');
      }
      if (ownerType === 'SELF' && !driver.serviceOrganization.partner.isInternal) {
        throw new BadRequestException('自有车辆只能关联内部物流服务商的司机');
      }
    }
    return normalized.map(link => ({
      ...link,
      driver: records.find(item => item.id === link.driverId)!,
    }));
  }

  private vehicleDate(value?: string | null) {
    return value === undefined ? undefined : value ? new Date(value) : null;
  }

  async createVehicle(data: CreateVehicleDto) {
    const plateNo = this.normalizePlateNo(data.plateNo);
    const existing = await this.prisma.vehicle.findUnique({ where: { plateNo } });
    if (existing) throw new ConflictException('该车牌号已存在');
    await this.validateVehicleOwner(data.ownerType, data.ownerId);
    const driverLinks = await this.validateVehicleDrivers(data.drivers || [], data.ownerType, data.ownerId);
    const primaryDriver = driverLinks.find(item => item.role === 'PRIMARY')?.driver;
    try {
      return await this.prisma.vehicle.create({
        data: {
          plateNo,
          vehicleType: data.vehicleType,
          brand: data.brand || null,
          tareWeight: data.tareWeight ?? null,
          loadCapacity: data.loadCapacity,
          plateColor: data.plateColor || null,
          licenseNo: data.licenseNo || null,
          annualInspectionExpiry: this.vehicleDate(data.annualInspectionExpiry),
          compulsoryInsuranceExpiry: this.vehicleDate(data.compulsoryInsuranceExpiry),
          commercialInsuranceExpiry: this.vehicleDate(data.commercialInsuranceExpiry),
          ownerId: data.ownerId || null,
          ownerType: data.ownerType,
          ownerName: data.ownerName || null,
          ownerPhone: data.ownerPhone || null,
          driverName: primaryDriver?.name || data.driverName || null,
          driverPhone: primaryDriver?.phone || data.driverPhone || null,
          deviceType: data.deviceType || 'NONE',
          deviceNo: data.deviceType === 'NONE' ? null : data.deviceNo || null,
          deviceInstalledAt: data.deviceType === 'NONE' ? null : this.vehicleDate(data.deviceInstalledAt),
          status: data.status || 'ACTIVE',
          remark: data.remark || null,
          drivers: { create: driverLinks.map(item => ({ driverId: item.driverId, role: item.role })) },
        },
        include: {
          owner: { select: { id: true, code: true, name: true, isInternal: true } },
          drivers: { include: { driver: { include: { serviceOrganization: { include: { partner: true } } } } } },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('该车牌号已存在');
      }
      throw error;
    }
  }

  async findAllVehicles(params: {
    page?: number; pageSize?: number; status?: string; ownerId?: string;
    ownerType?: string; vehicleType?: string; search?: string;
  }) {
    const page = params.page || 1;
    const pageSize = Math.min(params.pageSize || 20, 200);
    const skip = (page - 1) * pageSize;

    const where: Prisma.VehicleWhereInput = { deletedAt: null };
    if (params.status) where.status = params.status;
    if (params.ownerId) where.ownerId = params.ownerId;
    if (params.ownerType) where.ownerType = params.ownerType;
    if (params.vehicleType) where.vehicleType = params.vehicleType;
    if (params.search) {
      where.OR = [
        { plateNo: { contains: params.search, mode: 'insensitive' } },
        { brand: { contains: params.search, mode: 'insensitive' } },
        { driverName: { contains: params.search, mode: 'insensitive' } },
        { driverPhone: { contains: params.search, mode: 'insensitive' } },
        { ownerName: { contains: params.search, mode: 'insensitive' } },
        { ownerPhone: { contains: params.search, mode: 'insensitive' } },
        { licenseNo: { contains: params.search, mode: 'insensitive' } },
        { deviceNo: { contains: params.search, mode: 'insensitive' } },
        { owner: { name: { contains: params.search, mode: 'insensitive' } } },
        { drivers: { some: { driver: { name: { contains: params.search, mode: 'insensitive' } } } } },
        { drivers: { some: { driver: { phone: { contains: params.search, mode: 'insensitive' } } } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        include: {
          owner: { select: { id: true, code: true, name: true, isInternal: true } },
          drivers: {
            orderBy: { role: 'asc' },
            include: { driver: { include: { serviceOrganization: { include: { partner: true } } } } },
          },
          waybills: {
            where: { status: 'IN_TRANSIT', deletedAt: null },
            select: { id: true },
            take: 1,
          },
          _count: { select: { waybills: { where: { deletedAt: null } } } },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return {
      items: items.map(item => ({ ...item, operationStatus: item.waybills.length ? 'IN_TRANSIT' : 'IDLE' })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findOneVehicle(id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null },
      include: {
        owner: { select: { id: true, code: true, name: true, isInternal: true } },
        drivers: {
          orderBy: { role: 'asc' },
          include: { driver: { include: { serviceOrganization: { include: { partner: true } } } } },
        },
        waybills: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            dispatchNotice: { include: { order: { include: { contract: { select: { id: true, contractNo: true, title: true } } } } } },
            weighTickets: {
              where: { deletedAt: null },
              select: { id: true, ticketNo: true, ticketDate: true, grossWeight: true, tareWeight: true, netWeight: true, status: true },
              orderBy: { ticketDate: 'desc' },
            },
          },
        },
        _count: { select: { waybills: { where: { deletedAt: null } } } },
      },
    });
    if (!vehicle) throw new NotFoundException('车辆不存在');
    return vehicle;
  }

  async updateVehicle(id: string, data: UpdateVehicleDto) {
    const current = await this.findOneVehicle(id);
    const plateNo = data.plateNo ? this.normalizePlateNo(data.plateNo) : current.plateNo;
    if (plateNo !== current.plateNo) {
      const existing = await this.prisma.vehicle.findUnique({ where: { plateNo } });
      if (existing && existing.id !== id) throw new ConflictException('该车牌号已存在');
    }
    const ownerType = data.ownerType || current.ownerType;
    const switchedOwnerType = data.ownerType && data.ownerType !== current.ownerType;
    const ownerId = data.ownerId !== undefined
      ? data.ownerId || null
      : switchedOwnerType ? null : current.ownerId;
    await this.validateVehicleOwner(ownerType, ownerId);
    const driverLinks = data.drivers === undefined
      ? undefined
      : await this.validateVehicleDrivers(data.drivers, ownerType, ownerId);
    const primaryDriver = driverLinks?.find(item => item.role === 'PRIMARY')?.driver;
    const deviceType = data.deviceType === undefined ? current.deviceType : data.deviceType || 'NONE';
    try {
      return await this.prisma.vehicle.update({
        where: { id },
        data: {
          plateNo,
          vehicleType: data.vehicleType,
          brand: data.brand === undefined ? undefined : data.brand || null,
          tareWeight: data.tareWeight === undefined ? undefined : data.tareWeight,
          loadCapacity: data.loadCapacity,
          plateColor: data.plateColor === undefined ? undefined : data.plateColor || null,
          licenseNo: data.licenseNo === undefined ? undefined : data.licenseNo || null,
          annualInspectionExpiry: this.vehicleDate(data.annualInspectionExpiry),
          compulsoryInsuranceExpiry: this.vehicleDate(data.compulsoryInsuranceExpiry),
          commercialInsuranceExpiry: this.vehicleDate(data.commercialInsuranceExpiry),
          ownerType,
          ownerId,
          ownerName: data.ownerName === undefined ? undefined : data.ownerName || null,
          ownerPhone: data.ownerPhone === undefined ? undefined : data.ownerPhone || null,
          driverName: driverLinks === undefined ? (data.driverName === undefined ? undefined : data.driverName || null) : primaryDriver?.name || null,
          driverPhone: driverLinks === undefined ? (data.driverPhone === undefined ? undefined : data.driverPhone || null) : primaryDriver?.phone || null,
          deviceType,
          deviceNo: deviceType === 'NONE' ? null : data.deviceNo === undefined ? undefined : data.deviceNo || null,
          deviceInstalledAt: deviceType === 'NONE' ? null : this.vehicleDate(data.deviceInstalledAt),
          status: data.status,
          remark: data.remark === undefined ? undefined : data.remark || null,
          drivers: driverLinks === undefined ? undefined : {
            deleteMany: {},
            create: driverLinks.map(item => ({ driverId: item.driverId, role: item.role })),
          },
        },
        include: {
          owner: { select: { id: true, code: true, name: true, isInternal: true } },
          drivers: { include: { driver: { include: { serviceOrganization: { include: { partner: true } } } } } },
          _count: { select: { waybills: { where: { deletedAt: null } } } },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('该车牌号已存在');
      }
      throw error;
    }
  }

  async deleteVehicle(id: string) {
    const vehicle = await this.findOneVehicle(id);
    if (vehicle._count.waybills > 0) {
      throw new BadRequestException('车辆已有物流运单记录，不能删除；请将状态改为已退役');
    }
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
    return this.prisma.attachment.findFirst({
      where: { id, partnerId: { not: null } },
    });
  }

  async renameAttachment(id: string, originalName: string) {
    return this.prisma.attachment.update({
      where: { id },
      data: { originalName },
    });
  }

  async deleteAttachment(id: string) {
    return this.prisma.attachment.delete({ where: { id } });
  }
}
