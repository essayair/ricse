import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FinancialSettlementService } from './financial-settlement.service';
import { PurchaseSettlementBasis } from './purchase-settlement-basis';
import { SalesSettlementBasis } from './sales-settlement-basis';

describe('FinancialSettlementService payment approvals', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = mockDeep<AccessControlService>();
  const service = new FinancialSettlementService(prisma, accessControl);

  beforeEach(() => {
    jest.clearAllMocks();
    accessControl.assertPermission.mockResolvedValue({ isAdmin: false } as any);
    accessControl.getContractScope.mockResolvedValue({} as any);
    accessControl.getPaymentRequestScope.mockResolvedValue({} as any);
    prisma.$transaction.mockImplementation(async (handler: any) => handler(prisma));
  });

  it('读取结算详情时按默认账户和创建时间依次选择银行账户', async () => {
    prisma.financialSettlement.findFirst.mockResolvedValue({ id: 'settlement-1' } as any);

    await service.findOne('settlement-1', 'user-1');

    expect(prisma.financialSettlement.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        legalEntity: {
          select: expect.objectContaining({
            bankAccounts: expect.objectContaining({
              orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            }),
          }),
        },
      }),
    }));
  });

  it('合同结算记录按合同精确筛选且保留事业部数据权限，草稿与作废不计入汇总', async () => {
    const scope = { businessUnitId: { in: ['unit-1'] } };
    accessControl.getContractScope.mockResolvedValue(scope as any);
    prisma.financialSettlement.findMany.mockResolvedValue([
      { id: 'confirmed', status: 'CONFIRMED', totalAmount: 100, settledAmount: 20 },
      { id: 'draft', status: 'DRAFT', totalAmount: 900, settledAmount: 0 },
      { id: 'void', status: 'VOIDED', totalAmount: 800, settledAmount: 0 },
    ] as any);
    const result = await service.findAll({ contractId: 'contract-1' }, 'user-1');
    expect(prisma.financialSettlement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      deletedAt: null, contractId: 'contract-1', contract: scope,
    } }));
    expect(result.items).toHaveLength(3);
    expect(result.summary).toMatchObject({ total: 100, settled: 20, outstanding: 80 });
  });

  it('无结算查看权限时不能通过合同筛选读取结算记录', async () => {
    accessControl.assertPermission.mockRejectedValueOnce(new Error('缺少权限：settlement.view'));
    await expect(service.findAll({ contractId: 'contract-1' }, 'user-1')).rejects.toThrow('settlement.view');
    expect(prisma.financialSettlement.findMany).not.toHaveBeenCalled();
  });

  describe('付款申请关联合同的实时余额', () => {
    const contract = () => ({ id: 'contract', type: 'PURCHASE', totalAmount: '100', sellerId: 'supplier', buyerId: 'our', signingPartnerId: 'our',
      seller: { id: 'supplier', name: '供应商' }, buyer: { id: 'our', name: '我方' }, signingPartner: { id: 'our', name: '我方' }, businessUnit: { id: 'unit', name: '事业部' },
      lineItems: [{ quantity: '1', unit: 'TON', totalPrice: '100' }], financialSettlements: [] as any[], fundTransactions: [] as any[], paymentRequests: [] as any[] });
    const fund = (amount: string, refundedAmount = '0') => ({ amount, refundedAmount, allocatedAmount: '0', paymentStage: 'SETTLEMENT', direction: 'PAYMENT', status: 'CONFIRMED' });

    it('全额付款后无可申请余额；有效退款后实时恢复余额', async () => {
      const c = contract(); c.fundTransactions = [fund('100')];
      prisma.contract.findMany.mockResolvedValue([c] as any);
      expect((await service.contractOptions('PAYABLE', 'user'))[0].remainingPaymentAmount).toBe(0);
      c.fundTransactions[0].refundedAmount = '20';
      expect((await service.contractOptions('PAYABLE', 'user'))[0].remainingPaymentAmount).toBe(20);
    });
    it('全额申请占用后不允许重复申请，驳回、退回草稿或作废后恢复未付额度', async () => {
      const c = contract(); c.fundTransactions = [fund('30')];
      const request = { amount: '100', status: 'PARTIALLY_PAID', fundTransactions: [{ amount: '30', status: 'CONFIRMED' }] };
      c.paymentRequests = [request]; prisma.contract.findMany.mockResolvedValue([c] as any);
      expect((await service.contractOptions('PAYABLE', 'user'))[0].remainingPaymentAmount).toBe(0);
      for (const status of ['REJECTED', 'DRAFT', 'VOIDED']) {
        request.status = status;
        expect((await service.contractOptions('PAYABLE', 'user'))[0].remainingPaymentAmount).toBe(70);
      }
    });
    it('最终结算扣价后按确认货款判断付清，最终结算作废后不继续采用旧上限', async () => {
      const c = contract(); c.fundTransactions = [fund('90')];
      c.financialSettlements = [{ totalAmount: '90', status: 'SETTLED', settlementScope: 'GOODS', lines: [{ sourceSnapshot: { settlementQuantityReview: { finalSettlement: true } } }] }];
      prisma.contract.findMany.mockResolvedValue([c] as any);
      expect((await service.contractOptions('PAYABLE', 'user'))[0]).toMatchObject({ paymentLimit: 90, paymentLimitFinal: true, remainingPaymentAmount: 0 });
      c.financialSettlements = [];
      expect((await service.contractOptions('PAYABLE', 'user'))[0]).toMatchObject({ paymentLimit: 100, paymentLimitFinal: false, remainingPaymentAmount: 10 });
    });
  });

  it('结算审批中或驳回后不能打印正式结算单', async () => {
    prisma.financialSettlement.findFirst.mockResolvedValue({ id: 'settlement-1', status: 'PENDING_APPROVAL' } as any);
    await expect(service.recordPrint('settlement-1', 'user-1')).rejects.toThrow('只有已确认的有效结算单');
    prisma.financialSettlement.findFirst.mockResolvedValue({ id: 'settlement-1', status: 'REJECTED' } as any);
    await expect(service.recordPrint('settlement-1', 'user-1')).rejects.toThrow('只有已确认的有效结算单');
  });

  it('新采购最终结算不能绕过入库过账改用计划批次数量，提前付款走申请', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', status: 'EXECUTING', signingPartnerId: 'owner', businessUnitId: 'unit', sellerId: 'seller', buyerId: 'owner' } as any);
    await expect(service.create({ contractId: 'c', direction: 'PAYABLE', settlementScope: 'BATCH' }, 'u')).rejects.toThrow('按批次提前付款');
  });

  it.each(['PAYABLE', 'RECEIVABLE'] as const)('%s 绕过页面直接请求也不能重复创建已占用运单的结算单', async direction => {
    const prototype = direction === 'PAYABLE' ? PurchaseSettlementBasis.prototype : SalesSettlementBasis.prototype;
    const spy = jest.spyOn(prototype, 'sources').mockResolvedValue([{
      id: 'line', orderId: 'order', waybillNo: 'WB-1', available: false, settlementOccupied: true,
      remainingQuantity: 50, reasons: ['该运单已创建结算单（含草稿），不可重复选择'],
    }] as any);
    try {
      const method = direction === 'PAYABLE' ? 'createGoodsSettlement' : 'createSalesGoodsSettlement';
      const dto = { direction, contractId: 'contract', settlementScope: 'GOODS', lines: [{ orderId: 'order', waybillLineItemId: 'line', quantity: 50 }] };
      for (const preview of [true, false]) {
        await expect((service as any)[method](dto, { id: 'contract', pricingType: 'FIXED' }, 'counterparty', 'user', preview)).rejects.toThrow('不可重复选择');
      }
      expect(prisma.financialSettlement.create).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });

  it('品位分档采购结算要求明确填写税率，不使用合同预计单价', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', pricingType: 'GRADE_TIER', status: 'EXECUTING', signingPartnerId: 'owner', businessUnitId: 'unit', sellerId: 'seller' } as any);
    await expect(service.previewGoodsSettlement({ contractId: 'c', direction: 'PAYABLE', settlementScope: 'GOODS', lines: [{ orderId: 'o', waybillLineItemId: 'w' }] }, 'u'))
      .rejects.toThrow('填写并确认本次结算适用税率');
  });

  it('预览改用发货磅单只传入本单选择，不写回运单；未说明原因时阻止结算', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', pricingType: 'FIXED', status: 'EXECUTING', signingPartnerId: 'owner', businessUnitId: 'unit', sellerId: 'seller' } as any);
    const sources = jest.spyOn(PurchaseSettlementBasis.prototype, 'sources').mockResolvedValue([{
      id: 'w', orderId: 'o', available: true, remainingQuantity: 10, negotiableRemainingQuantity: 10,
      unitPrice: 100, deductionPerTon: 0, waybillNo: 'WB-1', orderNo: 'O-1', orderName: '批次', unit: 'TON',
      contractLineItemId: 'line-1', settlementWeightSource: 'SELECTED_OTHER_SIDE', weighTicketId: 'shipping-ticket', reasons: [],
    }] as any);
    prisma.contractLineItem.findMany.mockResolvedValue([{ id: 'line-1', quantity: 100, materialName: '萤石精粉' }] as any);
    prisma.financialSettlementLine.findMany.mockResolvedValue([]);
    const line = { orderId: 'o', waybillLineItemId: 'w', weighTicketId: 'shipping-ticket', quantity: 10 };
    await expect(service.previewGoodsSettlement({ contractId: 'c', direction: 'PAYABLE', settlementScope: 'GOODS', lines: [line] }, 'u')).rejects.toThrow('须填写依据说明');
    await service.previewGoodsSettlement({ contractId: 'c', direction: 'PAYABLE', settlementScope: 'GOODS', lines: [{ ...line, remarks: '双方确认供应商发货磅单' }] }, 'u');
    expect(sources).toHaveBeenCalledWith('c', 'u', 'settlement.create', undefined, expect.any(Map), new Map([['w', 'shipping-ticket']]));
    expect(prisma.waybillWeightSelection.update).not.toHaveBeenCalled();
    sources.mockRestore();
  });

  it('多车合计超出合同数量时仍可试算，填写原因并确认当前差异后允许保存', async () => {
    const sources = jest.spyOn(PurchaseSettlementBasis.prototype, 'sources').mockResolvedValue(['w1', 'w2'].map(id => ({
      id, orderId: 'o', available: true, remainingQuantity: 60, negotiableRemainingQuantity: 60,
      unitPrice: 100, deductionPerTon: 0, waybillNo: id, orderNo: 'O-1', orderName: '批次', unit: 'TON',
      contractLineItemId: 'line-1', reasons: [],
    })) as any);
    prisma.contractLineItem.findMany.mockResolvedValue([{ id: 'line-1', quantity: 100, materialName: '萤石精粉' }] as any);
    prisma.financialSettlementLine.findMany.mockResolvedValue([]);
    const contract = { id: 'c', pricingType: 'FIXED', overfillPct: 0, signingPartnerId: 'owner', businessUnitId: 'unit' };
    const dto = { contractId: 'c', direction: 'PAYABLE', settlementScope: 'GOODS', lines: ['w1', 'w2'].map(waybillLineItemId => ({ orderId: 'o', waybillLineItemId, quantity: 60 })) };
    const preview = await (service as any).createGoodsSettlement(dto, contract, 'seller', 'u', true);
    expect(preview.totalAmount).toBe(12000);
    expect(preview.quantityReview.differences).toEqual([expect.objectContaining({ type: 'OVER', upperQuantity: 100, difference: 20 })]);
    await expect((service as any).createGoodsSettlement(dto, contract, 'seller', 'u', false)).rejects.toThrow('填写数量差异说明');
    const accepted = { ...dto, quantityVarianceReason: '双方确认按实际发货数量结算', quantityVarianceConfirmed: true, quantityVarianceKey: preview.quantityReview.key };
    await expect((service as any).createGoodsSettlement({ ...accepted, quantityVarianceKey: 'old' }, contract, 'seller', 'u', false)).rejects.toThrow('重新预览并确认');
    const numbering = jest.spyOn(service as any, 'nextNo').mockResolvedValue('YF-TEST');
    prisma.financialSettlement.create.mockResolvedValue({ id: 'saved' } as any);
    await (service as any).createGoodsSettlement(accepted, contract, 'seller', 'u', false);
    expect(prisma.financialSettlement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lines: { create: expect.arrayContaining([
      expect.objectContaining({ sourceSnapshot: expect.objectContaining({ settlementQuantityReview: expect.objectContaining({ confirmed: true, reason: accepted.quantityVarianceReason, recordedBy: 'u' }) }) }),
    ]) } }) }));
    numbering.mockRestore();
    sources.mockRestore();
  });

  it('销售多车合计超限也要求填写原因并确认，而非强制修改合同', async () => {
    const sources = jest.spyOn(SalesSettlementBasis.prototype, 'sources').mockResolvedValue(['w1', 'w2'].map(id => ({
      id, orderId: 'o', available: true, remainingQuantity: 60, negotiableRemainingQuantity: 60,
      unitPrice: 100, waybillNo: id, orderNo: 'O-1', orderName: '批次', unit: 'TON',
      contractLineItemId: 'line-1', reasons: [],
    })) as any);
    prisma.contractLineItem.findMany.mockResolvedValue([{ id: 'line-1', quantity: 100, materialName: '萤石精粉' }] as any);
    prisma.financialSettlementLine.findMany.mockResolvedValue([]);
    const contract = { id: 'c', pricingType: 'FIXED', overfillPct: 0, signingPartnerId: 'owner', businessUnitId: 'unit' };
    const dto = { contractId: 'c', direction: 'RECEIVABLE', settlementScope: 'GOODS', lines: ['w1', 'w2'].map(waybillLineItemId => ({ orderId: 'o', waybillLineItemId, quantity: 60 })) };
    const preview = await (service as any).createSalesGoodsSettlement(dto, contract, 'buyer', 'u', true);
    expect(preview.totalAmount).toBe(12000);
    expect(preview.quantityReview.differences).toEqual([expect.objectContaining({ type: 'OVER', upperQuantity: 100, difference: 20 })]);
    await expect((service as any).createSalesGoodsSettlement(dto, contract, 'buyer', 'u', false)).rejects.toThrow('填写数量差异说明');
    sources.mockRestore();
  });

  it('仅溢短装数量确认不触发线上审批', () => {
    expect((service as any).settlementRequiresApproval({ adjustmentAmount: 0, lines: [{ adjustmentAmount: 0,
      sourceSnapshot: { settlementQuantityReview: { confirmed: true, reason: '线下盖章确认', differences: [{ type: 'OVER' }] } } }] })).toBe(false);
  });

  it.each(['PAYABLE', 'RECEIVABLE'] as const)('%s 预览与创建采用最终干基重算值，原车明细不被改写', async direction => {
    const prototype = direction === 'PAYABLE' ? PurchaseSettlementBasis.prototype : SalesSettlementBasis.prototype;
    const spy = jest.spyOn(prototype, 'sources').mockResolvedValue([{
      id: 'w', orderId: 'o', waybillNo: 'WB-1', orderNo: 'PC-1', unit: 'TON', available: true, remainingQuantity: 100, negotiableRemainingQuantity: 102,
      unitPrice: 2000, deductionPerTon: 0, pricingQuantityBasis: 'DRY_MATTER', contractLineItemId: 'cl', signature: 'original',
    }] as any);
    try {
      prisma.contractLineItem.findMany.mockResolvedValue([{ id: 'cl', quantity: 100 }] as any);
      prisma.financialSettlementLine.findMany.mockResolvedValue([]);
      prisma.financialSettlement.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue({ name: '经办人' } as any);
      const method = direction === 'PAYABLE' ? 'createGoodsSettlement' : 'createSalesGoodsSettlement';
      const dto = { contractId: 'c', direction, settlementScope: 'GOODS', lines: [{ orderId: 'o', waybillLineItemId: 'w', quantity: 100 }],
        settlementAdjustment: { mode: 'QUANTITY', quantity: 99, reason: '双方确认总干基99吨' } };
      const contract = { id: 'c', signingPartnerId: 'owner', businessUnitId: 'unit', pricingType: 'FIXED', overfillPct: 10, shortfallPct: 10 };
      const preview = await (service as any)[method](dto, contract, 'counterparty', 'u', true);
      expect(preview).toMatchObject({ quantity: 99, totalAmount: 198000, settlementAdjustment: { mode: 'QUANTITY', base: { quantity: 100, totalAmount: 200000 } } });
      expect(preview.lines[0]).toMatchObject({ quantity: 100, totalAmount: 200000 });
      await (service as any)[method](dto, contract, 'counterparty', 'u', false);
      const saved = (prisma.financialSettlement.create.mock.calls[0][0] as any).data;
      expect(saved).toMatchObject({ quantity: 99, totalAmount: 198000 });
      expect(saved.lines.create[0]).toMatchObject({ quantity: 100, totalAmount: 200000, sourceSnapshot: { settlementAdjustment: { mode: 'QUANTITY', final: { quantity: 99, totalAmount: 198000 } } } });
    } finally { spy.mockRestore(); }
  });

  it('逐车单价或整单结算调整沿用签章与现有结算审批，不通过零加减金额绕过', () => {
    expect((service as any).settlementRequiresApproval({ adjustmentAmount: 0, lines: [{ adjustmentAmount: 0, sourceSnapshot: { lineAdjustment: { priceAdjusted: true } } }] })).toBe(true);
    expect((service as any).settlementRequiresApproval({ adjustmentAmount: 0, lines: [{ adjustmentAmount: 0, sourceSnapshot: { settlementAdjustment: { mode: 'QUANTITY' } } }] })).toBe(true);
  });

  it('数量差异确认后合同允许范围发生变化，正式确认前要求重新核对', async () => {
    (service as any).transactional = true;
    prisma.financialSettlement.findFirst.mockResolvedValue({ id: 's', contractId: 'c', direction: 'PAYABLE', status: 'DRAFT', settlementScope: 'GOODS',
      lines: [{ quantity: 120, sourceSnapshot: { contractLineItemId: 'a', settlementQuantityReview: { finalSettlement: false, confirmed: true, reason: '双方同意', differences: [{ type: 'OVER' }] } } }] } as any);
    prisma.contract.findUniqueOrThrow.mockResolvedValue({ overfillPct: 30, shortfallPct: 10 } as any);
    prisma.contractLineItem.findMany.mockResolvedValue([{ id: 'a', quantity: 100, materialName: '萤石' }] as any);
    prisma.financialSettlementLine.findMany.mockResolvedValue([]);
    await expect(service.confirm('s', 'u')).rejects.toThrow('重新核对数量差异');
    expect(prisma.financialSettlement.update).not.toHaveBeenCalled();
  });

  it('结算确认后允许补传线下盖章文件，作废单据仍不允许', async () => {
    (service as any).transactional = true;
    prisma.financialSettlement.findFirst.mockResolvedValue({ id: 's', status: 'CONFIRMED' } as any);
    prisma.attachment.create.mockResolvedValue({ id: 'file' } as any);
    const file = { fileName: 'signed.pdf', originalName: '双方盖章.pdf', mimeType: 'application/pdf', size: 10, category: 'SIGNED_SETTLEMENT_CONFIRMATION' };
    await expect(service.createDocumentAttachment({ financialSettlementId: 's' }, file, 'u')).resolves.toMatchObject({ id: 'file' });
    prisma.financialSettlement.findFirst.mockResolvedValue({ id: 's', status: 'VOIDED' } as any);
    await expect(service.createDocumentAttachment({ financialSettlementId: 's' }, file, 'u')).rejects.toThrow('当前结算单状态不能上传附件');
  });

  it('按实测 37 度、23.20 元/度、10 吨、13% 税率生成含税结算预览', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', pricingType: 'GRADE_TIER', status: 'EXECUTING', signingPartnerId: 'owner', businessUnitId: 'unit', sellerId: 'seller' } as any);
    const sources = jest.spyOn(PurchaseSettlementBasis.prototype, 'sources').mockResolvedValue([{
      id: 'w', orderId: 'o', available: true, remainingQuantity: 10, unitPrice: 858.4, deductionPerTon: 0,
      gradePrice: { status: 'READY', gradePct: 37, moisturePct: 3, band: { lower: 35, upper: 40 }, spec: 'FRAGMENT', rate: 23.2, unitPrice: 858.4, amountExTax: 8584 },
      waybillNo: 'WB-1', orderNo: 'O-1', orderName: '测试批次', unit: 'TON', qualityTaskId: 'q', weightSelectionId: 'ws',
      contractLineItemId: 'line-1', reasons: [],
    }] as any);
    prisma.contractLineItem.findMany.mockResolvedValue([{ id: 'line-1', quantity: 100, materialName: '萤石矿' }] as any);
    prisma.financialSettlementLine.findMany.mockResolvedValue([]);

    const result = await service.previewGoodsSettlement({ contractId: 'c', direction: 'PAYABLE', settlementScope: 'GOODS', taxRatePct: 13, lines: [{ orderId: 'o', waybillLineItemId: 'w', quantity: 10 }] }, 'u');

    expect(result.grossAmount).toBe(9699.92);
    expect(result.lines[0].sourceSnapshot).toMatchObject({ amountExTax: 8584, taxAmount: 1115.92, taxRatePct: 13 });
    sources.mockRestore();
  });

  it('合同约定回收率扣价时，档位原价不变，扣价含税单列并写入结算行可查询事实', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', pricingType: 'GRADE_TIER', status: 'EXECUTING', signingPartnerId: 'owner', businessUnitId: 'unit', sellerId: 'seller', lineItems: [{ taxRatePct: 13 }] } as any);
    const sources = jest.spyOn(PurchaseSettlementBasis.prototype, 'sources').mockResolvedValue([{
      id: 'w', orderId: 'o', available: true, remainingQuantity: 10, unitPrice: 858.4, contractTaxRatePct: 13, deductionPerTon: 0, recoveryDeductionPerTon: 22.2,
      pricingType: 'GRADE_TIER', pricingQuantityBasis: 'DRY_MATTER',
      gradePrice: { status: 'READY', gradePct: 37, moisturePct: 3, recoveryPct: 84.5, band: { lower: 35, upper: 40 }, spec: 'FRAGMENT', rate: 23.2, unitPrice: 858.4,
        recovery: { shortfallPoints: 1.5, deductionPerTon: 22.2 }, netUnitPrice: 836.2 },
      waybillNo: 'WB-1', orderNo: 'O-1', orderName: '批次', unit: 'TON', contractLineItemId: 'line-1', reasons: [],
    }] as any);
    prisma.contractLineItem.findMany.mockResolvedValue([{ id: 'line-1', quantity: 100, materialName: '萤石矿' }] as any);
    prisma.financialSettlementLine.findMany.mockResolvedValue([]);
    const preview = await service.previewGoodsSettlement({ contractId: 'c', direction: 'PAYABLE', settlementScope: 'GOODS', lines: [{ orderId: 'o', waybillLineItemId: 'w', quantity: 10 }] }, 'u');
    // 不含税 8584 − 回收率扣价 222 = 8362；税 1087.06；扣价含税 250.86
    expect(preview).toMatchObject({ qualityDeductionAmount: 250.86, totalAmount: 9449.06 });
    expect(preview.lines[0]).toMatchObject({ unitPrice: 969.992, qualityDeductionAmount: 250.86, pricingMethod: 'GRADE_TIER', measuredGradePct: 37,
      measuredRecoveryPct: 84.5, gradeRateExTax: 23.2, recoveryDeductionPerTonExTax: 22.2, taxRatePct: 13, amountExTax: 8362, taxAmount: 1087.06 });
    sources.mockRestore();
  });

  it('新分档合同结算沿用合同税率，拒绝与合同不一致的手填税率', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', pricingType: 'GRADE_TIER', status: 'EXECUTING', signingPartnerId: 'owner', businessUnitId: 'unit', sellerId: 'seller', lineItems: [{ taxRatePct: 13 }] } as any);
    const sources = jest.spyOn(PurchaseSettlementBasis.prototype, 'sources').mockResolvedValue([{
      id: 'w', orderId: 'o', available: true, remainingQuantity: 10, unitPrice: 858.4, contractTaxRatePct: 13, deductionPerTon: 0,
      gradePrice: { status: 'READY', gradePct: 37, rate: 23.2 }, waybillNo: 'WB-1', orderNo: 'O-1', orderName: '批次', unit: 'TON', contractLineItemId: 'line-1', reasons: [],
    }] as any);
    prisma.contractLineItem.findMany.mockResolvedValue([{ id: 'line-1', quantity: 100, materialName: '萤石矿' }] as any);
    prisma.financialSettlementLine.findMany.mockResolvedValue([]);
    const request = { contractId: 'c', direction: 'PAYABLE' as const, settlementScope: 'GOODS' as const, lines: [{ orderId: 'o', waybillLineItemId: 'w', quantity: 10 }] };
    const preview = await service.previewGoodsSettlement(request, 'u');
    expect(preview.lines[0].sourceSnapshot).toMatchObject({ taxRatePct: 13, taxAmount: 1115.92 });
    await expect(service.previewGoodsSettlement({ ...request, taxRatePct: 9 }, 'u')).rejects.toThrow('与合同约定不一致');
    sources.mockRestore();
  });

  it('协商数量超过所选磅单但未超过双方依据上限时可预览，须填写原因', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', pricingType: 'FIXED', status: 'EXECUTING', signingPartnerId: 'owner', businessUnitId: 'unit', sellerId: 'seller' } as any);
    const sources = jest.spyOn(PurchaseSettlementBasis.prototype, 'sources').mockResolvedValue([{
      id: 'w', orderId: 'o', available: true, remainingQuantity: 100, negotiableRemainingQuantity: 105,
      unitPrice: 100, deductionPerTon: 0, waybillNo: 'WB-1', orderNo: 'O-1', orderName: '批次', unit: 'TON',
      contractLineItemId: 'line-1', reasons: [],
    }] as any);
    prisma.contractLineItem.findMany.mockResolvedValue([{ id: 'line-1', quantity: 200, materialName: '萤石精粉' }] as any);
    prisma.financialSettlementLine.findMany.mockResolvedValue([]);
    const line = { orderId: 'o', waybillLineItemId: 'w', quantity: 103, negotiatedQuantity: true };
    await expect(service.previewGoodsSettlement({ contractId: 'c', direction: 'PAYABLE', settlementScope: 'GOODS', lines: [line] }, 'u')).rejects.toThrow('须填写双方确认的原因');
    const result = await service.previewGoodsSettlement({ contractId: 'c', direction: 'PAYABLE', settlementScope: 'GOODS', lines: [{ ...line, remarks: '双方签章确认' }] }, 'u');
    expect(result.lines[0].sourceSnapshot).toMatchObject({ negotiatedQuantity: true, settlementQuantity: 103 });
    sources.mockRestore();
  });

  it('协商数量结算确认前必须有双方签章确认附件', async () => {
    prisma.financialSettlement.findFirst.mockResolvedValue({
      id: 'settlement-negotiated', contractId: 'c', direction: 'PAYABLE', settlementScope: 'GOODS', status: 'DRAFT',
      lines: [{ sourceSnapshot: { negotiatedQuantity: true } }], attachments: [],
    } as any);
    await expect(service.confirm('settlement-negotiated', 'u')).rejects.toThrow('双方签章的结算确认单');
    expect(prisma.financialSettlement.update).not.toHaveBeenCalled();
  });

  it('实际货物结算存在人工加减金额时确认前须上传双方签章凭证', async () => {
    prisma.financialSettlement.findFirst.mockResolvedValue({
      id: 'settlement-adjusted', contractId: 'c', direction: 'RECEIVABLE', settlementScope: 'GOODS', status: 'DRAFT',
      lines: [{ sourceSnapshot: {}, adjustmentAmount: 100 }], attachments: [],
    } as any);
    await expect(service.confirm('settlement-adjusted', 'u')).rejects.toThrow('双方签章的结算确认单');
  });

  it('协商数量结算提交后进入复用的审批链，不立即形成应付', async () => {
    (service as any).transactional = true;
    prisma.financialSettlement.findFirst.mockResolvedValue({
      id: 'settlement-review', contractId: 'contract-1', direction: 'PAYABLE', settlementScope: 'GOODS', status: 'DRAFT',
      totalAmount: 1000, businessUnitId: 'bu-1', createdBy: 'maker', adjustmentAmount: 0,
      contract: { id: 'contract-1', businessUnitId: 'bu-1', companyId: 'company-1', departmentId: 'department-1' },
      lines: [{ sourceSnapshot: { negotiatedQuantity: true }, adjustmentAmount: 0 }],
      attachments: [{ category: 'SIGNED_SETTLEMENT_CONFIRMATION' }],
    } as any);
    const current = jest.spyOn(PurchaseSettlementBasis.prototype, 'assertCurrent').mockResolvedValue(undefined);
    prisma.approvalFlow.findUnique.mockResolvedValue({
      status: 'ACTIVE', name: '付款审批', amountThreshold: 0,
      nodes: [{ enabled: true, condition: 'ALWAYS', scopeType: 'BUSINESS_UNIT', roleId: 'role-1', nodeName: '运营经理', approvalMode: 'ANY',
        role: { status: 'ACTIVE', code: 'OPERATIONS_MANAGER', name: '运营经理', permissions: [{ permission: { code: 'settlement.approve' } }] } }],
    } as any);
    prisma.userRoleAssignment.findMany.mockResolvedValue([{
      scopeType: 'ALL', scopes: [], user: { id: 'approver', name: '审批人', username: 'approver', companyId: 'company-1',
        employee: { departmentId: 'department-1' }, businessUnits: [{ businessUnitId: 'bu-1' }] },
    }] as any);
    prisma.financialSettlementApproval.aggregate.mockResolvedValue({ _max: { round: null } } as any);
    prisma.financialSettlement.update.mockResolvedValue({ id: 'settlement-review', status: 'PENDING_APPROVAL' } as any);

    const result = await service.confirm('settlement-review', 'maker');
    expect(result.status).toBe('PENDING_APPROVAL');
    expect(prisma.approvalFlow.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { contractType: 'FINANCIAL_SETTLEMENT' } }));
    expect(prisma.financialSettlementApproval.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      assigneeId: 'approver', nodeName: '运营经理', status: 'PENDING',
    })] });
    expect(prisma.financialSettlement.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PENDING_APPROVAL' } }));
    current.mockRestore();
    (service as any).transactional = false;
  });

  it('最后一个结算审批节点通过后才确认结算', async () => {
    (service as any).transactional = true;
    prisma.financialSettlement.findFirst.mockResolvedValue({
      id: 'settlement-review', contractId: 'contract-1', direction: 'PAYABLE', settlementScope: 'GOODS', status: 'PENDING_APPROVAL',
      contract: { id: 'contract-1' }, lines: [], approvalTasks: [],
    } as any);
    const current = jest.spyOn(PurchaseSettlementBasis.prototype, 'assertCurrent').mockResolvedValue(undefined);
    prisma.financialSettlementApproval.findMany.mockResolvedValue([{
      id: 'approval-1', settlementId: 'settlement-review', assigneeId: 'approver', approvalMode: 'ANY', round: 1, step: 1, status: 'PENDING',
    }] as any);
    prisma.financialSettlementApproval.updateMany.mockResolvedValue({ count: 1 });
    prisma.financialSettlementApproval.count.mockResolvedValue(0);
    prisma.financialSettlementApproval.findFirst.mockResolvedValue(null);
    prisma.financialSettlement.findUniqueOrThrow.mockResolvedValue({ id: 'settlement-review', status: 'CONFIRMED' } as any);

    const result = await service.approveSettlement('settlement-review', '同意', 'approver');
    expect(result.status).toBe('CONFIRMED');
    expect(prisma.financialSettlement.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMED', confirmedBy: 'approver' }) }));
    current.mockRestore();
    (service as any).transactional = false;
  });

  it('销售最终货款按交付与所选磅单逐车预览，不直接采用计划批次金额', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'sales-contract', type: 'SALES', pricingType: 'FIXED', status: 'EXECUTING', signingPartnerId: 'owner', businessUnitId: 'unit', buyerId: 'customer' } as any);
    const sources = jest.spyOn(SalesSettlementBasis.prototype, 'sources').mockResolvedValue([{
      id: 'line-1', orderId: 'order-1', available: true, remainingQuantity: 88.2, unitPrice: 2000,
      waybillNo: 'YD-1', orderNo: 'PC-1', orderName: '销售首批', unit: 'TON', contractLineItemId: 'contract-line-1',
      qualityTaskId: 'quality-1', weightSelectionId: 'weight-1', reportId: 'customer-report', defaultReportId: 'customer-report', reasons: [],
    }] as any);
    prisma.contractLineItem.findMany.mockResolvedValue([{ id: 'contract-line-1', quantity: 100, materialName: '萤石精粉' }] as any);
    prisma.financialSettlementLine.findMany.mockResolvedValue([]);

    const result = await service.previewGoodsSettlement({ contractId: 'sales-contract', direction: 'RECEIVABLE', settlementScope: 'GOODS', lines: [{ orderId: 'order-1', waybillLineItemId: 'line-1', quantity: 88.2 }] }, 'u');

    expect(result.totalAmount).toBe(176400);
    expect(result.lines[0]).toMatchObject({ waybillLineItemId: 'line-1', quantity: 88.2, totalAmount: 176400 });
    sources.mockRestore();
  });

  it('销售协商数量不得超过双方采信磅单范围，且必须填写原因', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'sales-contract', type: 'SALES', pricingType: 'FIXED', status: 'EXECUTING', signingPartnerId: 'owner', businessUnitId: 'unit', buyerId: 'customer' } as any);
    const sources = jest.spyOn(SalesSettlementBasis.prototype, 'sources').mockResolvedValue([{
      id: 'line-1', orderId: 'order-1', available: true, remainingQuantity: 88.2, negotiableRemainingQuantity: 90,
      unitPrice: 2000, waybillNo: 'YD-1', orderNo: 'PC-1', orderName: '销售首批', unit: 'TON', contractLineItemId: 'contract-line-1', reasons: [],
    }] as any);
    prisma.contractLineItem.findMany.mockResolvedValue([{ id: 'contract-line-1', quantity: 100, materialName: '萤石精粉' }] as any);
    prisma.financialSettlementLine.findMany.mockResolvedValue([]);
    const line = { orderId: 'order-1', waybillLineItemId: 'line-1', quantity: 89, negotiatedQuantity: true };
    await expect(service.previewGoodsSettlement({ contractId: 'sales-contract', direction: 'RECEIVABLE', settlementScope: 'GOODS', lines: [line] }, 'u')).rejects.toThrow('须填写双方确认的原因');
    const result = await service.previewGoodsSettlement({ contractId: 'sales-contract', direction: 'RECEIVABLE', settlementScope: 'GOODS', lines: [{ ...line, remarks: '双方确认以89吨结算' }] }, 'u');
    expect(result.lines[0].sourceSnapshot).toMatchObject({ negotiatedQuantity: true, settlementQuantity: 89 });
    sources.mockRestore();
  });

  it('管理员读取付款单时不把空合同范围嵌入可空关系过滤', async () => {
    accessControl.assertPermission.mockResolvedValue({ isAdmin: true, permissions: [] } as any);
    accessControl.getContractScope.mockResolvedValue({} as any);
    prisma.fundTransaction.findFirst.mockResolvedValue({ id: 'fund-1', direction: 'PAYMENT' } as any);

    await expect(service.findFund('fund-1', 'admin')).resolves.toMatchObject({ id: 'fund-1' });

    expect(prisma.fundTransaction.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'fund-1' },
    }));
  });

  it('普通用户读取付款单时按合同权限范围过滤', async () => {
    const scope = { businessUnitId: { in: ['business-unit-1'] } };
    accessControl.assertPermission.mockResolvedValue({ isAdmin: false, permissions: ['settlement.view'] } as any);
    accessControl.getContractScope.mockResolvedValue(scope as any);
    prisma.fundTransaction.findFirst.mockResolvedValue({ id: 'fund-1', direction: 'PAYMENT' } as any);

    await service.findFund('fund-1', 'user-1');

    expect(prisma.fundTransaction.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'fund-1',
        OR: expect.arrayContaining([{ contract: { is: scope } }]),
      }),
    }));
  });

  it('执行批次未完成时仍可作为结算候选，但排除已取消批次', async () => {
    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1', status: 'APPROVED', type: 'PURCHASE', sellerId: 'supplier-1', buyerId: 'internal-1',
      signingPartnerId: 'internal-1', lineItems: [],
    } as any);
    prisma.order.findMany.mockResolvedValue([{
      id: 'order-1', orderNo: 'CGDD001', name: '首批预付款', status: 'CONFIRMED',
      totalAmount: 100000, createdAt: new Date(), lineItems: [{ quantity: 100, unit: 'TON' }], settlementLines: [],
    }] as any);

    await expect(service.orderOptions('contract-1', 'PAYABLE', 'user-1')).resolves.toMatchObject([
      { id: 'order-1', status: 'CONFIRMED', quantity: 100, remainingAmount: 100000 },
    ]);
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        contractId: 'contract-1', type: 'PURCHASE',
        status: { in: ['DRAFT', 'CONFIRMED', 'DISPATCHED', 'COMPLETED'] },
      }),
    }));
  });

  it('仅允许打印已审批或已创建付款单的付款申请', async () => {
    prisma.paymentRequest.findFirst.mockResolvedValue({ id: 'request-1', status: 'APPROVED' } as any);
    await expect(service.recordPaymentRequestPrint('request-1', 'user-1')).resolves.toMatchObject({ id: 'request-1' });

    prisma.paymentRequest.findFirst.mockResolvedValue({ id: 'request-2', status: 'PENDING_APPROVAL' } as any);
    await expect(service.recordPaymentRequestPrint('request-2', 'user-1')).rejects.toThrow('付款申请审批完成后才能打印存档');
  });

  it('最后一个付款审批节点通过后才将申请置为已批准', async () => {
    prisma.paymentRequest.findFirst.mockResolvedValue({
      id: 'request-1', contractId: 'contract-1', status: 'PENDING_APPROVAL', approvals: [],
    } as any);
    prisma.paymentRequestApproval.findMany.mockResolvedValue([{
      id: 'task-1', paymentRequestId: 'request-1', assigneeId: 'user-1',
      approvalMode: 'ANY', round: 1, step: 2, status: 'PENDING',
    }] as any);
    prisma.paymentRequestApproval.updateMany.mockResolvedValue({ count: 1 });
    prisma.paymentRequestApproval.count.mockResolvedValue(0);
    prisma.paymentRequestApproval.findFirst.mockResolvedValue(null);
    prisma.paymentRequest.update.mockResolvedValue({ id: 'request-1', status: 'APPROVED' } as any);
    prisma.paymentRequest.findUnique.mockResolvedValue({ id: 'request-1', status: 'APPROVED' } as any);

    await service.approvePaymentRequest('request-1', { comment: '同意付款' }, 'user-1');

    expect(prisma.paymentRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: expect.objectContaining({ status: 'APPROVED', approvedBy: 'user-1' }),
    });
  });

  it('当前节点通过后存在后续节点时只激活下一级', async () => {
    prisma.paymentRequest.findFirst.mockResolvedValue({ id: 'request-1', contractId: 'contract-1', status: 'PENDING_APPROVAL' } as any);
    prisma.paymentRequestApproval.findMany.mockResolvedValue([{
      id: 'task-1', paymentRequestId: 'request-1', assigneeId: 'user-1',
      approvalMode: 'ANY', round: 1, step: 1, status: 'PENDING',
    }] as any);
    prisma.paymentRequestApproval.updateMany.mockResolvedValue({ count: 1 });
    prisma.paymentRequestApproval.count.mockResolvedValue(0);
    prisma.paymentRequestApproval.findFirst.mockResolvedValue({ id: 'task-2', round: 1, step: 2, status: 'WAITING' } as any);
    prisma.paymentRequest.findUnique.mockResolvedValue({ id: 'request-1', status: 'PENDING_APPROVAL' } as any);

    await service.approvePaymentRequest('request-1', {}, 'user-1');

    expect(prisma.paymentRequestApproval.updateMany).toHaveBeenCalledWith({
      where: { paymentRequestId: 'request-1', round: 1, step: 2, status: 'WAITING' },
      data: { status: 'PENDING' },
    });
    expect(prisma.paymentRequest.update).not.toHaveBeenCalled();
  });

  it('财务确认资金时按确认权限和对应事业部范围检查，不能直接指定其他事业部ID', async () => {
    const scope = { businessUnitId: { in: ['unit-1'] } };
    accessControl.assertPermission.mockResolvedValue({ isAdmin: false, permissions: ['settlement.fund.confirm'] } as any);
    accessControl.getContractScope.mockResolvedValue(scope as any);
    prisma.fundTransaction.findFirst.mockResolvedValue(null);
    await expect(service.confirmFund('other-unit-fund', 'user-1')).rejects.toThrow('无权访问');
    expect(accessControl.getContractScope).toHaveBeenCalledWith('user-1', 'settlement.fund.confirm');
    expect(prisma.fundTransaction.update).not.toHaveBeenCalled();
  });
});
