import { mockDeep } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { LogisticsPaymentContext } from './logistics-payment-context';
import { signature } from './purchase-settlement-basis';

describe('物流付款依据与额度', () => {
  const prisma = mockDeep<PrismaService>(), access = mockDeep<AccessControlService>();
  const context = new LogisticsPaymentContext(prisma, access);
  const decimal = (v: number) => new Prisma.Decimal(v);
  const settlement = () => ({ id: 'ls1', settlementNo: 'LS001', status: 'REVIEWED', totalAmount: decimal(10000),
    payerPartner: { id: 'own', name: '货主', isInternal: true, status: 'ACTIVE', bankAccounts: [] }, payerCompanyId: 'company',
    preparer: { companyId: 'company', employee: { departmentId: 'dept' } },
    lines: [{ id: 'line1', waybillId: 'wb1', netWeight: decimal(100), unitPrice: decimal(100), amount: decimal(10000),
      waybill: { waybillNo: 'WB001', carrierPartnerId: 'carrier', carrierPartner: { id: 'carrier', status: 'ACTIVE', bankAccounts: [] }, dispatchNotice: { order: { contract: { businessUnitId: 'bu1', businessUnit: { id: 'bu1', name: '玉门' } } } } } }],
    paymentRequests: [] as any[], paymentAllocations: [] as any[] });
  const request = () => ({ id: 'r1', businessType: 'LOGISTICS', basisType: 'LOGISTICS_SETTLEMENT', logisticsSettlementId: 'ls1',
    businessUnitId: 'bu1', legalEntityPartnerId: 'own', counterpartyId: 'carrier', paymentStage: 'SETTLEMENT', amount: 10000,
    purpose: '运费', conditionText: '结算后支付', fundTransactions: [] as any[] });
  beforeEach(() => { jest.clearAllMocks(); access.getLogisticsPaymentScope.mockResolvedValue({ lines: { every: { waybill: { id: 'wb1' } } } }); prisma.logisticsSettlement.findFirst.mockResolvedValue(settlement() as any); });
  it('使用货主与承运方作为付款双方，不使用采购合同供应商', async () => {
    const result = await context.load('ls1', 'u');
    expect(result.legalEntity.id).toBe('own'); expect(result.counterparty.id).toBe('carrier'); expect(result.businessUnit.id).toBe('bu1');
    expect(prisma.logisticsSettlement.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: [expect.objectContaining({ lines: expect.anything() })] }) }));
  });

  it('历史物流申请原主体、数量、金额均不变时兼容旧签名，不强制重新审批', async () => {
    const e = (await context.load('ls1', 'u')).evidence;
    const legacy = { logisticsSettlementId: e.logisticsSettlementId, settlementNo: e.settlementNo, totalAmount: e.totalAmount, payerPartnerId: e.payerPartnerId, carrierPartnerId: e.carrierPartnerId, businessUnitId: e.businessUnitId,
      lines: e.lines.map(l => ({ id: l.id, waybillId: l.waybillId, waybillNo: l.waybillNo, netWeight: l.netWeight, unitPrice: l.unitPrice, amount: l.amount })) };
    await expect(context.validate({ ...request(), evidenceSnapshot: { signature: signature(legacy) } }, 'u', 'settlement.payment.execute')).resolves.toBeDefined();
  });
  it('已登记款项与申请剩余额度不重复累计，草稿不占用额度', async () => {
    const s = settlement();
    s.paymentRequests = [{ id: 'other', status: 'PARTIALLY_PAID', amount: decimal(6000), fundTransactions: [{ status: 'CONFIRMED', amount: decimal(2000) }] }, { id: 'draft', status: 'DRAFT', amount: decimal(10000), fundTransactions: [] }];
    prisma.logisticsSettlement.findFirst.mockResolvedValue(s as any);
    const result = await context.load('ls1', 'u');
    expect(result.paidAmount).toBe(2000); expect(result.reservedAmount).toBe(4000); expect(result.availableAmount).toBe(4000);
    await expect(context.validate({ ...request(), amount: 4001 }, 'u', 'settlement.payment.apply')).rejects.toThrow('可申请余额');
  });
  it('部分付款后继续执行，仅校验申请尚未登记的余额', async () => {
    const s = settlement(); s.paymentRequests = [{ id: 'r1', status: 'PARTIALLY_PAID', amount: decimal(10000), fundTransactions: [{ status: 'CONFIRMED', amount: decimal(6000) }] }];
    prisma.logisticsSettlement.findFirst.mockResolvedValue(s as any);
    await expect(context.validate({ ...request(), fundTransactions: [{ amount: 6000, status: 'CONFIRMED' }] }, 'u', 'settlement.payment.execute')).resolves.toHaveProperty('availableAmount', 4000);
  });
  it('拒绝未复核、已作废与跨承运方混合结算', async () => {
    const s = settlement(); s.status = 'DRAFT'; prisma.logisticsSettlement.findFirst.mockResolvedValue(s as any);
    await expect(context.load('ls1', 'u')).rejects.toThrow('已复核');
    s.status = 'REVIEWED'; s.lines.push({ ...s.lines[0], waybill: { ...s.lines[0].waybill, carrierPartnerId: 'other' } });
    await expect(context.load('ls1', 'u')).rejects.toThrow('按承运方拆分');
  });
  it('拒绝混合事业部，避免审批范围被扩大', async () => {
    const s = settlement(); s.lines.push({ ...s.lines[0], waybill: { ...s.lines[0].waybill, dispatchNotice: { order: { contract: { businessUnitId: 'bu2', businessUnit: { id: 'bu2', name: '龙游' } } } } } });
    prisma.logisticsSettlement.findFirst.mockResolvedValue(s as any);
    await expect(context.load('ls1', 'u')).rejects.toThrow('按事业部拆分');
  });
  it('结算依据修改后要求重新确认，不沿用旧审批快照', async () => {
    await expect(context.validate({ ...request(), evidenceSnapshot: { signature: 'old' } }, 'u', 'settlement.payment.execute')).rejects.toThrow('依据已变更');
  });
  it('不能混用采购合同、货款结算或预付款类型', async () => {
    await expect(context.validate({ ...request(), contractId: 'trade' }, 'u', 'settlement.payment.apply')).rejects.toThrow('只能关联');
    await expect(context.validate({ ...request(), paymentStage: 'ADVANCE' }, 'u', 'settlement.payment.apply')).rejects.toThrow('结算款或尾款');
  });
  it('财务提交见票付款须有附件', async () => {
    await expect(context.validate({ ...request(), conditionTypes: ['INVOICE'] }, 'u', 'settlement.payment.submit', true)).rejects.toThrow('先上传发票');
  });
});
