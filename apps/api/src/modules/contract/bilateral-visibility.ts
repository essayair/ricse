/** 对外输出按方向裁剪；内部计算不能复用已裁剪的视图对象。 */
export function bilateralContractView<T extends Record<string, any>>(contract: T, partnerId?: string | null): T {
  if (!partnerId || contract.type !== 'BILATERAL') return contract;
  const purchase = contract.sellerId === partnerId, sales = contract.buyerId === partnerId;
  const result: Record<string, any> = { ...contract };
  for (const key of ['draftData', 'approvals', 'allowedPermissions']) delete result[key];
  const direction = purchase ? 'PURCHASE' : sales ? 'SALES' : '';
  result.visibleDirection = direction || null;
  result.orders = (contract.orders || []).filter((o: any) => o.type === direction);
  result.attachments = (contract.attachments || []).filter((a: any) => a.category === `${direction}_CONTRACT`);
  result.lineItems = (contract.lineItems || []).map((line: any) => {
    const copy = { ...line };
    if (!purchase) for (const key of ['unitPrice', 'unitPriceExTax', 'totalPrice', 'priceRulesSnapshot']) delete copy[key];
    if (!sales) for (const key of ['salesUnitPrice', 'salesUnitPriceExTax', 'salesTotalPrice', 'salesPriceRulesSnapshot']) delete copy[key];
    return copy;
  });
  if (!purchase) for (const key of ['totalAmount', 'externalNo', 'signedAt', 'paymentMethod', 'prepayPct', 'paymentDays']) delete result[key];
  if (!sales) for (const key of ['salesExternalNo', 'salesSignedAt', 'salesPaymentMethod']) delete result[key];
  if (result.fulfillment) result.fulfillment = { directions: (result.fulfillment.directions || []).filter((d: any) => d.type === direction) };
  return result as T;
}
