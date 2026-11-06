import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';
import { AccessControlService } from '../access-control/access-control.service';
import { FinancialSettlementService } from './financial-settlement.service';
import { InvoiceRegisterService } from './invoice-register.service';

describe('InvoiceRegisterService', () => {
  const prisma = mockDeep<PrismaService>();
  const settlements = { findOne: jest.fn() };
  const accessControl = {
    assertPermission: jest.fn(),
    getContractScope: jest.fn().mockResolvedValue({ deletedAt: null }),
    getLogisticsSettlementScope: jest.fn().mockResolvedValue({ logisticsScope: true }),
    getLogisticsPaymentScope: jest.fn().mockResolvedValue({ paymentScope: true }),
  };
  const service = new InvoiceRegisterService(prisma, settlements as unknown as FinancialSettlementService, accessControl as unknown as AccessControlService);
  const freightSettlement = { id: 'ls1', status: 'REVIEWED', totalAmount: 5000, carrierPartnerId: 'carrier', payerPartnerId: 'ours', businessUnitId: 'bu1' };
  const grant = (...codes: string[]) => accessControl.assertPermission.mockImplementation(async (_user: string, code: string) => {
    if (!codes.includes(code)) throw new ForbiddenException(code);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    grant('settlement.view', 'settlement.create', 'settlement.reverse', 'logistics.settlement.view', 'logistics.settlement.manage');
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

  describe('运费发票', () => {
    it('开票方为承运方、收票方为付款主体，固定为进项并挂物流结算单', async () => {
      prisma.logisticsSettlement.findFirst.mockResolvedValue(freightSettlement as any);
      prisma.invoiceRecord.findUnique.mockResolvedValue(null);
      prisma.invoiceRecord.create.mockResolvedValue({ id: 'inv-f' } as any);
      await service.createFreight('ls1', { invoiceNo: '0001', issuedAt: '2026-11-07T00:00:00.000+08:00', materialName: '运输服务*运费', taxRate: 9, taxInclusiveAmount: 5000 }, 'user1');
      expect(prisma.invoiceRecord.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        sourceType: 'FREIGHT', direction: 'INPUT', sellerPartnerId: 'carrier', buyerPartnerId: 'ours', logisticsSettlementId: 'ls1',
      }) });
      expect(prisma.invoiceRecord.create.mock.calls[0][0].data).not.toHaveProperty('settlementId');
    });

    it('物流结算单未复核或缺少承运方时不能登记', async () => {
      prisma.logisticsSettlement.findFirst.mockResolvedValue({ ...freightSettlement, status: 'SUBMITTED' } as any);
      await expect(service.createFreight('ls1', { invoiceNo: '1', issuedAt: '2026-11-07', materialName: '运费', taxInclusiveAmount: 1 }, 'user1')).rejects.toThrow('复核后');
      prisma.logisticsSettlement.findFirst.mockResolvedValue({ ...freightSettlement, carrierPartnerId: null } as any);
      await expect(service.createFreight('ls1', { invoiceNo: '1', issuedAt: '2026-11-07', materialName: '运费', taxInclusiveAmount: 1 }, 'user1')).rejects.toThrow('承运方');
    });

    it('只有资金结算权限的财务人员按付款数据范围处理运费发票', async () => {
      grant('settlement.view', 'settlement.create');
      prisma.logisticsSettlement.findFirst.mockResolvedValue(freightSettlement as any);
      prisma.invoiceRecord.findUnique.mockResolvedValue(null);
      prisma.invoiceRecord.create.mockResolvedValue({ id: 'inv-f' } as any);
      await service.createFreight('ls1', { invoiceNo: '2', issuedAt: '2026-11-07', materialName: '运费', taxInclusiveAmount: 5000 }, 'finance');
      expect(accessControl.getLogisticsSettlementScope).not.toHaveBeenCalled();
      expect(prisma.logisticsSettlement.findFirst).toHaveBeenCalledWith({ where: { AND: [{ id: 'ls1', deletedAt: null }, { OR: [{ paymentScope: true }] }] } });
    });

    it('既无物流结算也无资金结算权限时拒绝', async () => {
      grant();
      await expect(service.listFreight('ls1', 'nobody')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('运费发票只核对金额', async () => {
      prisma.logisticsSettlement.findFirst.mockResolvedValue(freightSettlement as any);
      prisma.invoiceRecord.findMany.mockResolvedValue([{ status: 'ACTIVE', quantity: null, taxInclusiveAmount: 5000, materialName: '运费' }] as any);
      const result = await service.listFreight('ls1', 'user1');
      expect(result.summary).toMatchObject({ direction: 'INPUT', state: 'MATCHED', settlementQuantity: null });
    });
  });

  describe('发票台账', () => {
    it('销项台账只含货款发票，进项台账同时包含运费发票', async () => {
      prisma.invoiceRecord.findMany.mockResolvedValue([]);
      await service.ledger({ direction: 'OUTPUT' }, 'user1');
      const outputWhere = prisma.invoiceRecord.findMany.mock.calls[0][0]!.where as any;
      expect(outputWhere.AND[0]).toEqual({ sourceType: 'GOODS', settlement: { is: { deletedAt: null, contract: { deletedAt: null } } } });
      await service.ledger({ direction: 'INPUT' }, 'user1');
      const inputWhere = prisma.invoiceRecord.findMany.mock.calls[1][0]!.where as any;
      expect(inputWhere.AND[0].OR).toContainEqual({ sourceType: 'FREIGHT', logisticsSettlement: { is: { paymentScope: true } } });
    });

    it('未指定方向时拒绝查询', async () => {
      await expect(service.ledger({}, 'user1')).rejects.toThrow('请指定发票方向');
    });

    it('待到票按结算依据汇总有效发票并给出核对状态', async () => {
      prisma.financialSettlement.findMany.mockResolvedValue([
        { id: 's1', settlementNo: 'YF1', quantity: 10, totalAmount: 1000, confirmedAt: new Date('2026-11-01'), contract: null, counterparty: { id: 'sup', name: '供方' }, legalEntity: { id: 'ours', name: '我方' }, businessUnit: null, invoiceRecords: [] },
        { id: 's2', settlementNo: 'YF2', quantity: 10, totalAmount: 1000, confirmedAt: new Date('2026-11-02'), contract: null, counterparty: { id: 'sup', name: '供方' }, legalEntity: { id: 'ours', name: '我方' }, businessUnit: null, invoiceRecords: [{ quantity: 10, taxInclusiveAmount: 1000 }] },
      ] as any);
      prisma.logisticsSettlement.findMany.mockResolvedValue([{ ...freightSettlement, settlementNo: 'WL1', reviewedAt: new Date('2026-11-03'), invoiceRecords: [{ quantity: null, taxInclusiveAmount: 3000 }] }] as any);
      prisma.partner.findMany.mockResolvedValue([{ id: 'carrier', name: '承运方' }, { id: 'ours', name: '我方' }] as any);
      prisma.businessUnit.findMany.mockResolvedValue([]);
      const rows = await service.pending({ direction: 'INPUT' }, 'user1');
      expect(rows.map(row => [(row.source as any).no, row.state])).toEqual([['WL1', 'PARTIAL'], ['YF2', 'MATCHED'], ['YF1', 'NONE']]);
      expect(rows[0]).toMatchObject({ sourceType: 'FREIGHT', seller: { name: '承运方' }, buyer: { name: '我方' } });
    });
  });
});
