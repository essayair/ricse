'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, FileText, FlaskConical, Link2, Plus, Scale, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { openStoredAttachment } from '@/lib/attachment-preview';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Indicator { id: string; name: string; operator: string; standardValue: string | null; upperValue: string | null; fuseValue: string | null; unit: string; measuredValue: string | null; result: string }
interface Attachment { id: string; originalName: string; mimeType: string; size: number; category: string; createdAt: string }
interface Report {
  id: string; inspectionNo: string; status: string; conclusion: string; institutionType: string; institutionName: string;
  reportNo: string; testedAt: string; sampleNo: string | null; sampledAt: string; samplerName: string;
  baseWeight: string | null; moistureDeductionWeight: string; impurityDeductionWeight: string; settlementWeight: string | null;
  deductionAmount: string; remarks: string | null; indicators: Indicator[]; attachments: Attachment[];
  creator: { name: string }; confirmer: { name: string } | null; confirmedAt: string | null;
  weighTicket: { id: string; ticketNo: string; status: string };
}
interface Task {
  id: string; taskNo: string; status: string; plannedReportCount: number; sampledAt: string | null; samplerName: string | null;
  samplingMethod: string | null; finalConclusion: string; finalizedReportCount: number; decisionReason: string | null;
  decisionVersion: number; decidedAt: string | null; createdAt: string; handler: { name: string } | null; decider: { name: string } | null;
  basisInspection: { id: string; inspectionNo: string; institutionName: string; reportNo: string } | null;
  reports: Report[];
  waybill: {
    id: string; waybillNo: string; status: string; plateNo: string | null; driverName: string | null; arrivedAt: string | null;
    lineItems: Array<{ materialName: string | null; quantity: string; unit: string }>;
    weighTickets: Array<{ id: string; ticketNo: string; status: string; weighingStage: string; sequence: number; netWeight: string | null; settlementWeight: string | null }>;
    weightSelections: Array<{ purpose: string; weighTicketId: string; quantity: string }>;
    inboundReceipts: Array<{ id: string; receiptNo: string; status: string; qualityInspectionId: string | null }>;
    dispatchNotice: { type: string; noticeNo: string; warehouse: { name: string } | null; order: { id: string; name: string; orderNo: string; contract: { contractNo: string; title: string; seller: { name: string } | null; buyer: { name: string } | null; signingPartner: { name: string } | null } } };
  };
}

const TASK_STATUS: Record<string, string> = { PENDING_SAMPLING: '待取样', INSPECTING: '检测中', PENDING_DECISION: '待综合判定', COMPLETED: '已完成', RECHECK_REQUIRED: '待复判', VOIDED: '已作废' };
const REPORT_STATUS: Record<string, string> = { DRAFT: '草稿', TESTING: '化验中', REPORTED: '已出报告', CONFIRMED: '已确认', VOIDED: '已作废' };
const CONCLUSION: Record<string, string> = { PENDING: '待判定', PASS: '合格', DEDUCTION: '超标扣款', FUSE: '熔断' };
const INSTITUTION: Record<string, string> = { OUR: '我方', PARTNER: '合作方', THIRD_PARTY: '第三方', OTHER: '其他' };
const OPERATOR: Record<string, string> = { GTE: '≥', LTE: '≤', EQ: '=', RANGE: '范围' };

export default function QualityTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Task | null>(null);
  const [basisInspectionId, setBasisInspectionId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const task = await api.get<Task>(`/quality-tasks/${id}`);
      setItem(task);
      if (task.basisInspection?.id) setBasisInspectionId(task.basisInspection.id);
    } catch (error: any) { alert(error.message || '到货质检任务加载失败'); router.push('/dashboard/quality'); }
  }, [id, router]);
  useEffect(() => { void load(); }, [load]);

  const confirmed = useMemo(() => item?.reports.filter(report => report.status === 'CONFIRMED') || [], [item]);
  const selectedBasis = confirmed.find(report => report.id === basisInspectionId);
  const eligibleTicket = item?.waybill.weighTickets.find(ticket => ['COMPLETED', 'REVIEWED'].includes(ticket.status));

  const confirmReport = async (report: Report) => {
    let resolution: string | undefined;
    if (report.conclusion === 'FUSE') {
      resolution = prompt('该报告触发熔断，请填写处理方案')?.trim();
      if (!resolution) return;
    }
    if (!confirm(`确认检测机构【${report.institutionName}】的报告 ${report.reportNo} 有效？`)) return;
    setSaving(true);
    try { await api.patch(`/quality-inspections/${report.id}/status`, { status: 'CONFIRMED', resolution }); await load(); }
    catch (error: any) { alert(error.message || '检测报告确认失败'); }
    finally { setSaving(false); }
  };

  const finalize = async () => {
    if (!item || !selectedBasis) return alert('请先选择一份已确认报告作为执行口径');
    const partial = confirmed.length < item.plannedReportCount;
    if (partial && !reason.trim()) return alert('有效报告少于计划数量，请填写提前判定原因');
    let message = `本次将依据 ${confirmed.length} 份有效检测报告形成最终结论“${CONCLUSION[selectedBasis.conclusion]}”，并以【${selectedBasis.institutionName} / ${selectedBasis.reportNo}】作为入库和结算执行口径。确认后将影响后续业务，是否继续？`;
    if (confirmed.length === 1) message = `当前仅有 1 份有效检测报告。确认后，该报告将单独作为本到货批次最终质检依据并影响入库及结算。请确认已核实合同约定、报告真实性和业务风险。是否继续？`;
    if (selectedBasis.conclusion === 'FUSE') message = `本次最终判定为“熔断”。确认后将阻止货物入库并触发异常处置，请再次核对检测报告。是否继续？`;
    if (!confirm(message)) return;
    setSaving(true);
    try {
      await api.patch(`/quality-tasks/${item.id}/finalize`, { conclusion: selectedBasis.conclusion, basisInspectionId: selectedBasis.id, reason: reason.trim() || undefined });
      await load();
    } catch (error: any) { alert(error.message || '最终质检结论确认失败'); }
    finally { setSaving(false); }
  };

  const uploadReportAttachment = async (reportId: string, files: FileList | null) => {
    if (!files?.length) return;
    setSaving(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData(); body.append('file', file); body.append('category', 'REPORT');
        await api.upload(`/quality-inspections/${reportId}/attachments`, body);
      }
      await load();
    } catch (error: any) { alert(error.message || '检测报告附件上传失败'); }
    finally { setSaving(false); }
  };

  const viewAttachment = async (attachmentId: string) => {
    try { await openStoredAttachment(`/quality-inspections/attachments/${attachmentId}/view-url`); }
    catch (error: any) { alert(error.message || '附件打开失败'); }
  };

  if (!item) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;
  const materialNames = item.waybill.lineItems.map(line => line.materialName).filter(Boolean).join('、') || '-';
  const businessParty = item.waybill.dispatchNotice.type === 'PURCHASE' ? item.waybill.dispatchNotice.order.contract.seller?.name : item.waybill.dispatchNotice.order.contract.buyer?.name;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/quality')}><ArrowLeft className="h-4 w-4" /></Button><div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{item.taskNo}</h1><Badge variant="outline">{TASK_STATUS[item.status] || item.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{materialNames} · {item.waybill.plateNo || '无车牌'} · {item.reports.length} 份机构检测报告</p></div></div>
      <Button disabled={!eligibleTicket || item.status === 'VOIDED'} onClick={() => router.push(`/dashboard/quality/create?taskId=${item.id}&weighTicketId=${eligibleTicket?.id || ''}`)}><Plus className="mr-1 h-4 w-4" />追加检测报告</Button>
    </div>

    <Card className={`flex items-start gap-4 border-l-4 p-5 ${item.finalConclusion === 'FUSE' ? 'border-l-destructive bg-destructive/5' : item.finalConclusion === 'PASS' ? 'border-l-primary bg-primary/5' : 'border-l-amber-500 bg-amber-50/50'}`}>
      {item.finalConclusion === 'PASS' ? <CheckCircle2 className="mt-1 h-7 w-7 text-primary" /> : <AlertTriangle className="mt-1 h-7 w-7 text-amber-600" />}
      <div><div className="text-lg font-semibold">最终质检结论：{CONCLUSION[item.finalConclusion]}</div><div className="mt-1 text-sm text-muted-foreground">{item.status === 'COMPLETED' ? `已归集 ${item.finalizedReportCount} 份有效报告，判定版本 V${item.decisionVersion}。` : `计划 ${item.plannedReportCount} 份，当前已录入 ${item.reports.length} 份、已确认 ${confirmed.length} 份。至少一份有效报告即可发起最终判定。`}</div></div>
    </Card>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5"><Title>到货与任务信息</Title><div className="grid gap-4 sm:grid-cols-2"><Info label="物流运单" value={item.waybill.waybillNo} /><Info label="到货时间" value={formatDateTimeToSecond(item.waybill.arrivedAt)} /><Info label="车牌号" value={item.waybill.plateNo || '-'} /><Info label="业务单位" value={businessParty || '-'} /><Info label="物料" value={materialNames} /><Info label="目标仓库" value={item.waybill.dispatchNotice.warehouse?.name || '-'} /><Info label="取样人" value={item.samplerName || '待处理'} /><Info label="取样时间" value={formatDateTimeToSecond(item.sampledAt)} /><Info label="取样方法" value={item.samplingMethod || '-'} /><Info label="当前处理人" value={item.handler?.name || '质检管理人员均可处理'} /></div></Card>
      <Card className="p-5"><Title>上游关联单据</Title><div className="grid gap-4 sm:grid-cols-2"><BusinessLink label="合同" value={`${item.waybill.dispatchNotice.order.contract.contractNo} · ${item.waybill.dispatchNotice.order.contract.title}`} /><BusinessLink label="执行批次" value={`${item.waybill.dispatchNotice.order.name} · ${item.waybill.dispatchNotice.order.orderNo}`} href={`/dashboard/orders/${item.waybill.dispatchNotice.order.id}`} /><BusinessLink label="物流运单" value={item.waybill.waybillNo} href={`/dashboard/waybills/${item.waybill.id}`} /><Info label="磅单进度" value={`${item.waybill.weighTickets.length} 张，已复核 ${item.waybill.weighTickets.filter(ticket => ticket.status === 'REVIEWED').length} 张`} /></div>{item.waybill.inboundReceipts[0] && <Button className="mt-5" variant="outline" onClick={() => router.push(`/dashboard/inbound/${item.waybill.inboundReceipts[0].id}`)}>查看入库作业单 {item.waybill.inboundReceipts[0].receiptNo}</Button>}</Card>
    </div>

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="font-semibold">机构检测报告</h2><p className="mt-1 text-xs text-muted-foreground">每份报告对应一个样品和一家检测机构，可继续追加。</p></div><Badge variant="secondary">{item.reports.length} / 计划 {item.plannedReportCount}</Badge></div>
      {!item.reports.length ? <div className="border-t p-12 text-center text-muted-foreground"><FlaskConical className="mx-auto mb-2 h-8 w-8 opacity-40" />尚未录入检测报告<br /><span className="text-xs">完成磅单称重后可从右上角追加第一份报告。</span></div> : <div className="space-y-5 border-t p-5">{item.reports.map((report, index) => {
        const editable = !['CONFIRMED', 'VOIDED'].includes(report.status);
        return <Card key={report.id} className={`overflow-hidden ${report.id === basisInspectionId ? 'ring-2 ring-primary/30' : ''}`}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 p-4"><div className="flex items-start gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{index + 1}</div><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{report.institutionName}</span><Badge variant="outline">{INSTITUTION[report.institutionType] || report.institutionType}</Badge><Badge variant={report.conclusion === 'FUSE' ? 'destructive' : report.conclusion === 'PASS' ? 'default' : 'secondary'}>{CONCLUSION[report.conclusion]}</Badge></div><div className="mt-1 font-mono text-xs text-muted-foreground">{report.inspectionNo} · 报告 {report.reportNo} · 样品 {report.sampleNo || '-'}</div></div></div><div className="flex items-center gap-2"><Badge variant="secondary">{REPORT_STATUS[report.status]}</Badge>{report.status === 'REPORTED' && <Button size="sm" disabled={saving} onClick={() => void confirmReport(report)}>确认报告有效</Button>}</div></div>
          <div className="grid gap-5 p-4 lg:grid-cols-[1.5fr_1fr]">
            <div><div className="grid gap-3 sm:grid-cols-4"><Info label="检测时间" value={formatDateTimeToSecond(report.testedAt)} /><Info label="取样人" value={report.samplerName} /><Info label="关联磅单" value={report.weighTicket.ticketNo} /><Info label="录入人" value={report.creator.name} /></div><div className="mt-4 overflow-x-auto"><table className="min-w-[640px] w-full text-sm"><thead className="border-y bg-muted/40 text-left text-muted-foreground"><tr><th className="px-3 py-2">指标</th><th className="px-3 py-2">标准</th><th className="px-3 py-2">检测值</th><th className="px-3 py-2">判定</th></tr></thead><tbody>{report.indicators.map(indicator => <tr key={indicator.id} className="border-b"><td className="px-3 py-2 font-medium">{indicator.name}</td><td className="px-3 py-2">{qualityStandard(indicator)}</td><td className="px-3 py-2 text-primary">{measure(indicator.measuredValue, indicator.unit)}</td><td className="px-3 py-2">{indicator.result === 'PASS' ? '合格' : indicator.result === 'FAIL' ? '超标' : indicator.result === 'FUSE' ? '熔断' : '待判定'}</td></tr>)}</tbody></table></div></div>
            <div className="space-y-3"><div className="flex items-center justify-between"><span className="text-sm font-medium">检测报告附件</span>{editable && <label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-2 text-xs text-primary"><input type="file" multiple className="hidden" accept=".jpg,.jpeg,.png,.webp,.pdf" disabled={saving} onChange={event => { void uploadReportAttachment(report.id, event.currentTarget.files); event.currentTarget.value = ''; }} /><Upload className="mr-1 h-3.5 w-3.5" />上传</label>}</div>{report.attachments.length ? report.attachments.map(attachment => <button key={attachment.id} className="flex w-full items-center gap-2 rounded-md border p-2 text-left hover:bg-muted" onClick={() => void viewAttachment(attachment.id)}><FileText className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1 truncate text-sm">{attachment.originalName}</span><Eye className="h-4 w-4 text-muted-foreground" /></button>) : <div className="rounded-md border border-dashed p-5 text-center text-xs text-muted-foreground">暂无检测报告附件</div>}<div className="rounded-md bg-muted/40 p-3 text-xs"><div className="flex justify-between"><span>基准重量</span><b>{weight(report.baseWeight)}</b></div><div className="mt-2 flex justify-between"><span>质检后重量</span><b>{weight(report.settlementWeight)}</b></div><div className="mt-2 flex justify-between"><span>预计扣款</span><b>¥{Number(report.deductionAmount).toLocaleString()}</b></div></div></div>
          </div>
        </Card>;
      })}</div>}
    </Card>

    {confirmed.length > 0 && item.status !== 'VOIDED' && <Card className="space-y-4 p-5"><div><h2 className="font-semibold">形成最终质检结论</h2><p className="mt-1 text-sm text-muted-foreground">选择一份已确认报告作为入库、扣重和结算执行口径；系统同时留存本次参与判定的全部有效报告。</p></div><div className="grid gap-2">{confirmed.map(report => <label key={report.id} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 ${basisInspectionId === report.id ? 'border-primary bg-primary/5' : ''}`}><input type="radio" name="basis" checked={basisInspectionId === report.id} onChange={() => setBasisInspectionId(report.id)} /><div className="min-w-0 flex-1"><div className="font-medium">{report.institutionName} · {report.reportNo}</div><div className="text-xs text-muted-foreground">{report.inspectionNo} · {CONCLUSION[report.conclusion]} · 质检后重量 {weight(report.settlementWeight)}</div></div></label>)}</div>{confirmed.length < item.plannedReportCount && <div><label className="mb-1 block text-sm font-medium">提前判定原因 *</label><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={reason} onChange={event => setReason(event.target.value)} placeholder={`计划 ${item.plannedReportCount} 份，当前仅有 ${confirmed.length} 份有效报告，请填写采用现有报告判定的原因`} /></div>}<div className="flex justify-end"><Button disabled={saving || !basisInspectionId} onClick={() => void finalize()}>{item.status === 'COMPLETED' ? '重新形成结论' : '确认形成最终结论'}</Button></div></Card>}

    {item.decidedAt && <Card className="p-5"><Title>最终判定记录</Title><div className="grid gap-4 sm:grid-cols-4"><Info label="最终结论" value={CONCLUSION[item.finalConclusion]} /><Info label="执行口径报告" value={item.basisInspection ? `${item.basisInspection.institutionName} · ${item.basisInspection.reportNo}` : '-'} /><Info label="判定人 / 时间" value={`${item.decider?.name || '-'} · ${formatDateTimeToSecond(item.decidedAt)}`} /><Info label="判定原因" value={item.decisionReason || '-'} /></div></Card>}
  </div>;
}

function Title({ children }: { children: React.ReactNode }) { return <h2 className="mb-4 flex items-center gap-2 font-semibold"><FlaskConical className="h-4 w-4 text-primary" />{children}</h2>; }
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 break-words text-sm font-medium">{value}</div></div>; }
function BusinessLink({ label, value, href }: { label: string; value: string; href?: string }) { const content = <><Link2 className="h-3.5 w-3.5" /><span className="truncate">{value}</span></>; return <div><div className="text-xs text-muted-foreground">{label}</div>{href ? <a className="mt-1 flex items-center gap-1 text-sm text-primary hover:underline" href={href}>{content}</a> : <div className="mt-1 flex items-center gap-1 text-sm">{content}</div>}</div>; }
function number(value: string | number | null) { return value === null ? '-' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 4 }); }
function weight(value: string | null) { return value === null ? '-' : `${number(value)} 吨`; }
function measure(value: string | null, unit: string) { return value === null ? '-' : `${number(value)} ${unit}`; }
function qualityStandard(item: Indicator) { if (item.standardValue === null) return '-'; return item.operator === 'RANGE' ? `${number(item.standardValue)}—${number(item.upperValue)} ${item.unit}` : `${OPERATOR[item.operator]} ${number(item.standardValue)} ${item.unit}`; }
