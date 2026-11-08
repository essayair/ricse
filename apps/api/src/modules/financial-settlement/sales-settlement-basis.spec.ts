import { mockDeep, mockReset } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { SalesSettlementBasis } from './sales-settlement-basis';
import { DEFAULT_FLUORITE_ORE_BANDS } from '../contract/grade-price-rules';

describe('销售交付后的逐车应收来源', () => {
  const prisma = mockDeep<PrismaService>(), access = mockDeep<AccessControlService>();
  const basis = new SalesSettlementBasis(prisma, access);
  let row: any;
  beforeEach(() => {
    mockReset(prisma); mockReset(access);
    access.assertPermission.mockResolvedValue({ isAdmin: false } as any);
    access.getContractScope.mockResolvedValue({ businessUnitId: 'unit' });
    prisma.contract.findFirst.mockResolvedValue({ id: 'contract', type: 'SALES', pricingType: 'FIXED', lineItems: [
      { id: 'contract-line', materialName: '萤石精粉', unitPrice: new Prisma.Decimal(2000) },
    ] } as any);
    prisma.financialSettlement.findMany.mockResolvedValue([]);
    prisma.material.findMany.mockResolvedValue([{ id: 'material', pricingQuantityBasis: 'DRY_MATTER' }] as any);
    const report = { id: 'customer-report', reportNo: '客户质检', status: 'CONFIRMED', conclusion: 'PASS', evidenceStage: 'RECEIVING',
      deletedAt: null, updatedAt: new Date('2026-10-31'), indicators: [{ code: 'MOISTURE', measuredValue: new Prisma.Decimal(10) }] };
    const shipping = { id: 'shipping', ticketNo: '我方发货', weighingStage: 'SHIPPING', status: 'REVIEWED', deletedAt: null,
      netWeight: new Prisma.Decimal(100), grossWeight: new Prisma.Decimal(120), tareWeight: new Prisma.Decimal(20), updatedAt: new Date('2026-10-31') };
    const receiving = { ...shipping, id: 'receiving', ticketNo: '客户收货', weighingStage: 'RECEIVING', netWeight: new Prisma.Decimal(98) };
    row = { id: 'line', materialId: 'material', materialName: '萤石精粉', unit: 'TON', settlementLines: [],
      dispatchNoticeLineItem: { orderLineItem: { contractLineItemId: 'contract-line' } },
      waybill: { id: 'waybill', waybillNo: 'YD-1', plateNo: '甘A12345', lineItems: [{ id: 'line' }],
        dispatchNotice: { mode: 'STANDARD', order: { id: 'order', orderNo: 'PC-1', name: '第一批', status: 'COMPLETED' } },
        weighTickets: [shipping, receiving], weightSelections: [
          { id: 'inventory-selection', purpose: 'INVENTORY', weighTicketId: 'shipping', weighTicket: shipping },
          { id: 'shipping-selection', purpose: 'SHIPPING', weighTicketId: 'shipping', weighTicket: shipping },
          { id: 'receiving-selection', purpose: 'RECEIVING', weighTicketId: 'receiving', weighTicket: receiving },
        ],
        outboundReceipts: [{ id: 'outbound', receiptNo: 'CK-1', status: 'POSTED', outboundQuantity: new Prisma.Decimal(100), weighTicket: shipping }],
        qualityTask: { id: 'task', status: 'COMPLETED', decisionVersion: 1, basisInspection: report, reports: [report], reportLinks: [] },
        salesCompletionConfirmedAt: new Date('2026-10-31'), salesCompletionReportId: 'customer-report',
        salesCompletionCustomerTicketId: 'receiving', salesCompletionShippingTicketId: 'shipping',
        salesCompletionCustomerWeight: new Prisma.Decimal(98), salesCompletionShippingWeight: new Prisma.Decimal(100),
        salesCompletionWeightVariance: new Prisma.Decimal(-2),
      } };
    prisma.waybillLineItem.findMany.mockResolvedValue([row]);
  });

  it('按客户收货磅单与最终报告折干形成应收，不改写我方出库数量', async () => {
    const source = (await basis.sources('contract', 'user'))[0];
    expect(source).toMatchObject({ available: true, totalQuantity: 88.2, remainingQuantity: 88.2,
      negotiableQuantity: 90, negotiableRemainingQuantity: 90,
      inventoryNetWeight: 100, customerNetWeight: 98, weightVariance: -2, unitPrice: 2000, totalAmount: 176400 });
    expect(row.waybill.outboundReceipts[0].outboundQuantity.toNumber()).toBe(100);
  });
  it('销售协商范围也采用我方发货报告水分，不只套用客户水分', async () => {
    row.waybill.qualityTask.reportLinks = [{ inspection: { id: 'our-report', status: 'CONFIRMED', evidenceStage: 'SHIPPING', conclusion: 'PASS',
      indicators: [{ code: 'MOISTURE', measuredValue: new Prisma.Decimal(5) }] } }];
    expect((await basis.sources('contract', 'user'))[0]).toMatchObject({ totalQuantity: 88.2, measuredMoisturePct: 10, negotiableRemainingQuantity: 95 });
    expect(row.waybill.outboundReceipts[0].outboundQuantity.toNumber()).toBe(100);
  });

  it('销售分档合同以选定客户磅单净重折干，不沿用物料的实物计价配置', async () => {
    prisma.material.findMany.mockResolvedValue([{ id: 'material', pricingQuantityBasis: 'PHYSICAL' }] as any);
    prisma.contract.findFirst.mockResolvedValue({ id: 'contract', type: 'SALES', pricingType: 'GRADE_TIER', lineItems: [{
      id: 'contract-line', unitPrice: new Prisma.Decimal(700), taxRatePct: new Prisma.Decimal(13),
      priceRulesSnapshot: { version: 1, method: 'CAF2_GRADE_TIER', gradeUnit: 'PERCENT_POINTS', rateUnit: 'CNY_PER_DEGREE_EX_TAX',
        quantityBasis: 'DRY_MATTER', moistureMaxPct: 5, bands: DEFAULT_FLUORITE_ORE_BANDS,
        exceptionHandling: 'MANUAL_REVIEW', selectedSpec: 'FRAGMENT', formulaConfirmed: true },
    }] } as any);
    row.waybill.qualityTask.basisInspection.indicators = [
      { code: 'CAF2', measuredValue: new Prisma.Decimal(32.5), unit: '%' },
      { code: 'MOISTURE', measuredValue: new Prisma.Decimal(3.2), unit: '%' },
    ];
    const source = (await basis.sources('contract', 'user'))[0];
    expect(source).toMatchObject({ available: true, pricingQuantityBasis: 'DRY_MATTER', netWeight: 98,
      dryQuantity: 94.864, totalQuantity: 94.864, contractTaxRatePct: 13,
      gradePrice: { status: 'READY', gradePct: 32.5, rate: 22.7, unitPrice: 737.75 } });
    expect(source.availableQualityReports).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'customer-report', measuredGradePct: 32.5, measuredMoisturePct: 3.2 }),
    ]));
    expect(row.waybill.outboundReceipts[0].outboundQuantity.toNumber()).toBe(100);
  });

  describe('双边合同销售方向回收率扣价', () => {
    const rules = (recoveryAdjustment: object) => ({ version: 1, method: 'CAF2_GRADE_TIER', gradeUnit: 'PERCENT_POINTS', rateUnit: 'CNY_PER_DEGREE_EX_TAX',
      quantityBasis: 'PHYSICAL', moistureMaxPct: 5, bands: DEFAULT_FLUORITE_ORE_BANDS,
      exceptionHandling: 'MANUAL_REVIEW', selectedSpec: 'FRAGMENT', formulaConfirmed: true, recoveryAdjustment });
    beforeEach(() => {
      prisma.contract.findFirst.mockResolvedValue({ id: 'contract', type: 'BILATERAL', pricingType: 'GRADE_TIER', lineItems: [{
        id: 'contract-line', unitPrice: new Prisma.Decimal(700), salesUnitPrice: new Prisma.Decimal(900), taxRatePct: new Prisma.Decimal(13),
        // 采购方向条款故意与销售方向不同，确保销售结算不会误用。
        priceRulesSnapshot: rules({ baselinePct: 90, deductionPerPointPerDegree: 1, stepMode: 'PROPORTIONAL' }),
        salesPriceRulesSnapshot: rules({ baselinePct: 86, deductionPerPointPerDegree: 0.4, stepMode: 'PROPORTIONAL' }),
      }] } as any);
      row.waybill.qualityTask.basisInspection.indicators = [
        { code: 'CAF2', measuredValue: new Prisma.Decimal(37), unit: '%', result: 'PASS' },
        { code: 'MOISTURE', measuredValue: new Prisma.Decimal(3), unit: '%', result: 'PASS' },
        { code: 'RECOVERY', name: '选矿回收率', measuredValue: new Prisma.Decimal(84.5), unit: '%', result: 'PASS' },
      ];
    });

    it('按销售方向条款计算扣价，不误用采购方向条款', async () => {
      const source = (await basis.sources('contract', 'user'))[0];
      expect(source).toMatchObject({ available: true, totalQuantity: 98, unitPrice: 858.4, recoveryDeductionPerTon: 22.2,
        gradePrice: { status: 'READY', gradePct: 37, recoveryPct: 84.5, recovery: { baselinePct: 86, shortfallPoints: 1.5, deductionPerTon: 22.2 } } });
    });

    it('仅回收率未达标且已按合同扣价时不重复拦截，其他指标不合格仍拦截', async () => {
      const report = row.waybill.qualityTask.basisInspection;
      report.conclusion = 'DEDUCTION';
      report.indicators[2].result = 'FAIL';
      Object.assign(row.waybill.qualityTask, { qualityDisposition: 'REVIEW_REQUIRED', contractQualitySnapshot: null, basisInspectionId: 'customer-report' });
      expect((await basis.sources('contract', 'user'))[0].available).toBe(true);

      report.indicators[0].result = 'FAIL';
      const blocked = (await basis.sources('contract', 'user'))[0];
      expect(blocked.available).toBe(false);
      expect(blocked.reasons.join('；')).toContain('所选检测报告未形成合格结论');
    });
  });

  it('同一侧追加第二张待复核磅单后，禁止静默编制销售结算', async () => {
    row.waybill.weighTickets.push({ id: 'receiving-2', ticketNo: '收货复磅', weighingStage: 'RECEIVING', status: 'PENDING', deletedAt: null });
    row.waybill.weightSelections = row.waybill.weightSelections.filter((selection: any) => selection.purpose !== 'RECEIVING');
    const source = (await basis.sources('contract', 'user'))[0];
    expect(source.available).toBe(false);
    expect(source.reasons.join('；')).toContain('收货侧有多张磅单，请先确认采信磅单');
  });

  it('未完成客户交付不能按执行计划量直接形成最终应收', async () => {
    row.waybill.salesCompletionConfirmedAt = null;
    const source = (await basis.sources('contract', 'user'))[0];
    expect(source.available).toBe(false);
    expect(source.reasons.join('；')).toContain('销售交付完成');
  });
  it('销售运单已创建结算草稿，即使仍有数量也不能重复结算', async () => {
    row.settlementLines = [{ quantity: new Prisma.Decimal(20) }];
    prisma.financialSettlement.findMany.mockResolvedValue([{ id: 'draft', settlementNo: 'YS-1', status: 'DRAFT', lines: [{ waybillLineItemId: 'line' }] }] as any);
    const source = (await basis.sources('contract', 'user'))[0];
    expect(source).toMatchObject({ available: false, settlementOccupied: true, remainingQuantity: 68.2, occupiedSettlements: [{ id: 'draft', settlementNo: 'YS-1', status: 'DRAFT' }] });
    expect(source.reasons.join('；')).toContain('不可重复选择');
  });
  it('销售编辑原草稿不把自身算成占用，已作废或删除记录不占用', async () => {
    const [source] = await basis.sources('contract', 'user', 'settlement.view', 'editing-draft');
    expect(source).toMatchObject({ available: true, settlementOccupied: false });
    expect(prisma.financialSettlement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ direction: 'RECEIVABLE', deletedAt: null, status: { not: 'VOIDED' }, id: { not: 'editing-draft' } }) }));
  });
});
