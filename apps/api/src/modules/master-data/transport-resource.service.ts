import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FileService } from '../common/file.service';
import { prepareAttachmentUpload } from '../common/attachment-upload';
import { DriverService } from './driver.service';
import { PartnerService } from './partner.service';
import { CreateTransportResourceDto } from './dto/transport-resource.dto';

export type ResourceFiles = { driverAttachments?: Express.Multer.File[]; vehicleAttachments?: Express.Multer.File[] };
type Kind = 'drivers' | 'vehicles';

@Injectable()
export class TransportResourceService {
  private readonly logger = new Logger(TransportResourceService.name);
  constructor(private readonly prisma: PrismaService, private readonly access: AccessControlService, private readonly files: FileService) {}

  async carrierOptions() {
    const [items, internalPartners] = await Promise.all([
      this.prisma.serviceOrganization.findMany({
        where: { organizationType: 'LOGISTICS_CARRIER', status: 'ACTIVE', deletedAt: null, partner: { status: 'ACTIVE', deletedAt: null } },
        select: { id: true, partnerId: true, partner: { select: { id: true, code: true, name: true, isInternal: true, status: true } } },
        orderBy: { partner: { name: 'asc' } },
        take: 200,
      }),
      this.prisma.partner.findMany({
        where: { isInternal: true, status: 'ACTIVE', deletedAt: null },
        select: { id: true, code: true, name: true, isInternal: true, status: true },
        orderBy: { name: 'asc' },
        take: 200,
      }),
    ]);
    return { items, internalPartners };
  }

  async parsePayload(raw: string) {
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new BadRequestException('提交信息格式不正确，请刷新页面后重试'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('请填写司机或车辆信息');
    const dto = plainToInstance(CreateTransportResourceDto, value);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) {
      const labels: Record<string, string> = { newDriver: '司机', newVehicle: '车辆', name: '姓名', phone: '手机号', plateNo: '车牌', loadCapacity: '核定载重', vehicleType: '车辆类型', ownerType: '车辆归属', idCardNo: '身份证号', licenseNo: '证件号' };
      const describe = (items: ValidationError[], prefix = ''): string[] => items.flatMap(e => {
        const label = prefix + (labels[e.property] || '填写信息');
        return [...(e.constraints ? [`${label}不完整或格式不正确`] : []), ...describe(e.children || [], label + ' / ')];
      });
      throw new BadRequestException(describe(errors).join('；'));
    }
    return dto;
  }

  private prepare(files: Express.Multer.File[]) {
    if (files.length > 6) throw new BadRequestException('每份档案最多选择6个附件');
    return files.map(file => {
      if (!file.buffer?.length || file.buffer.length > 20 * 1024 * 1024) throw new BadRequestException('附件不能为空，单个文件不能超过20MB');
      const prepared = prepareAttachmentUpload(file);
      if (!prepared) throw new BadRequestException('附件仅支持图片或PDF文件');
      return { file, ...prepared };
    });
  }

  async create(dto: CreateTransportResourceDto, fileGroups: ResourceFiles, userId: string) {
    await this.access.assertPermission(userId, 'transport_resource.manage');
    if (dto.driverId && dto.newDriver) throw new BadRequestException('司机请选择新建或已有档案之一');
    if (dto.vehicleId && dto.newVehicle) throw new BadRequestException('车辆请选择新建或已有档案之一');
    if (!dto.driverId && !dto.newDriver && !dto.vehicleId && !dto.newVehicle) throw new BadRequestException('请至少完整填写一名司机或一辆车辆');
    const driverFiles = this.prepare(fileGroups.driverAttachments || []), vehicleFiles = this.prepare(fileGroups.vehicleAttachments || []);
    if (driverFiles.length && !dto.driverId && !dto.newDriver) throw new BadRequestException('司机附件需要对应一份司机档案');
    if (vehicleFiles.length && !dto.vehicleId && !dto.newVehicle) throw new BadRequestException('车辆附件需要对应一份车辆档案');
    const uploaded: Array<{ fileName: string; originalName: string; mimeType: string; size: number; hash: string; kind: Kind }> = [];
    try {
      for (const [kind, group] of [['drivers', driverFiles], ['vehicles', vehicleFiles]] as const) {
        for (const item of group) {
          const stored = await this.files.upload(item.file.buffer, item.originalName, item.mimeType, 'transport-resources/' + kind);
          uploaded.push({ ...stored, originalName: item.originalName, mimeType: item.mimeType, hash: createHash('sha256').update(item.file.buffer).digest('hex'), kind });
        }
      }
      return await this.prisma.$transaction(async tx => {
        const drivers = new DriverService(tx as PrismaService), vehicles = new PartnerService(tx as PrismaService);
        const driver = dto.newDriver ? await drivers.create(dto.newDriver) : dto.driverId ? await drivers.findOne(dto.driverId) : null;
        if (driver && driver.status !== 'ACTIVE') throw new BadRequestException('所选司机已停用，请选择启用的司机');
        let vehicle = dto.newVehicle ? await vehicles.createVehicle({ ...dto.newVehicle, drivers: driver ? [{ driverId: driver.id, role: 'PRIMARY' }] : [] }) : null;
        if (dto.vehicleId) {
          // 同一车辆的关联变更串行，避免并发覆盖已有主/副驾。
          await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${dto.vehicleId} FOR UPDATE`;
          const existing = await vehicles.findOneVehicle(dto.vehicleId);
          if (existing.status !== 'ACTIVE') throw new BadRequestException('所选车辆不是可用状态，请先维护车辆状态');
          vehicle = existing;
          if (driver && !existing.drivers.some(link => link.driverId === driver.id)) {
            vehicle = await vehicles.updateVehicle(existing.id, { drivers: [
              ...existing.drivers.map(link => ({ driverId: link.driverId, role: link.role })),
              { driverId: driver.id, role: existing.drivers.some(link => link.role === 'PRIMARY') ? 'SECONDARY' : 'PRIMARY' },
            ] });
          }
        }
        for (const file of uploaded) {
          const parentId = file.kind === 'drivers' ? driver?.id : vehicle?.id;
          if (!parentId) throw new BadRequestException('附件缺少对应档案');
          await tx.attachment.create({ data: { [file.kind === 'drivers' ? 'driverId' : 'vehicleId']: parentId,
            fileName: file.fileName, originalName: file.originalName, mimeType: file.mimeType, size: file.size,
            category: file.kind === 'drivers' ? 'DRIVER_DOCUMENT' : 'VEHICLE_DOCUMENT', uploadedBy: userId, fileHash: file.hash,
          } });
        }
        return { driverId: driver?.id || null, vehicleId: vehicle?.id || null, driverCreated: Boolean(dto.newDriver), vehicleCreated: Boolean(dto.newVehicle), linked: Boolean(driver && vehicle) };
      }, { timeout: 20000 });
    } catch (error) {
      await Promise.all(uploaded.map(file => this.files.delete(file.fileName).catch(() => this.logger.warn('未完成登记的附件清理失败'))));
      throw error;
    }
  }

  private async requireRecord(kind: string, id: string, userId: string, manage = false): Promise<Kind> {
    await this.access.assertPermission(userId, manage ? 'transport_resource.manage' : 'transport_resource.view');
    if (kind !== 'drivers' && kind !== 'vehicles') throw new BadRequestException('不支持的运力档案类型');
    const exists = kind === 'drivers'
      ? await this.prisma.driver.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
      : await this.prisma.vehicle.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!exists) throw new NotFoundException(kind === 'drivers' ? '司机档案不存在' : '车辆档案不存在');
    return kind;
  }

  async upload(kind: string, id: string, file: Express.Multer.File, userId: string) {
    const validatedKind = await this.requireRecord(kind, id, userId, true);
    const [prepared] = this.prepare(file ? [file] : []);
    if (!prepared) throw new BadRequestException('请选择附件');
    const stored = await this.files.upload(file.buffer, prepared.originalName, prepared.mimeType, 'transport-resources/' + validatedKind);
    try {
      return await this.prisma.attachment.create({ data: {
        [validatedKind === 'drivers' ? 'driverId' : 'vehicleId']: id,
        fileName: stored.fileName, originalName: prepared.originalName, mimeType: prepared.mimeType, size: stored.size,
        category: validatedKind === 'drivers' ? 'DRIVER_DOCUMENT' : 'VEHICLE_DOCUMENT', uploadedBy: userId,
        fileHash: createHash('sha256').update(file.buffer).digest('hex'),
      } });
    } catch (error) { await this.files.delete(stored.fileName).catch(() => undefined); throw error; }
  }

  async attachment(kind: string, id: string, attachmentId: string, userId: string, remove = false) {
    const validatedKind = await this.requireRecord(kind, id, userId, remove);
    const key = validatedKind === 'drivers' ? 'driverId' : 'vehicleId';
    const file = await this.prisma.attachment.findFirst({ where: { id: attachmentId, [key]: id } });
    if (!file) throw new NotFoundException('附件不存在或不属于该档案');
    if (!remove) return { url: await this.files.getUrl(file.fileName) };
    await this.prisma.$transaction(async tx => {
      if (validatedKind === 'drivers') await tx.$queryRaw`SELECT id FROM drivers WHERE id = ${id} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${id} FOR UPDATE`;
      await tx.attachment.delete({ where: { id: file.id } });
    });
    await this.files.delete(file.fileName).catch(() => this.logger.warn('已删除的运力资料附件对象清理失败'));
  }
}
