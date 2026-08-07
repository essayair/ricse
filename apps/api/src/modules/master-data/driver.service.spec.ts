import { BadRequestException, ConflictException } from '@nestjs/common';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { DriverService } from './driver.service';

describe('DriverService 司机管理', () => {
  const prisma = mockDeep<PrismaService>();
  let service: DriverService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DriverService(prisma);
  });

  it('司机必须归属于有效物流承运商', async () => {
    prisma.serviceOrganization.findFirst.mockResolvedValue(null);
    await expect(service.create({
      serviceOrganizationId: 'org-invalid', name: '张师傅', phone: '13800138000',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('同一承运商下手机号不能重复', async () => {
    prisma.serviceOrganization.findFirst.mockResolvedValue({ id: 'org-1', partner: {} } as any);
    prisma.driver.findFirst.mockResolvedValue({ id: 'driver-old' } as any);
    await expect(service.create({
      serviceOrganizationId: 'org-1', name: '张师傅', phone: '13800138000',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('模糊搜索覆盖姓名、手机号、证件号和服务商', async () => {
    prisma.driver.findMany.mockResolvedValue([]);
    prisma.driver.count.mockResolvedValue(0);
    await service.findAll({ search: '张', status: 'ACTIVE' });
    expect(prisma.driver.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.any(Array), status: 'ACTIVE' }),
    }));
  });

  it('已有运单引用的司机不能删除', async () => {
    prisma.driver.findFirst.mockResolvedValue({ id: 'driver-1', _count: { waybills: 1 } } as any);
    await expect(service.remove('driver-1')).rejects.toThrow('请将状态改为停用');
  });
});
