import { mockDeep, mockReset } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { PurchasePaymentContext } from './purchase-payment-context';

const D = (v: number) => new Prisma.Decimal(v);
describe('采购付款上下文与预付款抵扣', () => {
  const prisma = mockDeep<PrismaService>(), access = mockDeep<AccessControlService>();
  const service = new PurchasePaymentContext(prisma, access);
  let settlement: any;
  beforeEach(() => {
    mockReset(prisma); mockReset(access);
    access.assertPermission.mockResolvedValue({ isAdmin: false } as any);
    access.getContractScope.mockResolvedValue({ businessUnitId: 'unit-1' });
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', status: 'EXECUTING', totalAmount: D(200000), prepayPct: D(30), lineItems: [], signingPartnerId: 'our', sellerId: 'seller' } as any);
    settlement = { id: 's', contractId: 'c', settlementNo: 'YF1', totalAmount: D(196000), settledAmount: D(0), status: 'CONFIRMED', lines: [] };
    prisma.financialSettlement.findMany.mockResolvedValue([settlement] as any);
    prisma.financialSettlement.findUnique.mockResolvedValue(settlement);
    prisma.order.findMany.mockResolvedValue([]); prisma.waybillLineItem.findMany.mockResolvedValue([]);
    prisma.paymentRequest.findMany.mockResolvedValue([]); prisma.fundTransaction.findMany.mockResolvedValue([]);
  });
  const request = () => ({ id: 'r', contractId: 'c', businessType: 'PURCHASE', paymentStage: 'FINAL', basisType: 'SETTLEMENT', settlementId: 's', amount: D(136000), conditionText: '按最终结算付尾款', purpose: '采购尾款', fundTransactions: [] });
  const advance = () => ({ id: 'f', amount: D(60000), allocatedAmount: D(0), refundedAmount: D(0), paymentStage: 'ADVANCE', status: 'CONFIRMED', paymentRequest: null, earmarks: [], allocations: [] });

  it('预付款未处理时阻止财务提交；核销后应付196000、未结136000，不重复扣预付', async () => {
    const fund = advance(); prisma.fundTransaction.findMany.mockResolvedValue([fund] as any);
    await expect(service.validate(request(), 'u', 'settlement.payment.submit', true)).rejects.toThrow('尚未处理的已付款资金');
    fund.allocatedAmount = D(60000); settlement.settledAmount = D(60000);
    const ctx = await service.validate(request(), 'u', 'settlement.payment.submit', true);
    expect(ctx?.settlements[0]).toMatchObject({ totalAmount: D(196000), availableAmount: 136000 });
  });
  it('部分付款和审批剩余金额不遗漏也不重复扣减，自身重新校验时只检查未执行部分', async () => {
    settlement.totalAmount = D(100000);
    const fund = { ...advance(), amount: D(30000), paymentStage: 'SETTLEMENT', status: 'PENDING_CONFIRMATION', paymentRequest: { settlementId: 's' } };
    const r = { ...request(), amount: D(100000), status: 'PARTIALLY_PAID', fundTransactions: [fund] };
    prisma.fundTransaction.findMany.mockResolvedValue([fund] as any); prisma.paymentRequest.findMany.mockResolvedValue([r] as any);
    expect((await service.load('c', 'u')).settlements[0].availableAmount).toBe(0);
    await expect(service.validate(r, 'u', 'settlement.payment.execute', true)).resolves.toBeTruthy();
  });
  it('已付预付款可以明确保留给其他批次，不能继续被当作无用途资金反复抵扣', async () => {
    const fund = { ...advance(), earmarks: [{ id: 'mark', orderId: 'other', settlementId: null, amount: D(60000), consumedAmount: D(0) }] };
    prisma.fundTransaction.findMany.mockResolvedValue([fund] as any);
    const ctx = await service.validate(request(), 'u', 'settlement.payment.submit', true);
    expect(ctx?.summary.unassignedFundAmount).toBe(0);
  });
  it('结算款和尾款不能仅通过改阶段名称绕过采购结算依据', async () => {
    await expect(service.validate({ ...request(), settlementId: null }, 'u', 'settlement.payment.apply')).rejects.toThrow('关联已确认的采购结算单');
  });
  it('预付款不依赖质检，但受合同预付比例控制', async () => {
    const r = { ...request(), paymentStage: 'ADVANCE', basisType: 'CONTRACT', settlementId: null, amount: D(60000) };
    await expect(service.validate(r, 'u', 'settlement.payment.apply')).resolves.toBeTruthy();
    await expect(service.validate({ ...r, amount: D(60001) }, 'u', 'settlement.payment.apply')).rejects.toThrow('预付款可申请余额');
  });
});
