type Named = { id: string; name: string };
export type LogisticsCandidateFilters = {
  search: string; from: string; to: string; businessType: string; ownerId: string; carrierId: string;
  businessUnitId: string; contractId: string; orderId: string; selectedOnly: boolean;
};
export const emptyCandidateFilters = (): LogisticsCandidateFilters => ({ search: '', from: '', to: '', businessType: '', ownerId: '', carrierId: '', businessUnitId: '', contractId: '', orderId: '', selectedOnly: false });
export const logisticsSelectionGroup = (row: { payerPartner?: Named | null; businessUnit?: Named | null; carrierPartnerId?: string | null }) =>
  row.payerPartner?.id && row.businessUnit?.id && row.carrierPartnerId ? [row.payerPartner.id, row.businessUnit.id, row.carrierPartnerId].join('|') : null;
export function retainCandidateSelection<T>(rows: Array<{ id: string }>, selected: Record<string, T>): Record<string, T> {
  const ids = new Set(rows.map(row => row.id));
  return Object.fromEntries(Object.entries(selected).filter(([id]) => ids.has(id)));
}
export const emptySettlementFilters = () => ({ search: '', status: '', carrierId: '', payerId: '', businessUnitId: '', from: '', to: '' });
export type LogisticsSettlementFilters = ReturnType<typeof emptySettlementFilters>;

export function logisticsDay(value?: string | null) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) : '';
}
export const logisticsDateError = (from: string, to: string) => from && to && from > to ? '开始日期不能晚于结束日期' : '';
const keywordsMatch = (search: string, values: unknown[]) => {
  const text = values.filter(value => value != null).join(' ').toLocaleLowerCase();
  return search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(term => text.includes(term));
};
export function candidateMatches(row: {
  id: string; waybillNo: string; plateNo?: string | null; materialName?: string; signedAt?: string | null;
  businessType: string; payerPartner?: Named | null; businessUnit?: Named | null; carrierPartnerId?: string | null; carrierName?: string | null;
  originLocation?: string | null; destinationLocation?: string | null;
  tradeContract?: { id: string; contractNo: string; title: string }; order?: { id: string; orderNo: string; name: string };
}, filters: LogisticsCandidateFilters, selected: boolean) {
  const date = logisticsDay(row.signedAt);
  return !logisticsDateError(filters.from, filters.to)
    && (!filters.from || (!!date && date >= filters.from)) && (!filters.to || (!!date && date <= filters.to))
    && (!filters.businessType || row.businessType === filters.businessType)
    && (!filters.ownerId || row.payerPartner?.id === filters.ownerId)
    && (!filters.businessUnitId || row.businessUnit?.id === filters.businessUnitId)
    && (!filters.carrierId || (filters.carrierId === 'UNBOUND' ? !row.carrierPartnerId : row.carrierPartnerId === filters.carrierId))
    && (!filters.contractId || row.tradeContract?.id === filters.contractId)
    && (!filters.orderId || row.order?.id === filters.orderId)
    && (!filters.selectedOnly || selected)
    && keywordsMatch(filters.search, [row.waybillNo, row.plateNo, row.materialName, row.payerPartner?.name, row.carrierName,
      row.businessUnit?.name, row.originLocation, row.destinationLocation, row.tradeContract?.contractNo, row.tradeContract?.title, row.order?.orderNo, row.order?.name]);
}

export function settlementMatches(row: {
  settlementNo: string; status: string; periodStart: string; periodEnd: string;
  carrierPartner?: Named | null; businessUnit?: Named | null; ownerPartner?: Named | null;
  payerPartner?: Named | null; payerCompany?: Named | null; preparer?: { name: string };
  lines: Array<{ materialName?: string | null; ticketNo?: string | null; waybill?: { waybillNo: string; plateNo?: string | null; carrierName?: string | null }; contractPriceTerm?: { contract?: { contractNo?: string; title?: string } } | null }>;
}, filters: LogisticsSettlementFilters) {
  const start = logisticsDay(row.periodStart), end = logisticsDay(row.periodEnd);
  return !logisticsDateError(filters.from, filters.to)
    && (!filters.from || (!!end && end >= filters.from)) && (!filters.to || (!!start && start <= filters.to))
    && (!filters.status || row.status === filters.status)
    && (!filters.carrierId || row.carrierPartner?.id === filters.carrierId)
    && (!filters.payerId || (row.payerPartner?.id || row.payerCompany?.id) === filters.payerId)
    && (!filters.businessUnitId || row.businessUnit?.id === filters.businessUnitId)
    && keywordsMatch(filters.search, [row.settlementNo, row.carrierPartner?.name, row.ownerPartner?.name, row.payerPartner?.name, row.payerCompany?.name, row.businessUnit?.name, row.preparer?.name,
      ...row.lines.flatMap(line => [line.materialName, line.ticketNo, line.waybill?.waybillNo, line.waybill?.plateNo, line.waybill?.carrierName, line.contractPriceTerm?.contract?.contractNo, line.contractPriceTerm?.contract?.title])]);
}
