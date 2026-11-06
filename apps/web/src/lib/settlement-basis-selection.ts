interface BasisSource {
  id: string; reportId?: string; defaultReportId?: string; inventoryReportId?: string;
  availableQualityReports?: Array<{ id: string; evidenceStage: string }>;
  availableWeighTickets?: Array<{ id: string; weighingStage: string }>;
}
type Choices = Record<string, { qualityReportId?: string; weighTicketId?: string }>;

export function selectedSettlementReportId(source: BasisSource, reportId?: string) {
  return reportId || source.reportId || source.defaultReportId || source.inventoryReportId || '';
}

/** 只从当前筛选下已选车辆的实际依据推导状态，不把批量操作意图当作成功结果。 */
export function batchReportSelection(sources: BasisSource[], choices: Choices, preferredMode = '') {
  const rows = sources.filter(source => choices[source.id]);
  if (!rows.length) return '';
  const reports = rows.map(source => source.availableQualityReports?.find(report => report.id === selectedSettlementReportId(source, choices[source.id].qualityReportId)));
  if (reports.every(report => !report)) return 'MISSING';
  if (reports.some(report => !report)) return 'MIXED';
  const defaults = rows.every((source, index) => reports[index]!.id === (source.defaultReportId || source.inventoryReportId || source.reportId));
  if (preferredMode === 'DEFAULT' && defaults) return 'DEFAULT';
  if (preferredMode.startsWith('REPORT:') && reports.every(report => report!.id === preferredMode.slice(7))) return preferredMode;
  if (reports.every(report => report!.evidenceStage === 'SHIPPING')) return 'SHIPPING';
  if (reports.every(report => report!.evidenceStage === 'RECEIVING')) return 'RECEIVING';
  if (defaults) return 'DEFAULT';
  if (reports.every(report => report!.id === reports[0]!.id)) return `REPORT:${reports[0]!.id}`;
  return 'MIXED';
}

export function batchWeighSelection(sources: BasisSource[], choices: Choices) {
  const rows = sources.filter(source => choices[source.id]);
  if (!rows.length) return '';
  const stages = rows.map(source => source.availableWeighTickets?.find(ticket => ticket.id === choices[source.id].weighTicketId)?.weighingStage);
  if (stages.every(stage => stage === 'SHIPPING')) return 'SHIPPING';
  if (stages.every(stage => stage === 'RECEIVING')) return 'RECEIVING';
  return 'MIXED';
}
