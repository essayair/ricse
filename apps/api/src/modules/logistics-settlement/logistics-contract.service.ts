import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FileService } from '../common/file.service';
import { prepareAttachmentUpload } from '../common/attachment-upload';
import { CreateLogisticsContractDto, CreatePriceTermDto, UpdateLogisticsContractStatusDto } from './dto/logistics-contract.dto';

const contractDate = (value?: string, end = false) => value ? new Date(value.length === 10 ? value + (end ? 'T23:59:59.999+08:00' : 'T00:00:00+08:00') : value) : null;

@Injectable()
export class LogisticsContractService {
  private readonly logger = new Logger(LogisticsContractService.name);
  constructor(private readonly prisma: PrismaService, private readonly accessControl: AccessControlService, private readonly files: FileService) {}

  private readonly include = {
    carrierPartner: { select: { id: true, name: true, code: true } },
    signingPartner: { select: { id: true, name: true, code: true } },
    company: { select: { id: true, name: true, code: true } },
    creator: { select: { id: true, name: true } },
    businessUnits: { include: { businessUnit: { select: { id: true, name: true, code: true } } } },
    attachments: { orderBy: { createdAt: 'asc' as const } },
    priceTerms: { orderBy: [{ originLocation: 'asc' as const }, { destinationLocation: 'asc' as const }, { effectiveAt: 'desc' as const }] },
  };

  async options(userId: string) {
    const context = await this.accessControl.assertPermission(userId, 'logistics.contract.manage');
    if (context.isExternal) throw new BadRequestException('外部企业账号不能维护物流合同');
    const [signingPartners, carriers, businessUnits] = await Promise.all([
      this.prisma.partner.findMany({ where: { isInternal: true, status: 'ACTIVE', deletedAt: null }, select: { id: true, name: true, code: true }, orderBy: { code: 'asc' } }),
      this.prisma.serviceOrganization.findMany({ where: { organizationType: 'LOGISTICS_CARRIER', status: 'ACTIVE', deletedAt: null, partner: { status: 'ACTIVE', deletedAt: null } }, select: { id: true, partner: { select: { id: true, name: true, code: true } } } }),
      this.accessControl.getBusinessUnitOptions(userId, 'logistics.contract.manage'),
    ]);
    return { signingPartners, carriers: carriers.map(c => c.partner), businessUnits };
  }

  private async validate(dto: CreateLogisticsContractDto, userId: string) {
    const context = await this.accessControl.assertPermission(userId, 'logistics.contract.manage');
    if (context.isExternal) throw new BadRequestException('外部企业账号不能维护物流合同');
    if (!dto.title?.trim()) throw new BadRequestException('请填写物流合同名称');
    const carrier = await this.prisma.serviceOrganization.findFirst({ where: {
      partnerId: dto.carrierPartnerId, organizationType: 'LOGISTICS_CARRIER', status: 'ACTIVE', deletedAt: null,
      partner: { status: 'ACTIVE', deletedAt: null },
    } });
    if (!carrier) throw new BadRequestException('承运方必须是有效的物流承运商主数据');
    const signer = await this.prisma.partner.findFirst({ where: { id: dto.signingPartnerId, isInternal: true, status: 'ACTIVE', deletedAt: null } });
    if (!signer) throw new BadRequestException('请选择有效的内部我方签约主体');
    if (dto.signingPartnerId === dto.carrierPartnerId) throw new BadRequestException('我方签约主体不能与承运方相同');
    if (dto.effectiveAt && dto.expireAt && new Date(dto.expireAt) <= new Date(dto.effectiveAt)) throw new BadRequestException('到期日期必须晚于生效日期');
    const unitIds = [...new Set(dto.businessUnitIds || [])];
    const allowed = await this.accessControl.getBusinessUnitOptions(userId, 'logistics.contract.manage');
    if (!allowed.length) throw new BadRequestException('请先配置可维护的业务单元（事业部）');
    if (dto.allBusinessUnits === false) {
      if (!unitIds.length || unitIds.some(id => !allowed.some(unit => unit.id === id))) throw new BadRequestException('请选择有维护权限的有效业务单元（事业部）');
    }
    for (const term of dto.priceTerms || []) this.validateTerm(term);
    return { title: dto.title.trim(), externalContractNo: dto.externalContractNo?.trim() || null,
      carrierPartnerId: dto.carrierPartnerId, signingPartnerId: dto.signingPartnerId,
      allBusinessUnits: dto.allBusinessUnits !== false, settlementBasis: dto.settlementBasis || 'NET_WEIGHT',
      defaultWeightBasis: dto.defaultWeightBasis || 'SETTLEMENT', paymentTerms: dto.paymentTerms?.trim() || null,
      signedAt: contractDate(dto.signedAt), effectiveAt: contractDate(dto.effectiveAt),
      expireAt: contractDate(dto.expireAt, true), remarks: dto.remarks?.trim() || null,
      businessUnits: { create: dto.allBusinessUnits === false ? unitIds.map(businessUnitId => ({ businessUnitId })) : [] },
    };
  }

  private validateTerm(dto: CreatePriceTermDto) {
    if (!Number.isFinite(dto.unitPrice) || dto.unitPrice <= 0) throw new BadRequestException('请填写大于零的合同运价');
    if (dto.expiresAt && new Date(dto.expiresAt) <= new Date(dto.effectiveAt)) throw new BadRequestException('运价失效日期必须晚于生效日期');
    if (Boolean(dto.originLocation?.trim()) !== Boolean(dto.destinationLocation?.trim())) throw new BadRequestException('请同时填写起运地与目的地，或全部留空表示不限路线');
  }

  async create(dto: CreateLogisticsContractDto, userId: string) {
    const context = await this.accessControl.assertPermission(userId, 'logistics.contract.manage');
    const data = await this.validate(dto, userId);
    return this.prisma.$transaction(async tx => {
      const now = new Date();
      const date = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
      const lock = 'logistics-contract-number:' + date;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text`;
      const count = await tx.logisticsContract.count({ where: { contractNo: { startsWith: 'LC' + date } } });
      const result = await tx.logisticsContract.create({ data: { ...data, contractNo: 'LC' + date + String(count + 1).padStart(4, '0'), companyId: context.user.company?.id, createdBy: userId }, include: this.include });
      for (const term of dto.priceTerms || []) await new LogisticsContractService(tx as PrismaService, this.accessControl, this.files).addTerm(result.id, term, userId);
      return tx.logisticsContract.findUniqueOrThrow({ where: { id: result.id }, include: this.include });
    });
  }

  async update(id: string, dto: CreateLogisticsContractDto, userId: string) {
    const data = await this.validate(dto, userId);
    return this.prisma.$transaction(async tx => {
      const lock = 'logistics-contract:' + id;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text`;
      const service = new LogisticsContractService(tx as PrismaService, this.accessControl, this.files);
      const contract = await service.findOne(id, userId, 'logistics.contract.manage');
      if (contract.status !== 'DRAFT') throw new BadRequestException('合同已生效，不能覆盖合同信息或运价；请在本次物流结算中调整并记录原因');
      await tx.logisticsContractBusinessUnit.deleteMany({ where: { contractId: id } });
      if (dto.priceTerms) {
        if (await tx.logisticsSettlementLine.count({ where: { contractPriceTerm: { contractId: id } } })) throw new BadRequestException('合同运价已被结算引用，不能替换');
        await tx.logisticsContractPriceTerm.deleteMany({ where: { contractId: id } });
        for (const term of dto.priceTerms) await service.addTerm(id, term, userId);
      }
      return tx.logisticsContract.update({ where: { id }, data, include: this.include });
    });
  }

  async findAll(query: { status?: string; carrierPartnerId?: string; search?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'logistics.contract.view');
    const scope = await this.accessControl.getLogisticsContractScope(userId, 'logistics.contract.view');
    const search = query.search?.trim();
    return this.prisma.logisticsContract.findMany({ where: { AND: [scope, { deletedAt: null },
      query.status ? { status: query.status } : {}, query.carrierPartnerId ? { carrierPartnerId: query.carrierPartnerId } : {},
      search ? { OR: [{ contractNo: { contains: search, mode: 'insensitive' } }, { title: { contains: search, mode: 'insensitive' } }, { externalContractNo: { contains: search, mode: 'insensitive' } }, { carrierPartner: { name: { contains: search, mode: 'insensitive' } } }, { signingPartner: { name: { contains: search, mode: 'insensitive' } } }] } : {},
    ] }, include: this.include, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string, userId: string, permission = 'logistics.contract.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getLogisticsContractScope(userId, permission);
    const result = await this.prisma.logisticsContract.findFirst({ where: { AND: [{ id, deletedAt: null }, scope] }, include: this.include });
    if (!result) throw new NotFoundException('物流合同不存在或无权访问');
    return result;
  }

  async updateStatus(id: string, dto: UpdateLogisticsContractStatusDto, userId: string) {
    return this.prisma.$transaction(async tx => {
      const lock = 'logistics-contract:' + id;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text`;
      const contract = await new LogisticsContractService(tx as PrismaService, this.accessControl, this.files).findOne(id, userId, 'logistics.contract.manage');
      const allowed: Record<string, string[]> = { DRAFT: ['ACTIVE'], ACTIVE: ['TERMINATED'] };
      if (!(allowed[contract.status] || []).includes(dto.status)) throw new BadRequestException('当前合同状态不支持此操作');
      if (dto.status === 'ACTIVE' && (!contract.signingPartnerId || !contract.title?.trim() || !contract.attachments.length || !contract.priceTerms.length)) throw new BadRequestException('启用前请补齐我方签约主体、合同名称、合同附件及至少一条运价');
      if (dto.status === 'ACTIVE') {
        await new LogisticsContractService(tx as PrismaService, this.accessControl, this.files).validate({
          title: contract.title!, signingPartnerId: contract.signingPartnerId!, carrierPartnerId: contract.carrierPartnerId,
          allBusinessUnits: contract.allBusinessUnits, businessUnitIds: (contract.businessUnits || []).map(u => u.businessUnitId),
        }, userId);
        if (contract.expireAt && contract.expireAt < new Date()) throw new BadRequestException('合同已到期，不能启用，请先核对合同有效期');
      }
      return tx.logisticsContract.update({ where: { id }, data: { status: dto.status, terminatedAt: dto.status === 'TERMINATED' ? new Date() : null }, include: this.include });
    });
  }

  private async addTerm(contractId: string, dto: CreatePriceTermDto, userId: string) {
    this.validateTerm(dto);
    const originLocation = dto.originLocation?.trim() || '', destinationLocation = dto.destinationLocation?.trim() || '';
    const effectiveAt = contractDate(dto.effectiveAt)!, expiresAt = contractDate(dto.expiresAt);
    const existing = await this.prisma.logisticsContractPriceTerm.findMany({ where: { contractId, originLocation, destinationLocation } });
    if (existing.some(term => effectiveAt < (term.expiresAt || new Date('9999-12-31')) && term.effectiveAt < (expiresAt || new Date('9999-12-31')))) throw new BadRequestException('该路线在此日期区间内已存在运价条款');
    return this.prisma.logisticsContractPriceTerm.create({ data: { contractId, originLocation, destinationLocation, unitPrice: dto.unitPrice, effectiveAt, expiresAt, createdBy: userId } });
  }

  async addPriceTerm(id: string, dto: CreatePriceTermDto, userId: string) {
    return this.prisma.$transaction(async tx => {
      const lock = 'logistics-contract:' + id;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text`;
      const service = new LogisticsContractService(tx as PrismaService, this.accessControl, this.files);
      const contract = await service.findOne(id, userId, 'logistics.contract.manage');
      if (contract.status !== 'DRAFT') throw new BadRequestException('生效合同运价已锁定，请在物流结算单调整本次价格并填写原因');
      return service.addTerm(id, dto, userId);
    });
  }

  async settlementRecords(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.accessControl.assertPermission(userId, 'logistics.settlement.view');
    const scope = await this.accessControl.getLogisticsSettlementScope(userId, 'logistics.settlement.view');
    const lines = await this.prisma.logisticsSettlementLine.findMany({ where: { contractPriceTerm: { contractId: id }, settlement: { AND: [scope, { deletedAt: null }] } }, include: {
      settlement: { include: { adjustments: { orderBy: { createdAt: 'asc' } } } },
      waybill: { select: { id: true, waybillNo: true, plateNo: true } },
    }, orderBy: { createdAt: 'desc' } });
    const ids = [...new Set(lines.flatMap(l => l.settlement.adjustments.map(a => a.actorId)))];
    const actors = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    return lines.map(l => ({ ...l, settlement: { ...l.settlement, adjustments: l.settlement.adjustments.filter(a => !a.lineId || a.lineId === l.id).map(a => ({ ...a, actorName: actors.find(u => u.id === a.actorId)?.name || '历史用户' })) } }));
  }

  async uploadAttachment(id: string, file: Express.Multer.File, userId: string) {
    await this.findOne(id, userId, 'logistics.contract.manage');
    if (!file?.buffer?.length || file.size > 20 * 1024 * 1024) throw new BadRequestException('请选择不超过20MB的附件');
    const prepared = prepareAttachmentUpload(file);
    if (!prepared) throw new BadRequestException('仅支持 JPG、PNG、WEBP 或 PDF 附件');
    const uploaded = await this.files.upload(file.buffer, prepared.originalName, prepared.mimeType, 'logistics-contract');
    try {
      return await this.prisma.$transaction(async tx => {
        const key = 'logistics-contract:' + id;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
        const contract = await new LogisticsContractService(tx as PrismaService, this.accessControl, this.files).findOne(id, userId, 'logistics.contract.manage');
        if (!['DRAFT', 'ACTIVE'].includes(contract.status)) throw new BadRequestException('已终止的物流合同不能再上传附件');
        return tx.attachment.create({ data: { ...uploaded, ...prepared, logisticsContractId: id, category: 'LOGISTICS_CONTRACT', uploadedBy: userId } });
      });
    } catch (error) { try { await this.files.delete(uploaded.fileName); } catch {} throw error; }
  }

  async attachment(id: string, attachmentId: string, userId: string, remove = false) {
    if (!remove) {
      const contract = await this.findOne(id, userId);
      const attachment = contract.attachments.find(item => item.id === attachmentId);
      if (!attachment) throw new NotFoundException('附件不存在');
      return { url: await this.files.getUrl(attachment.fileName), originalName: attachment.originalName, mimeType: attachment.mimeType };
    }
    const attachment = await this.prisma.$transaction(async tx => {
      const key = 'logistics-contract:' + id;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const contract = await new LogisticsContractService(tx as PrismaService, this.accessControl, this.files).findOne(id, userId, 'logistics.contract.manage');
      const item = contract.attachments.find(a => a.id === attachmentId);
      if (!item) throw new NotFoundException('附件不存在');
      if (contract.status !== 'DRAFT') throw new BadRequestException('生效合同附件不能删除，可追加补充附件');
      await tx.attachment.delete({ where: { id: attachmentId } });
      return item;
    });
    try { await this.files.delete(attachment.fileName); } catch { this.logger.warn('物流合同附件记录已移除，存储对象待清理：' + attachment.id); }
    return { success: true };
  }
}
