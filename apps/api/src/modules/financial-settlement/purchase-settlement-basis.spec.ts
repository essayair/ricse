import { mockDeep, mockReset } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { PurchaseSettlementBasis } from './purchase-settlement-basis';
import { DEFAULT_FLUORITE_ORE_BANDS } from '../contract/grade-price-rules';

describe('逐车质量结算来源与版本', () => {
  const prisma = mockDeep<PrismaService>(), access = mockDeep<AccessControlService>();
  const service = new PurchaseSettlementBasis(prisma, access);
  let source: any;
  beforeEach(() => {
    mockReset(prisma); mockReset(access);
    access.assertPermission.mockResolvedValue({ isAdmin: false } as any); access.getContractScope.mockResolvedValue({ businessUnitId: 'unit-1' });
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', lineItems: [{ id: 'cl', materialName: '萤石精粉', unitPrice: new Prisma.Decimal(2000) }] } as any);
    prisma.financialSettlement.findMany.mockResolvedValue([]);
    source = { id: 'wl', unit: 'TON', settlementLines: [], dispatchNoticeLineItem: { orderLineItem: { contractLineItemId: 'cl' } },
      waybill: { id: 'w', waybillNo: 'YD1', status: 'ARRIVED', lineItems: [{ id: 'wl' }], weighTickets: [], inboundReceipts: [{ status: 'POSTED', weighTicketId: 'wt', weighTicket: { ticketNo: 'B1', status: 'REVIEWED', netWeight: new Prisma.Decimal(102), updatedAt: new Date('2026-10-01') }, businessInbound: { id: 'bi', inboundNo: 'BIN1', status: 'POSTED', quantity: new Prisma.Decimal(100), postedAt: new Date('2026-10-01') } }],
        dispatchNotice: { order: { id: 'o', orderNo: 'O1', name: '第一批', status: 'DISPATCHED' } },
        weightSelections: [{ id: 'ws', purpose: 'INVENTORY', weighTicketId: 'wt', quantity: new Prisma.Decimal(100), weighTicket: { ticketNo: 'B1', status: 'REVIEWED', updatedAt: new Date('2026-10-01') } }, { id: 'ws-legacy', purpose: 'SETTLEMENT', weighTicketId: 'wt', quantity: new Prisma.Decimal(100), weighTicket: { ticketNo: 'B1', status: 'REVIEWED', updatedAt: new Date('2026-10-01') } }],
        qualityTask: { id: 'q', taskNo: 'Q1', status: 'COMPLETED', qualityDisposition: 'ACCEPT_WITH_DEDUCTION', qualityDeductionPerTon: new Prisma.Decimal(40), decisionVersion: 1,
          basisInspection: { id: 'report', reportNo: 'R1', status: 'CONFIRMED', updatedAt: new Date('2026-10-01') } } } };
    source.waybill.inboundReceipts[0].businessInbound.pricingQuantity = new Prisma.Decimal(100);
    prisma.waybillLineItem.findMany.mockResolvedValue([source]);
  });
  it('最终采购货款按入库过账数量而非磅单原始净重，减去已占用数量', async () => {
    source.settlementLines.push({ quantity: new Prisma.Decimal(60) });
    const rows = await service.sources('c', 'u');
    expect(rows[0]).toMatchObject({ available: true, totalQuantity: 100, remainingQuantity: 40, totalAmount: 78400, deductionPerTon: 40 });
  });
  it('新分档合同按所选磅单净重折干结算，库存过账数量保持不变', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', pricingType: 'GRADE_TIER', lineItems: [{
      id: 'cl', materialName: '萤石矿', unitPrice: new Prisma.Decimal(700), taxRatePct: new Prisma.Decimal(13),
      priceRulesSnapshot: { version: 1, method: 'CAF2_GRADE_TIER', gradeUnit: 'PERCENT_POINTS', rateUnit: 'CNY_PER_DEGREE_EX_TAX',
        quantityBasis: 'DRY_MATTER', moistureMaxPct: 5, bands: DEFAULT_FLUORITE_ORE_BANDS,
        exceptionHandling: 'MANUAL_REVIEW', selectedSpec: 'FRAGMENT', formulaConfirmed: true },
    }] } as any);
    source.waybill.inboundReceipts[0].weighTicket.netWeight = new Prisma.Decimal(50);
    source.waybill.inboundReceipts[0].businessInbound.quantity = new Prisma.Decimal(50);
    source.waybill.inboundReceipts[0].businessInbound.pricingQuantity = new Prisma.Decimal(50);
    source.waybill.qualityTask.basisInspection.indicators = [
      { code: 'CAF2', measuredValue: new Prisma.Decimal(32.5), unit: '%' },
      { code: 'MOISTURE', measuredValue: new Prisma.Decimal(3.2), unit: '%' },
    ];
    const [row] = await service.sources('c', 'u');
    expect(row).toMatchObject({ pricingQuantityBasis: 'DRY_MATTER', netWeight: 50, dryQuantity: 48.4,
      totalQuantity: 48.4, contractTaxRatePct: 13, gradePrice: { status: 'READY', gradePct: 32.5, rate: 22.7, unitPrice: 737.75 } });
    expect(row.availableQualityReports).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'report', measuredGradePct: 32.5, measuredMoisturePct: 3.2 }),
    ]));
    expect(source.waybill.inboundReceipts[0].businessInbound.quantity.toNumber()).toBe(50);
  });
  it('分档合同约定回收率扣价时，读取最终报告的回收率并单列每吨扣价', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', pricingType: 'GRADE_TIER', lineItems: [{
      id: 'cl', materialName: '萤石矿', unitPrice: new Prisma.Decimal(700), taxRatePct: new Prisma.Decimal(13),
      priceRulesSnapshot: { version: 1, method: 'CAF2_GRADE_TIER', gradeUnit: 'PERCENT_POINTS', rateUnit: 'CNY_PER_DEGREE_EX_TAX',
        moistureMaxPct: 5, bands: DEFAULT_FLUORITE_ORE_BANDS, exceptionHandling: 'MANUAL_REVIEW', selectedSpec: 'FRAGMENT', formulaConfirmed: true,
        recoveryAdjustment: { baselinePct: 86, deductionPerPointPerDegree: 0.4, stepMode: 'PROPORTIONAL' } },
    }] } as any);
    source.waybill.qualityTask.basisInspection.indicators = [
      { code: 'CAF2', measuredValue: new Prisma.Decimal(37), unit: '%' },
      { code: 'MOISTURE', measuredValue: new Prisma.Decimal(3), unit: '%' },
      { code: 'RECOVERY', name: '选矿回收率', measuredValue: new Prisma.Decimal(84.5), unit: '%' },
    ];
    const [row] = await service.sources('c', 'u');
    expect(row).toMatchObject({ available: true, unitPrice: 858.4, deductionPerTon: 40, recoveryDeductionPerTon: 22.2,
      gradePrice: { status: 'READY', recoveryPct: 84.5, recovery: { shortfallPoints: 1.5 } } });
    source.waybill.qualityTask.basisInspection.indicators.pop();
    const [missing] = await service.sources('c', 'u');
    expect(missing.available).toBe(false);
    expect(missing.reasons.join()).toContain('选矿回收率');
  });
  it('逐车结算来源带出入库日期、磅单三重和实测水分，并计算参考干基', async () => {
    const receipt = source.waybill.inboundReceipts[0];
    receipt.receivedAt = new Date('2026-07-23T09:00:00+08:00');
    receipt.weighTicket.grossWeight = new Prisma.Decimal(125);
    receipt.weighTicket.tareWeight = new Prisma.Decimal(23);
    receipt.businessInbound.measuredMoisturePct = new Prisma.Decimal(8.7);
    receipt.businessInbound.pricingQuantityBasis = 'DRY_MATTER';

    const row = (await service.sources('c', 'u'))[0];

    expect(row).toMatchObject({ inboundDate: receipt.receivedAt, grossWeight: 125, tareWeight: 23,
      netWeight: 102, measuredMoisturePct: 8.7, dryQuantity: 93.126, pricingQuantityBasis: 'DRY_MATTER' });
  });
  it('采购结算另选供应商发货磅单时，只改变货款数量且保留库存入库事实', async () => {
    source.waybill.inboundReceipts[0].weighTicket.id = 'wt';
    source.waybill.inboundReceipts[0].businessInbound.pricingQuantityBasis = 'DRY_MATTER';
    source.waybill.inboundReceipts[0].businessInbound.measuredMoisturePct = new Prisma.Decimal(10);
    source.waybill.weighTickets = [
      { id: 'wt', ticketNo: '我方收货', weighingStage: 'RECEIVING', status: 'REVIEWED', netWeight: new Prisma.Decimal(102) },
      { id: 'supplier', ticketNo: '供应商发货', weighingStage: 'SHIPPING', status: 'REVIEWED', netWeight: new Prisma.Decimal(110) },
    ];
    source.waybill.weightSelections[1] = {
      id: 'ws-supplier', purpose: 'SETTLEMENT', weighTicketId: 'supplier', quantity: new Prisma.Decimal(110),
      weighTicket: { id: 'supplier', ticketNo: '供应商发货', status: 'REVIEWED', netWeight: new Prisma.Decimal(110), updatedAt: new Date('2026-10-02') },
    };
    const row = (await service.sources('c', 'u'))[0];
    expect(row).toMatchObject({ totalQuantity: 99, inventoryNetWeight: 102, netWeight: 110,
      inventoryTicketNo: 'B1', settlementTicketNo: '供应商发货', weightSelectionId: 'ws-supplier', settlementWeightSource: 'SELECTED_OTHER_SIDE' });
    expect(source.waybill.inboundReceipts[0].businessInbound.pricingQuantity.toNumber()).toBe(100);
  });
  it('采购结算可另选本车已确认的发货侧报告重算折干数量，入库报告和库存数量保持不变', async () => {
    const posted = source.waybill.inboundReceipts[0].businessInbound;
    posted.pricingQuantityBasis = 'DRY_MATTER';
    posted.measuredMoisturePct = new Prisma.Decimal(10);
    posted.pricingQuantity = new Prisma.Decimal(90);
    source.waybill.inboundReceipts[0].weighTicket.netWeight = new Prisma.Decimal(100);
    source.waybill.qualityTask.basisInspection.indicators = [{ code: 'MOISTURE', measuredValue: new Prisma.Decimal(10) }];
    source.waybill.qualityTask.reportLinks = [{ inspection: {
      id: 'supplier-report', reportNo: '供应商报告', status: 'CONFIRMED', deletedAt: null, evidenceStage: 'SHIPPING',
      conclusion: 'PASS', institutionName: '供应商送检机构', updatedAt: new Date('2026-10-02'),
      indicators: [{ code: 'MOISTURE', measuredValue: new Prisma.Decimal(8) }],
    } }];
    const rows = await service.sources('c', 'u', 'settlement.view', undefined, new Map([['wl', 'supplier-report']]));
    expect(rows[0]).toMatchObject({ totalQuantity: 92, measuredMoisturePct: 8, inventoryReportId: 'report', reportId: 'supplier-report', qualityReady: true });
    expect(posted.pricingQuantity.toNumber()).toBe(90);
  });
  it('未关联本车或尚未确认的检测报告不能选作货款依据', async () => {
    const rows = await service.sources('c', 'u', 'settlement.view', undefined, new Map([['wl', 'other-contract-report']]));
    expect(rows[0].available).toBe(false);
    expect(rows[0].reasons.join('；')).toContain('不属于本车质检任务');
  });
  it('另选的货款报告被修改后，原结算快照在确认时失效', async () => {
    const report = { id: 'supplier-report', reportNo: '供应商报告', status: 'CONFIRMED', deletedAt: null,
      evidenceStage: 'SHIPPING', conclusion: 'PASS', institutionName: '送检机构', updatedAt: new Date('2026-10-02'),
      indicators: [{ code: 'MOISTURE', measuredValue: new Prisma.Decimal(8) }] };
    source.waybill.qualityTask.reportLinks = [{ inspection: report }];
    const selected = (await service.sources('c', 'u', 'settlement.view', undefined, new Map([['wl', report.id]])))[0];
    prisma.financialSettlement.findUnique.mockResolvedValue({ id: 's', contractId: 'c', lines: [{ waybillLineItemId: 'wl', quantity: new Prisma.Decimal(100), sourceSnapshot: selected }] } as any);
    await expect(service.assertCurrent('s', 'u')).resolves.toBeUndefined();
    report.updatedAt = new Date('2026-10-03');
    await expect(service.assertCurrent('s', 'u')).rejects.toThrow('结算依据已变更');
  });
  it('协商数量只允许落在双方已复核磅单的依据范围内，不回写库存', async () => {
    source.waybill.weighTickets = [
      { id: 'ours', ticketNo: '收货', weighingStage: 'RECEIVING', status: 'REVIEWED', netWeight: new Prisma.Decimal(100) },
      { id: 'theirs', ticketNo: '发货', weighingStage: 'SHIPPING', status: 'REVIEWED', netWeight: new Prisma.Decimal(105) },
    ];
    const row = (await service.sources('c', 'u'))[0];
    expect(row).toMatchObject({ totalQuantity: 100, negotiableQuantity: 105, remainingQuantity: 100, negotiableRemainingQuantity: 105 });
    expect(source.waybill.inboundReceipts[0].businessInbound.pricingQuantity.toNumber()).toBe(100);
  });
  it('只有一侧磅单时不能借协商数量入口突破已过账数量', async () => {
    source.waybill.weighTickets = [{ id: 'ours', ticketNo: '收货', weighingStage: 'RECEIVING', status: 'REVIEWED', netWeight: new Prisma.Decimal(105) }];
    expect((await service.sources('c', 'u'))[0]).toMatchObject({ totalQuantity: 100, negotiableQuantity: 100 });
  });
  it('新增未完成的同侧第二张磅单后，不再静默沿用唯一磅单作为结算侧依据', async () => {
    source.waybill.weighTickets = [
      { id: 'first', ticketNo: '发货一', weighingStage: 'SHIPPING', status: 'REVIEWED', netWeight: new Prisma.Decimal(105) },
      { id: 'second', ticketNo: '发货二', weighingStage: 'SHIPPING', status: 'PENDING', netWeight: null },
      { id: 'receiving', ticketNo: '我方收货', weighingStage: 'RECEIVING', status: 'REVIEWED', netWeight: new Prisma.Decimal(100) },
    ];
    const row = (await service.sources('c', 'u'))[0];
    expect(row.available).toBe(false);
    expect(row.reasons.join('；')).toContain('发货侧有多张磅单，请先确认采信磅单');
    expect(row.negotiableQuantity).toBe(100);
    expect(row.availableWeighTickets.map((ticket: any) => ticket.id)).toEqual(['first', 'receiving']);
  });
  it('未入库过账或入库已冲销时不能编制最终货物应付，不影响提前付款入口', async () => {
    source.waybill.inboundReceipts[0].status = 'RECEIVED';
    const row = (await service.sources('c', 'u'))[0];
    expect(row.available).toBe(false); expect(row.reasons.join('；')).toContain('入库过账'); expect(row.reasons.join('；')).toContain('预付款或阶段款');
  });
  it('有扣款但尚未商务接收时不能形成货物应付', async () => {
    source.waybill.qualityTask.qualityDisposition = 'DEDUCTION_PENDING';
    expect((await service.sources('c', 'u'))[0]).toMatchObject({ available: false, qualityReady: false });
  });
  it('改选报告或重新判定后，原结算快照失效而不静默重算', async () => {
    const original = (await service.sources('c', 'u'))[0];
    prisma.financialSettlement.findUnique.mockResolvedValue({ id: 's', contractId: 'c', lines: [{ waybillLineItemId: 'wl', quantity: new Prisma.Decimal(100), sourceSnapshot: original }] } as any);
    source.waybill.qualityTask.decisionVersion = 2;
    await expect(service.assertCurrent('s', 'u')).rejects.toThrow('结算依据已变更');
  });

  it('旧跟踪结算仅在过账数量与原磅单/检测事实完全一致时兼容原签名', async () => {
    const original = (await service.sources('c', 'u'))[0];
    prisma.financialSettlement.findUnique.mockResolvedValue({ id: 's', contractId: 'c', lines: [{ waybillLineItemId: 'wl', quantity: new Prisma.Decimal(100), sourceSnapshot: { ...original, inboundNo: undefined, signature: original.legacySignature } }] } as any);
    await expect(service.assertCurrent('s', 'u')).resolves.toBeUndefined();
    source.waybill.inboundReceipts[0].businessInbound.pricingQuantity = new Prisma.Decimal(99);
    await expect(service.assertCurrent('s', 'u')).rejects.toThrow('结算依据已变更');
  });
  it('双数量上线前已记录入库编号的结算快照，在数量事实未变时继续可确认', async () => {
    const original = (await service.sources('c', 'u'))[0];
    const oldSnapshot = { ...original, signature: original.priorSignature } as any;
    delete oldSnapshot.inboundPhysicalQuantity;
    prisma.financialSettlement.findUnique.mockResolvedValue({ id: 's', contractId: 'c', lines: [
      { waybillLineItemId: 'wl', quantity: new Prisma.Decimal(100), sourceSnapshot: oldSnapshot },
    ] } as any);
    await expect(service.assertCurrent('s', 'u')).resolves.toBeUndefined();
    source.waybill.inboundReceipts[0].businessInbound.pricingQuantity = new Prisma.Decimal(99);
    await expect(service.assertCurrent('s', 'u')).rejects.toThrow('结算依据已变更');
  });
  it('存在未映射的历史批次结算时阻止同货物重复确认应付', async () => {
    prisma.financialSettlement.findMany.mockResolvedValue([{ settlementScope: 'BATCH', lines: [{ orderId: 'o', waybillLineItemId: null }] }] as any);
    expect((await service.sources('c', 'u'))[0].reasons.join('；')).toContain('历史应付');
  });

  it('萤石矿分档价按最终报告实测品位计价，不用通用质检阈值误拒收', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', pricingType: 'GRADE_TIER', lineItems: [{
      id: 'cl', materialName: '萤石矿', unitPrice: new Prisma.Decimal(500), priceRulesSnapshot: {
        version: 1, method: 'CAF2_GRADE_TIER', gradeUnit: 'PERCENT_POINTS', rateUnit: 'CNY_PER_DEGREE_EX_TAX',
        selectedSpec: 'FRAGMENT', formulaConfirmed: true, moistureMaxPct: 5, exceptionHandling: 'MANUAL_REVIEW',
        bands: [{ lower: 35, upper: 40, rates: { FRAGMENT: 23.2, RUN_OF_MINE: 23.2 } }],
      },
    }] } as any);
    source.waybill.inboundReceipts[0].businessInbound.pricingQuantityBasis = 'PHYSICAL';
    source.waybill.qualityTask.qualityDisposition = 'REVIEW_REQUIRED';
    source.waybill.qualityTask.qualityDeductionPerTon = new Prisma.Decimal(0);
    source.waybill.qualityTask.basisInspection.indicators = [
      { code: 'CAF2', unit: '%', measuredValue: new Prisma.Decimal(37) },
      { code: 'MOISTURE', unit: '%', measuredValue: new Prisma.Decimal(4) },
    ];

    const row = (await service.sources('c', 'u'))[0];
    expect(row).toMatchObject({ available: true, unitPrice: 858.4, qualityReady: true, gradePrice: { status: 'READY', gradePct: 37, rate: 23.2 } });
  });

  it('水分超过分档合同上限时转人工确认，不自动生成金额', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', pricingType: 'GRADE_TIER', lineItems: [{
      id: 'cl', materialName: '萤石矿', unitPrice: new Prisma.Decimal(500), priceRulesSnapshot: {
        version: 1, method: 'CAF2_GRADE_TIER', gradeUnit: 'PERCENT_POINTS', rateUnit: 'CNY_PER_DEGREE_EX_TAX',
        selectedSpec: 'FRAGMENT', formulaConfirmed: true, moistureMaxPct: 5, exceptionHandling: 'MANUAL_REVIEW',
        bands: [{ lower: 35, upper: 40, rates: { FRAGMENT: 23.2, RUN_OF_MINE: 23.2 } }],
      },
    }] } as any);
    source.waybill.inboundReceipts[0].businessInbound.pricingQuantityBasis = 'PHYSICAL';
    source.waybill.qualityTask.basisInspection.indicators = [
      { code: 'CAF2', unit: '%', measuredValue: new Prisma.Decimal(37) },
      { code: 'MOISTURE', unit: '%', measuredValue: new Prisma.Decimal(6) },
    ];

    const row = (await service.sources('c', 'u'))[0];
    expect(row.available).toBe(false);
    expect(row.reasons.join('；')).toContain('水分 6% 超过合同上限 5%');
  });
});
