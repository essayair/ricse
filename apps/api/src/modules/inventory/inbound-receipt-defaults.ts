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
      warehouseId?: string | null;
      destinationWarehouse?: ReceiptWarehouse | null;
      warehouse?: ReceiptWarehouse | null;
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
  const suggestedWarehouse = activeWarehouse(notice?.destinationWarehouse) || activeWarehouse(notice?.warehouse);
  const warehouseId = saved.warehouseId || suggestedWarehouse?.id || null;
  const warehouse = saved.warehouseId ? receipt.warehouse : suggestedWarehouse;
  const destinationWarehouseId = notice?.destinationWarehouseId || notice?.warehouseId;
  const destinationContact = !warehouseId || !destinationWarehouseId || warehouseId === destinationWarehouseId
    ? notice?.destinationContactPerson?.trim() : null;
  const signedAt = waybill?.status === 'SIGNED' ? waybill.signedAt : null;
  const arrivedAt = ['ARRIVED', 'SIGNED'].includes(waybill?.status || '') ? waybill?.arrivedAt : null;

  return {
    warehouseId,
    receivedAt: saved.receivedAt || signedAt || arrivedAt || null,
    receiverName: saved.receiverName || destinationContact || warehouse?.manager?.trim() || null,
    receivedAtSource: saved.receivedAtSource || (signedAt ? 'SIGNED' : arrivedAt ? 'ARRIVED' : null),
  };
}
