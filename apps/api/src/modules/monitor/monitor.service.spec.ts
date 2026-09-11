import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { EzvizProvider } from './ezviz.provider';
import { MonitorService } from './monitor.service';

describe('MonitorService', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = { assertPermission: jest.fn().mockResolvedValue({}) };
  const ezviz = {
    getAccessToken: jest.fn().mockResolvedValue({ accessToken: 'token-1', expireTime: 1893456000000 }),
    buildStreamUrl: jest.fn(({ deviceSerial, channelNo }: any) => `ezopen://code@open.ys7.com/${deviceSerial}/${channelNo}.hd.live`),
    ptz: jest.fn().mockResolvedValue({}),
    deviceStatus: jest.fn(),
  };
  let service: MonitorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MonitorService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: accessControl },
        { provide: EzvizProvider, useValue: ezviz },
      ],
    }).compile();
    service = module.get(MonitorService);
  });

  it('平台列表不返回 appSecret 原值，只标记是否已配置', async () => {
    prisma.monitorPlatform.findMany.mockResolvedValue([
      { id: 'p1', code: 'EZVIZ', appKey: 'key', appSecret: 'secret-value' },
      { id: 'p2', code: 'OTHER', appKey: '', appSecret: '' },
    ] as any);

    const list = await service.listPlatforms('user-1');

    expect(list[0].appSecret).toBe('******');
    expect(list[0].appSecretConfigured).toBe(true);
    expect(list[1].appSecret).toBe('');
    expect(list[1].appSecretConfigured).toBe(false);
    expect(JSON.stringify(list)).not.toContain('secret-value');
  });

  it('修改平台时 appSecret 留空不覆盖已有凭据', async () => {
    prisma.monitorPlatform.findFirst.mockResolvedValue({ id: 'p1', appSecret: 'old' } as any);
    prisma.monitorPlatform.update.mockResolvedValue({ id: 'p1', appSecret: 'old' } as any);

    await service.updatePlatform('p1', { name: '萤石云' }, 'user-1');

    expect(prisma.monitorPlatform.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ appSecret: expect.anything() }) }),
    );
  });

  it('分组下仍有点位时拒绝删除', async () => {
    prisma.monitorSite.findFirst.mockResolvedValue({ id: 's1' } as any);
    prisma.monitorCamera.count.mockResolvedValue(3);

    await expect(service.removeSite('s1', 'user-1')).rejects.toThrow(BadRequestException);
    expect(prisma.monitorSite.update).not.toHaveBeenCalled();
  });

  it('点位列表不回显验证码原值', async () => {
    prisma.monitorCamera.findMany.mockResolvedValue([
      { id: 'c1', code: 'gk-3', verifyCode: 'Kd147258', site: { id: 's1' } },
    ] as any);

    const list = await service.listCameras('user-1');

    expect(list[0]).not.toHaveProperty('verifyCode');
    expect(list[0].verifyCodeConfigured).toBe(true);
  });

  it('公开点位按官网既有结构输出并附带取流地址', async () => {
    prisma.monitorSite.findMany.mockResolvedValue([{
      id: 's1', code: 'panorama', name: '玉门仓监控-全景',
      platform: { baseUrl: 'https://open.ys7.com' },
      cameras: [{
        id: 'c1', code: 'gk-3', name: '广角摄像头全景', deviceSerial: 'GK9665972',
        channelNo: 3, verifyCode: 'Kd147258', streamQuality: 'hd', ptzSupport: true,
        online: true, status: 'ACTIVE',
      }],
    }] as any);

    const groups = await service.publicCameraGroups();

    expect(groups[0]).toMatchObject({ label: '玉门仓监控-全景', value: 'panorama' });
    expect(groups[0].cameraList[0]).toMatchObject({
      id: 'gk-3', code: 'GK9665972', ptzSupport: true,
      url: 'ezopen://code@open.ys7.com/GK9665972/3.hd.live',
    });
  });

  it('不支持云台的点位拒绝云台指令', async () => {
    prisma.monitorCamera.findFirst.mockResolvedValue({
      id: 'c1', ptzSupport: false, site: { platform: { status: 'ACTIVE', deletedAt: null } },
    } as any);

    await expect(service.publicPtz('start', 'c1', 8)).rejects.toThrow('该点位不支持云台控制');
    expect(ezviz.ptz).not.toHaveBeenCalled();
  });

  it('平台停用时拒绝云台指令', async () => {
    prisma.monitorCamera.findFirst.mockResolvedValue({
      id: 'c1', ptzSupport: true, deviceSerial: 'GK9665972', channelNo: 3,
      site: { platform: { status: 'INACTIVE', deletedAt: null } },
    } as any);

    await expect(service.publicPtz('start', 'c1', 8)).rejects.toThrow('监控平台已停用');
  });

  it('没有启用平台时下发凭据明确失败', async () => {
    prisma.monitorPlatform.findFirst.mockResolvedValue(null);

    await expect(service.publicAccessToken()).rejects.toThrow(NotFoundException);
  });

  it('刷新状态按设备去重查询并回写每个点位', async () => {
    prisma.monitorPlatform.findMany.mockResolvedValue([{
      id: 'p1', baseUrl: 'https://open.ys7.com', appKey: 'k', appSecret: 's',
      sites: [{
        cameras: [
          { id: 'c1', deviceSerial: 'GK9665972' },
          { id: 'c2', deviceSerial: 'GK9665972' },
          { id: 'c3', deviceSerial: 'GQ5318128' },
        ],
      }],
    }] as any);
    ezviz.deviceStatus.mockResolvedValue(new Map([['GK9665972', true], ['GQ5318128', false]]));
    prisma.monitorCamera.update.mockResolvedValue({} as any);

    const result = await service.refreshStatus('user-1');

    expect(ezviz.deviceStatus).toHaveBeenCalledWith(expect.anything(), ['GK9665972', 'GQ5318128']);
    expect(result.updated).toBe(3);
    expect(prisma.monitorCamera.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c3' }, data: expect.objectContaining({ online: false }) }),
    );
  });
});
