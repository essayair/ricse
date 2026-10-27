import { Prisma, PrismaClient } from '@prisma/client';

const apply = process.argv.includes('--apply');

type Receipt = Prisma.InboundReceiptGetPayload<{
  include: {
    weighTicket: true;
    qualityInspection: { include: { indicators: true } };
    waybill: {
      include: {
        qualityTask: true;
        lineItems: true;
        weightSelections: true;
        dispatchNotice: { include: { order: true } };
      };
    };
    businessInbound: { include: { inventoryLot: true } };
  };
}>;

export function deriveLegacyQuantity(receipt: Receipt, basis: string) {
  const ticket = receipt.weighTicket;
  const report = receipt.qualityInspection;
  const task = receipt.waybill.qualityTask;
  const current = receipt.waybill.weightSelections.filter(selection => selection.purpose === 'INVENTORY' && selection.isCurrent);
  if (receipt.waybill.lineItems.length !== 1) throw new Error('运单不是单物料，无法分摊磅单重量');
  if (!ticket || ticket.status !== 'REVIEWED' || ticket.deletedAt || ticket.waybillId !== receipt.waybillId || ticket.netWeight == null) {
    throw new Error('缺少同一运单已复核的有效入库磅单');
  }
  if (current.length !== 1 || current[0].weighTicketId !== ticket.id) throw new Error('入库磅单不是当前选定磅单');
  if (!task || task.status !== 'COMPLETED' || task.deletedAt || !['PASS', 'LEGACY', 'ACCEPT_WITH_DEDUCTION'].includes(task.qualityDisposition)
    || !report || report.status !== 'CONFIRMED' || report.deletedAt || report.qualityTaskId !== task.id || task.basisInspectionId !== report.id) {
    throw new Error('缺少已确认且最终采用的合格质检报告');
  }
  const physical = new Prisma.Decimal(ticket.netWeight).toDecimalPlaces(3);
  if (physical.lte(0)) throw new Error('选定磅单净重无效');
  const moistures = report.indicators.filter(item => /^(MOISTURE|WATER|H2O|水分)$/i.test(item.code.trim()) || item.name.includes('水分'));
  const validMoisture = moistures.length === 1 && moistures[0].measuredValue != null
    && ['%', '％'].includes(moistures[0].unit.trim())
    && new Prisma.Decimal(moistures[0].measuredValue).gte(0)
    && new Prisma.Decimal(moistures[0].measuredValue).lt(100);
  if (basis === 'DRY_MATTER' && !validMoisture) throw new Error('折干物料缺少唯一有效的水分实测值');
  if (!['PHYSICAL', 'DRY_MATTER'].includes(basis)) throw new Error('物料计价口径无效');
  const moisture = validMoisture ? new Prisma.Decimal(moistures[0].measuredValue!) : null;
  const pricing = basis === 'DRY_MATTER' ? physical.mul(new Prisma.Decimal(1).minus(moisture!.div(100))).toDecimalPlaces(3) : physical;
  if (pricing.lte(0)) throw new Error('计价数量无效');
  return { physical, pricing, moisture, basis };
}

export async function reconcileLegacyReceipt(receipt: Receipt, prisma: PrismaClient, applyChanges = false) {
  const materialId = receipt.businessInbound?.materialId || receipt.waybill.lineItems[0]?.materialId;
  const material = materialId ? await prisma.material.findUnique({ where: { id: materialId }, select: { pricingQuantityBasis: true } }) : null;
  if (!material) throw new Error('物料不存在');
  const quantities = deriveLegacyQuantity(receipt, material.pricingQuantityBasis);
  if (receipt.status === 'RECEIVED') {
    if (receipt.businessInbound) throw new Error('已收货单已有关联业务入库单');
    if (applyChanges) {
      const updated = await prisma.inboundReceipt.updateMany({
        where: { id: receipt.id, status: 'RECEIVED', quantitySource: 'LEGACY_UNVERIFIED' },
        data: { receivedQuantity: quantities.physical, pricingQuantity: quantities.pricing,
          pricingQuantityBasis: quantities.basis, measuredMoisturePct: quantities.moisture,
          quantitySource: 'HISTORICAL_RECONCILED', quantityReconciledAt: new Date() },
      });
      if (updated.count !== 1) throw new Error('入库单已由其他操作修改，请重新运行');
    }
    return 'RECEIVED_RECONCILED';
  }

  const inbound = receipt.businessInbound;
  const lot = inbound?.inventoryLot;
  if (!inbound || !lot || inbound.status !== 'POSTED') throw new Error('已过账单缺少有效入库或库存批次');
  const unchanged = new Prisma.Decimal(inbound.quantity).eq(quantities.physical)
    && new Prisma.Decimal(lot.initialQuantity).eq(quantities.physical)
    && new Prisma.Decimal(inbound.pricingQuantity).eq(quantities.pricing)
    && new Prisma.Decimal(lot.pricingInitialQuantity).eq(quantities.pricing);
  const initialLedger = await prisma.inventoryLedger.findMany({ where: { lotId: lot.id }, orderBy: { createdAt: 'asc' } });
  if (!initialLedger.length || initialLedger[0].businessType !== 'INBOUND' || initialLedger[0].businessNo !== inbound.inboundNo) {
    throw new Error('库存批次缺少原始入库台账');
  }
  if (!unchanged || quantities.basis === 'DRY_MATTER') {
    const [outbound, sales, reversal, production, settlement] = await Promise.all([
      prisma.outboundReceiptAllocation.count({ where: { inventoryLotId: lot.id } }),
      prisma.salesOutboundLine.count({ where: { inventoryLotId: lot.id } }),
      prisma.inventoryReversalLine.count({ where: { inventoryLotId: lot.id } }),
      prisma.productionMaterialAllocation.count({ where: { inventoryLotId: lot.id } }),
      prisma.financialSettlement.count({ where: {
        contractId: receipt.waybill.dispatchNotice.order.contractId,
        deletedAt: null, status: { not: 'VOIDED' },
      } }),
    ]);
    if (outbound || sales || reversal || production || settlement
      || (!unchanged && (initialLedger.length !== 1 || !new Prisma.Decimal(lot.availableQuantity).eq(lot.initialQuantity)))) {
      throw new Error('已有出库、领料、冲销、结算或库存变动，不能自动改写历史过账数量');
    }
  }
  if (applyChanges) await prisma.$transaction(async tx => {
    const count = await tx.inboundReceipt.updateMany({
      where: { id: receipt.id, status: 'POSTED', quantitySource: 'LEGACY_UNVERIFIED' },
      data: { receivedQuantity: quantities.physical, pricingQuantity: quantities.pricing,
        pricingQuantityBasis: quantities.basis, measuredMoisturePct: quantities.moisture,
        quantitySource: 'HISTORICAL_RECONCILED', quantityReconciledAt: new Date() },
    });
    if (count.count !== 1) throw new Error('入库单已由其他操作修改，请重新运行');
    await tx.businessInbound.update({ where: { id: inbound.id }, data: {
      quantity: quantities.physical, pricingQuantity: quantities.pricing,
      pricingQuantityBasis: quantities.basis, measuredMoisturePct: quantities.moisture,
    } });
    if (!unchanged) {
      await tx.inventoryLot.update({ where: { id: lot.id }, data: {
        initialQuantity: quantities.physical, availableQuantity: quantities.physical,
        pricingInitialQuantity: quantities.pricing, pricingAvailableQuantity: quantities.pricing,
        pricingQuantityBasis: quantities.basis, quantitySource: 'HISTORICAL_RECONCILED', quantityReconciledAt: new Date(),
      } });
      await tx.inventoryLedger.update({ where: { id: initialLedger[0].id }, data: {
        quantityChange: quantities.physical, balanceAfter: quantities.physical,
        pricingQuantityChange: quantities.pricing, pricingBalanceAfter: quantities.pricing,
      } });
    } else {
      await tx.inventoryLot.update({ where: { id: lot.id }, data: {
        pricingQuantityBasis: quantities.basis, quantitySource: 'HISTORICAL_RECONCILED', quantityReconciledAt: new Date(),
      } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return unchanged ? 'POSTED_VERIFIED' : 'POSTED_RECONCILED';
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('请明确提供 DATABASE_URL，禁止隐式连接业务库');
  const prisma = new PrismaClient();
  try {
  const totals: Record<string, number> = {};
  const pending = await prisma.inboundReceipt.count({ where: { quantitySource: 'LEGACY_UNVERIFIED', status: 'PENDING' } });
  totals.PENDING_CONFIRM_NORMAL_FLOW = pending;
  let cursor: string | undefined;
  for (;;) {
    const receipts = await prisma.inboundReceipt.findMany({
      where: { quantitySource: 'LEGACY_UNVERIFIED', status: { in: ['RECEIVED', 'POSTED'] }, deletedAt: null },
      include: { weighTicket: true, qualityInspection: { include: { indicators: true } },
        waybill: { include: { qualityTask: true, lineItems: true, weightSelections: true, dispatchNotice: { include: { order: true } } } },
        businessInbound: { include: { inventoryLot: true } } },
      orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!receipts.length) break;
    for (const receipt of receipts) {
      try {
        const result = await reconcileLegacyReceipt(receipt, prisma, apply);
        totals[result] = (totals[result] || 0) + 1;
        console.log(`${apply ? 'APPLY' : 'DRY_RUN'} ${result} ${receipt.receiptNo}`);
      } catch (error) {
        totals.REVIEW_REQUIRED = (totals.REVIEW_REQUIRED || 0) + 1;
        console.log(`REVIEW_REQUIRED ${receipt.receiptNo}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    cursor = receipts[receipts.length - 1].id;
  }
  console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', totals }));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith('/reconcile-legacy-inventory.ts') || process.argv[1]?.endsWith('/reconcile-legacy-inventory.js')) {
  main();
}
