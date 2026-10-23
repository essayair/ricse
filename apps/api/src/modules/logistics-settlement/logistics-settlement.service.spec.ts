import { mockDeep, mockReset } from 'jest-mock-extended';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FileService } from '../common/file.service';
import { LogisticsSettlementService } from './logistics-settlement.service';

describe('物流结算独立计量、调价留痕与付款主体', () => {
  const prisma = mockDeep<PrismaService>(), access = mockDeep<AccessControlService>(), files = mockDeep<FileService>();
  const service = new LogisticsSettlementService(prisma, access, files);
  const d = (v: number) => new Prisma.Decimal(v), stamp = new Date('2026-10-01T01:00:00Z');
  const ticket = (id: string, stage: string, net: number) => ({ id, ticketNo: id, status: 'REVIEWED', weighingStage: stage, grossWeight: d(net + 20), tareWeight: d(20), netWeight: d(net), updatedAt: stamp, materialSpec: '97粉' });
  const waybill = () => ({ id: 'w', waybillNo: 'WB1', status: 'SIGNED', carrierPartnerId: 'carrier', carrierName: '承运方', plateNo: '浙A12345', departedAt: new Date('2026-10-01'), signedAt: new Date('2026-10-02'), originLocation: '额济纳', destinationLocation: '玉门',
    lineItems: [{ materialId: 'm', materialName: '萤石精粉' }],
    dispatchNotice: { order: { type: 'PURCHASE', contract: { signingPartnerId: 'owner', signingPartner: { id: 'owner', name: '货主' }, businessUnitId: 'unit', businessUnit: { id: 'unit', name: '玉门' } } } },
    weighTickets: [ticket('receiving', 'RECEIVING', 98), ticket('shipping', 'SHIPPING', 100)],
    weightSelections: [{ purpose: 'INVENTORY', weighTicketId: 'receiving' }, { purpose: 'SETTLEMENT', weighTicketId: 'shipping' }],
    inboundReceipts: [{ weighTicketId: 'receiving', businessInbound: { id: 'posted', status: 'POSTED', quantity: d(96) } }],
  });
  const term = () => ({ id: 'rate', contractId: 'lc', originLocation: '', destinationLocation: '', unitPrice: d(100), contract: { id: 'lc', signingPartnerId: 'owner', settlementBasis: 'NET_WEIGHT', defaultWeightBasis: 'SETTLEMENT' } });
  const dto = () => ({ periodStart: '2026-10-01', periodEnd: '2026-10-31', lines: [{ waybillId: 'w' }] });
  const settlement = () => ({ id: 'ls', status: 'DRAFT', payerPartnerId: 'owner', ownerPartnerId: 'owner', payerPartner: { id: 'owner', name: '货主' }, attachments: [], adjustments: [], lines: [
    { id: 'line', waybillId: 'w', netWeight: d(98), chargeQuantity: d(98), grossWeight: d(118), unitPrice: d(100), amount: d(9800), pricingBasis: 'NET_WEIGHT', weightBasis: 'SETTLEMENT', weighTicketId: 'receiving', ticketNo: 'receiving', evidenceSnapshot: { ticketUpdatedAt: stamp.toISOString() }, contractPriceTermId: 'rate', contractUnitPrice: d(100), contractPriceTerm: { contract: { signingPartnerId: 'owner' } }, waybill: { waybillNo: 'WB1' } },
  ] });
  beforeEach(() => {
    mockReset(prisma); mockReset(access); mockReset(files);
    access.assertPermission.mockResolvedValue({ user: { company: { id: 'management' } } } as any);
    access.getWaybillScope.mockResolvedValue({}); access.getLogisticsSettlementScope.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (f: any) => f(prisma));
    prisma.waybill.findMany.mockResolvedValue([waybill()] as any); prisma.waybill.findFirst.mockResolvedValue(waybill() as any);
    prisma.partner.findFirst.mockResolvedValue({ id: 'owner', name: '货主', isInternal: true } as any);
    prisma.logisticsSettlementLine.count.mockResolvedValue(0); prisma.logisticsSettlement.count.mockResolvedValue(0);
    prisma.logisticsContractPriceTerm.findMany.mockResolvedValue([term()] as any);
    prisma.logisticsSettlement.findFirst.mockResolvedValue(settlement() as any);
    prisma.logisticsSettlementLine.findMany.mockResolvedValue(settlement().lines as any);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.logisticsSettlement.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'ls', ...data, lines: data.lines.createMany.data.map((l: any, i: number) => ({ id: 'new' + i, ...l })) }) as any);
    prisma.logisticsSettlementLine.update.mockImplementation(({ data }: any) => Promise.resolve({ ...settlement().lines[0], ...data }) as any);
  });
  it('采购默认使用入库磅单，而不是另选的货款磅单；不修改库存或货款选用记录', async () => {
    await service.create(dto(), 'u');
    const data = (prisma.logisticsSettlement.create.mock.calls[0][0] as any).data;
    expect(data).toMatchObject({ ownerPartnerId: 'owner', payerPartnerId: 'owner', businessUnitId: 'unit' });
    expect(data.lines.createMany.data[0]).toMatchObject({ weighTicketId: 'receiving', netWeight: 98, chargeQuantity: 98, amount: 9800, materialName: '萤石精粉' });
    expect(prisma.waybillWeightSelection.update).not.toHaveBeenCalled(); expect(prisma.businessInbound.update).not.toHaveBeenCalled();
  });
  it('销售默认跟随已确认的货款结算磅单，可独立改用我方发货磅单', async () => {
    const w = waybill(); w.dispatchNotice.order.type = 'SALES'; w.weightSelections = [{ purpose: 'SETTLEMENT', weighTicketId: 'receiving' }];
    prisma.waybill.findMany.mockResolvedValue([w] as any);
    await service.create(dto(), 'u');
    expect((prisma.logisticsSettlement.create.mock.calls[0][0] as any).data.lines.createMany.data[0].chargeQuantity).toBe(98);
    await service.create({ ...dto(), lines: [{ waybillId: 'w', weighTicketId: 'shipping', weightReason: '双方按发货磅单结运费' }] }, 'u');
    expect((prisma.logisticsSettlement.create.mock.calls[1][0] as any).data.lines.createMany.data[0].chargeQuantity).toBe(100);
  });
  it('允许只有一张有效磅单，不要求发收两张齐全', async () => {
    const w = waybill(); w.weighTickets = [w.weighTickets[0]]; prisma.waybill.findMany.mockResolvedValue([w] as any);
    await expect(service.create(dto(), 'u')).resolves.toBeDefined();
    w.weighTickets = []; await expect(service.create(dto(), 'u')).rejects.toThrow('至少需要一张');
  });
  it('改选磅单、调整运价、修改付款主体均必须有原因', async () => {
    await expect(service.create({ ...dto(), lines: [{ waybillId: 'w', weighTicketId: 'shipping' }] }, 'u')).rejects.toThrow('填写原因');
    await expect(service.create({ ...dto(), lines: [{ waybillId: 'w', manualUnitPrice: 90 }] }, 'u')).rejects.toThrow('调整原因');
    await expect(service.create({ ...dto(), payerPartnerId: 'other' }, 'u')).rejects.toThrow('修改付款主体');
  });
  it('结算调价保留合同原价并创建历史，不会回写合同', async () => {
    await service.create({ ...dto(), lines: [{ waybillId: 'w', manualUnitPrice: 90, overrideReason: '本次协商优惠' }] }, 'u');
    expect((prisma.logisticsSettlement.create.mock.calls[0][0] as any).data.lines.createMany.data[0]).toMatchObject({ unitPrice: 90, contractUnitPrice: d(100), priceSource: 'CONTRACT_OVERRIDDEN', amount: 8820 });
    expect(prisma.logisticsSettlementAdjustment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'PRICE', actorId: 'u', reason: '本次协商优惠' }) }));
    expect(prisma.logisticsContractPriceTerm.update).not.toHaveBeenCalled();
  });
  it('按车次实际按一车计费，而不是错误乘以吨数', async () => {
    const rate = term(); rate.contract.settlementBasis = 'TRIP'; rate.unitPrice = d(3200); prisma.logisticsContractPriceTerm.findMany.mockResolvedValue([rate] as any);
    await service.create(dto(), 'u');
    expect((prisma.logisticsSettlement.create.mock.calls[0][0] as any).data.lines.createMany.data[0]).toMatchObject({ netWeight: 98, chargeQuantity: 1, pricingBasis: 'TRIP', amount: 3200 });
  });
  it('按实际发货日匹配运价，并支持不限路线；多份合同不静默选择', async () => {
    await service.create(dto(), 'u');
    const query = prisma.logisticsContractPriceTerm.findMany.mock.calls[0][0] as any;
    expect(query.where.effectiveAt.lte).toEqual(new Date('2026-10-01')); expect(query.where.AND).toEqual(expect.arrayContaining([expect.objectContaining({ OR: expect.arrayContaining([{ originLocation: '', destinationLocation: '' }]) })]));
    prisma.logisticsContractPriceTerm.findMany.mockResolvedValue([term(), { ...term(), id: 'other' }] as any);
    await expect(service.create(dto(), 'u')).rejects.toThrow('匹配多份');
    await expect(service.create({ ...dto(), lines: [{ waybillId: 'w', contractPriceTermId: 'foreign' }] }, 'u')).rejects.toThrow('不适用于');
  });
  it('同一结算单不能混合事业部、货主、承运方；重复运单也拒绝', async () => {
    await expect(service.create({ ...dto(), lines: [{ waybillId: 'w' }, { waybillId: 'w' }] }, 'u')).rejects.toThrow('不能重复');
    const w2 = waybill(); w2.id = 'w2'; w2.dispatchNotice.order.contract.businessUnitId = 'other'; prisma.waybill.findMany.mockResolvedValue([waybill(), w2] as any);
    await expect(service.create({ ...dto(), lines: [{ waybillId: 'w' }, { waybillId: 'w2' }] }, 'u')).rejects.toThrow('同一业务单元');
    prisma.waybill.findMany.mockResolvedValue([waybill()] as any); prisma.logisticsSettlementLine.count.mockResolvedValue(1);
    await expect(service.create(dto(), 'u')).rejects.toThrow('重复结算');
  });
  it('付款主体改为另一内部企业后原货主保留，且变更有历史', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'payer-b', name: '代付公司' } as any);
    await service.setPayer('ls', { payerPartnerId: 'payer-b', reason: '公司间代付约定' }, 'u');
    expect(prisma.logisticsSettlement.update).toHaveBeenCalledWith(expect.objectContaining({ data: { payerPartnerId: 'payer-b', payerChangeReason: '公司间代付约定' } }));
    expect(prisma.logisticsSettlementAdjustment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'PAYER', reason: '公司间代付约定' }) }));
  });
  it('多次调价都保存前后价格，草稿以外禁止修改', async () => {
    await service.setLinePrice('ls', 'line', { unitPrice: 99, overrideReason: '复核协商' }, 'u');
    expect(prisma.logisticsSettlementAdjustment.create).toHaveBeenCalled();
    expect(prisma.logisticsSettlementLine.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 9702, contractUnitPrice: d(100) }) }));
    prisma.logisticsSettlement.findFirst.mockResolvedValue({ ...settlement(), status: 'REVIEWED' } as any);
    await expect(service.setLinePrice('ls', 'line', { unitPrice: 90, overrideReason: '再次调整' }, 'u')).rejects.toThrow('只有草稿');
  });
  it('双方确认重量需依据附件；过磅内容更正后不能沿用旧快照提交', async () => {
    const s = settlement(); s.lines[0].weightBasis = 'CONFIRMED'; prisma.logisticsSettlement.findFirst.mockResolvedValue(s as any);
    await expect(service.submit('ls', 'u')).rejects.toThrow('上传重量确认依据');
    prisma.logisticsSettlement.findFirst.mockResolvedValue(settlement() as any); prisma.weighTicket.findFirst.mockResolvedValue({ ...ticket('receiving', 'RECEIVING', 97), updatedAt: new Date('2026-10-03') } as any);
    await expect(service.submit('ls', 'u')).rejects.toThrow('计费磅单已变化');
  });
  it('已有有效付款申请或核销的结算不能直接作废', async () => {
    prisma.paymentRequest.count.mockResolvedValue(1);
    await expect(service.voidSettlement('ls', 'u')).rejects.toThrow('有效付款申请或核销');
  });
  it('日期范围包含结束日期的全天，同一天也可以结算', async () => {
    prisma.waybill.findMany.mockResolvedValue([]);
    await service.listCandidateWaybills({ periodStart: '2026-10-01', periodEnd: '2026-10-01' }, 'u');
    const query = prisma.waybill.findMany.mock.calls[0][0] as any;
    expect(query.where.AND[1].signedAt.lt).toEqual(new Date('2026-10-01T16:00:00Z'));
    await expect(service.listCandidateWaybills({ periodStart: '2026-10-03', periodEnd: '2026-10-01' }, 'u')).rejects.toThrow('有效的结算周期');
  });
  it('未选日期时展示权限范围内全部已签收且未结算运单，不附加日期限制', async () => {
    const scope = { dispatchNotice: { order: { contract: { businessUnitId: 'unit' } } } };
    access.getWaybillScope.mockResolvedValue(scope);
    prisma.waybill.findMany.mockResolvedValue([]);
    await service.listCandidateWaybills({}, 'u');
    const query = prisma.waybill.findMany.mock.calls[0][0] as any;
    expect(query.where.AND[0]).toEqual(scope);
    expect(query.where.AND[1]).toMatchObject({ deletedAt: null, status: 'SIGNED', logisticsSettlementLines: { none: { settlement: { status: { not: 'VOIDED' }, deletedAt: null } } } });
    expect(query.where.AND[1]).not.toHaveProperty('signedAt');
  });
  it('支持只填写开始或结束日期，不要求先填写完整周期', async () => {
    prisma.waybill.findMany.mockResolvedValue([]);
    await service.listCandidateWaybills({ periodStart: '2026-10-01' }, 'u');
    await service.listCandidateWaybills({ periodEnd: '2026-10-02' }, 'u');
    const first = (prisma.waybill.findMany.mock.calls[0][0] as any).where.AND[1].signedAt;
    const second = (prisma.waybill.findMany.mock.calls[1][0] as any).where.AND[1].signedAt;
    expect(first.gte).toEqual(new Date('2026-09-30T16:00:00Z')); expect(first.lt).toBeUndefined();
    expect(second.gte).toBeUndefined(); expect(second.lt).toEqual(new Date('2026-10-02T16:00:00Z'));
    await expect(service.listCandidateWaybills({ periodStart: 'invalid' }, 'u')).rejects.toThrow('有效的结算周期日期');
  });
  it('不填日期也可以保存结算草稿，周期按所选运单签收日期自动生成', async () => {
    await service.create({ lines: [{ waybillId: 'w' }] }, 'u');
    const data = (prisma.logisticsSettlement.create.mock.calls[0][0] as any).data;
    expect(data.periodStart).toEqual(new Date('2026-10-01T16:00:00Z'));
    expect(data.periodEnd).toEqual(new Date('2026-10-02T15:59:59.999Z'));
  });
});
