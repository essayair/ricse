import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDriverDto, UpdateDriverDto } from './dto/driver.dto';

@Injectable()
export class DriverService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    attachments: { orderBy: { createdAt: 'desc' as const } },
    vehicleLinks: { include: { vehicle: { select: { id: true, plateNo: true, status: true, deletedAt: true } } } },
    serviceOrganization: {
      select: {
        id: true,
        code: true,
        organizationType: true,
        status: true,
        partnerId: true,
        partner: { select: { id: true, code: true, name: true, isInternal: true, status: true } },
      },
    },
    fleetLinks: {
      select: { fleet: { select: { id: true, name: true, carrierPartnerId: true, status: true, deletedAt: true } } },
    },
    _count: {
      select: {
        waybills: { where: { deletedAt: null } },
        vehicleLinks: true,
      },
    },
  };

  private async requireCarrier(id: string) {
    const carrier = await this.prisma.serviceOrganization.findFirst({
      where: {
        id,
        organizationType: 'LOGISTICS_CARRIER',
        status: 'ACTIVE',
        deletedAt: null,
        partner: { status: 'ACTIVE', deletedAt: null },
      },
      include: { partner: { select: { id: true, name: true, isInternal: true } } },
    });
    if (!carrier) throw new BadRequestException('物流承运商不存在或已停用');
    return carrier;
  }

  private async assertUniqueIdentity(
    identity: { phone: string; idCardNo?: string | null; licenseNo?: string | null },
    excludeId?: string,
  ) {
    const base: Prisma.DriverWhereInput = {
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    };
    const [phoneOwner, idCardOwner, licenseOwner] = await Promise.all([
      this.prisma.driver.findFirst({ where: { ...base, phone: identity.phone }, select: { id: true } }),
      identity.idCardNo
        ? this.prisma.driver.findFirst({
          where: { ...base, idCardNo: { equals: identity.idCardNo, mode: 'insensitive' } },
          select: { id: true },
        })
        : null,
      identity.licenseNo
        ? this.prisma.driver.findFirst({
          where: { ...base, licenseNo: { equals: identity.licenseNo, mode: 'insensitive' } },
          select: { id: true },
        })
        : null,
    ]);
    if (phoneOwner) throw new ConflictException('该手机号已存在司机档案，请直接关联已有司机');
    if (idCardOwner) throw new ConflictException('该身份证号已存在司机档案，请直接关联已有司机');
    if (licenseOwner) throw new ConflictException('该驾驶证号已存在司机档案，请直接关联已有司机');
  }

  private uniqueConflict(error: Prisma.PrismaClientKnownRequestError) {
    const target = String(error.meta?.target || '').toLowerCase();
    if (target.includes('phone')) return new ConflictException('该手机号已存在司机档案，请直接关联已有司机');
    if (target.includes('idcard')) return new ConflictException('该身份证号已存在司机档案，请直接关联已有司机');
    if (target.includes('license')) return new ConflictException('该驾驶证号已存在司机档案，请直接关联已有司机');
    return new ConflictException('司机手机号、身份证号或驾驶证号已存在');
  }

  async create(data: CreateDriverDto) {
    if (data.serviceOrganizationId) await this.requireCarrier(data.serviceOrganizationId);
    await this.assertUniqueIdentity(data);
    try {
      return await this.prisma.driver.create({
        data: {
          serviceOrganizationId: data.serviceOrganizationId || null,
          name: data.name,
          phone: data.phone,
          idCardNo: data.idCardNo || null,
          licenseNo: data.licenseNo || null,
          licenseClass: data.licenseClass || null,
          licenseExpiry: data.licenseExpiry ? new Date(data.licenseExpiry) : null,
          status: data.status || 'ACTIVE',
          remark: data.remark || null,
        },
        include: this.include,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.uniqueConflict(error);
      }
      throw error;
    }
  }

  async findAll(params: {
    page?: number; pageSize?: number; status?: string; search?: string;
    serviceOrganizationId?: string; carrierPartnerId?: string; internal?: boolean; fleetId?: string;
  }) {
    const page = params.page || 1;
    const pageSize = Math.min(params.pageSize || 50, 200);
    const where: Prisma.DriverWhereInput = { deletedAt: null };
    if (params.status) where.status = params.status;
    // serviceOrganizationId=NONE 表示仅筛选"无承运商"司机（社会运力专用）。
    if (params.serviceOrganizationId === 'NONE') where.serviceOrganizationId = null;
    else if (params.serviceOrganizationId) where.serviceOrganizationId = params.serviceOrganizationId;
    if (params.fleetId) where.fleetLinks = { some: { fleetId: params.fleetId } };
    const organizationFilter: Prisma.ServiceOrganizationWhereInput = {};
    if (params.carrierPartnerId) organizationFilter.partnerId = params.carrierPartnerId;
    if (params.internal !== undefined) organizationFilter.partner = { isInternal: params.internal };
    if (Object.keys(organizationFilter).length) where.serviceOrganization = organizationFilter;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search, mode: 'insensitive' } },
        { idCardNo: { contains: params.search, mode: 'insensitive' } },
        { licenseNo: { contains: params.search, mode: 'insensitive' } },
        { serviceOrganization: { partner: { name: { contains: params.search, mode: 'insensitive' } } } },
        { serviceOrganization: { partner: { code: { contains: params.search, mode: 'insensitive' } } } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        include: this.include,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.driver.count({ where }),
    ]);
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async findOne(id: string) {
    const driver = await this.prisma.driver.findFirst({ where: { id, deletedAt: null }, include: this.include });
    if (!driver) throw new NotFoundException('司机档案不存在');
    return driver;
  }

  async update(id: string, data: UpdateDriverDto) {
    const current = await this.findOne(id);
    // 传空字符串表示解除承运商（变为无承运商司机），不传该字段表示保持原值。
    const serviceOrganizationId = data.serviceOrganizationId === undefined
      ? current.serviceOrganizationId
      : data.serviceOrganizationId || null;
    const phone = data.phone || current.phone;
    const idCardNo = data.idCardNo === undefined ? current.idCardNo : data.idCardNo || null;
    const licenseNo = data.licenseNo === undefined ? current.licenseNo : data.licenseNo || null;
    if (serviceOrganizationId && serviceOrganizationId !== current.serviceOrganizationId) {
      await this.requireCarrier(serviceOrganizationId);
    }
    await this.assertUniqueIdentity({ phone, idCardNo, licenseNo }, id);
    try {
      return await this.prisma.driver.update({
        where: { id },
        data: {
          serviceOrganizationId,
          name: data.name,
          phone: data.phone,
          idCardNo: data.idCardNo === undefined ? undefined : data.idCardNo || null,
          licenseNo: data.licenseNo === undefined ? undefined : data.licenseNo || null,
          licenseClass: data.licenseClass === undefined ? undefined : data.licenseClass || null,
          licenseExpiry: data.licenseExpiry === undefined ? undefined : data.licenseExpiry ? new Date(data.licenseExpiry) : null,
          status: data.status,
          remark: data.remark === undefined ? undefined : data.remark || null,
        },
        include: this.include,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.uniqueConflict(error);
      }
      throw error;
    }
  }

  async remove(id: string) {
    const driver = await this.findOne(id);
    if (driver._count.waybills > 0) throw new BadRequestException('司机已有物流运单记录，不能删除；请将状态改为停用');
    if (driver._count.vehicleLinks > 0) throw new BadRequestException('司机已关联车辆，不能删除；请先解除车辆关联或将司机停用');
    return this.prisma.driver.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
