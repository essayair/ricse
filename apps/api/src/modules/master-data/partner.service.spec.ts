import { BadRequestException, ConflictException } from '@nestjs/common';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnerService } from './partner.service';

describe('PartnerService', () => {
  const prisma = mockDeep<PrismaService>();
  let service: PartnerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PartnerService(prisma);
  });

  it('允许将合作伙伴类别明确清空', async () => {
    prisma.partner.findUnique.mockResolvedValue({
      id: 'partner-1', name: '测试合作伙伴', taxId: '91330000TEST',
      category: 'CORE', roles: ['SUPPLIER'], status: 'ACTIVE', deletedAt: null,
      bankAccounts: [], businessAddresses: [], vehicles: [], warehouses: [],
      serviceOrganizations: [], attachments: [], creator: null,
    } as any);
    prisma.partner.update.mockResolvedValue({ id: 'partner-1', category: null } as any);

    await service.update('partner-1', { category: null });

    expect(prisma.partner.update).toHaveBeenCalledWith({
      where: { id: 'partner-1' },
      data: { category: null },
    });
  });

  it('编辑合作伙伴时将日期输入框的值转换为 DateTime', async () => {
    prisma.partner.findUnique.mockResolvedValue({
      id: 'partner-1', name: '测试合作伙伴', roles: ['SUPPLIER'], status: 'ACTIVE', deletedAt: null,
    } as any);
    prisma.partner.update.mockResolvedValue({ id: 'partner-1' } as any);

    await service.update('partner-1', { estDate: '2026-10-27', licenseExpiry: '2027-12-31' });

    expect(prisma.partner.update).toHaveBeenCalledWith({
      where: { id: 'partner-1' },
      data: {
        estDate: new Date('2026-10-27T00:00:00.000Z'),
        licenseExpiry: new Date('2027-12-31T00:00:00.000Z'),
      },
    });
  });

  it('允许清空合作伙伴日期，拒绝无效日期', async () => {
    prisma.partner.findUnique.mockResolvedValue({
      id: 'partner-1', name: '测试合作伙伴', roles: ['SUPPLIER'], status: 'ACTIVE', deletedAt: null,
    } as any);
    prisma.partner.update.mockResolvedValue({ id: 'partner-1' } as any);

    await service.update('partner-1', { estDate: null, licenseExpiry: '' });
    expect(prisma.partner.update).toHaveBeenCalledWith({
      where: { id: 'partner-1' }, data: { estDate: null, licenseExpiry: null },
    });

    await expect(service.update('partner-1', { estDate: '2026-02-30' }))
      .rejects.toThrow('成立日期格式不正确');
    expect(prisma.partner.update).toHaveBeenCalledTimes(1);
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

  it('社会运力车辆可以暂不关联物流承运商', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(null);
    prisma.vehicle.create.mockResolvedValue({ id: 'vehicle-social', plateNo: '浙A12345' } as any);
    await service.createVehicle({
      plateNo: '浙A12345', vehicleType: 'TRUCK', loadCapacity: 32.5, ownerType: 'OUTSOURCED',
    });
    expect(prisma.vehicle.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ownerType: 'OUTSOURCED', ownerId: null }),
    }));
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
