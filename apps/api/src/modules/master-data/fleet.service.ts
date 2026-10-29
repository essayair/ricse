import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFleetDto, UpdateFleetDto } from './dto/fleet.dto';
import { resolvePagination } from '../common/pagination';

@Injectable()
export class FleetService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    carrierPartner: { select: { id: true, code: true, name: true, status: true } },
    _count: { select: { driverLinks: true, vehicleLinks: true } },
  };

  // 车队绑定的是"开票承运商"，与运单 resolveCarrier 同一语义：
  // 必须是有效的物流承运商档案，且合作伙伴具备供应商角色。
  private async requireCarrier(carrierPartnerId: string) {
    const profile = await this.prisma.serviceOrganization.findFirst({
      where: {
        partnerId: carrierPartnerId,
        organizationType: 'LOGISTICS_CARRIER',
        status: 'ACTIVE',
        deletedAt: null,
        partner: { status: 'ACTIVE', deletedAt: null, roles: { has: 'SUPPLIER' } },
      },
      include: { partner: { select: { id: true, name: true } } },
    });
    if (!profile) throw new BadRequestException('所选物流承运商不存在、已停用或合作伙伴不具备供应商角色');
    return profile.partner;
  }

  async create(data: CreateFleetDto) {
    if (data.carrierPartnerId) await this.requireCarrier(data.carrierPartnerId);
    return this.prisma.fleet.create({
      data: {
        name: data.name,
        contactPerson: data.contactPerson || null,
        contactPhone: data.contactPhone || null,
        carrierPartnerId: data.carrierPartnerId || null,
        status: data.status || 'ACTIVE',
        remark: data.remark || null,
      },
      include: this.include,
    });
  }

  async findAll(params: { page?: number; pageSize?: number; status?: string; search?: string; carrierPartnerId?: string }) {
    const { page, pageSize, skip } = resolvePagination(params.page, params.pageSize, { defaultPageSize: 20 });
    const where: Prisma.FleetWhereInput = {
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
      ...(params.carrierPartnerId ? { carrierPartnerId: params.carrierPartnerId } : {}),
      ...(params.search ? {
        OR: [
          { name: { contains: params.search, mode: 'insensitive' as const } },
          { contactPerson: { contains: params.search, mode: 'insensitive' as const } },
          { contactPhone: { contains: params.search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.fleet.findMany({
        where, include: this.include, orderBy: { createdAt: 'desc' },
        skip, take: pageSize,
      }),
      this.prisma.fleet.count({ where }),
    ]);
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async findOne(id: string) {
    const fleet = await this.prisma.fleet.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...this.include,
        driverLinks: {
          include: {
            driver: {
              select: {
                id: true, name: true, phone: true, status: true, serviceOrganizationId: true,
                serviceOrganization: { select: { partner: { select: { id: true, name: true } } } },
              },
            },
          },
        },
        vehicleLinks: {
          include: { vehicle: { select: { id: true, plateNo: true, vehicleType: true, status: true, ownerType: true, ownerId: true } } },
        },
      },
    });
    if (!fleet) throw new NotFoundException('车队不存在');
    return fleet;
  }

  async update(id: string, data: UpdateFleetDto) {
    await this.findOne(id);
    // 传空字符串表示解除承运商挂靠，不传该字段表示保持原值。
    if (data.carrierPartnerId) await this.requireCarrier(data.carrierPartnerId);
    return this.prisma.fleet.update({
      where: { id },
      data: {
        name: data.name,
        contactPerson: data.contactPerson === undefined ? undefined : data.contactPerson || null,
        contactPhone: data.contactPhone === undefined ? undefined : data.contactPhone || null,
        carrierPartnerId: data.carrierPartnerId === undefined ? undefined : data.carrierPartnerId || null,
        status: data.status,
        remark: data.remark === undefined ? undefined : data.remark || null,
      },
      include: this.include,
    });
  }

  async remove(id: string) {
    const fleet = await this.findOne(id);
    if (fleet._count.driverLinks > 0 || fleet._count.vehicleLinks > 0) {
      throw new BadRequestException('车队内仍有司机或车辆，不能删除；请先移出全部成员或将车队停用');
    }
    return this.prisma.fleet.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async addDriver(fleetId: string, driverId: string) {
    if (typeof driverId !== 'string' || !driverId.trim()) throw new BadRequestException('请选择要加入的司机');
    const fleet = await this.findOne(fleetId);
    if (fleet.status !== 'ACTIVE') throw new BadRequestException('车队已停用，请先启用后再加入司机');
    const driver = await this.prisma.driver.findFirst({ where: { id: driverId, deletedAt: null, status: 'ACTIVE' } });
    if (!driver) throw new BadRequestException('司机不存在或已停用');
    const existing = await this.prisma.driverFleet.findUnique({ where: { driverId_fleetId: { driverId, fleetId } } });
    if (existing) throw new ConflictException('该司机已在此车队中');
    try {
      return await this.prisma.driverFleet.create({ data: { driverId, fleetId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('该司机已在此车队中，请刷新成员列表');
      throw error;
    }
  }

  async removeDriver(fleetId: string, driverId: string) {
    const link = await this.prisma.driverFleet.findUnique({ where: { driverId_fleetId: { driverId, fleetId } } });
    if (!link) throw new NotFoundException('该司机不在此车队中');
    return this.prisma.driverFleet.delete({ where: { id: link.id } });
  }

  async addVehicle(fleetId: string, vehicleId: string) {
    if (typeof vehicleId !== 'string' || !vehicleId.trim()) throw new BadRequestException('请选择要加入的车辆');
    const fleet = await this.findOne(fleetId);
    if (fleet.status !== 'ACTIVE') throw new BadRequestException('车队已停用，请先启用后再加入车辆');
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, deletedAt: null, status: 'ACTIVE' } });
    if (!vehicle) throw new BadRequestException('车辆不存在或已停用');
    const existing = await this.prisma.vehicleFleet.findUnique({ where: { vehicleId_fleetId: { vehicleId, fleetId } } });
    if (existing) throw new ConflictException('该车辆已在此车队中');
    try {
      return await this.prisma.vehicleFleet.create({ data: { vehicleId, fleetId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('该车辆已在此车队中，请刷新成员列表');
      throw error;
    }
  }

  async removeVehicle(fleetId: string, vehicleId: string) {
    const link = await this.prisma.vehicleFleet.findUnique({ where: { vehicleId_fleetId: { vehicleId, fleetId } } });
    if (!link) throw new NotFoundException('该车辆不在此车队中');
    return this.prisma.vehicleFleet.delete({ where: { id: link.id } });
  }
}
