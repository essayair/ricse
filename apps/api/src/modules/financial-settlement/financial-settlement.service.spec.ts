import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FinancialSettlementService } from './financial-settlement.service';
import { PurchaseSettlementBasis } from './purchase-settlement-basis';

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

  it('新采购最终结算不能绕过入库过账改用计划批次数量，提前付款走申请', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', status: 'EXECUTING', signingPartnerId: 'owner', businessUnitId: 'unit', sellerId: 'seller', buyerId: 'owner' } as any);
    await expect(service.create({ contractId: 'c', direction: 'PAYABLE', settlementScope: 'BATCH' }, 'u')).rejects.toThrow('按批次提前付款');
  });

  it('品位分档采购结算要求明确填写税率，不使用合同预计单价', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', pricingType: 'GRADE_TIER', status: 'EXECUTING', signingPartnerId: 'owner', businessUnitId: 'unit', sellerId: 'seller' } as any);
    await expect(service.previewGoodsSettlement({ contractId: 'c', direction: 'PAYABLE', settlementScope: 'GOODS', lines: [{ orderId: 'o', waybillLineItemId: 'w' }] }, 'u'))
      .rejects.toThrow('填写并确认本次结算适用税率');
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
