import { Prisma } from '@prisma/client';
import { BilateralDirectService } from './bilateral-direct.service';

describe('双边直拨确认与纠错', () => {
  let service: BilateralDirectService;
  let db: any;
  const pair = { purchaseNoticeId: 'purchase-notice', salesNoticeId: 'sales-notice' };
  const w = () => ({ id: 'trip', status: 'SIGNED', lineItems: [{ id: 'cargo' }], directDeliveries: [], dispatchNotice: { directSalesExecution: pair, order: { contractId: 'contract' } } });
  const dto = { weighTicketId: 'ticket', qualityReportId: 'report', remarks: '按实际单据确认' };
  beforeEach(() => {
    db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      waybill: { findFirst: jest.fn().mockResolvedValue({ id: 'trip' }), update: jest.fn() },
      directDelivery: { create: jest.fn().mockImplementation(({ data }) => ({ id: 'delivery', ...data })), findUnique: jest.fn().mockResolvedValue({ id: 'delivery' }), update: jest.fn() },
      directTradeDocument: { createMany: jest.fn(), updateMany: jest.fn() }, dispatchNotice: { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) }, order: { updateMany: jest.fn() },
      financialSettlement: { findFirst: jest.fn().mockResolvedValue(null) }, logisticsSettlementLine: { findFirst: jest.fn().mockResolvedValue(null) },
      businessOperationLog: { create: jest.fn() }, weighTask: { updateMany: jest.fn() }, qualityTask: { updateMany: jest.fn() },
      contract: { updateMany: jest.fn() },
    };
    db.$transaction = jest.fn(async callback => callback(db));
    const access: any = { assertPermission: jest.fn().mockResolvedValue({ isAdmin: true, isExternal: false, roleCodes: ['ADMIN'] }), getWaybillScope: jest.fn().mockResolvedValue({}) };
    service = new BilateralDirectService(db, access);
  });
  function prepared(current = w()) {
    return { w: current, quantity: new Prisma.Decimal(20), pricingQuantity: new Prisma.Decimal(19), pricingQuantityBasis: 'DRY_MATTER', snapshot: { quantity: '20', pricingQuantity: '19' } };
  }
  it('真实交付预览使用下游免扣规则，两向共用98.2吨计价量', async () => {
    const source = { id: 'contract-line', materialId: 'material', materialName: '萤石矿', unit: 'TON', pricingQuantityBasis: 'DRY_MATTER',
      salesPriceRulesSnapshot: { quantityBasis: 'DRY_MATTER', moistureDeductionMode: 'EXCESS', moistureBasePct: 5 } };
    const current: any = { ...w(), attachments: [{ category: 'RECEIPT_DOCUMENT' }], weighTickets: [{ id: 'ticket', netWeight: new Prisma.Decimal(100), weighingStage: 'RECEIVING', weightSelections: [], ticketNo: 'BD1', updatedAt: new Date() }],
      qualityTask: { status: 'COMPLETED', basisInspectionId: 'report', finalConclusion: 'PASS', decisionVersion: 1, reports: [], reportLinks: [], basisInspection: { id: 'report', status: 'CONFIRMED', evidenceStage: 'RECEIVING', reportNo: 'QC1', indicators: [{ code: 'MOISTURE', name: '水分', unit: '%', measuredValue: new Prisma.Decimal(6.8) }] } } };
    current.lineItems = [{ dispatchNoticeLineItem: { orderLineItem: { contractLineItemId: source.id } } }];
    current.dispatchNotice = { ...current.dispatchNotice, order: { contractId: 'contract', contract: { status: 'APPROVED', pricingType: 'GRADE_TIER', lineItems: [source] } } };
    db.material = { findUnique: jest.fn().mockResolvedValue({ pricingQuantityBasis: 'PHYSICAL' }) };
    jest.spyOn(service as any, 'load').mockResolvedValue(current);
    const result = await (service as any).prepare(db, 'trip', dto);
    expect(result.pricingQuantity.toNumber()).toBe(98.2);
    expect(result.snapshot).toMatchObject({ moistureDeductionMode: 'EXCESS', moistureBasePct: 5, pricingQuantity: '98.2', quantity: '100' });
  });
  it('一次操作生成两向等量单据，绝不调用库存表', async () => {
    jest.spyOn(service as any, 'prepare').mockResolvedValue(prepared());
    await service.confirm('trip', dto, 'operator');
    const docs = db.directTradeDocument.createMany.mock.calls[0][0].data as Array<{ direction: string; quantity: Prisma.Decimal; pricingQuantity: Prisma.Decimal }>;
    expect(docs.map(d => d.direction)).toEqual(['PURCHASE', 'SALES']);
    expect(docs.every(d => d.quantity.eq(20) && d.pricingQuantity.eq(19))).toBe(true);
    expect(db.waybill.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ salesCompletionReportId: 'report' }) }));
    expect(db.directDelivery.create.mock.calls[0][0].data.version).toBe(1);
  });
  it('同一有效确认重复请求不再生成两向单据', async () => {
    const current: any = w(); current.directDeliveries = [{ id: 'old', version: 1, status: 'CONFIRMED', weighTicketId: 'ticket', qualityInspectionId: 'report' }];
    jest.spyOn(service as any, 'prepare').mockResolvedValue(prepared(current));
    expect(await service.confirm('trip', dto, 'operator')).toMatchObject({ id: 'old' });
    expect(db.directDelivery.create).not.toHaveBeenCalled(); expect(db.directTradeDocument.createMany).not.toHaveBeenCalled();
  });
  it('历史版本已撤销时允许创建新版本', async () => {
    const current: any = w(); current.directDeliveries = [{ version: 2, status: 'REVERSED' }];
    jest.spyOn(service as any, 'prepare').mockResolvedValue(prepared(current));
    await service.confirm('trip', dto, 'operator');
    expect(db.directDelivery.create.mock.calls[0][0].data.version).toBe(3);
  });
  it('提交运营经理复核时不提前生成业务单据', async () => {
    jest.spyOn(service as any, 'prepare').mockResolvedValue(prepared());
    await service.confirm('trip', { ...dto, requestReview: true }, 'operator');
    expect(db.directDelivery.create.mock.calls[0][0].data.status).toBe('PENDING_REVIEW');
    expect(db.directTradeDocument.createMany).not.toHaveBeenCalled();
  });
  it('结算草稿也会阻止撤销，不能只检查已确认结算', async () => {
    const current: any = w(); current.directDeliveries = [{ id: 'delivery', status: 'CONFIRMED' }];
    jest.spyOn(service as any, 'load').mockResolvedValue(current);
    db.financialSettlement.findFirst.mockResolvedValue({ settlementNo: 'YF-DRAFT' });
    await expect(service.reverse('trip', '填错需要重做', 'operator')).rejects.toThrow('YF-DRAFT');
    expect(db.directDelivery.update).not.toHaveBeenCalled();
  });
  it('撤销成对单据并清理交付状态，保留原始运输和凭证', async () => {
    const current: any = w(); current.directDeliveries = [{ id: 'delivery', status: 'CONFIRMED' }];
    jest.spyOn(service as any, 'load').mockResolvedValue(current);
    await service.reverse('trip', '更正采用依据', 'operator');
    expect(db.directTradeDocument.updateMany).toHaveBeenCalledWith({ where: { directDeliveryId: 'delivery' }, data: { status: 'REVERSED' } });
    expect(db.waybill.update.mock.calls[0][0].data.salesCompletionConfirmedAt).toBeNull();
    expect(db.waybill.update.mock.calls[0][0].data.status).toBeUndefined();
    expect(db.contract.updateMany).toHaveBeenCalledWith({ where: { id: 'contract', status: 'COMPLETED' }, data: { status: 'EXECUTING' } });
  });
  it('在途且未交付的运单可取消，有有效交付则必须先撤销', async () => {
    const current: any = w(); current.status = 'IN_TRANSIT';
    jest.spyOn(service as any, 'load').mockResolvedValue(current);
    await expect(service.cancel('trip', '重新安排车辆', 'operator')).resolves.toEqual({ cancelled: true });
    current.directDeliveries = [{ status: 'CONFIRMED' }];
    await expect(service.cancel('trip', '重新安排车辆', 'operator')).rejects.toThrow('请先撤销');
  });
});
