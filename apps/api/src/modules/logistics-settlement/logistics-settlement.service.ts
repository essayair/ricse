import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FileService } from '../common/file.service';
import { prepareAttachmentUpload } from '../common/attachment-upload';
import { CreateLogisticsSettlementDto, CreateLogisticsSettlementLineDto, SetLinePriceDto, SetLineWeightDto, SetPayerDto } from './dto/logistics-settlement.dto';

const waybillInclude = {
  lineItems: true,
  dispatchNotice: { include: { order: { include: { contract: { include: { signingPartner: true, businessUnit: true } } } } } },
  weightSelections: { where: { isCurrent: true }, include: { weighTicket: true }, orderBy: { selectedAt: 'desc' as const } },
  weighTickets: { where: { deletedAt: null, status: 'REVIEWED' }, orderBy: [{ sequence: 'desc' as const }, { createdAt: 'desc' as const }] },
  inboundReceipts: { where: { deletedAt: null, status: { not: 'CANCELLED' } }, include: { businessInbound: true }, orderBy: { createdAt: 'desc' as const } },
};
type Waybill = Prisma.WaybillGetPayload<{ include: typeof waybillInclude }>;
type PriceTerm = Prisma.LogisticsContractPriceTermGetPayload<{ include: { contract: true } }>;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const money = (quantity: Prisma.Decimal.Value, price: Prisma.Decimal.Value) => new Prisma.Decimal(quantity).mul(price).toDecimalPlaces(2).toNumber();

@Injectable()
export class LogisticsSettlementService {
  private readonly logger = new Logger(LogisticsSettlementService.name);
  constructor(private readonly prisma: PrismaService, private readonly accessControl: AccessControlService, private readonly files: FileService) {}

  private readonly include = {
    payerCompany: { select: { id: true, name: true, code: true } },
    payerPartner: { select: { id: true, name: true, code: true } },
    preparer: { select: { id: true, name: true } }, reviewer: { select: { id: true, name: true } },
    attachments: { orderBy: { createdAt: 'asc' as const } },
    adjustments: { orderBy: { createdAt: 'asc' as const } },
    lines: { include: {
      waybill: { select: { id: true, waybillNo: true, plateNo: true, signedAt: true, departedAt: true, originLocation: true, destinationLocation: true, carrierPartnerId: true, carrierName: true } },
      contractPriceTerm: { include: { contract: { select: { id: true, title: true, contractNo: true, signingPartnerId: true } } } },
    } },
  };

  private defaultTicket(w: Waybill, preference = 'SETTLEMENT') {
    const valid = w.weighTickets.filter(t => Number(t.netWeight) > 0);
    if (preference === 'SHIPPING' || preference === 'RECEIVING') return valid.find(t => t.weighingStage === preference) || null;
    if (w.dispatchNotice.order.type === 'PURCHASE') {
      const posted = w.inboundReceipts.find(r => r.businessInbound?.status === 'POSTED');
      const id = posted?.weighTicketId || w.weightSelections.find(s => s.purpose === 'INVENTORY')?.weighTicketId;
      return valid.find(t => t.id === id) || null;
    }
    const id = w.weightSelections.find(s => s.purpose === 'SETTLEMENT')?.weighTicketId;
    return valid.find(t => t.id === id) || null;
  }

  private weight(w: Waybill, dto: Pick<CreateLogisticsSettlementLineDto, 'weighTicketId' | 'weightBasis' | 'confirmedWeight' | 'weightReason'>, preference = 'SETTLEMENT', pricingBasis = 'NET_WEIGHT') {
    const valid = w.weighTickets.filter(t => Number(t.netWeight) > 0);
    if (!valid.length) throw new BadRequestException('运单 ' + w.waybillNo + ' 至少需要一张已复核的有效磅单');
    const defaultTicket = this.defaultTicket(w, preference);
    const ticket = dto.weighTicketId ? valid.find(t => t.id === dto.weighTicketId) : defaultTicket;
    if (!ticket) throw new BadRequestException('运单 ' + w.waybillNo + ' 尚未确认默认结算磅单，请选择本次运费计费磅单');
    const confirmed = dto.weightBasis === 'CONFIRMED';
    if ((confirmed || ticket.id !== defaultTicket?.id) && !dto.weightReason?.trim()) throw new BadRequestException('更换运费计费依据或使用双方确认重量时，请填写原因');
    const net = Number(ticket.netWeight), gross = Number(ticket.grossWeight || 0);
    if (confirmed && (!dto.confirmedWeight || !Number.isFinite(dto.confirmedWeight) || dto.confirmedWeight <= 0)) throw new BadRequestException('请填写有效的双方确认重量');
    if (confirmed && pricingBasis === 'TRIP') throw new BadRequestException('按车次计费无需填写双方确认重量，请选择有效磅单作为运输依据');
    const chargeQuantity = pricingBasis === 'TRIP' ? 1 : confirmed ? Number(new Prisma.Decimal(dto.confirmedWeight!).toFixed(3)) : pricingBasis === 'GROSS_WEIGHT' ? gross : net;
    if (chargeQuantity <= 0) throw new BadRequestException('计费数量必须大于零');
    const shipping = valid.find(t => t.weighingStage === 'SHIPPING'), receiving = valid.find(t => t.weighingStage === 'RECEIVING');
    const first = w.lineItems[0];
    return {
      netWeight: net, grossWeight: gross, tareWeight: ticket.tareWeight, chargeQuantity, pricingBasis,
      shippingWeight: shipping?.netWeight, receivingWeight: receiving?.netWeight,
      weighTicketId: ticket.id, ticketNo: ticket.ticketNo,
      weightBasis: confirmed ? 'CONFIRMED' : ticket.id === defaultTicket?.id ? preference : 'TICKET',
      weightReason: dto.weightReason?.trim() || null,
      materialName: w.lineItems.map(l => l.materialName || l.materialId).join('、') || ticket.materialName,
      materialSpec: ticket.materialSpec,
      shippedAt: w.departedAt, receivedAt: w.signedAt || w.arrivedAt,
      evidenceSnapshot: json({ ticketId: ticket.id, ticketUpdatedAt: ticket.updatedAt, netWeight: net, grossWeight: gross, tareWeight: ticket.tareWeight, defaultTicketId: defaultTicket?.id,
        businessUnitId: w.dispatchNotice.order.contract.businessUnitId, ownerPartnerId: w.dispatchNotice.order.contract.signingPartnerId, materialId: first?.materialId,
        waybillNo: w.waybillNo, plateNo: w.plateNo, originLocation: w.originLocation, destinationLocation: w.destinationLocation, pricingBasis, chargeQuantity }),
    };
  }

  private async applicablePrices(w: Waybill): Promise<PriceTerm[]> {
    const contract = w.dispatchNotice.order.contract, referenceDate = w.departedAt || w.signedAt;
    if (!referenceDate || !contract.businessUnitId || !contract.signingPartnerId || !w.carrierPartnerId) return [];
    const terms = await this.prisma.logisticsContractPriceTerm.findMany({ where: {
      effectiveAt: { lte: referenceDate }, OR: [{ expiresAt: null }, { expiresAt: { gt: referenceDate } }],
      AND: [{ OR: [{ originLocation: w.originLocation || '', destinationLocation: w.destinationLocation || '' }, { originLocation: '', destinationLocation: '' }] }],
      contract: { is: { deletedAt: null, carrierPartnerId: w.carrierPartnerId,
        signingPartnerId: contract.signingPartnerId,
        AND: [
          { OR: [{ status: { in: ['ACTIVE', 'EXPIRED'] } }, { status: 'TERMINATED', terminatedAt: { gt: referenceDate } }] },
          { OR: [{ effectiveAt: null }, { effectiveAt: { lte: referenceDate } }] },
          { OR: [{ expireAt: null }, { expireAt: { gt: referenceDate } }] },
          { OR: [{ allBusinessUnits: true }, { businessUnits: { some: { businessUnitId: contract.businessUnitId } } }] },
        ],
      } },
    }, include: { contract: true }, orderBy: { effectiveAt: 'desc' } });
    return terms.sort((a, b) => Number(Boolean(b.originLocation)) - Number(Boolean(a.originLocation)));
  }

  async options(userId: string) {
    await this.accessControl.assertPermission(userId, 'logistics.settlement.manage');
    const [payers, carriers] = await Promise.all([
      this.prisma.partner.findMany({ where: { isInternal: true, status: 'ACTIVE', deletedAt: null }, select: { id: true, name: true, code: true }, orderBy: { code: 'asc' } }),
      this.prisma.serviceOrganization.findMany({
        where: { organizationType: 'LOGISTICS_CARRIER', status: 'ACTIVE', deletedAt: null, partner: { status: 'ACTIVE', deletedAt: null, roles: { has: 'SUPPLIER' } } },
        select: { partner: { select: { id: true, name: true, code: true } } },
        orderBy: { partner: { code: 'asc' } },
      }),
    ]);
    return { payers, carriers: carriers.map(item => item.partner) };
  }

  async bindCandidateCarrier(id: string, carrierPartnerId: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'logistics.settlement.manage');
    if (!carrierPartnerId?.trim()) throw new BadRequestException('请选择物流承运商');
    const scope = await this.accessControl.getWaybillScope(userId, 'logistics.settlement.manage');
    const carrier = await this.prisma.serviceOrganization.findFirst({
      where: { partnerId: carrierPartnerId, organizationType: 'LOGISTICS_CARRIER', status: 'ACTIVE', deletedAt: null,
        partner: { status: 'ACTIVE', deletedAt: null, roles: { has: 'SUPPLIER' } } },
      include: { partner: { select: { id: true, name: true } } },
    });
    if (!carrier) throw new BadRequestException('所选物流承运商不存在、已停用或合作伙伴不具备供应商角色');
    const result = await this.prisma.waybill.updateMany({
      where: { AND: [scope, { id, deletedAt: null, status: 'SIGNED', freightMode: 'SOCIAL', carrierPartnerId: null,
        logisticsSettlementLines: { none: { settlement: { status: { not: 'VOIDED' }, deletedAt: null } } } }] },
      data: { carrierPartnerId: carrier.partner.id, carrierName: carrier.partner.name },
    });
    if (!result.count) throw new BadRequestException('运单不在可结算范围内、已绑定承运商或已加入结算单，请刷新后重试');
    return { id, carrierPartnerId: carrier.partner.id, carrierName: carrier.partner.name };
  }

  async listCandidateWaybills(query: { periodStart?: string; periodEnd?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'logistics.settlement.manage');
    const scope = await this.accessControl.getWaybillScope(userId, 'logistics.settlement.manage');
    const { start, end } = this.period(query.periodStart, query.periodEnd);
    const signedAt = start || end ? { gte: start, lt: end } : undefined;
    const rows = await this.prisma.waybill.findMany({ where: { AND: [scope, { deletedAt: null, status: 'SIGNED', ...(signedAt && { signedAt }), logisticsSettlementLines: { none: { settlement: { status: { not: 'VOIDED' }, deletedAt: null } } } }] }, include: waybillInclude, orderBy: { signedAt: 'asc' } });
    return Promise.all(rows.map(async w => ({
      id: w.id, waybillNo: w.waybillNo, plateNo: w.plateNo, signedAt: w.signedAt, departedAt: w.departedAt,
      originLocation: w.originLocation, destinationLocation: w.destinationLocation, carrierPartnerId: w.carrierPartnerId, carrierName: w.carrierName,
      freightMode: w.freightMode, carrierPending: !w.carrierPartnerId, payerPartner: w.dispatchNotice.order.contract.signingPartner,
      businessUnit: w.dispatchNotice.order.contract.businessUnit, businessType: w.dispatchNotice.order.type,
      materialName: w.lineItems.map(l => l.materialName || l.materialId).join('、'),
      tickets: w.weighTickets.filter(t => Number(t.netWeight) > 0).map(t => ({ id: t.id, ticketNo: t.ticketNo, weighingStage: t.weighingStage, grossWeight: t.grossWeight, tareWeight: t.tareWeight, netWeight: t.netWeight, ticketDate: t.ticketDate })),
      defaultTicketId: this.defaultTicket(w)?.id || null,
      priceTerms: await this.applicablePrices(w),
    })));
  }

  private period(from?: string, to?: string) {
    const parse = (value: string | undefined, endOfDay: boolean) => {
      if (!value) return undefined;
      const result = new Date(value.length === 10 ? value + 'T00:00:00+08:00' : value);
      if (!Number.isFinite(result.getTime())) throw new BadRequestException('请选择有效的结算周期日期');
      if (endOfDay && value.length === 10) result.setUTCDate(result.getUTCDate() + 1);
      return result;
    };
    const start = parse(from, false), end = parse(to, true);
    if (start && end && end <= start) throw new BadRequestException('请选择有效的结算周期，结束日期不能早于开始日期');
    return { start, end };
  }

  async create(dto: CreateLogisticsSettlementDto, userId: string, locked = false): Promise<any> {
    await this.accessControl.assertPermission(userId, 'logistics.settlement.manage');
    const ids = dto.lines.map(l => l.waybillId);
    if (!ids.length || new Set(ids).size !== ids.length) throw new BadRequestException('请选择运单，同一张运单不能重复加入同一结算单');
    if (!locked) return this.prisma.$transaction(async tx => {
      for (const id of [...ids].sort()) { const key = 'logistics-waybill:' + id; await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`; }
      return new LogisticsSettlementService(tx as PrismaService, this.accessControl, this.files).create(dto, userId, true);
    }, { timeout: 20000 });
    this.period(dto.periodStart, dto.periodEnd);
    const scope = await this.accessControl.getWaybillScope(userId, 'logistics.settlement.manage');
    const waybills = await this.prisma.waybill.findMany({ where: { AND: [{ id: { in: ids }, deletedAt: null }, scope] }, include: waybillInclude });
    if (waybills.length !== ids.length) throw new BadRequestException('存在不在当前数据范围内或不存在的运单');
    if (waybills.some(w => w.status !== 'SIGNED')) throw new BadRequestException('所选运单尚未签收，不能加入结算单');
    if (waybills.some(w => !w.signedAt)) throw new BadRequestException('所选运单缺少签收日期，请先补齐签收信息');
    const signedTimes = waybills.map(w => w.signedAt!.getTime());
    const localDay = (time: number) => new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const periodStart = dto.periodStart || localDay(Math.min(...signedTimes));
    const periodEnd = dto.periodEnd || localDay(Math.max(...signedTimes));
    const period = this.period(periodStart, periodEnd);
    const owners = new Set(waybills.map(w => w.dispatchNotice.order.contract.signingPartnerId)), units = new Set(waybills.map(w => w.dispatchNotice.order.contract.businessUnitId)), carriers = new Set(waybills.map(w => w.carrierPartnerId));
    if (owners.size !== 1 || owners.has(null)) throw new BadRequestException('所选运单属于不同的我方签约主体或缺少货主，请按货主分别结算');
    if (units.size !== 1 || units.has(null)) throw new BadRequestException('请按同一业务单元（事业部）分别创建物流结算单');
    if (carriers.size !== 1 || carriers.has(null)) throw new BadRequestException('请先确定开票承运商，并按同一承运方分别创建物流结算单');
    if (await this.prisma.logisticsSettlementLine.count({ where: { waybillId: { in: ids }, settlement: { status: { not: 'VOIDED' }, deletedAt: null } } })) throw new BadRequestException('运单已在其他有效结算单中，不能重复结算');
    const ownerPartnerId = [...owners][0]!, payerPartnerId = dto.payerPartnerId || ownerPartnerId;
    if (payerPartnerId !== ownerPartnerId && !dto.payerChangeReason?.trim()) throw new BadRequestException('修改付款主体必须填写原因，原业务货主保持不变');
    const payer = await this.prisma.partner.findFirst({ where: { id: payerPartnerId, isInternal: true, status: 'ACTIVE', deletedAt: null } });
    if (!payer) throw new BadRequestException('请选择有效的内部付款主体');
    const rows: Prisma.LogisticsSettlementLineCreateManySettlementInput[] = [];
    for (const line of dto.lines) {
      const w = waybills.find(w => w.id === line.waybillId)!;
      const terms = await this.applicablePrices(w);
      let term: PriceTerm | undefined;
      if (line.contractPriceTermId) {
        term = terms.find(t => t.id === line.contractPriceTermId);
        if (!term) throw new BadRequestException('所选物流合同运价不适用于该运单的主体、事业部、路线或发货日期');
      } else if (terms.length) {
        const best = terms.filter(t => Boolean(t.originLocation) === Boolean(terms[0].originLocation));
        if (best.length > 1) throw new BadRequestException('运单 ' + w.waybillNo + ' 匹配多份物流合同，请明确选择使用哪份运价');
        term = best[0];
      }
      if (term && term.contract.signingPartnerId !== payerPartnerId && !dto.payerChangeReason?.trim()) throw new BadRequestException('付款主体与物流合同签约主体不同，请填写付款安排说明');
      const pricingBasis = term?.contract.settlementBasis || line.pricingBasis || 'NET_WEIGHT';
      const weight = this.weight(w, line, term?.contract.defaultWeightBasis || 'SETTLEMENT', pricingBasis);
      const price = line.manualUnitPrice ?? (term ? Number(term.unitPrice) : undefined);
      const changed = Boolean(term && price !== Number(term.unitPrice));
      if (changed && !line.overrideReason?.trim()) throw new BadRequestException('调整合同运价必须填写调整原因');
      rows.push({ ...weight, waybillId: w.id, unitPrice: price, contractUnitPrice: term?.unitPrice,
        contractPriceTermId: term?.id, priceSource: changed ? 'CONTRACT_OVERRIDDEN' : term ? 'CONTRACT' : 'MANUAL',
        overrideReason: changed ? line.overrideReason!.trim() : null, amount: price != null ? money(weight.chargeQuantity, price) : undefined });
    }
    const now = new Date(), date = now.toISOString().slice(0, 10).replace(/-/g, ''), numberLock = 'logistics-settlement-number:' + date;
    await this.prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${numberLock}, 0))::text`;
    const count = await this.prisma.logisticsSettlement.count({ where: { settlementNo: { startsWith: 'LS' + date } } });
    const result = await this.prisma.logisticsSettlement.create({ data: {
      settlementNo: 'LS' + date + String(count + 1).padStart(4, '0'), ownerPartnerId, payerPartnerId,
      businessUnitId: [...units][0], carrierPartnerId: [...carriers][0], payerChangeReason: dto.payerChangeReason?.trim(),
      periodStart: period.start!,
      periodEnd: new Date(period.end!.getTime() - (periodEnd.length === 10 ? 1 : 0)),
      preparedBy: userId, preparedAt: now, createdBy: userId, remarks: dto.remarks,
      totalNetWeight: rows.reduce((v, l) => v.plus(String(l.netWeight)), new Prisma.Decimal(0)), totalGrossWeight: rows.reduce((v, l) => v.plus(String(l.grossWeight || 0)), new Prisma.Decimal(0)),
      totalAmount: rows.reduce((v, l) => v.plus(String(l.amount || 0)), new Prisma.Decimal(0)),
      lines: { createMany: { data: rows } },
    }, include: this.include });
    if (payerPartnerId !== ownerPartnerId) await this.record(result.id, null, 'PAYER', { payerPartnerId: ownerPartnerId }, { payerPartnerId }, dto.payerChangeReason!, userId);
    for (const row of result.lines) {
      if (row.overrideReason) await this.record(result.id, row.id, 'PRICE', { unitPrice: row.contractUnitPrice }, { unitPrice: row.unitPrice }, row.overrideReason, userId);
      if (row.weightReason) await this.record(result.id, row.id, 'WEIGHT', { source: '默认货款依据' }, { ticketNo: row.ticketNo, weightBasis: row.weightBasis, chargeQuantity: row.chargeQuantity }, row.weightReason, userId);
    }
    return this.findOne(result.id, userId, 'logistics.settlement.manage');
  }

  async findAll(query: { status?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'logistics.settlement.view');
    const scope = await this.accessControl.getLogisticsSettlementScope(userId, 'logistics.settlement.view');
    return this.prisma.logisticsSettlement.findMany({ where: { AND: [scope, { deletedAt: null }, query.status ? { status: query.status } : {}] }, include: this.include, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string, userId: string, permission = 'logistics.settlement.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getLogisticsSettlementScope(userId, permission);
    const item = await this.prisma.logisticsSettlement.findFirst({ where: { AND: [{ id, deletedAt: null }, scope] }, include: this.include });
    if (!item) throw new NotFoundException('物流结算单不存在或无权访问');
    const [ownerPartner, businessUnit, actors] = await Promise.all([
      item.ownerPartnerId ? this.prisma.partner.findUnique({ where: { id: item.ownerPartnerId }, select: { id: true, name: true, code: true } }) : Promise.resolve(item.payerPartner),
      item.businessUnitId ? this.prisma.businessUnit.findUnique({ where: { id: item.businessUnitId }, select: { id: true, name: true } }) : Promise.resolve(null),
      this.prisma.user.findMany({ where: { id: { in: [...new Set(item.adjustments.map(a => a.actorId))] } }, select: { id: true, name: true } }),
    ]);
    return { ...item, ownerPartner, businessUnit, adjustments: item.adjustments.map(a => ({ ...a, actorName: actors.find(u => u.id === a.actorId)?.name || '历史用户' })) };
  }

  private async record(settlementId: string, lineId: string | null, kind: string, before: unknown, after: unknown, reason: string, actorId: string) {
    return this.prisma.logisticsSettlementAdjustment.create({ data: { settlementId, lineId, kind, before: json(before), after: json(after), reason: reason.trim(), actorId } });
  }

  private async recomputeTotals(id: string) {
    const lines = await this.prisma.logisticsSettlementLine.findMany({ where: { settlementId: id } });
    await this.prisma.logisticsSettlement.update({ where: { id }, data: {
      totalNetWeight: lines.reduce((s, l) => s.plus(l.netWeight), new Prisma.Decimal(0)),
      totalGrossWeight: lines.reduce((s, l) => s.plus(l.grossWeight || 0), new Prisma.Decimal(0)),
      totalAmount: lines.reduce((s, l) => s.plus(l.amount || 0), new Prisma.Decimal(0)),
    } });
  }

  private async edit<T>(id: string, userId: string, operation: (service: LogisticsSettlementService, item: Awaited<ReturnType<LogisticsSettlementService['findOne']>>) => Promise<T>) {
    return this.prisma.$transaction(async tx => {
      const key = 'logistics:' + id;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const service = new LogisticsSettlementService(tx as PrismaService, this.accessControl, this.files);
      const item = await service.findOne(id, userId, 'logistics.settlement.manage');
      if (item.status !== 'DRAFT') throw new BadRequestException('只有草稿状态的物流结算单可以修改');
      return operation(service, item);
    });
  }

  async setLinePrice(id: string, lineId: string, dto: SetLinePriceDto, userId: string) {
    return this.edit(id, userId, async (service, item) => {
      const line = item.lines.find(l => l.id === lineId);
      if (!line) throw new NotFoundException('结算单明细不存在');
      if (!dto.overrideReason?.trim()) throw new BadRequestException('调整单价必须填写调整原因');
      const quantity = line.chargeQuantity || line.netWeight;
      const updated = await service.prisma.logisticsSettlementLine.update({ where: { id: lineId }, data: { unitPrice: dto.unitPrice, amount: money(quantity, dto.unitPrice),
        contractUnitPrice: line.contractUnitPrice || (line.contractPriceTermId ? line.unitPrice : null), priceSource: line.contractPriceTermId ? 'CONTRACT_OVERRIDDEN' : 'MANUAL', overrideReason: dto.overrideReason.trim() } });
      await service.record(id, lineId, 'PRICE', { unitPrice: line.unitPrice, amount: line.amount }, { unitPrice: updated.unitPrice, amount: updated.amount }, dto.overrideReason, userId);
      await service.recomputeTotals(id);
      return updated;
    });
  }

  async lineOptions(id: string, lineId: string, userId: string) {
    const item = await this.findOne(id, userId, 'logistics.settlement.manage');
    const line = item.lines.find(l => l.id === lineId);
    if (!line) throw new NotFoundException('结算单明细不存在');
    const scope = await this.accessControl.getWaybillScope(userId, 'logistics.settlement.manage');
    const waybill = await this.prisma.waybill.findFirst({ where: { id: line.waybillId, AND: [scope] }, include: waybillInclude });
    if (!waybill) throw new NotFoundException('运单不存在或无权访问');
    return { tickets: waybill.weighTickets, defaultTicketId: this.defaultTicket(waybill)?.id };
  }

  async setLineWeight(id: string, lineId: string, dto: SetLineWeightDto, userId: string) {
    return this.edit(id, userId, async (service, item) => {
      const line = item.lines.find(l => l.id === lineId);
      if (!line) throw new NotFoundException('结算单明细不存在');
      if (!dto.weightReason?.trim()) throw new BadRequestException('请填写计费依据调整原因');
      const scope = await this.accessControl.getWaybillScope(userId, 'logistics.settlement.manage');
      const w = await service.prisma.waybill.findFirst({ where: { id: line.waybillId, AND: [scope] }, include: waybillInclude });
      if (!w) throw new NotFoundException('运单不存在或无权访问');
      const weight = service.weight(w, dto, 'SETTLEMENT', line.pricingBasis);
      const updated = await service.prisma.logisticsSettlementLine.update({ where: { id: lineId }, data: { ...weight, amount: line.unitPrice ? money(weight.chargeQuantity, line.unitPrice) : null } });
      await service.record(id, lineId, 'WEIGHT', { ticketNo: line.ticketNo, chargeQuantity: line.chargeQuantity, amount: line.amount }, { ticketNo: updated.ticketNo, chargeQuantity: updated.chargeQuantity, amount: updated.amount }, dto.weightReason, userId);
      await service.recomputeTotals(id);
      return updated;
    });
  }

  async setPayer(id: string, dto: SetPayerDto, userId: string) {
    return this.edit(id, userId, async (service, item) => {
      if (!dto.reason?.trim()) throw new BadRequestException('修改付款主体必须填写原因');
      const payer = await service.prisma.partner.findFirst({ where: { id: dto.payerPartnerId, isInternal: true, status: 'ACTIVE', deletedAt: null } });
      if (!payer) throw new BadRequestException('请选择有效的内部付款主体');
      await service.prisma.logisticsSettlement.update({ where: { id }, data: { payerPartnerId: payer.id, payerChangeReason: dto.reason.trim() } });
      await service.record(id, null, 'PAYER', { payerPartnerId: item.payerPartnerId, name: item.payerPartner?.name }, { payerPartnerId: payer.id, name: payer.name }, dto.reason, userId);
      return service.findOne(id, userId, 'logistics.settlement.manage');
    });
  }

  async submit(id: string, userId: string) {
    return this.edit(id, userId, async (service, item) => {
      if (item.lines.some(l => !l.unitPrice || Number(l.unitPrice) <= 0)) throw new BadRequestException('存在未填写单价的明细，请先补全后再提交');
      if (item.lines.some(l => l.weightBasis === 'CONFIRMED') && !item.attachments.length) throw new BadRequestException('使用双方确认重量，请先上传重量确认依据附件');
      await service.assertWeightsCurrent(item);
      return service.prisma.logisticsSettlement.update({ where: { id }, data: { status: 'SUBMITTED' }, include: service.include });
    });
  }

  private async assertWeightsCurrent(item: Awaited<ReturnType<LogisticsSettlementService['findOne']>>) {
    for (const line of item.lines) {
      if (!line.weighTicketId) continue; // 历史结算保留原快照，不追溯重算。
      await this.prisma.$queryRaw`SELECT "id" FROM "weigh_tickets" WHERE "id"=${line.weighTicketId} FOR SHARE`;
      const ticket = await this.prisma.weighTicket.findFirst({ where: { id: line.weighTicketId, waybillId: line.waybillId, status: 'REVIEWED', deletedAt: null } });
      const old = line.evidenceSnapshot as any;
      if (!ticket || ticket.updatedAt.toISOString() !== old?.ticketUpdatedAt) throw new BadRequestException('计费磅单已变化，请退回草稿重新确认该行计费依据：' + (line.ticketNo || line.waybill.waybillNo));
    }
  }

  async review(id: string, userId: string) {
    return this.prisma.$transaction(async tx => {
      const key = 'logistics:' + id;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const service = new LogisticsSettlementService(tx as PrismaService, this.accessControl, this.files);
      const item = await service.findOne(id, userId, 'logistics.settlement.manage');
      if (item.status !== 'SUBMITTED') throw new BadRequestException('只有已提交的物流结算单可以复核');
      await service.assertWeightsCurrent(item);
      return tx.logisticsSettlement.update({ where: { id }, data: { status: 'REVIEWED', reviewedBy: userId, reviewedAt: new Date() }, include: service.include });
    });
  }

  async returnDraft(id: string, userId: string) {
    return this.prisma.$transaction(async tx => {
      const key = 'logistics:' + id;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const service = new LogisticsSettlementService(tx as PrismaService, this.accessControl, this.files);
      const item = await service.findOne(id, userId, 'logistics.settlement.manage');
      if (item.status !== 'SUBMITTED') throw new BadRequestException('只有已提交、未复核的结算单可退回修改');
      return tx.logisticsSettlement.update({ where: { id }, data: { status: 'DRAFT' }, include: service.include });
    });
  }

  async voidSettlement(id: string, userId: string, locked = false): Promise<any> {
    if (!locked) return this.prisma.$transaction(async tx => {
      const key = 'logistics:' + id;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      return new LogisticsSettlementService(tx as PrismaService, this.accessControl, this.files).voidSettlement(id, userId, true);
    });
    const item = await this.findOne(id, userId, 'logistics.settlement.manage');
    if (item.status === 'VOIDED') throw new BadRequestException('结算单已作废');
    const requests = await this.prisma.paymentRequest.count({ where: { logisticsSettlementId: id, status: { notIn: ['DRAFT', 'REJECTED', 'VOIDED'] } } });
    const allocations = await this.prisma.logisticsPaymentAllocation.count({ where: { logisticsSettlementId: id, reversedAt: null } });
    if (requests || allocations) throw new BadRequestException('物流结算单已有有效付款申请或核销记录，请先处理付款申请及资金记录，不能直接作废');
    return this.prisma.logisticsSettlement.update({ where: { id }, data: { status: 'VOIDED' }, include: this.include });
  }

  async uploadAttachment(id: string, file: Express.Multer.File, userId: string) {
    await this.findOne(id, userId, 'logistics.settlement.manage');
    const prepared = file?.buffer?.length && file.size <= 20 * 1024 * 1024 ? prepareAttachmentUpload(file) : null;
    if (!prepared) throw new BadRequestException('请选择不超过20MB的 JPG、PNG、WEBP 或 PDF');
    const uploaded = await this.files.upload(file.buffer, prepared.originalName, prepared.mimeType, 'logistics-settlement');
    try {
      return await this.edit(id, userId, async service => service.prisma.attachment.create({ data: { ...uploaded, ...prepared, logisticsSettlementId: id, category: 'LOGISTICS_SETTLEMENT', uploadedBy: userId } }));
    } catch (error) { try { await this.files.delete(uploaded.fileName); } catch {} throw error; }
  }

  async attachment(id: string, attachmentId: string, userId: string, remove = false) {
    if (!remove) {
      const item = await this.findOne(id, userId);
      const attachment = item.attachments.find(a => a.id === attachmentId);
      if (!attachment) throw new NotFoundException('附件不存在');
      return { url: await this.files.getUrl(attachment.fileName), originalName: attachment.originalName, mimeType: attachment.mimeType };
    }
    const attachment = await this.edit(id, userId, async (service, item) => {
      const attachment = item.attachments.find(a => a.id === attachmentId);
      if (!attachment) throw new NotFoundException('附件不存在');
      await service.prisma.attachment.delete({ where: { id: attachmentId } });
      return attachment;
    });
    try { await this.files.delete(attachment.fileName); } catch { this.logger.warn('物流结算附件记录已移除，存储对象待清理：' + attachment.id); }
    return { success: true };
  }
}
