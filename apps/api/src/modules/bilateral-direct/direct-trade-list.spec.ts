import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DirectTradeQueryDto } from './bilateral-direct.dto';
import { BilateralDirectService } from './bilateral-direct.service';

describe('直拨进出只读列表', () => {
  const scope = { dispatchNotice: { order: { contract: { businessUnitId: { in: ['allowed-unit'] } } } } };
  let db: any, access: any, service: BilateralDirectService;
  beforeEach(() => {
    db = { directDelivery: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _count: 0, _sum: { quantity: null, pricingQuantity: null } }) }, user: { findMany: jest.fn().mockResolvedValue([]) } };
    access = { assertPermission: jest.fn().mockResolvedValue({ isExternal: false }), getWaybillScope: jest.fn().mockResolvedValue(scope) };
    service = new BilateralDirectService(db, access);
  });
  it('数据列表、总数和全筛选汇总均保留权限范围，且不查询库存', async () => {
    await service.tradeDocuments({}, 'u');
    expect(access.assertPermission).toHaveBeenCalledWith('u', 'inventory.view');
    expect(access.getWaybillScope).toHaveBeenCalledWith('u', 'inventory.view');
    const where = db.directDelivery.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: { in: ['CONFIRMED', 'REVERSED'] }, documents: { some: {} }, waybill: { deletedAt: null, AND: [scope], dispatchNotice: { mode: 'DIRECT', directSalesExecution: { is: {} } } } });
    expect(db.directDelivery.count).toHaveBeenCalledWith({ where });
    expect(db.directDelivery.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [where, { status: 'CONFIRMED' }] } }));
  });
  it('分页不截断全部记录统计，采购销售成对而不双倍累计', async () => {
    db.directDelivery.count.mockResolvedValue(101);
    db.directDelivery.aggregate.mockResolvedValue({ _count: 3, _sum: { quantity: new Prisma.Decimal(39.7), pricingQuantity: new Prisma.Decimal(37.379) } });
    const result = await service.tradeDocuments({ pageNo: 2, pageSize: 20 }, 'u');
    expect(db.directDelivery.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20, orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }] }));
    expect(result).toMatchObject({ total: 101, pageNo: 2, pageSize: 20, totals: { confirmedCount: 3 } });
    expect(String(result.totals.quantity)).toBe('39.7');
  });
  it('按北京时间完整自然日筛选，包含结束日期且不包含次日', async () => {
    await service.tradeDocuments({ startDate: '2026-11-12', endDate: '2026-11-12', contractId: 'c' }, 'u');
    expect(db.directDelivery.findMany.mock.calls[0][0].where).toMatchObject({ confirmedAt: { gte: new Date('2026-11-11T16:00:00Z'), lt: new Date('2026-11-12T16:00:00Z') }, waybill: { dispatchNotice: { directSalesExecution: { is: { contractId: 'c' } } } } });
  });
  it('反向日期范围返回明确错误', async () => {
    await expect(service.tradeDocuments({ startDate: '2026-11-13', endDate: '2026-11-12' }, 'u')).rejects.toThrow('结束日期不能早于开始日期');
    expect(db.directDelivery.findMany).not.toHaveBeenCalled();
  });
  it('搜索和状态条件不覆盖业务单元权限', async () => {
    await service.tradeDocuments({ search: ' ZBCG ', status: 'REVERSED' }, 'u');
    const where = db.directDelivery.findMany.mock.calls[0][0].where;
    expect(where.waybill.AND).toEqual([scope]);
    expect(where.status).toBe('REVERSED');
    expect(where.OR).toContainEqual({ documents: { some: { documentNo: { contains: 'ZBCG', mode: 'insensitive' } } } });
  });
  it('外部账号不能读取两向内部交付记录', async () => {
    access.assertPermission.mockResolvedValue({ isExternal: true });
    await expect(service.tradeDocuments({}, 'outside')).rejects.toThrow('仅对有业务权限的内部账号开放');
    expect(db.directDelivery.findMany).not.toHaveBeenCalled();
  });
  it('仅投影必要凭证字段，不返回完整快照或内部价格', async () => {
    db.directDelivery.findMany.mockResolvedValue([{ id: 'd', createdBy: 'u', snapshot: { ticketNo: 'WG', reportNo: 'Q', materialName: '块矿', secretPrice: 99 } }]);
    db.user.findMany.mockResolvedValue([{ id: 'u', name: '经办人' }]);
    const result = await service.tradeDocuments({}, 'u');
    expect(result.items[0]).toMatchObject({ operatorName: '经办人', evidence: { ticketNo: 'WG', reportNo: 'Q', materialName: '块矿' } });
    expect(result.items[0]).not.toHaveProperty('snapshot');
    expect(result.items[0].evidence).not.toHaveProperty('secretPrice');
  });
  it.each([{ pageNo: '0' }, { pageSize: '101' }, { status: 'DRAFT' }, { startDate: '2026-02-30' }, { endDate: '2026-11-12T00:00:00Z' }])('查询参数 %j 被拒绝', async query => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    await expect(pipe.transform(query, { type: 'query', metatype: DirectTradeQueryDto })).rejects.toBeInstanceOf(BadRequestException);
  });
});
