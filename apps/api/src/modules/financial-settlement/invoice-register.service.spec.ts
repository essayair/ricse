import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FinancialSettlementService } from './financial-settlement.service';
import { InvoiceRegisterService } from './invoice-register.service';

describe('InvoiceRegisterService', () => {
  const prisma = mockDeep<PrismaService>();
  const settlements = { findOne: jest.fn() };
  const accessControl = {
    assertPermission: jest.fn(),
    getContractScope: jest.fn(),
    getLogisticsSettlementScope: jest.fn(),
    getLogisticsPaymentScope: jest.fn(),
    getBusinessUnitOptions: jest.fn(),
  };
  const service = new InvoiceRegisterService(prisma, settlements as unknown as FinancialSettlementService, accessControl as unknown as AccessControlService);
  const grant = (...codes: string[]) => accessControl.assertPermission.mockImplementation(async (_user: string, code: string) => {
    if (!codes.includes(code)) throw new ForbiddenException(code);
  });
  const d = (value: number) => new Prisma.Decimal(value);

  const payable = { id: 's1', settlementNo: 'YF1', contractId: 'c1', businessUnitId: 'bu1', direction: 'PAYABLE', status: 'CONFIRMED', quantity: d(100), totalAmount: d(100000), settledAmount: d(85000), legalEntityPartnerId: 'ours', counterpartyId: 'supplier', deletedAt: null };
  const invoice = (over: Record<string, unknown> = {}) => ({ id: 'inv1', invoiceNo: '0001', sourceType: 'GOODS', direction: 'INPUT', status: 'ACTIVE', sellerPartnerId: 'supplier', buyerPartnerId: 'ours', contractId: 'c1', quantity: null, taxInclusiveAmount: d(95000), allocations: [] as Array<{ amount: Prisma.Decimal; quantity: Prisma.Decimal | null }>, ...over });
  const ticket = { invoiceNo: '0001', issuedAt: '2026-11-07T00:00:00.000+08:00', materialName: '萤石精粉', taxInclusiveAmount: 95000 };

  beforeEach(() => {
    mockReset(prisma);
    jest.clearAllMocks();
    grant('settlement.view', 'settlement.create', 'settlement.reverse', 'logistics.settlement.view', 'logistics.settlement.manage');
    accessControl.getContractScope.mockResolvedValue({ deletedAt: null });
    accessControl.getLogisticsSettlementScope.mockResolvedValue({ logisticsScope: true });
    accessControl.getLogisticsPaymentScope.mockResolvedValue({ paymentScope: true });
    accessControl.getBusinessUnitOptions.mockResolvedValue([{ id: 'bu1' }]);
    settlements.findOne.mockResolvedValue(payable);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.$queryRaw.mockResolvedValue([] as any);
    prisma.invoiceRecord.findUnique.mockResolvedValue(null);
    prisma.invoiceAllocation.create.mockImplementation(((args: any) => Promise.resolve({ id: 'a-new', ...args.data })) as any);
  });

  /** 分摊事务内的读数：发票及其已有分摊、结算单及其已有分摊。 */
  const arrange = (inv = invoice(), settlement = payable, settlementUsed: number[] = []) => {
    prisma.invoiceRecord.findMany.mockResolvedValue([inv] as any);
    prisma.invoiceRecord.findFirst.mockResolvedValue(inv as any);
    prisma.financialSettlement.findFirst.mockResolvedValue(settlement as any);
    prisma.invoiceAllocation.findMany.mockResolvedValue(settlementUsed.map(amount => ({ amount: d(amount) })) as any);
  };

  describe('在结算单上登记', () => {
    it('登记后按发票金额与未到票金额的较小者分摊到本单，开票方为供应商', async () => {
      prisma.invoiceRecord.create.mockResolvedValue({ id: 'inv1' } as any);
      arrange(invoice({ taxInclusiveAmount: d(120000) }), payable, [30000]);
      await service.create('s1', { ...ticket, taxInclusiveAmount: 120000 }, 'user1');
      expect(prisma.invoiceRecord.create).toHaveBeenCalledWith({ data: expect.objectContaining({ sourceType: 'GOODS', direction: 'INPUT', sellerPartnerId: 'supplier', buyerPartnerId: 'ours', contractId: 'c1', businessUnitId: 'bu1' }) });
      expect(prisma.invoiceAllocation.create.mock.calls[0][0].data).toMatchObject({ invoiceId: 'inv1', settlementId: 's1', amount: d(70000) });
    });

    it('结算单未确认时提示到台账先登记', async () => {
      settlements.findOne.mockResolvedValue({ ...payable, status: 'DRAFT' });
      await expect(service.create('s1', ticket, 'user1')).rejects.toThrow('票先到时请在发票台账中登记');
    });
  });

  describe('先登记、暂不对应结算单', () => {
    const contract = { id: 'c1', type: 'PURCHASE', status: 'EXECUTING', sellerId: 'supplier', buyerId: 'ours', signingPartnerId: 'ours', businessUnitId: 'bu1' };

    it('货款发票按合同带出开票方、收票方，不创建分摊', async () => {
      prisma.contract.findFirst.mockResolvedValue(contract as any);
      prisma.invoiceRecord.create.mockResolvedValue({ id: 'inv1' } as any);
      await service.register({ ...ticket, direction: 'INPUT', sourceType: 'GOODS', contractId: 'c1' }, 'user1');
      expect(prisma.invoiceRecord.create).toHaveBeenCalledWith({ data: expect.objectContaining({ sellerPartnerId: 'supplier', buyerPartnerId: 'ours', contractId: 'c1', businessUnitId: 'bu1', sourceType: 'GOODS' }) });
      expect(prisma.invoiceAllocation.create).not.toHaveBeenCalled();
    });

    it('合同未生效或方向不符时拒绝', async () => {
      prisma.contract.findFirst.mockResolvedValue({ ...contract, status: 'DRAFT' } as any);
      await expect(service.register({ ...ticket, direction: 'INPUT', sourceType: 'GOODS', contractId: 'c1' }, 'user1')).rejects.toThrow('合同生效后');
      prisma.contract.findFirst.mockResolvedValue({ ...contract, type: 'SALES' } as any);
      await expect(service.register({ ...ticket, direction: 'INPUT', sourceType: 'GOODS', contractId: 'c1' }, 'user1')).rejects.toThrow('采购或双边合同');
    });

    it('运费发票须为进项，收票方须为我方主体，事业部须在权限范围内', async () => {
      await expect(service.register({ ...ticket, direction: 'OUTPUT', sourceType: 'FREIGHT' }, 'user1')).rejects.toThrow('只能登记为进项');
      await expect(service.register({ ...ticket, direction: 'INPUT', sourceType: 'FREIGHT', carrierPartnerId: 'carrier', payerPartnerId: 'ours', businessUnitId: 'bu9' }, 'user1')).rejects.toBeInstanceOf(ForbiddenException);
      prisma.partner.findFirst.mockResolvedValueOnce({ id: 'carrier' } as any).mockResolvedValueOnce({ id: 'other', isInternal: false } as any);
      prisma.businessUnit.findUnique.mockResolvedValue({ id: 'bu1' } as any);
      await expect(service.register({ ...ticket, direction: 'INPUT', sourceType: 'FREIGHT', carrierPartnerId: 'carrier', payerPartnerId: 'other', businessUnitId: 'bu1' }, 'user1')).rejects.toThrow('我方签约主体');
    });
  });

  describe('分摊', () => {
    it('一张发票分摊到多张结算单，余额逐条累计校验', async () => {
      const s2 = { ...payable, id: 's2', settlementNo: 'YF2', totalAmount: d(50000) };
      prisma.invoiceRecord.findMany.mockResolvedValue([invoice()] as any);
      prisma.invoiceRecord.findFirst.mockResolvedValue(invoice() as any);
      prisma.financialSettlement.findFirst.mockImplementation(((args: any) => Promise.resolve(args.where.id === 's2' ? s2 : payable)) as any);
      prisma.invoiceAllocation.findMany.mockResolvedValue([]);
      const created = await service.allocate([
        { invoiceId: 'inv1', settlementId: 's1', amount: 60000 },
        { invoiceId: 'inv1', settlementId: 's2', amount: 35000 },
      ], 'user1');
      expect(created).toHaveLength(2);
      await expect(service.allocate([
        { invoiceId: 'inv1', settlementId: 's1', amount: 60000 },
        { invoiceId: 'inv1', settlementId: 's2', amount: 35001 },
      ], 'user1')).rejects.toThrow('可分摊余额为 35000.00 元');
    });

    it('不超过结算单未到票金额', async () => {
      arrange(invoice(), payable, [80000]);
      await expect(service.allocate([{ invoiceId: 'inv1', settlementId: 's1', amount: 20001 }], 'user1')).rejects.toThrow('未到票金额为 20000.00 元');
    });

    it('开票方、收票方不一致或结算单未确认时拒绝', async () => {
      arrange(invoice({ sellerPartnerId: 'someone' }));
      await expect(service.allocate([{ invoiceId: 'inv1', settlementId: 's1', amount: 100 }], 'user1')).rejects.toThrow('开票方、收票方');
      arrange(invoice(), { ...payable, status: 'DRAFT' });
      await expect(service.allocate([{ invoiceId: 'inv1', settlementId: 's1', amount: 100 }], 'user1')).rejects.toThrow('尚未确认');
    });

    it('货款发票不能分摊到物流结算单', async () => {
      prisma.invoiceRecord.findMany.mockResolvedValue([invoice()] as any);
      prisma.invoiceRecord.findFirst.mockResolvedValue(invoice() as any);
      prisma.logisticsSettlement.findFirst.mockResolvedValue({ id: 'ls1', settlementNo: 'LS1', status: 'REVIEWED', totalAmount: d(3000), carrierPartnerId: 'supplier', payerPartnerId: 'ours', deletedAt: null } as any);
      prisma.invoiceAllocation.findMany.mockResolvedValue([]);
      await expect(service.allocate([{ invoiceId: 'inv1', logisticsSettlementId: 'ls1', amount: 100 }], 'user1')).rejects.toThrow('货款发票');
    });

    it('填写了发票数量时，分摊数量合计不超过发票数量', async () => {
      arrange(invoice({ quantity: d(50), allocations: [{ amount: d(10000), quantity: d(45) }] }));
      await expect(service.allocate([{ invoiceId: 'inv1', settlementId: 's1', amount: 1000, quantity: 6 }], 'user1')).rejects.toThrow('可分摊数量为 5.000');
    });

    it('每条分摊必须且只能指定一个结算依据', async () => {
      await expect(service.allocate([{ invoiceId: 'inv1', amount: 1 }], 'user1')).rejects.toThrow('每条分摊');
    });
  });

  describe('撤销与作废', () => {
    it('撤销分摊保留记录与原因', async () => {
      prisma.invoiceAllocation.findUnique.mockResolvedValue({ id: 'a1', settlementId: 's1', reversedAt: null } as any);
      prisma.invoiceAllocation.updateMany.mockResolvedValue({ count: 1 });
      prisma.invoiceAllocation.findUniqueOrThrow.mockResolvedValue({ id: 'a1' } as any);
      await service.reverseAllocation('a1', '分错结算单', 'user1');
      expect(settlements.findOne).toHaveBeenCalledWith('s1', 'user1', 'settlement.reverse');
      expect(prisma.invoiceAllocation.updateMany).toHaveBeenCalledWith({ where: { id: 'a1', reversedAt: null }, data: expect.objectContaining({ reversedBy: 'user1', reversalReason: '分错结算单' }) });
    });

    it('发票有有效分摊时不能作废', async () => {
      prisma.invoiceRecord.findFirst.mockResolvedValue(invoice() as any);
      prisma.invoiceAllocation.count.mockResolvedValue(1);
      await expect(service.voidInvoice('inv1', '录错', 'user1')).rejects.toThrow('请先撤销全部分摊');
      prisma.invoiceAllocation.count.mockResolvedValue(0);
      prisma.invoiceRecord.updateMany.mockResolvedValue({ count: 1 });
      prisma.invoiceRecord.findUniqueOrThrow.mockResolvedValue({ status: 'VOIDED' } as any);
      await service.voidInvoice('inv1', '录错', 'user1');
      expect(prisma.invoiceRecord.updateMany).toHaveBeenCalledWith({ where: { id: 'inv1', status: 'ACTIVE' }, data: expect.objectContaining({ status: 'VOIDED', voidReason: '录错' }) });
    });
  });

  describe('台账与核对', () => {
    it('结算单详情按有效分摊核对，并给出票款差', async () => {
      prisma.invoiceAllocation.findMany.mockResolvedValue([
        { amount: d(95000), quantity: null, reversedAt: null },
        { amount: d(5000), quantity: null, reversedAt: new Date() },
      ] as any);
      const result = await service.list('s1', 'user1');
      expect(result.summary).toMatchObject({ direction: 'INPUT', state: 'PARTIAL', invoiceAmount: '95000.00', paidAmount: '85000.00', invoicePaymentGap: '10000.00', remainingAmount: '5000.00' });
    });

    it('台账按分摊状态筛选，作废发票不计入', async () => {
      prisma.invoiceRecord.findMany.mockResolvedValue([
        { ...invoice({ id: 'a' }), taxInclusiveAmount: d(100), allocations: [] },
        { ...invoice({ id: 'b' }), taxInclusiveAmount: d(100), allocations: [{ id: 'x', amount: d(40), quantity: null, settlement: { id: 's1', settlementNo: 'YF1' }, logisticsSettlement: null }] },
        { ...invoice({ id: 'c', status: 'VOIDED' }), taxInclusiveAmount: d(100), allocations: [] },
      ] as any);
      const rows = await service.ledger({ direction: 'INPUT', allocation: 'UNALLOCATED' }, 'user1');
      expect(rows.map(row => row.id)).toEqual(['a']);
      const all = await service.ledger({ direction: 'INPUT' }, 'user1');
      expect(all.find(row => row.id === 'b')).toMatchObject({ allocationState: 'PARTIAL', remainingAmount: '60.00', targets: [{ no: 'YF1', amount: '40.00' }] });
      expect(all.find(row => row.id === 'c')).toMatchObject({ allocationStateLabel: '已作废' });
    });

    it('货款发票随合同范围、运费发票随事业部范围', async () => {
      prisma.invoiceRecord.findMany.mockResolvedValue([]);
      await service.ledger({ direction: 'INPUT' }, 'user1');
      const where = prisma.invoiceRecord.findMany.mock.calls[0][0]!.where as any;
      expect(where.AND[0].OR).toEqual([
        { sourceType: 'GOODS', contract: { is: { deletedAt: null } } },
        { sourceType: 'FREIGHT', businessUnitId: { in: ['bu1'] } },
      ]);
    });

    it('合同到票汇总区分已分摊和待分摊', async () => {
      prisma.invoiceAllocation.findMany.mockResolvedValue([{ amount: d(300), settlement: { contractId: 'c1' } }, { amount: d(200), settlement: { contractId: 'c2' } }] as any);
      prisma.invoiceRecord.findMany.mockResolvedValue([{ contractId: 'c1', taxInclusiveAmount: d(1000), allocations: [{ amount: d(300) }] }] as any);
      const rows = await service.contractSummary({ direction: 'INPUT' }, 'user1');
      expect(rows).toEqual(expect.arrayContaining([
        { contractId: 'c1', allocatedAmount: '300.00', unallocatedAmount: '700.00' },
        { contractId: 'c2', allocatedAmount: '200.00', unallocatedAmount: '0.00' },
      ]));
    });

    it('无任何结算或物流权限时拒绝', async () => {
      grant();
      await expect(service.ledger({ direction: 'INPUT' }, 'nobody')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
