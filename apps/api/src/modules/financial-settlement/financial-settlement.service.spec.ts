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
