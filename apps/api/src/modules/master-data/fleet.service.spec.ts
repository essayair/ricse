import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { FleetService } from './fleet.service';

describe('FleetService 车队管理', () => {
  const prisma = mockDeep<PrismaService>();
  let service: FleetService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FleetService(prisma);
  });

  it('创建车队时如指定承运商必须是有效的物流承运商', async () => {
    prisma.serviceOrganization.findFirst.mockResolvedValue(null);
    await expect(service.create({
      name: '老张车队', carrierPartnerId: 'carrier-invalid',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('创建车队不传承运商时允许暂未挂靠', async () => {
    prisma.fleet.create.mockResolvedValue({ id: 'fleet-1' } as any);
    await service.create({ name: '老张车队' });
    expect(prisma.serviceOrganization.findFirst).not.toHaveBeenCalled();
    expect(prisma.fleet.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ carrierPartnerId: null }),
    }));
  });

  it('车队详情包含完整成员司机和车辆', async () => {
    prisma.fleet.findFirst.mockResolvedValue({ id: 'fleet-1', driverLinks: [], vehicleLinks: [] } as any);
    const result = await service.findOne('fleet-1');
    expect(result.id).toBe('fleet-1');
  });

  it('车队不存在时抛出 NotFoundException', async () => {
    prisma.fleet.findFirst.mockResolvedValue(null);
    await expect(service.findOne('fleet-missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('修改车队时传空字符串表示解除承运商挂靠', async () => {
    prisma.fleet.findFirst.mockResolvedValue({ id: 'fleet-1', _count: { driverLinks: 0, vehicleLinks: 0 } } as any);
    prisma.fleet.update.mockResolvedValue({ id: 'fleet-1' } as any);
    await service.update('fleet-1', { carrierPartnerId: '' });
    expect(prisma.serviceOrganization.findFirst).not.toHaveBeenCalled();
    expect(prisma.fleet.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ carrierPartnerId: null }),
    }));
  });

  it('修改车队时不传承运商字段保持原值不变', async () => {
    prisma.fleet.findFirst.mockResolvedValue({ id: 'fleet-1', _count: { driverLinks: 0, vehicleLinks: 0 } } as any);
    prisma.fleet.update.mockResolvedValue({ id: 'fleet-1' } as any);
    await service.update('fleet-1', { name: '新队名' });
    expect(prisma.fleet.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ carrierPartnerId: undefined }),
    }));
  });

  it('车队内仍有成员时不能删除', async () => {
    prisma.fleet.findFirst.mockResolvedValue({ id: 'fleet-1', _count: { driverLinks: 1, vehicleLinks: 0 } } as any);
    await expect(service.remove('fleet-1')).rejects.toThrow('请先移出全部成员或将车队停用');
  });

  it('车队无成员时可以删除', async () => {
    prisma.fleet.findFirst.mockResolvedValue({ id: 'fleet-1', _count: { driverLinks: 0, vehicleLinks: 0 } } as any);
    prisma.fleet.update.mockResolvedValue({ id: 'fleet-1' } as any);
    await service.remove('fleet-1');
    expect(prisma.fleet.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { deletedAt: expect.any(Date) },
    }));
  });

  it('司机加入车队时不能重复加入', async () => {
    prisma.fleet.findFirst.mockResolvedValue({ id: 'fleet-1', status: 'ACTIVE', _count: { driverLinks: 0, vehicleLinks: 0 } } as any);
    prisma.driver.findFirst.mockResolvedValue({ id: 'driver-1' } as any);
    prisma.driverFleet.findUnique.mockResolvedValue({ id: 'link-1' } as any);
    await expect(service.addDriver('fleet-1', 'driver-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(['drivers', 'vehicles'])('加入 %s 未选择成员时给出业务提示，不调用数据库', async (kind) => {
    await expect(kind === 'drivers' ? service.addDriver('fleet-1', undefined as any) : service.addVehicle('fleet-1', undefined as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.fleet.findFirst).not.toHaveBeenCalled();
  });

  it.each(['drivers', 'vehicles'])('停用车队不能新增 %s 成员', async (kind) => {
    prisma.fleet.findFirst.mockResolvedValue({ id: 'fleet-1', status: 'INACTIVE' } as any);
    await expect(kind === 'drivers' ? service.addDriver('fleet-1', 'driver-1') : service.addVehicle('fleet-1', 'vehicle-1'))
      .rejects.toThrow('车队已停用');
  });

  it.each(['drivers', 'vehicles'])('候选 %s 只能是未删除且启用的档案', async (kind) => {
    prisma.fleet.findFirst.mockResolvedValue({ id: 'fleet-1', status: 'ACTIVE' } as any);
    if (kind === 'drivers') {
      prisma.driver.findFirst.mockResolvedValue(null);
      await expect(service.addDriver('fleet-1', 'driver-1')).rejects.toThrow('司机不存在或已停用');
      expect(prisma.driver.findFirst).toHaveBeenCalledWith({ where: { id: 'driver-1', deletedAt: null, status: 'ACTIVE' } });
    } else {
      prisma.vehicle.findFirst.mockResolvedValue(null);
      await expect(service.addVehicle('fleet-1', 'vehicle-1')).rejects.toThrow('车辆不存在或已停用');
      expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({ where: { id: 'vehicle-1', deletedAt: null, status: 'ACTIVE' } });
    }
  });

  it.each(['drivers', 'vehicles'])('并发重复加入 %s 返回明确冲突而不是 Internal server error', async (kind) => {
    prisma.fleet.findFirst.mockResolvedValue({ id: 'fleet-1', status: 'ACTIVE' } as any);
    const error = new Prisma.PrismaClientKnownRequestError('duplicate member', { code: 'P2002', clientVersion: '5.18.0' });
    if (kind === 'drivers') {
      prisma.driver.findFirst.mockResolvedValue({ id: 'driver-1' } as any);
      prisma.driverFleet.findUnique.mockResolvedValue(null);
      prisma.driverFleet.create.mockRejectedValue(error);
      await expect(service.addDriver('fleet-1', 'driver-1')).rejects.toBeInstanceOf(ConflictException);
    } else {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1' } as any);
      prisma.vehicleFleet.findUnique.mockResolvedValue(null);
      prisma.vehicleFleet.create.mockRejectedValue(error);
      await expect(service.addVehicle('fleet-1', 'vehicle-1')).rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('移出不在车队中的车辆时报错', async () => {
    prisma.vehicleFleet.findUnique.mockResolvedValue(null);
    await expect(service.removeVehicle('fleet-1', 'vehicle-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
