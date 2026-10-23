import { mockDeep, mockReset } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { PurchaseSettlementBasis } from './purchase-settlement-basis';

describe('逐车质量结算来源与版本', () => {
  const prisma = mockDeep<PrismaService>(), access = mockDeep<AccessControlService>();
  const service = new PurchaseSettlementBasis(prisma, access);
  let source: any;
  beforeEach(() => {
    mockReset(prisma); mockReset(access);
    access.assertPermission.mockResolvedValue({ isAdmin: false } as any); access.getContractScope.mockResolvedValue({ businessUnitId: 'unit-1' });
    prisma.contract.findFirst.mockResolvedValue({ id: 'c', type: 'PURCHASE', lineItems: [{ id: 'cl', materialName: '萤石精粉', unitPrice: new Prisma.Decimal(2000) }] } as any);
    prisma.financialSettlement.findMany.mockResolvedValue([]);
    source = { id: 'wl', unit: 'TON', settlementLines: [], dispatchNoticeLineItem: { orderLineItem: { contractLineItemId: 'cl' } },
      waybill: { id: 'w', waybillNo: 'YD1', status: 'ARRIVED', lineItems: [{ id: 'wl' }], inboundReceipts: [{ status: 'POSTED', weighTicketId: 'wt', weighTicket: { ticketNo: 'B1', status: 'REVIEWED', netWeight: new Prisma.Decimal(102), updatedAt: new Date('2026-10-01') }, businessInbound: { id: 'bi', inboundNo: 'BIN1', status: 'POSTED', quantity: new Prisma.Decimal(100), postedAt: new Date('2026-10-01') } }],
        dispatchNotice: { order: { id: 'o', orderNo: 'O1', name: '第一批', status: 'DISPATCHED' } },
        weightSelections: [{ id: 'ws', purpose: 'INVENTORY', weighTicketId: 'wt', quantity: new Prisma.Decimal(100), weighTicket: { ticketNo: 'B1', status: 'REVIEWED', updatedAt: new Date('2026-10-01') } }, { id: 'ws-legacy', purpose: 'SETTLEMENT', weighTicketId: 'wt', quantity: new Prisma.Decimal(100), weighTicket: { ticketNo: 'B1', status: 'REVIEWED', updatedAt: new Date('2026-10-01') } }],
        qualityTask: { id: 'q', taskNo: 'Q1', status: 'COMPLETED', qualityDisposition: 'ACCEPT_WITH_DEDUCTION', qualityDeductionPerTon: new Prisma.Decimal(40), decisionVersion: 1,
          basisInspection: { id: 'report', reportNo: 'R1', status: 'CONFIRMED', updatedAt: new Date('2026-10-01') } } } };
    prisma.waybillLineItem.findMany.mockResolvedValue([source]);
  });
  it('最终采购货款按入库过账数量而非磅单原始净重，减去已占用数量', async () => {
    source.settlementLines.push({ quantity: new Prisma.Decimal(60) });
    const rows = await service.sources('c', 'u');
    expect(rows[0]).toMatchObject({ available: true, totalQuantity: 100, remainingQuantity: 40, totalAmount: 78400, deductionPerTon: 40 });
  });
  it('未入库过账或入库已冲销时不能编制最终货物应付，不影响提前付款入口', async () => {
    source.waybill.inboundReceipts[0].status = 'RECEIVED';
    const row = (await service.sources('c', 'u'))[0];
    expect(row.available).toBe(false); expect(row.reasons.join('；')).toContain('入库过账'); expect(row.reasons.join('；')).toContain('预付款或阶段款');
  });
  it('有扣款但尚未商务接收时不能形成货物应付', async () => {
    source.waybill.qualityTask.qualityDisposition = 'DEDUCTION_PENDING';
    expect((await service.sources('c', 'u'))[0]).toMatchObject({ available: false, qualityReady: false });
  });
  it('改选报告或重新判定后，原结算快照失效而不静默重算', async () => {
    const original = (await service.sources('c', 'u'))[0];
    prisma.financialSettlement.findUnique.mockResolvedValue({ id: 's', contractId: 'c', lines: [{ waybillLineItemId: 'wl', quantity: new Prisma.Decimal(100), sourceSnapshot: original }] } as any);
    source.waybill.qualityTask.decisionVersion = 2;
    await expect(service.assertCurrent('s', 'u')).rejects.toThrow('结算依据已变更');
  });

  it('旧跟踪结算仅在过账数量与原磅单/检测事实完全一致时兼容原签名', async () => {
    const original = (await service.sources('c', 'u'))[0];
    prisma.financialSettlement.findUnique.mockResolvedValue({ id: 's', contractId: 'c', lines: [{ waybillLineItemId: 'wl', quantity: new Prisma.Decimal(100), sourceSnapshot: { ...original, inboundNo: undefined, signature: original.legacySignature } }] } as any);
    await expect(service.assertCurrent('s', 'u')).resolves.toBeUndefined();
    source.waybill.inboundReceipts[0].businessInbound.quantity = new Prisma.Decimal(99);
    await expect(service.assertCurrent('s', 'u')).rejects.toThrow('结算依据已变更');
  });
  it('存在未映射的历史批次结算时阻止同货物重复确认应付', async () => {
    prisma.financialSettlement.findMany.mockResolvedValue([{ settlementScope: 'BATCH', lines: [{ orderId: 'o', waybillLineItemId: null }] }] as any);
    expect((await service.sources('c', 'u'))[0].reasons.join('；')).toContain('历史应付');
  });
});
