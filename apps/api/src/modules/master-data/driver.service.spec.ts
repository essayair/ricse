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

  it('手机号在全平台不能重复', async () => {
    prisma.serviceOrganization.findFirst.mockResolvedValue({ id: 'org-1', partner: {} } as any);
    prisma.driver.findFirst.mockResolvedValue({ id: 'driver-old' } as any);
    await expect(service.create({
      serviceOrganizationId: 'org-1', name: '张师傅', phone: '13800138000',
    })).rejects.toThrow('该手机号已存在司机档案');
  });

  it('无承运商司机同样执行手机号全平台唯一', async () => {
    prisma.driver.findFirst.mockResolvedValue({ id: 'driver-old' } as any);
    await expect(service.create({
      name: '社会司机', phone: '13800138000',
    })).rejects.toThrow('该手机号已存在司机档案');
  });

  it('身份证号和驾驶证号填写后全平台唯一', async () => {
    prisma.driver.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'driver-by-id-card' } as any)
      .mockResolvedValueOnce(null);
    await expect(service.create({
      name: '张师傅', phone: '13800138000', idCardNo: '330102199001011234', licenseNo: 'LICENCE001',
    })).rejects.toThrow('该身份证号已存在司机档案');
  });

  it('模糊搜索覆盖姓名、手机号、证件号和服务商', async () => {
    prisma.driver.findMany.mockResolvedValue([]);
    prisma.driver.count.mockResolvedValue(0);
    await service.findAll({ search: '张', status: 'ACTIVE' });
    expect(prisma.driver.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.any(Array), status: 'ACTIVE' }),
    }));
  });

  it('serviceOrganizationId=NONE 只筛选无承运商司机', async () => {
    prisma.driver.findMany.mockResolvedValue([]);
    prisma.driver.count.mockResolvedValue(0);
    await service.findAll({ serviceOrganizationId: 'NONE' });
    expect(prisma.driver.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ serviceOrganizationId: null }),
    }));
  });

  it('按车队筛选司机', async () => {
    prisma.driver.findMany.mockResolvedValue([]);
    prisma.driver.count.mockResolvedValue(0);
    await service.findAll({ fleetId: 'fleet-1' });
    expect(prisma.driver.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ fleetLinks: { some: { fleetId: 'fleet-1' } } }),
    }));
  });

  it('已有运单引用的司机不能删除', async () => {
    prisma.driver.findFirst.mockResolvedValue({ id: 'driver-1', _count: { waybills: 1 } } as any);
    await expect(service.remove('driver-1')).rejects.toThrow('请将状态改为停用');
  });
});
