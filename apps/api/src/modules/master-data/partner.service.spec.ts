import { BadRequestException, ConflictException } from '@nestjs/common';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnerService } from './partner.service';

describe('PartnerService 车辆管理', () => {
  const prisma = mockDeep<PrismaService>();
  let service: PartnerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PartnerService(prisma);
  });

  it('创建车辆时规范化车牌并保存完整档案', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(null);
    prisma.vehicle.create.mockResolvedValue({ id: 'vehicle-1', plateNo: '浙A12345' } as any);
    await service.createVehicle({
      plateNo: '浙a12345', vehicleType: 'TRUCK', loadCapacity: 32.5, ownerType: 'SELF',
      driverName: '张师傅', driverPhone: '13800138000',
    });
    expect(prisma.vehicle.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ plateNo: '浙A12345', loadCapacity: 32.5, status: 'ACTIVE' }),
    }));
  });

  it('拒绝重复车牌', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({ id: 'existing' } as any);
    await expect(service.createVehicle({
      plateNo: '浙A12345', vehicleType: 'TRUCK', loadCapacity: 32.5, ownerType: 'SELF',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('外协车辆必须关联所属单位', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(null);
    await expect(service.createVehicle({
      plateNo: '浙A12345', vehicleType: 'TRUCK', loadCapacity: 32.5, ownerType: 'OUTSOURCED',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('已有运单引用的车辆不能删除', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1', _count: { waybills: 2 } } as any);
    await expect(service.deleteVehicle('vehicle-1')).rejects.toThrow('请将状态改为已退役');
  });

  it('一辆车可关联一名主驾和多名副驾', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(null);
    prisma.partner.findFirst.mockResolvedValue({ id: 'partner-internal', name: '内部车队', isInternal: true } as any);
    prisma.driver.findMany.mockResolvedValue([
      { id: 'driver-1', name: '主驾', phone: '13800138000', serviceOrganization: { partnerId: 'partner-internal', partner: { id: 'partner-internal', isInternal: true } } },
      { id: 'driver-2', name: '副驾', phone: '13900139000', serviceOrganization: { partnerId: 'partner-internal', partner: { id: 'partner-internal', isInternal: true } } },
    ] as any);
    prisma.vehicle.create.mockResolvedValue({ id: 'vehicle-1' } as any);

    await service.createVehicle({
      plateNo: '甘A12345', vehicleType: 'SEMI_TRAILER', loadCapacity: 50, ownerType: 'SELF', ownerId: 'partner-internal',
      drivers: [{ driverId: 'driver-1', role: 'PRIMARY' }, { driverId: 'driver-2', role: 'SECONDARY' }],
    });

    expect(prisma.vehicle.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        driverName: '主驾',
        drivers: { create: [{ driverId: 'driver-1', role: 'PRIMARY' }, { driverId: 'driver-2', role: 'SECONDARY' }] },
      }),
    }));
  });

  it('一辆车不能设置多名主驾', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(null);
    await expect(service.createVehicle({
      plateNo: '甘A12345', vehicleType: 'SEMI_TRAILER', loadCapacity: 50, ownerType: 'SELF',
      drivers: [{ driverId: 'driver-1', role: 'PRIMARY' }, { driverId: 'driver-2', role: 'PRIMARY' }],
    })).rejects.toThrow('只能设置一名主驾');
  });
});
