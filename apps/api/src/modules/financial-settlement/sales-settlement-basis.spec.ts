import { mockDeep, mockReset } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { SalesSettlementBasis } from './sales-settlement-basis';

describe('销售交付后的逐车应收来源', () => {
  const prisma = mockDeep<PrismaService>(), access = mockDeep<AccessControlService>();
  const basis = new SalesSettlementBasis(prisma, access);
  let row: any;
  beforeEach(() => {
    mockReset(prisma); mockReset(access);
    access.assertPermission.mockResolvedValue({ isAdmin: false } as any);
    access.getContractScope.mockResolvedValue({ businessUnitId: 'unit' });
    prisma.contract.findFirst.mockResolvedValue({ id: 'contract', type: 'SALES', pricingType: 'FIXED', lineItems: [
      { id: 'contract-line', materialName: '萤石精粉', unitPrice: new Prisma.Decimal(2000) },
    ] } as any);
    prisma.financialSettlement.findMany.mockResolvedValue([]);
    prisma.material.findMany.mockResolvedValue([{ id: 'material', pricingQuantityBasis: 'DRY_MATTER' }] as any);
    const report = { id: 'customer-report', reportNo: '客户质检', status: 'CONFIRMED', conclusion: 'PASS', evidenceStage: 'RECEIVING',
      deletedAt: null, updatedAt: new Date('2026-10-31'), indicators: [{ code: 'MOISTURE', measuredValue: new Prisma.Decimal(10) }] };
    const shipping = { id: 'shipping', ticketNo: '我方发货', weighingStage: 'SHIPPING', status: 'REVIEWED', deletedAt: null,
      netWeight: new Prisma.Decimal(100), grossWeight: new Prisma.Decimal(120), tareWeight: new Prisma.Decimal(20), updatedAt: new Date('2026-10-31') };
    const receiving = { ...shipping, id: 'receiving', ticketNo: '客户收货', weighingStage: 'RECEIVING', netWeight: new Prisma.Decimal(98) };
    row = { id: 'line', materialId: 'material', materialName: '萤石精粉', unit: 'TON', settlementLines: [],
      dispatchNoticeLineItem: { orderLineItem: { contractLineItemId: 'contract-line' } },
      waybill: { id: 'waybill', waybillNo: 'YD-1', plateNo: '甘A12345', lineItems: [{ id: 'line' }],
        dispatchNotice: { mode: 'STANDARD', order: { id: 'order', orderNo: 'PC-1', name: '第一批', status: 'COMPLETED' } },
        weighTickets: [shipping, receiving], weightSelections: [
          { id: 'inventory-selection', purpose: 'INVENTORY', weighTicketId: 'shipping', weighTicket: shipping },
          { id: 'shipping-selection', purpose: 'SHIPPING', weighTicketId: 'shipping', weighTicket: shipping },
          { id: 'receiving-selection', purpose: 'RECEIVING', weighTicketId: 'receiving', weighTicket: receiving },
        ],
        outboundReceipts: [{ id: 'outbound', receiptNo: 'CK-1', status: 'POSTED', outboundQuantity: new Prisma.Decimal(100), weighTicket: shipping }],
        qualityTask: { id: 'task', status: 'COMPLETED', decisionVersion: 1, basisInspection: report, reports: [report], reportLinks: [] },
        salesCompletionConfirmedAt: new Date('2026-10-31'), salesCompletionReportId: 'customer-report',
        salesCompletionCustomerTicketId: 'receiving', salesCompletionShippingTicketId: 'shipping',
        salesCompletionCustomerWeight: new Prisma.Decimal(98), salesCompletionShippingWeight: new Prisma.Decimal(100),
        salesCompletionWeightVariance: new Prisma.Decimal(-2),
      } };
    prisma.waybillLineItem.findMany.mockResolvedValue([row]);
  });

  it('按客户收货磅单与最终报告折干形成应收，不改写我方出库数量', async () => {
    const source = (await basis.sources('contract', 'user'))[0];
    expect(source).toMatchObject({ available: true, totalQuantity: 88.2, remainingQuantity: 88.2,
      negotiableQuantity: 90, negotiableRemainingQuantity: 90,
      inventoryNetWeight: 100, customerNetWeight: 98, weightVariance: -2, unitPrice: 2000, totalAmount: 176400 });
    expect(row.waybill.outboundReceipts[0].outboundQuantity.toNumber()).toBe(100);
  });

  it('同一侧追加第二张待复核磅单后，禁止静默编制销售结算', async () => {
    row.waybill.weighTickets.push({ id: 'receiving-2', ticketNo: '收货复磅', weighingStage: 'RECEIVING', status: 'PENDING', deletedAt: null });
    row.waybill.weightSelections = row.waybill.weightSelections.filter((selection: any) => selection.purpose !== 'RECEIVING');
    const source = (await basis.sources('contract', 'user'))[0];
    expect(source.available).toBe(false);
    expect(source.reasons.join('；')).toContain('收货侧有多张磅单，请先确认采信磅单');
  });

  it('未完成客户交付不能按执行计划量直接形成最终应收', async () => {
    row.waybill.salesCompletionConfirmedAt = null;
    const source = (await basis.sources('contract', 'user'))[0];
    expect(source.available).toBe(false);
    expect(source.reasons.join('；')).toContain('销售交付完成');
  });
});
