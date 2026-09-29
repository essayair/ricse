import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FinancialSettlementService } from './financial-settlement.service';

describe('FinancialSettlementService payment approvals', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = mockDeep<AccessControlService>();
  const service = new FinancialSettlementService(prisma, accessControl);

  beforeEach(() => {
    jest.clearAllMocks();
    accessControl.assertPermission.mockResolvedValue({ isAdmin: false } as any);
    accessControl.getContractScope.mockResolvedValue({} as any);
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

  it('执行批次未完成时仍可作为结算候选，但排除已取消批次', async () => {
    prisma.contract.findFirst.mockResolvedValue({
      id: 'contract-1', type: 'PURCHASE', sellerId: 'supplier-1', buyerId: 'internal-1',
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
      id: 'request-1', status: 'PENDING_APPROVAL', approvals: [],
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
    prisma.paymentRequest.findFirst.mockResolvedValue({ id: 'request-1', status: 'PENDING_APPROVAL' } as any);
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
});
