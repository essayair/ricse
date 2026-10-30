import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FileService } from '../common/file.service';
import { TransportResourceService } from './transport-resource.service';

describe('司机车辆联合登记与资料附件', () => {
  const prisma = mockDeep<PrismaService>(), access = mockDeep<AccessControlService>(), files = mockDeep<FileService>();
  const service = new TransportResourceService(prisma, access, files);
  const file = () => ({ originalname: '证件.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF'), size: 14 }) as Express.Multer.File;
  const driver = { id: 'd', name: '张三', phone: '13800138000', status: 'ACTIVE', serviceOrganizationId: null, serviceOrganization: null, attachments: [], _count: { waybills: 0, vehicleLinks: 0 } };
  const vehicle = { id: 'v', plateNo: '浙A12345', vehicleType: 'SEMI_TRAILER', loadCapacity: 32, status: 'ACTIVE', ownerType: 'OUTSOURCED', ownerId: null, deviceType: 'NONE', drivers: [], _count: { waybills: 0 } };
  const newDriver = { name: '张三', phone: '13800138000' }, newVehicle = { plateNo: '浙A12345', vehicleType: 'SEMI_TRAILER', loadCapacity: 32, ownerType: 'OUTSOURCED' };
  beforeEach(() => {
    mockReset(prisma); mockReset(access); mockReset(files);
    prisma.$transaction.mockImplementation(async (f: any) => f(prisma));
    prisma.driver.findFirst.mockResolvedValue(null); prisma.driver.create.mockResolvedValue(driver as any);
    prisma.driver.findMany.mockImplementation((args: any) => Promise.resolve(args.where.id.in.map((id: string) => ({ ...driver, id }))) as any);
    prisma.vehicle.findUnique.mockResolvedValue(null); prisma.vehicle.create.mockResolvedValue(vehicle as any);
    prisma.vehicle.findFirst.mockResolvedValue(vehicle as any); prisma.vehicle.update.mockResolvedValue(vehicle as any);
    files.upload.mockResolvedValue({ fileName: 'stored.pdf', size: 14 } as any);
    files.delete.mockResolvedValue(undefined);
  });
  it('只创建司机，车辆完全独立；附件写入司机档案而非车辆', async () => {
    await expect(service.create({ newDriver }, { driverAttachments: [file()] }, 'u')).resolves.toMatchObject({ driverId: 'd', vehicleId: null, linked: false });
    expect(prisma.vehicle.create).not.toHaveBeenCalled();
    expect(prisma.attachment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ driverId: 'd', category: 'DRIVER_DOCUMENT', uploadedBy: 'u' }) }));
  });
  it('只创建车辆不强制有司机；两者一起创建自动关联为主驾', async () => {
    await service.create({ newVehicle }, { vehicleAttachments: [file()] }, 'u');
    expect(prisma.driver.create).not.toHaveBeenCalled();
    await service.create({ newDriver, newVehicle }, { driverAttachments: [file()], vehicleAttachments: [file()] }, 'u');
    expect(prisma.vehicle.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ drivers: { create: [{ driverId: 'd', role: 'PRIMARY' }] } }) }));
  });
  it('已有司机加新车辆不重复创建司机', async () => {
    prisma.driver.findFirst.mockResolvedValue(driver as any);
    await service.create({ driverId: 'd', newVehicle }, { vehicleAttachments: [file()] }, 'u');
    expect(prisma.driver.create).not.toHaveBeenCalled(); expect(prisma.vehicle.create).toHaveBeenCalled();
  });
  it('新司机关联已有车辆，不覆盖旧主驾，重复关联不会插入第二条', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ ...vehicle, drivers: [{ driverId: 'old', role: 'PRIMARY' }] } as any);
    await service.create({ newDriver, vehicleId: 'v' }, { driverAttachments: [file()] }, 'u');
    expect(prisma.vehicle.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ drivers: { deleteMany: {}, create: [{ driverId: 'old', role: 'PRIMARY' }, { driverId: 'd', role: 'SECONDARY' }] } }) }));
    prisma.vehicle.update.mockClear();
    prisma.driver.findFirst.mockResolvedValue(driver as any);
    prisma.vehicle.findFirst.mockResolvedValue({ ...vehicle, drivers: [{ driverId: 'd', role: 'PRIMARY' }] } as any);
    await service.create({ driverId: 'd', vehicleId: 'v' }, {}, 'u');
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });
  it('空表单、同一侧新建与已有并存仍拦截，证件附件可后补', async () => {
    await expect(service.create({}, {}, 'u')).rejects.toThrow('至少完整填写');
    await expect(service.create({ driverId: 'd', newDriver }, {}, 'u')).rejects.toThrow('之一');
    await expect(service.create({ newDriver }, {}, 'u')).resolves.toMatchObject({ driverId: 'd' });
    await expect(service.create({ newVehicle }, {}, 'u')).resolves.toMatchObject({ vehicleId: 'v' });
    await expect(service.create({ driverId: 'd' }, { vehicleAttachments: [file()] }, 'u')).rejects.toThrow('对应一份车辆');
    expect(files.upload).not.toHaveBeenCalled();
  });
  it('DTO校验不允许部分司机信息借车辆完整而绕过，也不接受额外关联字段', async () => {
    await expect(service.parsePayload(JSON.stringify({ newDriver: { name: '张三' }, newVehicle }))).rejects.toThrow('手机号');
    await expect(service.parsePayload(JSON.stringify({ newVehicle: { ...newVehicle, drivers: [{ driverId: 'd', role: 'PRIMARY' }] } }))).rejects.toThrow('格式不正确');
    await expect(service.parsePayload('invalid')).rejects.toThrow('格式不正确');
  });
  it('失败时回滚事务并清理已上传文件，不保留半套档案', async () => {
    prisma.vehicle.create.mockRejectedValue(new Error('模拟车辆创建失败'));
    await expect(service.create({ newDriver, newVehicle }, { driverAttachments: [file()], vehicleAttachments: [file()] }, 'u')).rejects.toThrow('模拟车辆创建失败');
    expect(prisma.$transaction).toHaveBeenCalled(); expect(files.delete).toHaveBeenCalledTimes(2);
  });
  it('继续执行手机号唯一检查，重复不会创建新司机，已上传文件会清理', async () => {
    prisma.driver.findFirst.mockResolvedValue(driver as any);
    await expect(service.create({ newDriver }, { driverAttachments: [file()] }, 'u')).rejects.toThrow('手机号已存在');
    expect(prisma.driver.create).not.toHaveBeenCalled(); expect(files.delete).toHaveBeenCalled();
  });
  it('不能通过车辆资料路径读取另一名司机的证件；最后一份附件允许删除', async () => {
    prisma.attachment.findFirst.mockResolvedValue(null);
    await expect(service.attachment('vehicles', 'v', 'driver-file', 'u')).rejects.toThrow('不属于该档案');
    expect(files.getUrl).not.toHaveBeenCalled();
    prisma.driver.findFirst.mockResolvedValue(driver as any); prisma.attachment.findFirst.mockResolvedValue({ id: 'a', fileName: 'stored.pdf' } as any); prisma.attachment.count.mockResolvedValue(1);
    await expect(service.attachment('drivers', 'd', 'a', 'u', true)).resolves.toBeUndefined();
    expect(prisma.attachment.delete).toHaveBeenCalled();
  });
});
