import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { EzvizProvider } from './ezviz.provider';
import {
  CreateMonitorCameraDto, CreateMonitorSiteDto, UpdateMonitorCameraDto,
  UpdateMonitorPlatformDto, UpdateMonitorSiteDto, UpsertMonitorPlatformDto,
} from './dto/monitor.dto';

const MASKED = '******';

@Injectable()
export class MonitorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
    private readonly ezviz: EzvizProvider,
  ) {}

  // ========== 平台账号 ==========

  async listPlatforms(userId: string) {
    await this.accessControl.assertPermission(userId, 'monitor.view');
    const platforms = await this.prisma.monitorPlatform.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { sites: { where: { deletedAt: null } } } } },
    });
    return platforms.map((item) => this.maskPlatform(item));
  }

  async createPlatform(dto: UpsertMonitorPlatformDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'monitor.manage');
    const exists = await this.prisma.monitorPlatform.findUnique({ where: { code: dto.code } });
    if (exists) throw new BadRequestException(`平台标识 ${dto.code} 已存在`);
    const created = await this.prisma.monitorPlatform.create({
      data: {
        code: dto.code, name: dto.name, appKey: dto.appKey, appSecret: dto.appSecret,
        baseUrl: dto.baseUrl || 'https://open.ys7.com', status: dto.status || 'ACTIVE', remark: dto.remark,
      },
    });
    return this.maskPlatform(created);
  }

  async updatePlatform(id: string, dto: UpdateMonitorPlatformDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'monitor.manage');
    await this.getPlatformOrFail(id);
    const updated = await this.prisma.monitorPlatform.update({
      where: { id },
      data: {
        name: dto.name, appKey: dto.appKey, baseUrl: dto.baseUrl, status: dto.status, remark: dto.remark,
        // 留空表示不修改，避免前端回显掩码后误将 secret 覆盖为空。
        ...(dto.appSecret ? { appSecret: dto.appSecret } : {}),
      },
    });
    return this.maskPlatform(updated);
  }

  /** 连通性测试：真实换取一次 accessToken，失败时把萤石原始提示透出给管理员。 */
  async testPlatform(id: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'monitor.manage');
    const platform = await this.getPlatformOrFail(id);
    const token = await this.ezviz.getAccessToken(platform);
    return { ok: true, expireAt: new Date(token.expireTime).toISOString() };
  }

  // ========== 点位分组 ==========

  async listSites(userId: string) {
    await this.accessControl.assertPermission(userId, 'monitor.view');
    return this.prisma.monitorSite.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        platform: { select: { id: true, code: true, name: true, status: true } },
        _count: { select: { cameras: { where: { deletedAt: null } } } },
      },
    });
  }

  async createSite(dto: CreateMonitorSiteDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'monitor.manage');
    await this.getPlatformOrFail(dto.platformId);
    const exists = await this.prisma.monitorSite.findFirst({
      where: { platformId: dto.platformId, code: dto.code, deletedAt: null },
    });
    if (exists) throw new BadRequestException(`该平台下分组标识 ${dto.code} 已存在`);
    return this.prisma.monitorSite.create({
      data: {
        platformId: dto.platformId, code: dto.code, name: dto.name, warehouseId: dto.warehouseId,
        sortOrder: dto.sortOrder ?? 0, status: dto.status || 'ACTIVE', remark: dto.remark,
      },
    });
  }

  async updateSite(id: string, dto: UpdateMonitorSiteDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'monitor.manage');
    await this.getSiteOrFail(id);
    return this.prisma.monitorSite.update({ where: { id }, data: { ...dto } });
  }

  async removeSite(id: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'monitor.manage');
    await this.getSiteOrFail(id);
    const cameras = await this.prisma.monitorCamera.count({ where: { siteId: id, deletedAt: null } });
    if (cameras > 0) throw new BadRequestException(`该分组下还有 ${cameras} 个点位，请先移除或转移点位`);
    await this.prisma.monitorSite.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  // ========== 摄像头点位 ==========

  async listCameras(userId: string, params: { siteId?: string; status?: string; search?: string } = {}) {
    await this.accessControl.assertPermission(userId, 'monitor.view');
    const search = params.search?.trim();
    const cameras = await this.prisma.monitorCamera.findMany({
      where: {
        deletedAt: null,
        ...(params.siteId ? { siteId: params.siteId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { code: { contains: search, mode: 'insensitive' as const } },
            { deviceSerial: { contains: search, mode: 'insensitive' as const } },
          ],
        } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { site: { select: { id: true, code: true, name: true, platformId: true } } },
    });
    // 验证码属于取流凭据，管理列表只标记是否已配置，不回显原值。
    return cameras.map(({ verifyCode, ...rest }) => ({ ...rest, verifyCodeConfigured: !!verifyCode }));
  }

  async createCamera(dto: CreateMonitorCameraDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'monitor.manage');
    await this.getSiteOrFail(dto.siteId);
    const exists = await this.prisma.monitorCamera.findFirst({
      where: { siteId: dto.siteId, code: dto.code, deletedAt: null },
    });
    if (exists) throw new BadRequestException(`该分组下点位标识 ${dto.code} 已存在`);
    return this.prisma.monitorCamera.create({
      data: {
        siteId: dto.siteId, code: dto.code, name: dto.name, deviceSerial: dto.deviceSerial,
        channelNo: dto.channelNo, verifyCode: dto.verifyCode, streamQuality: dto.streamQuality || 'hd',
        ptzSupport: dto.ptzSupport ?? false, purpose: dto.purpose, sortOrder: dto.sortOrder ?? 0,
        status: dto.status || 'ACTIVE', remark: dto.remark,
      },
    });
  }

  async updateCamera(id: string, dto: UpdateMonitorCameraDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'monitor.manage');
    await this.getCameraOrFail(id);
    if (dto.siteId) await this.getSiteOrFail(dto.siteId);
    return this.prisma.monitorCamera.update({
      where: { id },
      data: { ...dto, ...(dto.verifyCode ? { verifyCode: dto.verifyCode } : {}) },
    });
  }

  async removeCamera(id: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'monitor.manage');
    await this.getCameraOrFail(id);
    await this.prisma.monitorCamera.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  /** 配置页单路预览：签发凭据用于确认序列号与通道号配对是否正确。 */
  async previewCamera(id: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'monitor.view');
    const camera = await this.getCameraOrFail(id);
    const platform = await this.getPlatformOrFail(camera.site.platformId);
    const { accessToken, expireTime } = await this.ezviz.getAccessToken(platform);
    return {
      accessToken,
      expireTime,
      url: this.ezviz.buildStreamUrl({
        baseUrl: platform.baseUrl, deviceSerial: camera.deviceSerial,
        channelNo: camera.channelNo, verifyCode: camera.verifyCode, quality: camera.streamQuality,
      }),
    };
  }

  /** 刷新真实在线状态，替代此前前端写死的 online: true。 */
  async refreshStatus(userId: string) {
    await this.accessControl.assertPermission(userId, 'monitor.manage');
    const platforms = await this.prisma.monitorPlatform.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      include: { sites: { where: { deletedAt: null }, include: { cameras: { where: { deletedAt: null } } } } },
    });
    let updated = 0;
    for (const platform of platforms) {
      const cameras = platform.sites.flatMap((site) => site.cameras);
      const serials = [...new Set(cameras.map((camera) => camera.deviceSerial))];
      if (!serials.length) continue;
      const status = await this.ezviz.deviceStatus(platform, serials);
      const syncAt = new Date();
      for (const camera of cameras) {
        const online = status.get(camera.deviceSerial) ?? false;
        await this.prisma.monitorCamera.update({
          where: { id: camera.id }, data: { online, statusSyncAt: syncAt },
        });
        updated += 1;
      }
    }
    return { updated };
  }

  // ========== 公开端：官网与数字大屏 ==========

  /**
   * 返回分组与点位，字段与官网 warehouseList 保持一致，便于直接替换硬编码。
   * 只暴露拼好的取流地址，不暴露 appKey / appSecret。
   */
  async publicCameraGroups() {
    const sites = await this.prisma.monitorSite.findMany({
      where: {
        deletedAt: null, status: 'ACTIVE',
        platform: { deletedAt: null, status: 'ACTIVE' },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        platform: { select: { baseUrl: true } },
        cameras: {
          where: { deletedAt: null, status: 'ACTIVE' },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    return sites.map((site) => ({
      label: site.name,
      value: site.code,
      cameraList: site.cameras.map((camera) => ({
        id: camera.code,
        name: camera.name,
        code: camera.deviceSerial,
        channelNo: camera.channelNo,
        cameraId: camera.id,
        online: camera.online,
        live: camera.status === 'ACTIVE',
        recording: camera.status === 'ACTIVE',
        ptzSupport: camera.ptzSupport,
        url: this.ezviz.buildStreamUrl({
          baseUrl: site.platform.baseUrl, deviceSerial: camera.deviceSerial,
          channelNo: camera.channelNo, verifyCode: camera.verifyCode, quality: camera.streamQuality,
        }),
      })),
    }));
  }

  /** 播放器需要浏览器持有 accessToken，这里只下发短期 token，appSecret 始终留在服务端。 */
  async publicAccessToken() {
    const platform = await this.defaultActivePlatform();
    const { accessToken, expireTime } = await this.ezviz.getAccessToken(platform);
    return { accessToken, expireTime };
  }

  /** 云台代理：前端只传 cameraId，设备序列号与通道号由服务端解析。 */
  async publicPtz(action: 'start' | 'stop', cameraId: string, direction: number, speed?: number) {
    const camera = await this.prisma.monitorCamera.findFirst({
      where: { id: cameraId, deletedAt: null, status: 'ACTIVE' },
      include: { site: { include: { platform: true } } },
    });
    if (!camera) throw new NotFoundException('监控点位不存在或已停用');
    if (!camera.ptzSupport) throw new BadRequestException('该点位不支持云台控制');
    if (camera.site.platform.status !== 'ACTIVE' || camera.site.platform.deletedAt) {
      throw new BadRequestException('监控平台已停用');
    }
    await this.ezviz.ptz(camera.site.platform, {
      action, deviceSerial: camera.deviceSerial, channelNo: camera.channelNo, direction, speed,
    });
    return { ok: true };
  }

  // ========== 内部工具 ==========

  private async defaultActivePlatform() {
    const platform = await this.prisma.monitorPlatform.findFirst({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (!platform) throw new NotFoundException('尚未启用任何监控平台');
    return platform;
  }

  private async getPlatformOrFail(id: string) {
    const platform = await this.prisma.monitorPlatform.findFirst({ where: { id, deletedAt: null } });
    if (!platform) throw new NotFoundException('监控平台不存在');
    return platform;
  }

  private async getSiteOrFail(id: string) {
    const site = await this.prisma.monitorSite.findFirst({ where: { id, deletedAt: null } });
    if (!site) throw new NotFoundException('监控点位分组不存在');
    return site;
  }

  private async getCameraOrFail(id: string) {
    const camera = await this.prisma.monitorCamera.findFirst({
      where: { id, deletedAt: null },
      include: { site: true },
    });
    if (!camera) throw new NotFoundException('监控点位不存在');
    return camera;
  }

  private maskPlatform<T extends { appSecret: string }>(platform: T) {
    return { ...platform, appSecret: platform.appSecret ? MASKED : '', appSecretConfigured: !!platform.appSecret };
  }
}
