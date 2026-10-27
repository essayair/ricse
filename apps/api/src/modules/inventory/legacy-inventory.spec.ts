import { Prisma, PrismaClient } from '@prisma/client';
import { mockDeep, mockReset } from 'jest-mock-extended';
import { deriveLegacyQuantity, reconcileLegacyReceipt } from '../../../prisma/reconcile-legacy-inventory';

const receipt = () => ({
  id: 'r1', waybillId: 'w1', weighTicketId: 'wt1', qualityInspectionId: 'q1',
  weighTicket: { id: 'wt1', waybillId: 'w1', status: 'REVIEWED', deletedAt: null, netWeight: new Prisma.Decimal(100) },
  qualityInspection: { id: 'q1', status: 'CONFIRMED', deletedAt: null, qualityTaskId: 'task1', indicators: [
    { code: 'MOISTURE', name: '水分', unit: '%', measuredValue: new Prisma.Decimal(12) },
  ] },
  waybill: { dispatchNotice: { order: { contractId: 'contract-1' } }, lineItems: [{ materialId: 'm1' }], weightSelections: [
    { purpose: 'INVENTORY', isCurrent: true, weighTicketId: 'wt1' },
  ], qualityTask: { id: 'task1', status: 'COMPLETED', deletedAt: null, qualityDisposition: 'PASS', basisInspectionId: 'q1' } },
}) as any;

describe('历史库存证据推导', () => {
  const db = mockDeep<PrismaClient>();
  beforeEach(() => {
    mockReset(db);
    db.material.findUnique.mockResolvedValue({ pricingQuantityBasis: 'PHYSICAL' } as any);
  });
  it('从选定磅单得到实物净重，从最终采用报告的水分得到折干数量', () => {
    const result = deriveLegacyQuantity(receipt(), 'DRY_MATTER');
    expect(result.physical.toNumber()).toBe(100);
    expect(result.pricing.toNumber()).toBe(88);
    expect(result.moisture?.toNumber()).toBe(12);
  });

  it('实物计价不按水分扣数量，仍保留检测水分快照', () => {
    const result = deriveLegacyQuantity(receipt(), 'PHYSICAL');
    expect(result.pricing.toNumber()).toBe(100);
    expect(result.moisture?.toNumber()).toBe(12);
  });

  it('报告不是最终判定依据时拒绝自动核对', () => {
    const item = receipt(); item.waybill.qualityTask.basisInspectionId = 'another-report';
    expect(() => deriveLegacyQuantity(item, 'PHYSICAL')).toThrow('最终采用');
  });

  it('折干缺少唯一有效水分时拒绝猜数', () => {
    const item = receipt(); item.qualityInspection.indicators.push({ code: 'H2O', name: '水分复测', unit: '%', measuredValue: new Prisma.Decimal(11) });
    expect(() => deriveLegacyQuantity(item, 'DRY_MATTER')).toThrow('唯一有效');
  });

  it('当前选定磅单与历史单不同则拒绝自动核对', () => {
    const item = receipt(); item.waybill.weightSelections[0].weighTicketId = 'another-ticket';
    expect(() => deriveLegacyQuantity(item, 'PHYSICAL')).toThrow('当前选定');
  });

  it('已收货未过账旧单可用磅单净重自动补全，同时保留迁移时记录的原值', async () => {
    const item = { ...receipt(), status: 'RECEIVED', businessInbound: null, receiptNo: 'IR-OLD-1' } as any;
    db.inboundReceipt.updateMany.mockResolvedValue({ count: 1 });
    await expect(reconcileLegacyReceipt(item, db, true)).resolves.toBe('RECEIVED_RECONCILED');
    expect(db.inboundReceipt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'r1', quantitySource: 'LEGACY_UNVERIFIED' }),
      data: expect.objectContaining({ receivedQuantity: new Prisma.Decimal(100), pricingQuantity: new Prisma.Decimal(100), quantitySource: 'HISTORICAL_RECONCILED' }),
    }));
  });

  it('已过账且下游已出库，历史数量不同则拒绝自动改写', async () => {
    const item = { ...receipt(), status: 'POSTED', businessInbound: {
      id: 'bi1', inboundNo: 'BIN-1', status: 'POSTED', materialId: 'm1', quantity: new Prisma.Decimal(88), pricingQuantity: new Prisma.Decimal(88),
      inventoryLot: { id: 'lot1', initialQuantity: new Prisma.Decimal(88), availableQuantity: new Prisma.Decimal(68), pricingInitialQuantity: new Prisma.Decimal(88) },
    } } as any;
    db.inventoryLedger.findMany.mockResolvedValue([{ id: 'ledger1', businessType: 'INBOUND', businessNo: 'BIN-1' }] as any);
    db.outboundReceiptAllocation.count.mockResolvedValue(1);
    await expect(reconcileLegacyReceipt(item, db, true)).rejects.toThrow('不能自动改写');
    expect(db.inboundReceipt.updateMany).not.toHaveBeenCalled();
  });
});
