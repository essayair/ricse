import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FileService } from '../common/file.service';
import { AttachmentMimeType, normalizeAttachmentName, prepareAttachmentUpload } from '../common/attachment-upload';
import { BusinessImagePreviewService } from './business-image-preview.service';
import { LinkBusinessImageDto, UpdateBusinessImageDto, UploadBusinessImageDto } from './business-image.dto';
import { IMAGE_TYPES, TYPE_LABELS, TARGETS, ImageTargetType, UNLINKED, imageTarget, imageTargetCategory, inferImageType, isLinkedImage, normalizeImageRemarks } from './business-image.policy';

const nest = (path: string, value: any): any => path.split('.').reverse().reduce((v, key) => ({ [key]: v }), value);
const CONTRACT_SELECT = { id: true, contractNo: true, title: true };
const NOTICE_SELECT = { id: true, noticeNo: true, order: { select: { contract: { select: CONTRACT_SELECT } } } };
const WAYBILL_SELECT = { id: true, waybillNo: true, dispatchNotice: { select: NOTICE_SELECT } };
const PATHS: Record<string, string> = { CONTRACT: '', WAYBILL: 'dispatchNotice.order.contract', WEIGH_TICKET: 'waybill.dispatchNotice.order.contract', QUALITY_REPORT: 'contract', INBOUND: 'waybill.dispatchNotice.order.contract', OUTBOUND: 'waybill.dispatchNotice.order.contract', SETTLEMENT: 'contract', PAYMENT_REQUEST: 'contract', FUND: 'contract' };
const HREFS: Record<string, string> = { CONTRACT: 'contracts', WAYBILL: 'waybills', WEIGH_TICKET: 'weighbridge', QUALITY_REPORT: 'quality/reports', INBOUND: 'inbound', OUTBOUND: 'outbound', SETTLEMENT: 'settlements', PAYMENT_REQUEST: 'payment-requests', FUND: 'funds' };
const SOURCE_INCLUDE: any = {
  businessImage: { include: { contract: { select: CONTRACT_SELECT }, dispatchNotice: { select: { id: true, noticeNo: true } } } },
  uploader: { select: { id: true, name: true, username: true } },
  contract: { select: CONTRACT_SELECT }, waybill: { select: WAYBILL_SELECT },
  weighTicket: { select: { id: true, ticketNo: true, waybill: { select: WAYBILL_SELECT } } },
  weighTask: { select: { id: true, waybill: { select: WAYBILL_SELECT } } },
  qualityTask: { select: { id: true, waybill: { select: WAYBILL_SELECT } } },
  qualitySample: { select: { id: true, qualityTaskId: true, qualityTask: { select: { waybill: { select: WAYBILL_SELECT } } } } },
  qualityInspection: { select: { id: true, inspectionNo: true, contract: { select: CONTRACT_SELECT }, qualityTask: { select: { waybill: { select: WAYBILL_SELECT } } }, weighTicket: { select: { waybill: { select: WAYBILL_SELECT } } } } },
  inboundReceipt: { select: { id: true, receiptNo: true, waybill: { select: WAYBILL_SELECT } } },
  outboundReceipt: { select: { id: true, receiptNo: true, waybill: { select: WAYBILL_SELECT } } },
  financialSettlement: { select: { id: true, settlementNo: true, contract: { select: CONTRACT_SELECT } } },
  paymentRequest: { select: { id: true, requestNo: true, contract: { select: CONTRACT_SELECT } } },
  fundTransaction: { select: { id: true, transactionNo: true, contract: { select: CONTRACT_SELECT } } },
  logisticsSettlement: { select: { id: true, settlementNo: true, lines: { select: { waybill: { select: WAYBILL_SELECT } } } } },
  inventoryReversal: { select: { id: true, reversalNo: true, businessInbound: { select: { receipt: { select: { waybill: { select: WAYBILL_SELECT } } } } }, salesOutbound: { select: { receipt: { select: { waybill: { select: WAYBILL_SELECT } } } } } } },
};
for (const config of Object.values(TARGETS)) {
  const select = SOURCE_INCLUDE[config.field.replace(/Id$/, '')].select;
  select.status = true;
  if (config.model === 'contract') select.type = true;
  if (config.model === 'fundTransaction') select.direction = true;
}
const AUDIT_TYPES: Record<string, string> = { CONTRACT: 'CONTRACT', WAYBILL: 'WAYBILL', WEIGH_TICKET: 'WEIGH_TICKET', QUALITY_REPORT: 'QUALITY_INSPECTION', INBOUND: 'INBOUND_RECEIPT', OUTBOUND: 'OUTBOUND_RECEIPT', SETTLEMENT: 'FINANCIAL_SETTLEMENT', PAYMENT_REQUEST: 'PAYMENT_REQUEST', FUND: 'FUND_TRANSACTION' };

@Injectable()
export class BusinessImageService {
  private readonly logger = new Logger(BusinessImageService.name);
  constructor(private readonly prisma: PrismaService, private readonly access: AccessControlService, private readonly files: FileService, private readonly previews: BusinessImagePreviewService) {}

  private async context(userId: string, manage = false) {
    const context = await this.access.assertPermission(userId, manage ? 'business_image.manage' : 'business_image.view');
    if (context.isExternal) throw new ForbiddenException('业务影像资料库暂仅对内部账号开放');
    await this.access.assertPermission(userId, 'contract.view');
    return context;
  }
  private async contracts(userId: string, manage = false): Promise<any> {
    return { deletedAt: null, AND: [await this.access.getContractScope(userId, manage ? 'business_image.manage' : 'business_image.view'), await this.access.getContractScope(userId, 'contract.view')] };
  }
  private async targetScope(type: ImageTargetType, userId: string, permission: string): Promise<any> {
    if (type === 'WAYBILL') return this.access.getWaybillScope(userId, permission);
    if (type === 'WEIGH_TICKET') return this.access.getWeighTicketScope(userId, permission);
    if (type === 'QUALITY_REPORT') return this.access.getQualityInspectionScope(userId, permission);
    if (type === 'INBOUND') return this.access.getInboundReceiptScope(userId, permission);
    if (type === 'OUTBOUND') return this.access.getOutboundReceiptScope(userId, permission);
    if (type === 'PAYMENT_REQUEST') return this.access.getPaymentRequestScope(userId, permission);
    const scope = await this.access.getContractScope(userId, permission);
    return type === 'CONTRACT' ? scope : { contract: scope };
  }
  private contractFilter(type: ImageTargetType, contract: any) {
    if (type === 'QUALITY_REPORT') return { OR: [{ contract }, nest('weighTicket.waybill.dispatchNotice.order.contract', contract), nest('qualityTask.waybill.dispatchNotice.order.contract', contract)] };
    return PATHS[type] ? nest(PATHS[type], contract) : contract;
  }
  private noticeFilter(type: ImageTargetType, noticeId?: string | null): any {
    if (!noticeId) return {};
    if (type === 'WAYBILL') return { dispatchNoticeId: noticeId };
    if (['WEIGH_TICKET', 'INBOUND', 'OUTBOUND'].includes(type)) return nest('waybill.dispatchNoticeId', noticeId);
    if (type === 'QUALITY_REPORT') return { OR: [
      nest('weighTicket.waybill.dispatchNoticeId', noticeId),
      nest('qualityTask.waybill.dispatchNoticeId', noticeId),
      { taskLinks: { some: { unlinkedAt: null, qualityTask: { deletedAt: null, waybill: { dispatchNoticeId: noticeId } } } } },
    ] };
    // 合同、汇总结算和资金单可能覆盖多个通知，只校验合同归属。
    return {};
  }
  private async readable(userId: string, params: Record<string, string> = {}): Promise<any> {
    const context = await this.context(userId);
    const contract = { AND: [await this.contracts(userId), ...(params.contractId ? [{ id: params.contractId }] : [])] };
    const branches: any[] = [{ ...UNLINKED, businessImage: { contract, ...(params.dispatchNoticeId ? { dispatchNoticeId: params.dispatchNoticeId } : {}) } }];
    for (const [type, config] of Object.entries(TARGETS)) {
      if (!context.isAdmin && !context.permissions.includes(config.view)) continue;
      if (params.dispatchNoticeId && !['WAYBILL', 'WEIGH_TICKET', 'QUALITY_REPORT', 'INBOUND', 'OUTBOUND'].includes(type)) continue;
      branches.push({ [config.field.replace(/Id$/, '')]: { ...(!['FUND', 'PAYMENT_REQUEST'].includes(type) ? { deletedAt: null } : {}), AND: [await this.targetScope(type as ImageTargetType, userId, config.view), this.contractFilter(type as ImageTargetType, contract), this.noticeFilter(type as ImageTargetType, params.dispatchNoticeId)] } });
    }
    if (context.isAdmin || context.permissions.includes('quality.view')) {
      const waybill = { AND: [await this.access.getWaybillScope(userId, 'quality.view'), nest('dispatchNotice.order.contract', contract), ...(params.dispatchNoticeId ? [{ dispatchNoticeId: params.dispatchNoticeId }] : [])] };
      branches.push({ weighTask: { deletedAt: null, waybill } }, { qualityTask: { deletedAt: null, waybill } }, { qualitySample: { deletedAt: null, qualityTask: { deletedAt: null, waybill } } });
    }
    if (context.isAdmin || context.permissions.includes('logistics.settlement.view')) {
      const visibleWaybill = nest('dispatchNotice.order.contract', await this.contracts(userId));
      const selectedWaybill = { AND: [nest('dispatchNotice.order.contract', contract), ...(params.dispatchNoticeId ? [{ dispatchNoticeId: params.dispatchNoticeId }] : [])] };
      branches.push({ logisticsSettlement: { deletedAt: null, AND: [await this.access.getLogisticsSettlementScope(userId), { lines: { some: { waybill: selectedWaybill }, every: { waybill: visibleWaybill } } }] } });
    }
    if (context.isAdmin || context.permissions.includes('inventory.view')) {
      const receipt = { waybill: { AND: [nest('dispatchNotice.order.contract', contract), ...(params.dispatchNoticeId ? [{ dispatchNoticeId: params.dispatchNoticeId }] : [])] } };
      branches.push({ inventoryReversal: { AND: [await this.access.getInventoryReversalScope(userId), { OR: [{ businessInbound: { receipt } }, { salesOutbound: { receipt } }] }] } });
    }
    return { AND: [{ OR: branches }, ...(params.search?.trim() ? [{ originalName: { contains: params.search.trim().slice(0, 100), mode: 'insensitive' } }] : []), ...(params.linkState === 'ARCHIVED' ? [UNLINKED] : params.linkState === 'LINKED' ? [{ NOT: UNLINKED }] : []), ...(params.uploadedBy ? [{ uploadedBy: params.uploadedBy }] : []), ...(params.from || params.to ? [{ createdAt: { ...(params.from ? { gte: this.date(params.from) } : {}), ...(params.to ? { lt: new Date(this.date(params.to).getTime() + 86400000) } : {}) } }] : [])] };
  }
  private date(value: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new BadRequestException('请选择有效日期'); return new Date(`${value}T00:00:00+08:00`); }
  private typeFilter(documentType?: string): any {
    if (!documentType) return {};
    if (!(IMAGE_TYPES as readonly string[]).includes(documentType)) throw new BadRequestException('影像类型无效');
    const legacy: Record<string, any> = { CONTRACT: { contractId: { not: null } }, WEIGH_TICKET: { weighTicketId: { not: null } }, QUALITY_REPORT: { qualityInspectionId: { not: null } }, RECEIPT: { waybillId: { not: null }, category: { not: 'RECEIPT_PHOTO' } }, VEHICLE_PHOTO: { OR: [{ qualityTaskId: { not: null }, category: 'VEHICLE_PLATE' }, { weighTaskId: { not: null }, category: 'VEHICLE_PLATE' }, { qualitySampleId: { not: null }, category: 'VEHICLE_PLATE' }] }, SCENE_PHOTO: { OR: [{ waybillId: { not: null }, category: 'RECEIPT_PHOTO' }, { qualityTaskId: { not: null }, category: { not: 'VEHICLE_PLATE' } }, { qualitySampleId: { not: null }, category: { not: 'VEHICLE_PLATE' } }, { weighTaskId: { not: null }, category: { not: 'VEHICLE_PLATE' } }] }, WAREHOUSE_DOCUMENT: { OR: [{ inboundReceiptId: { not: null } }, { outboundReceiptId: { not: null } }, { inventoryReversalId: { not: null } }] }, SETTLEMENT_DOCUMENT: { OR: [{ financialSettlementId: { not: null } }, { paymentRequestId: { not: null } }, { fundTransactionId: { not: null } }, { logisticsSettlementId: { not: null } }] } };
    return { OR: [{ businessImage: { documentType } }, ...(legacy[documentType] ? [{ businessImage: null, ...legacy[documentType] }] : [])] };
  }
  private row(a: any, canManage = false) {
    const kind = imageTarget(a);
    const config = kind ? TARGETS[kind] : null;
    const target = config ? a[config.field.replace(/Id$/, '')] : null;
    const waybill = a.waybill || a.weighTicket?.waybill || a.qualityInspection?.weighTicket?.waybill || a.qualityInspection?.qualityTask?.waybill || a.weighTask?.waybill || a.qualityTask?.waybill || a.qualitySample?.qualityTask?.waybill || a.inboundReceipt?.waybill || a.outboundReceipt?.waybill || a.logisticsSettlement?.lines[0]?.waybill || a.inventoryReversal?.businessInbound?.receipt?.waybill || a.inventoryReversal?.salesOutbound?.receipt?.waybill;
    const contract = a.businessImage?.contract || a.contract || a.qualityInspection?.contract || a.financialSettlement?.contract || a.paymentRequest?.contract || a.fundTransaction?.contract || waybill?.dispatchNotice?.order?.contract;
    const otherTarget = a.logisticsSettlement ? { no: a.logisticsSettlement.settlementNo, href: `/dashboard/logistics-settlements/${a.logisticsSettlement.id}` }
      : a.inventoryReversal ? { no: a.inventoryReversal.reversalNo, href: `/dashboard/inventory-reversals/${a.inventoryReversal.id}` }
      : waybill && (a.qualityTask || a.qualitySample) ? { no: '质检现场证据', href: `/dashboard/quality/${a.qualityTask?.id || a.qualitySample.qualityTaskId}` }
      : waybill && a.weighTask ? { no: '过磅现场证据', href: `/dashboard/weighbridge/management/${waybill.id}` } : null;
    return { id: a.id, originalName: a.originalName, remarks: a.businessImage?.remarks || '', sourceOriginalName: a.businessImage?.sourceOriginalName || a.originalName, mimeType: a.mimeType, size: a.size, originalSize: a.businessImage?.originalSize || a.size, photoCompressed: a.businessImage?.photoCompressed || false, documentType: inferImageType(a), typeLabel: TYPE_LABELS[inferImageType(a)], linkState: isLinkedImage(a) ? 'LINKED' : 'ARCHIVED', source: a.businessImage ? 'ARCHIVE' : 'DOCUMENT', contract, dispatchNotice: a.businessImage?.dispatchNotice || waybill?.dispatchNotice && { id: waybill.dispatchNotice.id, noticeNo: waybill.dispatchNotice.noticeNo }, targetType: kind, targetId: config ? a[config.field] : null, targetNo: target && config ? target[config.number] : otherTarget?.no, targetHref: kind && target ? `/dashboard/${HREFS[kind]}/${target.id}` : otherTarget?.href, uploader: a.uploader, createdAt: a.createdAt, canEdit: Boolean(canManage && a.businessImage && !isLinkedImage(a)), canLink: Boolean(canManage && a.businessImage && !isLinkedImage(a)), canUnlink: Boolean(canManage && a.businessImage && kind) };
  }
  async list(userId: string, params: Record<string, string>) {
    const page = Math.max(1, Math.min(100000, Number(params.page) || 1));
    const where = { AND: [await this.readable(userId, params), this.typeFilter(params.documentType)] };
    const [items, total, stats, context] = await Promise.all([this.prisma.attachment.findMany({ where, include: SOURCE_INCLUDE, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30, skip: (Math.floor(page) - 1) * 30 }), this.prisma.attachment.count({ where }), this.prisma.attachment.aggregate({ where, _sum: { size: true } }), this.access.getContext(userId)]);
    const manage = context.isAdmin || context.permissions.includes('business_image.manage');
    const manageable = manage ? await this.prisma.businessImage.findMany({ where: { id: { in: items.map(i => i.id) }, contract: await this.contracts(userId, true) }, select: { id: true } }) : [];
    const ids = new Set(manageable.map(i => i.id));
    const rows = await Promise.all(items.map(async (i: any) => {
      const row = this.row(i, ids.has(i.id));
      if (row.canUnlink) {
        const type = imageTarget(i)!; const config = TARGETS[type]; const record = i[config.field.replace(/Id$/, '')]; const permission = this.permission(type, record);
        try { imageTargetCategory(type, record, i.category, true); row.canUnlink = (context.isAdmin || context.permissions.includes(permission)) && Boolean(await (this.prisma[config.model] as any).findFirst({ where: { id: i[config.field], AND: [await this.targetScope(type, userId, permission)] }, select: { id: true } })); } catch { row.canUnlink = false; }
      }
      return row;
    }));
    return { items: rows, total, totalSize: stats._sum.size || 0, page: Math.floor(page), pageSize: 30, canManage: manage, types: TYPE_LABELS };
  }
  private async find(id: string, userId: string) {
    const item = await this.prisma.attachment.findFirst({ where: { id, AND: [await this.readable(userId)] }, include: SOURCE_INCLUDE });
    if (!item) throw new NotFoundException('影像不存在或无权访问');
    return item as any;
  }
  async detail(id: string, userId: string) {
    const item = await this.find(id, userId);
    const context = await this.access.getContext(userId);
    const logs = context.isAdmin ? await this.prisma.businessOperationLog.findMany({ where: { businessType: 'BUSINESS_IMAGE', businessId: id }, include: { operator: { select: { id: true, name: true, username: true } } }, orderBy: { createdAt: 'desc' } }) : [];
    return { ...this.row(item), operationLogs: logs };
  }
  async url(id: string, userId: string, thumbnail = false) {
    const item = await this.find(id, userId);
    if (thumbnail) { const url = await this.previews.ensure(item.fileName, item.mimeType); if (url) return { url, mimeType: 'image/jpeg', thumbnail: true }; }
    return { url: await this.files.getUrl(item.fileName), mimeType: item.mimeType, thumbnail: false };
  }
  async contractOptions(userId: string, search = '') {
    await this.context(userId);
    return this.prisma.contract.findMany({ where: { AND: [await this.contracts(userId), ...(search.trim() ? [{ OR: [{ contractNo: { contains: search.trim().slice(0, 100), mode: 'insensitive' as const } }, { title: { contains: search.trim().slice(0, 100), mode: 'insensitive' as const } }] }] : [])] }, select: CONTRACT_SELECT, take: 30, orderBy: { createdAt: 'desc' } });
  }
  async notices(userId: string, contractId: string) {
    const context = await this.context(userId);
    if (!contractId || typeof contractId !== 'string') throw new BadRequestException('请选择合同');
    if (!context.isAdmin && !context.permissions.includes('execution.view')) return [];
    return this.prisma.dispatchNotice.findMany({ where: { deletedAt: null, AND: [await this.access.getDispatchNoticeScope(userId), { order: { contract: { id: contractId, AND: [await this.contracts(userId)] } } }] }, select: { id: true, noticeNo: true }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
  private async checkArchive(userId: string, contractId: string, noticeId?: string | null) {
    await this.context(userId, true);
    if (!await this.prisma.contract.findFirst({ where: { id: contractId, AND: [await this.contracts(userId, true)] }, select: { id: true } })) throw new ForbiddenException('合同不存在或不在可归档范围');
    if (noticeId) {
      await this.access.assertPermission(userId, 'execution.view');
      if (!await this.prisma.dispatchNotice.findFirst({ where: { id: noticeId, deletedAt: null, order: { contractId }, AND: [await this.access.getDispatchNoticeScope(userId)] }, select: { id: true } })) throw new BadRequestException('执行通知不属于该合同或无权访问');
    }
  }
  private audit(tx: any, id: string, userId: string, action: string, label: string, details: any) { return tx.businessOperationLog.create({ data: { businessType: 'BUSINESS_IMAGE', businessId: id, operatorId: userId, action, actionLabel: label, details } }); }
  async upload(file: Express.Multer.File | undefined, dto: UploadBusinessImageDto, userId: string) {
    await this.checkArchive(userId, dto.contractId, dto.dispatchNoticeId);
    if (!file?.buffer.length || file.buffer.length > 20 * 1024 * 1024) throw new BadRequestException('请选择不超过20MB的文件');
    if (!dto.originalName.trim() || !dto.sourceOriginalName.trim() || !dto.clientRequestId.trim()) throw new BadRequestException('请填写并确认文件名称');
    const prepared = prepareAttachmentUpload(file, dto.originalName);
    if (!prepared) throw new BadRequestException('仅支持 JPG、PNG、WEBP 图片和 PDF 文件');
    if (dto.photoCompressed && (!['SCENE_PHOTO', 'VEHICLE_PHOTO'].includes(dto.documentType) || prepared.mimeType === 'application/pdf')) throw new BadRequestException('只有普通现场照片和车辆照片允许压缩，单据原件不压缩');
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');
    const duplicateWhere = { OR: [{ contractId: dto.contractId, fileHash }, { createdBy: userId, clientRequestId: dto.clientRequestId }] };
    const duplicate = await this.prisma.businessImage.findFirst({ where: duplicateWhere });
    if (duplicate) { if (duplicate.contractId !== dto.contractId || duplicate.fileHash !== fileHash) throw new BadRequestException('上传请求已用于其他文件，请重新添加'); return { ...this.row(await this.find(duplicate.id, userId)), duplicate: true }; }
    if (await this.prisma.businessImage.findFirst({ where: { contractId: dto.contractId, nameKey: prepared.originalName.trim().toLowerCase() }, select: { id: true } })) throw new BadRequestException('该合同下已有同名归档文件，请修改文件名称');
    const stored = await this.files.upload(file.buffer, prepared.originalName, prepared.mimeType, 'business-images');
    try {
      const result = await this.prisma.$transaction(async tx => {
        const attachment = await tx.attachment.create({ data: { ...stored, ...prepared, category: 'BUSINESS_IMAGE', uploadedBy: userId, fileHash } });
        await tx.businessImage.create({ data: { id: attachment.id, contractId: dto.contractId, dispatchNoticeId: dto.dispatchNoticeId || null, documentType: dto.documentType, remarks: normalizeImageRemarks(dto.remarks), sourceOriginalName: dto.sourceOriginalName.trim(), originalSize: dto.originalSize || file.buffer.length, photoCompressed: dto.photoCompressed || false, fileHash, clientRequestId: dto.clientRequestId, createdBy: userId } });
        await this.audit(tx, attachment.id, userId, 'CREATE', '归档业务影像', { name: prepared.originalName, remarks: normalizeImageRemarks(dto.remarks) || '', contractId: dto.contractId, photoCompressed: Boolean(dto.photoCompressed) });
        return attachment;
      });
      // 缩略图按首次展示时生成，上传不等待 PDF 转换。
      return { ...this.row(await this.find(result.id, userId), true), duplicate: false };
    } catch (error) {
      await this.files.delete(stored.fileName).catch(() => undefined);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.businessImage.findFirst({ where: duplicateWhere });
        if (existing && existing.contractId === dto.contractId && existing.fileHash === fileHash) return { ...this.row(await this.find(existing.id, userId)), duplicate: true };
        throw new BadRequestException('该合同下已有同名归档文件，请修改文件名称');
      }
      throw error;
    }
  }
  private async editable(id: string, userId: string) {
    const item = await this.find(id, userId);
    if (!item.businessImage) throw new BadRequestException('原单据附件请到原单据中修改');
    await this.checkArchive(userId, item.businessImage.contractId);
    return item;
  }
  private async lock(tx: any, id: string) { await tx.$queryRaw`SELECT id FROM attachments WHERE id = ${id} FOR UPDATE`; return tx.attachment.findUnique({ where: { id } }); }
  async update(id: string, dto: UpdateBusinessImageDto, userId: string) {
    const item = await this.editable(id, userId);
    await this.checkArchive(userId, item.businessImage.contractId, dto.dispatchNoticeId);
    if (!dto.originalName.trim()) throw new BadRequestException('文件名称不能为空');
    const name = normalizeAttachmentName(dto.originalName, item.mimeType as AttachmentMimeType);
    try { await this.prisma.$transaction(async tx => {
      const current = await this.lock(tx, id);
      if (!current || isLinkedImage(current)) throw new BadRequestException('已关联文件请到原单据修改，或先解除关联');
      await tx.attachment.update({ where: { id }, data: { originalName: name } });
      await tx.businessImage.update({ where: { id }, data: { documentType: dto.documentType, dispatchNoticeId: dto.dispatchNoticeId || null, ...(dto.remarks !== undefined ? { remarks: normalizeImageRemarks(dto.remarks) } : {}), confirmedAt: new Date() } });
      await this.audit(tx, id, userId, 'UPDATE', '修改归档资料', { beforeName: item.originalName, name, beforeRemarks: item.businessImage.remarks || '', remarks: dto.remarks === undefined ? item.businessImage.remarks || '' : normalizeImageRemarks(dto.remarks) || '' });
    }); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('该合同下已有同名归档文件，请修改文件名称');
      throw error;
    }
    return { id };
  }
  private permission(type: ImageTargetType, record: any) { return type === 'FUND' ? record.direction === 'RECEIPT' ? 'settlement.receipt.register' : 'settlement.payment.execute' : type === 'PAYMENT_REQUEST' && record.status === 'BUSINESS_CONFIRMED' ? 'settlement.payment.submit' : TARGETS[type].permission; }
  async targets(userId: string, contractId: string, type: ImageTargetType, search = '', noticeId?: string) {
    if (!contractId || typeof contractId !== 'string') throw new BadRequestException('请选择合同');
    await this.checkArchive(userId, contractId);
    const config = TARGETS[type];
    if (!config) throw new BadRequestException('请选择单据类型');
    const context = await this.context(userId);
    if (!context.isAdmin && !context.permissions.includes(config.view)) return [];
    const records = await (this.prisma[config.model] as any).findMany({ where: { ...(!['FUND', 'PAYMENT_REQUEST'].includes(type) ? { deletedAt: null } : {}), AND: [this.contractFilter(type, { id: contractId, AND: [await this.contracts(userId, true)] }), this.noticeFilter(type, noticeId), await this.targetScope(type, userId, config.view), ...(search.trim() ? [{ [config.number]: { contains: search.trim().slice(0, 100), mode: 'insensitive' } }] : [])] }, orderBy: { createdAt: 'desc' }, take: 50 });
    return Promise.all(records.map(async (record: any) => {
      let reason = '';
      try {
        const permission = this.permission(type, record);
        await this.access.assertPermission(userId, permission);
        if (!await (this.prisma[config.model] as any).findFirst({ where: { id: record.id, AND: [await this.targetScope(type, userId, permission)] }, select: { id: true } })) throw new Error('该单据不在可操作范围');
        imageTargetCategory(type, record, type === 'CONTRACT' && record.type === 'BILATERAL' ? 'OTHER' : undefined);
      } catch (e) { reason = e instanceof Error ? e.message : '无权操作'; }
      return { id: record.id, number: record[config.number], status: record.status, disabled: Boolean(reason), reason, bilateral: record.type === 'BILATERAL' };
    }));
  }
  async link(id: string, dto: LinkBusinessImageDto, userId: string, removing = false) {
    const item = await this.editable(id, userId);
    const type = removing ? imageTarget(item) : dto.targetType;
    if (!type) throw new BadRequestException('没有可解除的关联');
    const config = TARGETS[type];
    const targetId = removing ? item[config.field] : dto.targetId;
    const notice = this.noticeFilter(type, removing ? null : item.businessImage.dispatchNoticeId);
    const existing = await (this.prisma[config.model] as any).findFirst({ where: { id: targetId, ...(!['FUND', 'PAYMENT_REQUEST'].includes(type) ? { deletedAt: null } : {}), AND: [this.contractFilter(type, { id: item.businessImage.contractId, AND: [await this.contracts(userId, true)] }), notice, await this.targetScope(type, userId, config.view)] } });
    if (!existing) throw new NotFoundException('目标单据不属于归档合同、执行通知，或无权访问');
    await this.access.assertPermission(userId, config.view);
    const permission = this.permission(type, existing);
    await this.access.assertPermission(userId, permission);
    const scope = await this.targetScope(type, userId, permission);
    await this.prisma.$transaction(async tx => {
      // 资金单与原资金结算服务使用同一合同咨询锁；再锁定目标及附件，防止状态竞态。
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${item.businessImage.contractId}, 0))::text`;
      await tx.$queryRaw(Prisma.sql`SELECT id FROM ${Prisma.raw(config.table)} WHERE id = ${targetId} FOR UPDATE`);
      const record = await (tx[config.model] as any).findFirst({ where: { id: targetId, ...(!['FUND', 'PAYMENT_REQUEST'].includes(type) ? { deletedAt: null } : {}), AND: [scope, notice, this.contractFilter(type, { id: item.businessImage.contractId })] } });
      if (!record) throw new ForbiddenException('目标单据已变更或不在可操作范围');
      if (this.permission(type, record) !== permission) throw new BadRequestException('单据状态已变化，请刷新后重试');
      const category = imageTargetCategory(type, record, dto.category || item.category, removing);
      const current = await this.lock(tx, id);
      if (!current) throw new NotFoundException('文件已删除');
      if (removing ? current[config.field] !== targetId : isLinkedImage(current)) throw new BadRequestException('文件关联已变化，请刷新');
      await tx.attachment.update({ where: { id }, data: { [config.field]: removing ? null : targetId, category: removing ? 'BUSINESS_IMAGE' : category } });
      await this.audit(tx, id, userId, removing ? 'UNLINK' : 'LINK', removing ? '解除单据关联' : '关联业务单据', { targetType: type, targetId, targetNo: record[config.number], category });
      await tx.businessOperationLog.create({ data: { businessType: AUDIT_TYPES[type], businessId: targetId, operatorId: userId, action: removing ? 'UNLINK_ATTACHMENT' : 'LINK_ATTACHMENT', actionLabel: removing ? '解除业务影像关联' : '关联业务影像', details: { attachmentId: id, name: item.originalName } } });
    });
    return { id };
  }
  async remove(id: string, userId: string) {
    const item = await this.editable(id, userId);
    await this.prisma.$transaction(async tx => {
      const current = await this.lock(tx, id);
      if (!current || isLinkedImage(current)) throw new BadRequestException('仅归档文件才可删除，已关联凭证请到原单据处理');
      await this.audit(tx, id, userId, 'DELETE', '删除归档资料', { name: item.originalName });
      await tx.attachment.delete({ where: { id } });
    });
    await this.files.delete(item.fileName).catch(() => this.logger.warn(`归档影像 ${id} 已删除，存储文件待清理`));
    return { id, deleted: true };
  }
}
