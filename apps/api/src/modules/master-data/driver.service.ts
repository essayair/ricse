import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDriverDto, UpdateDriverDto } from './dto/driver.dto';

@Injectable()
export class DriverService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
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

  private async assertUniquePhone(serviceOrganizationId: string, phone: string, excludeId?: string) {
    const existing = await this.prisma.driver.findFirst({
      where: { serviceOrganizationId, phone, deletedAt: null },
      select: { id: true },
    });
    if (existing && existing.id !== excludeId) throw new ConflictException('该物流承运商下已存在相同手机号的司机');
  }

  async create(data: CreateDriverDto) {
    await this.requireCarrier(data.serviceOrganizationId);
    await this.assertUniquePhone(data.serviceOrganizationId, data.phone);
    try {
      return await this.prisma.driver.create({
        data: {
          serviceOrganizationId: data.serviceOrganizationId,
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
        throw new ConflictException('该物流承运商下已存在相同手机号的司机');
      }
      throw error;
    }
  }

  async findAll(params: {
    page?: number; pageSize?: number; status?: string; search?: string;
    serviceOrganizationId?: string; carrierPartnerId?: string; internal?: boolean;
  }) {
    const page = params.page || 1;
    const pageSize = Math.min(params.pageSize || 50, 200);
    const where: Prisma.DriverWhereInput = { deletedAt: null };
    if (params.status) where.status = params.status;
    if (params.serviceOrganizationId) where.serviceOrganizationId = params.serviceOrganizationId;
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
    const serviceOrganizationId = data.serviceOrganizationId || current.serviceOrganizationId;
    const phone = data.phone || current.phone;
    if (serviceOrganizationId !== current.serviceOrganizationId) await this.requireCarrier(serviceOrganizationId);
    await this.assertUniquePhone(serviceOrganizationId, phone, id);
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
        throw new ConflictException('该物流承运商下已存在相同手机号的司机');
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
