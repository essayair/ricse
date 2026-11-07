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

type FreightWeightRow = { id: string; tickets: FreightWeightTicket[] };
type FreightWeightLine = { ticketId: string; weightBasis: 'TICKET' | 'CONFIRMED'; confirmedWeight: string; weightReason: string };

/** 表头状态反映实际已选行；手工重量、混用两侧或失效磅单不误标为统一口径。 */
export function freightWeightSelectionStage(rows: FreightWeightRow[], selected: Record<string, FreightWeightLine>) {
  const stages = rows.filter(row => selected[row.id]).map(row => {
    const line = selected[row.id];
    if (line.weightBasis === 'CONFIRMED') return 'MIXED';
    const ticket = row.tickets.find(ticket => ticket.id === line.ticketId && Number(ticket.netWeight) > 0 && Number.isFinite(Number(ticket.netWeight)));
    return ticket?.weighingStage || 'MIXED';
  });
  if (!stages.length) return '';
  const unique = new Set(stages);
  return unique.size === 1 && ['SHIPPING', 'RECEIVING'].includes(stages[0]) ? stages[0] : 'MIXED';
}

/** 仅切换范围内的已选运单；目标侧缺失保留原选项，不伪造统一成功。 */
export function switchFreightWeightStage<T extends FreightWeightLine>(rows: FreightWeightRow[], selected: Record<string, T>, stage: 'SHIPPING' | 'RECEIVING', reason = '') {
  const lines = { ...selected }, switched: string[] = [], missing: string[] = [];
  for (const row of rows) {
    const line = selected[row.id];
    if (!line) continue;
    const choices = freightWeightChoices(row.tickets, line.ticketId);
    const ticket = stage === 'SHIPPING' ? choices.shipping : choices.receiving;
    if (!ticket) { missing.push(row.id); continue; }
    lines[row.id] = { ...line, ticketId: ticket.id, weightBasis: 'TICKET', confirmedWeight: '', weightReason: line.weightBasis !== 'CONFIRMED' && line.weightReason.trim() ? line.weightReason : reason };
    switched.push(row.id);
  }
  return { lines, switched, missing };
}
