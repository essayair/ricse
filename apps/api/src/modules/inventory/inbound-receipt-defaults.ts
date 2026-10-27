type ReceiptTime = Date | string | null;
type ReceiptWarehouse = { id: string; manager?: string | null; status?: string; deletedAt?: ReceiptTime };

interface ReceiptForDefaults {
  status?: string;
  warehouseId?: string | null;
  warehouse?: ReceiptWarehouse | null;
  receivedAt?: ReceiptTime;
  receiverName?: string | null;
  waybill?: {
    status?: string;
    signedAt?: ReceiptTime;
    arrivedAt?: ReceiptTime;
    dispatchNotice?: {
      destinationContactPerson?: string | null;
      destinationWarehouseId?: string | null;
      destinationWarehouse?: ReceiptWarehouse | null;
    };
  } | null;
}

/** 仅提供表单建议值；读取不写库，不替代人工收货确认，也不改动已完成的单据。 */
export function inboundReceiptDefaults(receipt: ReceiptForDefaults) {
  const saved = {
    warehouseId: receipt.warehouseId || null,
    receivedAt: receipt.receivedAt || null,
    receiverName: receipt.receiverName?.trim() || null,
    receivedAtSource: receipt.receivedAt ? 'SAVED' : null,
  };
  if (receipt.status !== 'PENDING') return saved;

  const waybill = receipt.waybill;
  const notice = waybill?.dispatchNotice;
  const activeWarehouse = (warehouse?: ReceiptWarehouse | null) => warehouse?.status === 'ACTIVE' && !warehouse.deletedAt ? warehouse : null;
  // 入库仓库只能取物流目的地对应的仓库，不能误取执行通知的起运仓库。
  const suggestedWarehouse = activeWarehouse(notice?.destinationWarehouse);
  const warehouseId = saved.warehouseId || suggestedWarehouse?.id || null;
  const signedAt = waybill?.status === 'SIGNED' ? waybill.signedAt : null;
  const arrivedAt = ['ARRIVED', 'SIGNED'].includes(waybill?.status || '') ? waybill?.arrivedAt : null;

  return {
    warehouseId,
    receivedAt: saved.receivedAt || signedAt || arrivedAt || null,
    receiverName: saved.receiverName,
    receivedAtSource: saved.receivedAtSource || (signedAt ? 'SIGNED' : arrivedAt ? 'ARRIVED' : null),
  };
}
