interface FreightWeightTicket {
  id: string;
  weighingStage: string;
  netWeight: string | number | null;
}

/** 仅比较有效实测净重；缺失、无效或相等时不突出某一方。 */
export function lowerFreightWeightStage(shippingWeight: unknown, receivingWeight: unknown) {
  const shipping = Number(shippingWeight), receiving = Number(receivingWeight);
  if (!Number.isFinite(shipping) || !Number.isFinite(receiving) || shipping <= 0 || receiving <= 0 || shipping === receiving) return null;
  return shipping < receiving ? 'SHIPPING' : 'RECEIVING';
}

/** 新建运费结算默认收货；仅有一张有效磅单时选该张，不自动选较低值。 */
export function freightWeightChoices<T extends FreightWeightTicket>(tickets: T[], selectedId?: string) {
  const valid = tickets.filter(ticket => Number.isFinite(Number(ticket.netWeight)) && Number(ticket.netWeight) > 0);
  const selected = valid.find(ticket => ticket.id === selectedId);
  const firstShipping = valid.find(ticket => ticket.weighingStage === 'SHIPPING');
  const firstReceiving = valid.find(ticket => ticket.weighingStage === 'RECEIVING');
  const shipping = selected?.weighingStage === 'SHIPPING' ? selected : firstShipping;
  const receiving = selected?.weighingStage === 'RECEIVING' ? selected : firstReceiving;
  return {
    shipping, receiving,
    defaultTicketId: firstReceiving?.id || firstShipping?.id || valid[0]?.id || '',
    lowerStage: lowerFreightWeightStage(shipping?.netWeight, receiving?.netWeight),
  };
}
