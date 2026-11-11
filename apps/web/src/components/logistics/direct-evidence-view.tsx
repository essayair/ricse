export interface DirectEvidenceSides {
  version: number;
  shipping: EvidenceSide;
  receiving: EvidenceSide;
  weightVariance: string | null;
}
interface EvidenceSide {
  selectionRequired: boolean;
  ticket: { ticketNo: string; netWeight: string; grossWeight: string | null; tareWeight: string | null } | null;
  reports: Array<{ id: string; reportNo: string; institutionName: string | null; gradePct: number | null; moisturePct: number | null; finalAdopted: boolean }>;
}

export function DirectEvidenceView({ value }: { value?: DirectEvidenceSides }) {
  if (!value) return <p className="text-xs text-muted-foreground">历史版本未保存双侧对照快照，不以当前数据补写历史。</p>;
  return <div className="space-y-3"><div className="grid gap-3 md:grid-cols-2">{(['shipping', 'receiving'] as const).map(key => {
    const side = value[key];
    return <div key={key} className="space-y-2 rounded-md border p-3 text-sm"><h3 className="font-medium">{key === 'shipping' ? '发货侧快照' : '收货侧快照'}</h3>
      {side.ticket ? <p>{side.ticket.ticketNo} · 净重 {side.ticket.netWeight} 吨</p> : <p className="text-muted-foreground">{side.selectionRequired ? '同侧多张，尚未采信' : '未提供采信磅单'}</p>}
      {side.reports.length ? side.reports.map(report => <div key={report.id} className="text-xs"><p>{report.reportNo}{report.finalAdopted ? ' · 最终采用' : ''}</p><p className="mt-1 text-muted-foreground">{report.institutionName || '-'} · CaF₂ {report.gradePct == null ? '-' : `${report.gradePct}%`} · 水分 {report.moisturePct == null ? '-' : `${report.moisturePct}%`}</p></div>) : <p className="text-xs text-muted-foreground">未提供有效报告</p>}
    </div>;
  })}</div>{value.weightVariance != null && <p className={`text-sm ${Number(value.weightVariance) !== 0 ? 'text-warning' : 'text-muted-foreground'}`}>两侧净重差异（收货－发货）：{Number(value.weightVariance) > 0 ? '+' : ''}{value.weightVariance} 吨</p>}</div>;
}
