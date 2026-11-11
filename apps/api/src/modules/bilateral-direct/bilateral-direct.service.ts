import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateDirectExecutionDto, ConfirmDirectDeliveryDto, ConvertDirectDeliveryDto } from './bilateral-direct.dto';
import { directQuantity } from './direct-quantity';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const no = (prefix: string) => `${prefix}-${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }).replace(/-/g, '')}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
const active = ['PENDING_REVIEW', 'CONFIRMED'];
const stable = (v: any): string => JSON.stringify(v, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value);

@Injectable()
export class BilateralDirectService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessControlService) {}

  private async internal(userId: string, permission: string) {
    const context = await this.access.assertPermission(userId, permission);
    // 未完成方向级投影前不能把两向内部确认快照向外部账号开放。
    if (context.isExternal) throw new ForbiddenException('直拨内部交付操作仅对有业务权限的内部账号开放');
    return context;
  }

  async executionOptions(contractId: string, userId: string) {
    await this.internal(userId, 'execution.manage');
    const scope = await this.access.getContractScope(userId, 'execution.manage');
    const contract = await this.prisma.contract.findFirst({ where: { id: contractId, type: 'BILATERAL', deletedAt: null, AND: [scope] }, select: { id: true, sellerId: true, buyerId: true, signingPartnerId: true, lineItems: { select: { id: true, quantity: true } } } });
    if (!contract) throw new NotFoundException('双边合同不存在或无权操作');
    const [partners, warehouses, orders] = await Promise.all([
      this.prisma.partner.findMany({ where: { id: { in: [contract.sellerId, contract.buyerId, contract.signingPartnerId].filter(Boolean) as string[] }, deletedAt: null }, select: { id: true, name: true, businessAddresses: { where: { status: 'ACTIVE' }, orderBy: { isDefault: 'desc' }, select: { id: true, addressName: true, fullAddress: true, contactPerson: true, contactPhone: true, isDefault: true } } } }),
      this.prisma.warehouse.findMany({ where: { deletedAt: null, status: 'ACTIVE' }, select: { id: true, name: true, address: true, manager: true, managerPhone: true } }),
      this.prisma.order.findMany({ where: { contractId, deletedAt: null, status: { not: 'CANCELLED' } }, select: { id: true, orderNo: true, name: true, type: true, status: true, lineItems: { select: { id: true, contractLineItemId: true, quantity: true } }, dispatchNotices: { where: { deletedAt: null, status: { not: 'CANCELLED' } }, select: { lineItems: { select: { orderLineItemId: true, quantity: true } } } } } }),
    ]);
    return {
      partners, warehouses, sellerId: contract.sellerId, buyerId: contract.buyerId,
      orders: orders.filter(o => ['CONFIRMED', 'DISPATCHED'].includes(o.status)).map(o => ({ id: o.id, orderNo: o.orderNo, name: o.name, type: o.type, status: o.status, remaining: o.lineItems.map(l => ({ contractLineItemId: l.contractLineItemId, quantity: l.quantity.minus(o.dispatchNotices.flatMap(n => n.lineItems).filter(i => i.orderLineItemId === l.id).reduce((sum, i) => sum.plus(i.quantity), new Prisma.Decimal(0))).toString() })) })),
      unallocated: contract.lineItems.map(l => ({ contractLineItemId: l.id, ...Object.fromEntries(['PURCHASE', 'SALES'].map(direction => [direction, l.quantity.minus(orders.filter(o => o.type === direction).flatMap(o => o.lineItems).filter(i => i.contractLineItemId === l.id).reduce((sum, i) => sum.plus(i.quantity), new Prisma.Decimal(0))).toString()])) })),
    };
  }

  async createExecution(dto: CreateDirectExecutionDto, userId: string) {
    await this.internal(userId, 'execution.manage');
    const scope = await this.access.getContractScope(userId, 'execution.manage');
    const allowed = await this.prisma.contract.findFirst({ where: { id: dto.contractId, deletedAt: null, AND: [scope] }, select: { id: true } });
    if (!allowed) throw new NotFoundException('合同不存在或无权操作');
    if (!dto.originLocation.trim() || !dto.destinationLocation.trim()) throw new BadRequestException('请填写起运地点和目的地点');
    return this.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM contracts WHERE id=${dto.contractId} FOR UPDATE`;
      const previous = await tx.directExecution.findUnique({ where: { createdBy_requestId: { createdBy: userId, requestId: dto.requestId } }, include: { purchaseNotice: true, salesNotice: { include: { lineItems: { include: { orderLineItem: true } } } } } });
      if (previous) {
        if (previous.contractId !== dto.contractId || previous.salesNotice.lineItems[0]?.orderLineItem.contractLineItemId !== dto.contractLineItemId || (dto.purchaseOrderId && previous.purchaseNotice.orderId !== dto.purchaseOrderId) || (dto.salesOrderId && previous.salesNotice.orderId !== dto.salesOrderId) || Number(previous.salesNotice.totalQuantity) !== dto.quantity || previous.salesNotice.originLocation !== dto.originLocation.trim() || previous.salesNotice.destinationLocation !== dto.destinationLocation.trim()) throw new BadRequestException('请求标识已用于其他直拨执行，请刷新后重试');
        return previous;
      }
      const contract = await tx.contract.findFirst({ where: { id: dto.contractId, deletedAt: null, type: 'BILATERAL', status: { in: ['APPROVED', 'EXECUTING'] } }, include: { lineItems: true } });
      if (!contract) throw new BadRequestException('仅审批通过或执行中的双边合同可以创建配对直拨');
      const source = contract.lineItems.find(l => l.id === dto.contractLineItemId);
      if (!source || !Number.isFinite(dto.quantity) || dto.quantity <= 0) throw new BadRequestException('请选择有效合同行项和正数通知数量');
      // 所选地址必须属于合同参与方；手填地址仍可用。
      const participants = [contract.sellerId, contract.buyerId, contract.signingPartnerId].filter(Boolean) as string[];
      for (const addressId of [dto.originPartnerAddressId, dto.destinationPartnerAddressId].filter(Boolean) as string[]) {
        if (!await tx.partnerAddress.findFirst({ where: { id: addressId, partnerId: { in: participants }, status: 'ACTIVE' } })) throw new BadRequestException('所选收发货地址不存在、已停用或不属于合同参与方');
      }
      for (const warehouseId of [dto.originWarehouseId, dto.destinationWarehouseId].filter(Boolean) as string[]) {
        if (!await tx.warehouse.findFirst({ where: { id: warehouseId, deletedAt: null, status: 'ACTIVE' } })) throw new BadRequestException('所选地址仓库不存在或已停用');
      }
      const notices: Record<string, string> = {};
      for (const direction of ['PURCHASE', 'SALES']) {
        const orderId = direction === 'PURCHASE' ? dto.purchaseOrderId : dto.salesOrderId;
        let order = orderId ? await tx.order.findFirst({ where: { id: orderId, contractId: contract.id, type: direction, deletedAt: null, status: { in: ['CONFIRMED', 'DISPATCHED'] } }, include: { lineItems: true } }) : null;
        if (orderId && !order) throw new BadRequestException(`${direction === 'PURCHASE' ? '采购' : '销售'}批次不属于本合同、方向不符或未确认`);
        if (!order) {
          const allocated = await tx.orderLineItem.aggregate({ where: { contractLineItemId: source.id, order: { contractId: contract.id, type: direction, deletedAt: null, status: { not: 'CANCELLED' } } }, _sum: { quantity: true } });
          if (new Prisma.Decimal(allocated._sum.quantity || 0).plus(dto.quantity).gt(source.quantity)) throw new BadRequestException(`${direction === 'PURCHASE' ? '采购' : '销售'}数量超过合同剩余可建批次数量，请选用已有批次`);
          const price = direction === 'SALES' ? source.salesUnitPrice : source.unitPrice;
          if (price == null) throw new BadRequestException('合同缺少对应方向价格');
          order = await tx.order.create({ data: {
            orderNo: no(direction === 'PURCHASE' ? 'CGDD' : 'XSDD'), name: `${dto.name?.trim() || contract.title}·${direction === 'PURCHASE' ? '采购' : '销售'}直拨`, contractId: contract.id, type: direction,
            status: 'CONFIRMED', totalAmount: price.mul(dto.quantity).toDecimalPlaces(2), plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : null, createdBy: userId,
            lineItems: { create: { contractLineItemId: source.id, materialId: source.materialId, materialName: source.materialName, quantity: dto.quantity, unit: source.unit, unitPrice: price, totalPrice: price.mul(dto.quantity).toDecimalPlaces(2) } },
          }, include: { lineItems: true } });
        }
        const line = order.lineItems.find(l => l.contractLineItemId === source.id);
        if (!line) throw new BadRequestException('所选批次没有对应合同行项');
        const used = await tx.dispatchNoticeLineItem.aggregate({ where: { orderLineItemId: line.id, dispatchNotice: { deletedAt: null, status: { not: 'CANCELLED' } } }, _sum: { quantity: true } });
        if (new Prisma.Decimal(used._sum.quantity || 0).plus(dto.quantity).gt(line.quantity)) throw new BadRequestException('本次数量超过两向批次剩余可通知数量');
        const notice = await tx.dispatchNotice.create({ data: {
          noticeNo: no(direction === 'PURCHASE' ? 'PI' : 'SD'), orderId: order.id, type: direction, mode: 'DIRECT', status: 'ISSUED', qualityRequired: true,
          originLocation: dto.originLocation.trim(), destinationLocation: dto.destinationLocation.trim(),
          originSourceType: dto.originSourceType || 'MANUAL', destinationSourceType: dto.destinationSourceType || 'MANUAL',
          originWarehouseId: dto.originWarehouseId || null, destinationWarehouseId: dto.destinationWarehouseId || null,
          originPartnerAddressId: dto.originPartnerAddressId || null, destinationPartnerAddressId: dto.destinationPartnerAddressId || null,
          originContactPerson: dto.originContactPerson, originContactPhone: dto.originContactPhone, destinationContactPerson: dto.destinationContactPerson, destinationContactPhone: dto.destinationContactPhone,
          totalQuantity: dto.quantity, plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : null, issuedAt: new Date(), createdBy: userId, remarks: dto.remarks,
          lineItems: { create: { orderLineItemId: line.id, materialId: source.materialId, materialName: source.materialName, quantity: dto.quantity, unit: source.unit } },
        } });
        notices[direction] = notice.id;
        await tx.order.update({ where: { id: order.id }, data: { status: 'DISPATCHED', dispatchedAt: new Date() } });
      }
      const execution = await tx.directExecution.create({ data: { contractId: contract.id, purchaseNoticeId: notices.PURCHASE, salesNoticeId: notices.SALES, createdBy: userId, requestId: dto.requestId }, include: { purchaseNotice: true, salesNotice: true } });
      await tx.contract.update({ where: { id: contract.id }, data: { status: 'EXECUTING' } });
      await this.log(tx, 'CONTRACT', contract.id, 'DIRECT_EXECUTION_CREATE', '创建配对直拨执行', userId, { executionId: execution.id, ...notices });
      return execution;
    }, { timeout: 20000 });
  }

  async contractReview(contractId: string, userId: string) {
    const context = await this.internal(userId, 'contract.view');
    const scope = await this.access.getContractScope(userId, 'contract.view');
    const c = await this.prisma.contract.findFirst({ where: { id: contractId, type: 'BILATERAL', deletedAt: null, AND: [scope] }, include: { attachments: { select: { category: true } }, seller: { select: { name: true } }, buyer: { select: { name: true } } } });
    if (!c) throw new NotFoundException('双边合同不存在或无权查看');
    const waybills = await this.prisma.waybill.findMany({ where: { deletedAt: null, dispatchNotice: { directSalesExecution: { is: { contractId } } } }, include: {
      attachments: { select: { category: true } }, directDeliveries: { where: { status: 'CONFIRMED' }, include: { documents: true }, take: 1, orderBy: { version: 'desc' } },
    }, orderBy: { createdAt: 'asc' } });
    let financeVisible = context.isAdmin;
    if (!financeVisible && context.permissions.includes('settlement.view')) {
      const financialScope = await this.access.getContractScope(userId, 'settlement.view');
      financeVisible = Boolean(await this.prisma.contract.findFirst({ where: { id: contractId, AND: [financialScope] }, select: { id: true } }));
    }
    const [settlements, invoices, funds] = financeVisible ? await Promise.all([
      this.prisma.financialSettlement.findMany({ where: { contractId, deletedAt: null, status: { not: 'VOIDED' } }, select: { id: true, settlementNo: true, direction: true, status: true, quantity: true, lines: { select: { directDeliveryId: true } } } }),
      this.prisma.invoiceRecord.findMany({ where: { contractId, status: { not: 'VOIDED' } }, select: { id: true, direction: true, sellerPartnerId: true, buyerPartnerId: true, quantity: true, materialName: true } }),
      this.prisma.fundTransaction.findMany({ where: { OR: [{ contractId }, { claims: { some: { contractId, status: { not: 'REVERSED' } } } }], status: { not: 'VOIDED' } }, select: { id: true, direction: true, actualPayerName: true, actualPayeeName: true, paymentStage: true, isThirdParty: true } }),
    ]) : [[], [], []];
    const normalize = (value?: string | null) => (value || '').replace(/[\s（）()·,，.。]/g, '').toLowerCase();
    return {
      contractId, financeVisible,
      contractEvidence: { purchase: c.attachments.some(a => a.category === 'PURCHASE_CONTRACT'), sales: c.attachments.some(a => a.category === 'SALES_CONTRACT'), purchaseNo: Boolean(c.externalNo), salesNo: Boolean(c.salesExternalNo) },
      trips: waybills.map(w => {
        const delivery = w.directDeliveries[0], purchase = delivery?.documents.find(d => d.direction === 'PURCHASE'), sales = delivery?.documents.find(d => d.direction === 'SALES');
        return { id: w.id, waybillNo: w.waybillNo, plateNo: w.plateNo, status: w.status, receiptProvided: w.attachments.some(a => ['RECEIPT', 'RECEIPT_DOCUMENT', 'RECEIPT_PHOTO', 'RECEIPT_OTHER'].includes(a.category)),
          delivered: Boolean(delivery), purchaseDocumentNo: purchase?.documentNo, salesDocumentNo: sales?.documentNo,
          quantitiesConsistent: Boolean(purchase && sales && purchase.quantity.eq(sales.quantity) && purchase.pricingQuantity.eq(sales.pricingQuantity)),
          quantity: delivery?.quantity, pricingQuantity: delivery?.pricingQuantity,
          purchaseSettlements: settlements.filter(s => s.direction === 'PAYABLE' && s.lines.some(l => l.directDeliveryId === delivery?.id)).map(s => ({ id: s.id, settlementNo: s.settlementNo, quantity: s.quantity, status: s.status })),
          salesSettlements: settlements.filter(s => s.direction === 'RECEIVABLE' && s.lines.some(l => l.directDeliveryId === delivery?.id)).map(s => ({ id: s.id, settlementNo: s.settlementNo, quantity: s.quantity, status: s.status })),
        };
      }),
      funds: { count: funds.length, thirdPartyCount: funds.filter(f => f.isThirdParty).length, oppositePartyCount: funds.filter(f => !['REFUND', 'GUARANTEE_RETURN'].includes(f.paymentStage || '') && (f.direction === 'PAYMENT' ? normalize(f.actualPayeeName) === normalize(c.buyer?.name) : normalize(f.actualPayerName) === normalize(c.seller?.name))).length },
      invoices: { count: invoices.length, inconsistentPartyCount: invoices.filter(i => i.direction === 'INPUT' ? i.sellerPartnerId !== c.sellerId || i.buyerPartnerId !== c.signingPartnerId : i.sellerPartnerId !== c.signingPartnerId || i.buyerPartnerId !== c.buyerId).length,
        inputQuantity: invoices.filter(i => i.direction === 'INPUT').reduce((s, i) => s.plus(i.quantity || 0), new Prisma.Decimal(0)), outputQuantity: invoices.filter(i => i.direction === 'OUTPUT').reduce((s, i) => s.plus(i.quantity || 0), new Prisma.Decimal(0)),
        namesDiffer: new Set(invoices.map(i => i.materialName?.trim()).filter(Boolean)).size > 1 },
      note: '补充核对仅提示，不代替原有提交门禁、资金主体校验或财税认定；原地交割未开放。',
    };
  }

  private async scope(userId: string, waybillId: string, permission: string) {
    await this.internal(userId, permission);
    const scope = await this.access.getWaybillScope(userId, permission);
    if (!await this.prisma.waybill.findFirst({ where: { id: waybillId, deletedAt: null, AND: [scope] }, select: { id: true } })) throw new NotFoundException('运单不存在或无权操作');
  }

  private async load(tx: Prisma.TransactionClient, waybillId: string) {
    const w = await tx.waybill.findFirst({ where: { id: waybillId, deletedAt: null }, include: {
      dispatchNotice: { include: { order: { include: { contract: { include: { lineItems: true } } } }, directSalesExecution: true } },
      lineItems: { include: { dispatchNoticeLineItem: { include: { orderLineItem: true } } } }, attachments: true,
      weighTickets: { where: { deletedAt: null, status: 'REVIEWED' }, include: { weightSelections: { where: { isCurrent: true } } } },
      qualityTask: { include: { basisInspection: { include: { indicators: true } }, reports: { where: { deletedAt: null, status: 'CONFIRMED' }, include: { indicators: true } }, reportLinks: { where: { unlinkedAt: null }, include: { inspection: { include: { indicators: true } } } } } },
      directDeliveries: { orderBy: { version: 'desc' }, include: { documents: true } },
    } });
    if (!w?.dispatchNotice.directSalesExecution || w.dispatchNotice.mode !== 'DIRECT' || w.dispatchNotice.order.contract.type !== 'BILATERAL') throw new BadRequestException('此运单不是新建的配对双边直拨；历史直拨不能自动转换');
    return w;
  }

  async detail(waybillId: string, userId: string) {
    await this.scope(userId, waybillId, 'logistics.view');
    const w = await this.load(this.prisma, waybillId);
    const task = w.qualityTask;
    const reports = [...new Map([...(task?.reports || []), ...(task?.reportLinks.map(l => l.inspection) || []), ...(task?.basisInspection ? [task.basisInspection] : [])].filter(r => !r.deletedAt && r.status === 'CONFIRMED').map(r => [r.id, r])).values()];
    return { waybillId: w.id, status: w.status, directOutcome: w.directOutcome, replacementWaybillId: w.replacementWaybillId, plannedQuantity: w.totalQuantity, originLocation: w.originLocation, destinationLocation: w.destinationLocation, execution: w.dispatchNotice.directSalesExecution, deliveries: w.directDeliveries, weighTickets: w.weighTickets, reports, qualityTask: task ? { id: task.id, status: task.status, basisInspectionId: task.basisInspectionId, finalConclusion: task.finalConclusion } : null };
  }

  async warehouses(userId: string) {
    await this.internal(userId, 'inventory.manage');
    return this.prisma.warehouse.findMany({ where: { deletedAt: null, status: 'ACTIVE' }, select: { id: true, code: true, name: true, address: true }, orderBy: { code: 'asc' } });
  }

  async rejectReturn(waybillId: string, reason: string, userId: string) {
    await this.scope(userId, waybillId, 'inventory.manage');
    if (!reason.trim()) throw new BadRequestException('请填写拒收退回原因');
    return this.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM waybills WHERE id=${waybillId} FOR UPDATE`;
      const w = await this.load(tx, waybillId);
      if (w.status === 'CANCELLED' || w.directOutcome) throw new BadRequestException('运单已取消或已处理异常去向');
      if (!['ARRIVED', 'SIGNED'].includes(w.status)) throw new BadRequestException('客户确认送达后才能登记整车拒收；尚未到货请使用取消运单');
      if (w.directDeliveries.some(d => active.includes(d.status))) throw new BadRequestException('请先撤销有效交付或复核，再登记整车拒收退回');
      await this.assertNoDownstream(tx, w);
      if (!w.attachments.length) throw new BadRequestException('请在运单附件中上传拒收退回依据');
      await tx.waybill.update({ where: { id: waybillId }, data: { status: 'CANCELLED', directOutcome: 'REJECT_RETURN' } });
      await tx.weighTask.updateMany({ where: { waybillId, deletedAt: null }, data: { status: 'VOIDED' } });
      await tx.qualityTask.updateMany({ where: { waybillId, deletedAt: null }, data: { status: 'VOIDED', decisionReason: reason.trim() } });
      await this.log(tx, 'WAYBILL', waybillId, 'DIRECT_REJECT_RETURN', '整车拒收退回供应商', userId, { reason, previousStatus: w.status });
      return { rejected: true, outcome: 'REJECT_RETURN' };
    });
  }

  async convertToWarehouse(waybillId: string, dto: ConvertDirectDeliveryDto, userId: string) {
    await this.scope(userId, waybillId, 'inventory.manage');
    if (!dto.reason.trim()) throw new BadRequestException('请填写转入库原因');
    return this.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM waybills WHERE id=${waybillId} FOR UPDATE`;
      const w = await this.load(tx, waybillId);
      if (w.status === 'CANCELLED' || w.directOutcome) throw new BadRequestException('运单已取消或已处理异常去向');
      if (w.directDeliveries.some(d => active.includes(d.status))) throw new BadRequestException('请先撤销有效交付或复核，再转入库');
      await this.assertNoDownstream(tx, w);
      const warehouse = await tx.warehouse.findFirst({ where: { id: dto.warehouseId, status: 'ACTIVE', deletedAt: null } });
      if (!warehouse?.address?.trim()) throw new BadRequestException('请选择已维护详细地址的有效入库仓库');
      if (w.lineItems.length !== 1) throw new BadRequestException('整车转入库仅支持一车一个物料');
      const execution = w.dispatchNotice.directSalesExecution!;
      const contractId = w.dispatchNotice.order.contractId;
      if (!['APPROVED', 'EXECUTING'].includes(w.dispatchNotice.order.contract.status)) throw new BadRequestException('合同已结束或终止，不能新增转入库执行；请先由业务处理合同状态');
      await tx.$queryRaw`SELECT id FROM contracts WHERE id=${contractId} FOR UPDATE`;
      const purchase = await tx.dispatchNotice.findUniqueOrThrow({ where: { id: execution.purchaseNoticeId }, include: { lineItems: true } });
      const sales = await tx.dispatchNotice.findUniqueOrThrow({ where: { id: execution.salesNoticeId }, include: { lineItems: true } });
      const qty = Number(w.lineItems[0].quantity) > 0 ? Number(w.lineItems[0].quantity) : dto.plannedQuantity;
      if (!qty || qty <= 0) throw new BadRequestException('原车无计划参考数量，请填写本次转入库的计划参考数量；实际仍以到仓磅单为准');
      if (!purchase.lineItems[0] || !sales.lineItems[0] || purchase.lineItems[0].quantity.lt(qty) || sales.lineItems[0].quantity.lt(qty)) throw new BadRequestException('转入库计划参考数量超过原配对通知可分配数量，请先核对通知计划；不能静默超额拆分');
      for (const notice of [purchase, sales]) {
        const quantity = notice.lineItems[0].quantity.minus(qty);
        await tx.dispatchNoticeLineItem.update({ where: { id: notice.lineItems[0].id }, data: { quantity } });
        const otherTrips = await tx.waybill.count({ where: { dispatchNoticeId: sales.id, id: { not: waybillId }, deletedAt: null, status: { not: 'CANCELLED' } } });
        await tx.dispatchNotice.update({ where: { id: notice.id }, data: { totalQuantity: quantity, status: quantity.eq(0) && !otherTrips ? 'CANCELLED' : notice.status } });
      }
      const nextNotice = await tx.dispatchNotice.create({ data: { noticeNo: no('PI'), orderId: purchase.orderId, type: 'PURCHASE', mode: 'STANDARD', status: 'ISSUED', qualityRequired: true,
        warehouseId: warehouse.id, destinationWarehouseId: warehouse.id, destinationSourceType: 'WAREHOUSE', originLocation: dto.originLocation?.trim() || (w.status === 'PENDING' ? w.originLocation : w.destinationLocation) || purchase.originLocation,
        destinationLocation: warehouse.address, totalQuantity: qty, createdBy: userId, issuedAt: new Date(), remarks: `由直拨运单 ${w.waybillNo} 整车转入库：${dto.reason.trim()}`,
        lineItems: { create: { orderLineItemId: purchase.lineItems[0].orderLineItemId, materialId: w.lineItems[0].materialId, materialName: w.lineItems[0].materialName, unit: w.lineItems[0].unit, quantity: qty } },
      }, include: { lineItems: true } });
      const nextWaybill = await tx.waybill.create({ data: { waybillNo: no('WB'), dispatchNoticeId: nextNotice.id, totalQuantity: qty, status: 'PENDING', freightMode: w.freightMode,
        vehicleId: w.vehicleId, driverId: w.driverId, carrierPartnerId: w.carrierPartnerId, carrierName: w.carrierName, plateNo: w.plateNo, driverName: w.driverName, driverPhone: w.driverPhone,
        originLocation: nextNotice.originLocation, destinationLocation: warehouse.address, createdBy: userId, remarks: nextNotice.remarks,
        lineItems: { create: { dispatchNoticeLineItemId: nextNotice.lineItems[0].id, materialId: w.lineItems[0].materialId, materialName: w.lineItems[0].materialName, unit: w.lineItems[0].unit, quantity: qty } },
      } });
      await tx.waybill.update({ where: { id: w.id }, data: { status: 'CANCELLED', directOutcome: 'TO_WAREHOUSE', replacementWaybillId: nextWaybill.id } });
      await tx.weighTask.updateMany({ where: { waybillId, deletedAt: null }, data: { status: 'VOIDED' } });
      await tx.qualityTask.updateMany({ where: { waybillId, deletedAt: null }, data: { status: 'VOIDED' } });
      await this.log(tx, 'WAYBILL', waybillId, 'DIRECT_TO_WAREHOUSE', '直拨整车转常规采购入库', userId, { reason: dto.reason, nextNoticeId: nextNotice.id, nextWaybillId: nextWaybill.id, warehouseId: warehouse.id, plannedQuantity: qty });
      return { converted: true, nextNoticeId: nextNotice.id, nextWaybillId: nextWaybill.id, nextWaybillNo: nextWaybill.waybillNo };
    });
  }

  private async prepare(tx: Prisma.TransactionClient, waybillId: string, dto: ConfirmDirectDeliveryDto) {
    const w = await this.load(tx, waybillId);
    if (w.status !== 'SIGNED') throw new BadRequestException('请先完成客户签收');
    if (!['APPROVED', 'EXECUTING'].includes(w.dispatchNotice.order.contract.status)) throw new BadRequestException('合同已结束或终止，不能确认交付');
    if (w.lineItems.length !== 1) throw new BadRequestException('直拨首版一车仅支持一个物料行');
    if (!w.attachments.some(a => ['RECEIPT', 'RECEIPT_DOCUMENT', 'RECEIPT_PHOTO', 'RECEIPT_OTHER'].includes(a.category))) throw new BadRequestException('请先上传至少一份有效签收凭证');
    const ticket = w.weighTickets.find(t => t.id === dto.weighTicketId && Number(t.netWeight) > 0);
    if (!ticket) throw new BadRequestException('请选择本车已复核的有效磅单');
    const stageTickets = w.weighTickets.filter(t => t.weighingStage === ticket.weighingStage);
    const selected = stageTickets.flatMap(t => t.weightSelections).find(s => s.purpose === ticket.weighingStage);
    if ((stageTickets.length > 1 || selected) && selected?.weighTicketId !== ticket.id) throw new BadRequestException('同侧有多张磅单，请先确认采用的采信磅单');
    const task = w.qualityTask;
    if (!task || task.deletedAt || task.status !== 'COMPLETED' || task.basisInspectionId !== dto.qualityReportId || task.basisInspection?.status !== 'CONFIRMED' || task.basisInspection.deletedAt) throw new BadRequestException('请在质检任务中采用一份有效报告并完成最终判定，发货侧或收货侧均可');
    if (!['SHIPPING', 'RECEIVING'].includes(task.basisInspection.evidenceStage)) throw new BadRequestException('请标明采用报告的发货/收货环节');
    if (!dto.remarks.trim()) throw new BadRequestException('请填写交付依据及差异处理说明');
    if (task.finalConclusion !== 'PASS' && !dto.acceptQualityException) throw new BadRequestException('质量结果存在异常，请核对后勾选确认异常接收，并填写处理说明');
    const source = w.dispatchNotice.order.contract.lineItems.find(l => l.id === w.lineItems[0].dispatchNoticeLineItem.orderLineItem.contractLineItemId);
    if (!source) throw new BadRequestException('无法匹配合同物料行');
    const material = await tx.material.findUnique({ where: { id: source.materialId }, select: { pricingQuantityBasis: true } });
    const basis = source.pricingQuantityBasis || material?.pricingQuantityBasis || '';
    const qty = directQuantity(ticket.netWeight!, basis, task.basisInspection.indicators);
    return { w, ...qty, pricingQuantityBasis: basis, snapshot: json({ contractId: w.dispatchNotice.order.contractId, contractLineItemId: source.id, executionId: w.dispatchNotice.directSalesExecution!.id,
      materialId: source.materialId, materialName: source.materialName, unit: source.unit, weighTicketId: ticket.id, ticketNo: ticket.ticketNo, ticketUpdatedAt: ticket.updatedAt, weighingStage: ticket.weighingStage,
      reportId: task.basisInspection.id, reportNo: task.basisInspection.reportNo || task.basisInspection.inspectionNo, reportUpdatedAt: task.basisInspection.updatedAt, evidenceStage: task.basisInspection.evidenceStage,
      indicators: task.basisInspection.indicators, decisionVersion: task.decisionVersion, finalConclusion: task.finalConclusion, acceptQualityException: Boolean(dto.acceptQualityException),
      quantity: qty.quantity.toString(), pricingQuantity: qty.pricingQuantity.toString(), pricingQuantityBasis: basis, measuredMoisturePct: qty.measuredMoisturePct,
    }) };
  }

  async preview(waybillId: string, dto: ConfirmDirectDeliveryDto, userId: string) {
    await this.scope(userId, waybillId, 'inventory.manage');
    const { w, snapshot } = await this.prepare(this.prisma, waybillId, dto);
    return { snapshot, procurementQuantityEqualsSales: true, createsInventory: false, activeDelivery: w.directDeliveries.find(d => active.includes(d.status)) || null };
  }

  async confirm(waybillId: string, dto: ConfirmDirectDeliveryDto, userId: string) {
    await this.scope(userId, waybillId, 'inventory.manage');
    return this.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM waybills WHERE id=${waybillId} FOR UPDATE`;
      const prepared = await this.prepare(tx, waybillId, dto);
      const current = prepared.w.directDeliveries.find(d => active.includes(d.status));
      if (current) {
        if (current.status === 'CONFIRMED' && current.weighTicketId === dto.weighTicketId && current.qualityInspectionId === dto.qualityReportId) return current;
        throw new BadRequestException('当前已有有效交付或待复核记录，请先撤销或处理复核');
      }
      const delivery = await tx.directDelivery.create({ data: {
        waybillId, version: (prepared.w.directDeliveries[0]?.version || 0) + 1, status: dto.requestReview ? 'PENDING_REVIEW' : 'CONFIRMED',
        weighTicketId: dto.weighTicketId, qualityInspectionId: dto.qualityReportId, quantity: prepared.quantity, pricingQuantity: prepared.pricingQuantity,
        pricingQuantityBasis: prepared.pricingQuantityBasis, snapshot: prepared.snapshot, remarks: dto.remarks.trim(), createdBy: userId, confirmedAt: dto.requestReview ? null : new Date(),
      } });
      if (!dto.requestReview) await this.post(tx, delivery, prepared.w, userId);
      await this.log(tx, 'WAYBILL', waybillId, dto.requestReview ? 'DIRECT_REVIEW_SUBMIT' : 'DIRECT_CONFIRM', dto.requestReview ? '提交直拨交付复核' : '确认销售交付并同步采购', userId, { deliveryId: delivery.id, version: delivery.version, snapshot: prepared.snapshot });
      return tx.directDelivery.findUnique({ where: { id: delivery.id }, include: { documents: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
  }

  private async post(tx: Prisma.TransactionClient, delivery: { id: string; quantity: Prisma.Decimal; pricingQuantity: Prisma.Decimal; qualityInspectionId: string; weighTicketId: string; remarks: string }, w: Awaited<ReturnType<BilateralDirectService['load']>>, userId: string) {
    await tx.directTradeDocument.createMany({ data: ['PURCHASE', 'SALES'].map(direction => ({ documentNo: no(direction === 'PURCHASE' ? 'ZBCG' : 'ZBXS'), directDeliveryId: delivery.id, direction, quantity: delivery.quantity, pricingQuantity: delivery.pricingQuantity })) });
    await tx.waybill.update({ where: { id: w.id }, data: { salesCompletionReportId: delivery.qualityInspectionId, salesCompletionCustomerTicketId: delivery.weighTicketId,
      salesCompletionConfirmedBy: userId, salesCompletionConfirmedAt: new Date(), salesCompletionRemarks: delivery.remarks, salesCompletionCustomerWeight: delivery.quantity } });
    await tx.dispatchNotice.updateMany({ where: { id: { in: [w.dispatchNotice.directSalesExecution!.purchaseNoticeId, w.dispatchNotice.directSalesExecution!.salesNoticeId] }, status: 'ISSUED' }, data: { status: 'IN_PROGRESS' } });
  }

  async review(waybillId: string, approved: boolean, reason: string, userId: string) {
    const context = await this.internal(userId, 'contract.approve');
    if (!context.isAdmin && !context.roleCodes.includes('BUSINESS_MANAGER')) throw new ForbiddenException('请由运营经理复核直拨交付');
    await this.scope(userId, waybillId, 'contract.approve');
    const roleScope = await this.access.getContractScope(userId, 'contract.approve', 'BUSINESS_MANAGER');
    if (!reason.trim()) throw new BadRequestException('请填写复核意见');
    return this.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM waybills WHERE id=${waybillId} FOR UPDATE`;
      const w = await this.load(tx, waybillId);
      if (!await tx.contract.findFirst({ where: { id: w.dispatchNotice.order.contractId, AND: [roleScope] }, select: { id: true } })) throw new ForbiddenException('运营经理角色未获授权处理该业务单元');
      const d = w.directDeliveries.find(d => d.status === 'PENDING_REVIEW');
      if (!d) throw new BadRequestException('没有待复核的直拨交付');
      if (approved) {
        const result = await this.prepare(tx, waybillId, { weighTicketId: d.weighTicketId, qualityReportId: d.qualityInspectionId, remarks: d.remarks, acceptQualityException: Boolean((d.snapshot as any).acceptQualityException) });
        if (stable(result.snapshot) !== stable(d.snapshot)) throw new BadRequestException('采用依据已变化，请退回修改并重新提交复核');
        await this.post(tx, d, w, userId);
      }
      const result = await tx.directDelivery.update({ where: { id: d.id }, data: { status: approved ? 'CONFIRMED' : 'REJECTED', confirmedAt: approved ? new Date() : null, reviewedBy: userId, reviewedAt: new Date(), reviewComment: reason.trim() }, include: { documents: true } });
      await this.log(tx, 'WAYBILL', waybillId, 'DIRECT_REVIEW', approved ? '通过直拨交付复核' : '退回直拨交付修改', userId, { deliveryId: d.id, reason });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async assertNoDownstream(tx: Prisma.TransactionClient, w: Awaited<ReturnType<BilateralDirectService['load']>>) {
    const lineIds = w.lineItems.map(l => l.id);
    const deliveryIds = w.directDeliveries.map(d => d.id);
    const blocked = await tx.financialSettlement.findFirst({ where: { deletedAt: null, status: { not: 'VOIDED' }, lines: { some: { OR: [{ waybillLineItemId: { in: lineIds } }, { directDeliveryId: { in: deliveryIds } }] } } }, select: { settlementNo: true } });
    if (blocked) throw new BadRequestException(`请先撤回或作废关联结算单 ${blocked.settlementNo} 并处理其资金、发票引用`);
    const freight = await tx.logisticsSettlementLine.findFirst({ where: { waybillId: w.id, settlement: { deletedAt: null, status: { not: 'VOIDED' } } }, select: { id: true } });
    if (freight) throw new BadRequestException('请先处理该运单关联的物流结算，再撤销或取消');
  }

  async reverse(waybillId: string, reason: string, userId: string) {
    await this.scope(userId, waybillId, 'inventory.manage');
    if (!reason.trim()) throw new BadRequestException('请填写撤销原因');
    return this.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM waybills WHERE id=${waybillId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM direct_deliveries WHERE "waybillId"=${waybillId} AND status IN ('CONFIRMED','PENDING_REVIEW') FOR UPDATE`;
      const w = await this.load(tx, waybillId);
      const d = w.directDeliveries.find(d => active.includes(d.status));
      if (!d) throw new BadRequestException('没有可撤销的有效交付或复核');
      await this.assertNoDownstream(tx, w);
      await tx.directTradeDocument.updateMany({ where: { directDeliveryId: d.id }, data: { status: 'REVERSED' } });
      await tx.directDelivery.update({ where: { id: d.id }, data: { status: 'REVERSED', reversedBy: userId, reversedAt: new Date(), reversalReason: reason.trim() } });
      await tx.waybill.update({ where: { id: waybillId }, data: { salesCompletionConfirmedAt: null, salesCompletionConfirmedBy: null, salesCompletionReportId: null, salesCompletionCustomerTicketId: null, salesCompletionShippingTicketId: null, salesCompletionCustomerWeight: null, salesCompletionShippingWeight: null, salesCompletionWeightVariance: null, salesCompletionRemarks: null } });
      await tx.dispatchNotice.updateMany({ where: { id: { in: [w.dispatchNotice.directSalesExecution!.purchaseNoticeId, w.dispatchNotice.directSalesExecution!.salesNoticeId] }, status: 'COMPLETED' }, data: { status: 'IN_PROGRESS', completedAt: null } });
      const notices = await tx.dispatchNotice.findMany({ where: { id: { in: [w.dispatchNotice.directSalesExecution!.purchaseNoticeId, w.dispatchNotice.directSalesExecution!.salesNoticeId] } }, select: { orderId: true } });
      await tx.order.updateMany({ where: { id: { in: notices.map(n => n.orderId) }, status: 'COMPLETED' }, data: { status: 'DISPATCHED', completedAt: null } });
      // 完成是可重开的履约状态；关闭、终止、作废等法律/管理状态不自动恢复。
      await tx.contract.updateMany({ where: { id: w.dispatchNotice.order.contractId, status: 'COMPLETED' }, data: { status: 'EXECUTING' } });
      await this.log(tx, 'WAYBILL', waybillId, 'DIRECT_REVERSE', '撤销直拨配对交付', userId, { deliveryId: d.id, reason });
      return { reversed: true, deliveryId: d.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancel(waybillId: string, reason: string, userId: string) {
    await this.scope(userId, waybillId, 'logistics.manage');
    if (!reason.trim()) throw new BadRequestException('请填写取消原因');
    return this.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM waybills WHERE id=${waybillId} FOR UPDATE`;
      const w = await this.load(tx, waybillId);
      if (w.directDeliveries.some(d => active.includes(d.status))) throw new BadRequestException('请先撤销有效交付或待复核记录，再取消运单');
      await this.assertNoDownstream(tx, w);
      await tx.waybill.update({ where: { id: waybillId }, data: { status: 'CANCELLED' } });
      await tx.weighTask.updateMany({ where: { waybillId, deletedAt: null }, data: { status: 'VOIDED' } });
      await tx.qualityTask.updateMany({ where: { waybillId, deletedAt: null }, data: { status: 'VOIDED' } });
      await this.log(tx, 'WAYBILL', waybillId, 'DIRECT_CANCEL', '取消直拨运单', userId, { reason, previousStatus: w.status });
      return { cancelled: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, options: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel } = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(fn, { ...options, isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: options.timeout || 20000 }); }
      catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && (
          ['P2034', 'P2002'].includes(error.code)
          || (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code)))
        );
        if (retryable) {
          if (attempt < 2) continue;
          throw new BadRequestException('单据状态正在被其他操作更新，请刷新后重试');
        }
        throw error;
      }
    }
  }

  private log(tx: Prisma.TransactionClient, businessType: string, businessId: string, action: string, actionLabel: string, operatorId: string, details: unknown) {
    return tx.businessOperationLog.create({ data: { businessType, businessId, action, actionLabel, operatorId, details: json(details) } });
  }
}
