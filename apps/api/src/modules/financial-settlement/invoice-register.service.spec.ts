import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { FinancialSettlementService } from './financial-settlement.service';
import { InvoiceRegisterService } from './invoice-register.service';

describe('InvoiceRegisterService', () => {
  const prisma = mockDeep<PrismaService>();
  const settlements = { findOne: jest.fn() };
  const service = new InvoiceRegisterService(prisma, settlements as unknown as FinancialSettlementService);

  beforeEach(() => {
    jest.clearAllMocks();
    settlements.findOne.mockResolvedValue({
      id: 's1', contractId: 'c1', direction: 'PAYABLE', status: 'CONFIRMED', quantity: 10,
      totalAmount: 1000, legalEntityPartnerId: 'ours', counterpartyId: 'supplier',
    });
  });

  it('进项发票按供方开票方和我方购方归属结算单', async () => {
    prisma.invoiceRecord.findUnique.mockResolvedValue(null);
    prisma.invoiceRecord.create.mockResolvedValue({ id: 'inv1' } as any);
    await service.create('s1', { invoiceNo: '12345678', issuedAt: '2026-10-31T00:00:00.000+08:00', materialName: '萤石精粉', quantity: 10, taxInclusiveAmount: 1000 }, 'user1');
    expect(prisma.invoiceRecord.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      direction: 'INPUT', sellerPartnerId: 'supplier', buyerPartnerId: 'ours', settlementId: 's1', quantity: 10,
    }) });
  });

  it('按有效发票累计数量金额提示差异，忽略已作废记录', async () => {
    prisma.invoiceRecord.findMany.mockResolvedValue([
      { status: 'ACTIVE', quantity: 9, taxInclusiveAmount: 900, materialName: '萤石精粉' },
      { status: 'VOIDED', quantity: 1, taxInclusiveAmount: 100, materialName: '萤石精粉' },
    ] as any);
    const result = await service.list('s1', 'user1');
    expect(result.summary.quantityDifference).toBe('-1.000');
    expect(result.summary.amountDifference).toBe('-100.00');
    expect(result.summary.warnings).toHaveLength(2);
  });

  it('已作废发票不物理删除，保留原因、操作人与时间', async () => {
    prisma.invoiceRecord.updateMany.mockResolvedValue({ count: 1 });
    prisma.invoiceRecord.findUniqueOrThrow.mockResolvedValue({ status: 'VOIDED' } as any);
    await service.void('s1', 'invoice-1', '原发票信息录错', 'user1');
    expect(prisma.invoiceRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'invoice-1', settlementId: 's1', status: 'ACTIVE' },
      data: expect.objectContaining({ status: 'VOIDED', voidedBy: 'user1', voidReason: '原发票信息录错' }),
    }));
  });
});
