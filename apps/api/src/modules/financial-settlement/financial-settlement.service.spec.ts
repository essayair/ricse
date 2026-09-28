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
