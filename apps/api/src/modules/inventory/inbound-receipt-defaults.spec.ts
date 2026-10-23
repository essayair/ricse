import { inboundReceiptDefaults } from './inbound-receipt-defaults';

describe('入库收货信息默认带入', () => {
  const arrivedAt = new Date('2026-10-22T08:00:05Z');
  const signedAt = new Date('2026-10-22T09:00:06Z');
  const receipt = {
    status: 'PENDING',
    waybill: {
      status: 'SIGNED', arrivedAt, signedAt,
      dispatchNotice: {
        destinationWarehouseId: 'destination', warehouseId: 'legacy',
        destinationContactPerson: '通知收货人',
        destinationWarehouse: { id: 'destination', manager: '目的仓负责人', status: 'ACTIVE' },
        warehouse: { id: 'legacy', manager: '旧仓负责人', status: 'ACTIVE' },
      },
    },
  };

  it('默认采用目的仓、物流签收时间和收货联系人，读取不修改原记录', () => {
    const original = JSON.stringify(receipt);
    expect(inboundReceiptDefaults(receipt)).toEqual({
      warehouseId: 'destination', receivedAt: signedAt, receiverName: '通知收货人', receivedAtSource: 'SIGNED',
    });
    expect(JSON.stringify(receipt)).toBe(original);
  });

  it('尚未签收时使用实际到达时间，而不是计划时间或当前时间', () => {
    expect(inboundReceiptDefaults({ ...receipt, waybill: { ...receipt.waybill, status: 'ARRIVED' } }))
      .toEqual(expect.objectContaining({ receivedAt: arrivedAt, receivedAtSource: 'ARRIVED' }));
  });

  it('尚在途时不预填实际收货时间', () => {
    expect(inboundReceiptDefaults({ ...receipt, waybill: { ...receipt.waybill, status: 'IN_TRANSIT' } }).receivedAt).toBeNull();
  });

  it('没有通知联系人时采用目标仓库负责人', () => {
    expect(inboundReceiptDefaults({ ...receipt, waybill: {
      ...receipt.waybill, dispatchNotice: { ...receipt.waybill.dispatchNotice, destinationContactPerson: '' },
    } }).receiverName).toBe('目的仓负责人');
  });

  it('人工保存的仓库、时间、收货人优先，不被上游变化覆盖', () => {
    const savedAt = new Date('2026-10-22T10:00:07Z');
    expect(inboundReceiptDefaults({ ...receipt, warehouseId: 'manual', receivedAt: savedAt, receiverName: '人工收货人' }))
      .toEqual({ warehouseId: 'manual', receivedAt: savedAt, receiverName: '人工收货人', receivedAtSource: 'SAVED' });
  });

  it('人工改选其他仓库后，不采用原目的仓收货联系人', () => {
    expect(inboundReceiptDefaults({ ...receipt, warehouseId: 'manual', warehouse: { id: 'manual', manager: '实际仓负责人' } }).receiverName)
      .toBe('实际仓负责人');
  });

  it.each([{ status: 'INACTIVE' }, { status: 'ACTIVE', deletedAt: arrivedAt }])('不默认选择停用或删除的目的仓 %j', (state) => {
    expect(inboundReceiptDefaults({ ...receipt, waybill: { ...receipt.waybill, dispatchNotice: {
      ...receipt.waybill.dispatchNotice, destinationWarehouse: { id: 'destination', ...state },
    } } }).warehouseId).toBe('legacy');
  });

  it.each(['RECEIVED', 'POSTED', 'CANCELLED'])('不对 %s 单据补入上游建议值', (status) => {
    expect(inboundReceiptDefaults({ ...receipt, status })).toEqual({
      warehouseId: null, receivedAt: null, receiverName: null, receivedAtSource: null,
    });
  });

  it('没有可用来源时保持空白，不猜测收货人或仓库', () => {
    expect(inboundReceiptDefaults({ status: 'PENDING' })).toEqual({
      warehouseId: null, receivedAt: null, receiverName: null, receivedAtSource: null,
    });
  });
});
