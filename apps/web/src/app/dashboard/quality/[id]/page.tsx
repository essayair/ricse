'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, FileText, FlaskConical, Link2, Pencil, Plus, Scale, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { openStoredAttachment } from '@/lib/attachment-preview';
import { formatDateTimeToSecond, toLocalDateTimeInput } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BusinessOperationHistory } from '@/components/business-operation-history';
import { StatusText } from '@/components/status-text';

interface Indicator { id: string; name: string; operator: string; standardValue: string | null; upperValue: string | null; fuseValue: string | null; unit: string; measuredValue: string | null; result: string }
interface Attachment { id: string; originalName: string; mimeType: string; size: number; category: string; sourceType?: string | null; evidenceNode?: string | null; capturedAt?: string | null; watermarkText?: string | null; createdAt: string; uploader?: { name: string } | null }
interface Report {
  id: string; inspectionNo: string; status: string; conclusion: string; institutionType: string; institutionName: string;
  reportNo: string; testedAt: string; sampleNo: string | null; sampledAt: string; samplerName: string;
  baseWeight: string | null; moistureDeductionWeight: string; impurityDeductionWeight: string; settlementWeight: string | null;
  deductionAmount: string; remarks: string | null; indicators: Indicator[]; attachments: Attachment[];
  creator: { name: string }; confirmer: { name: string } | null; confirmedAt: string | null;
  weighTicket: { id: string; ticketNo: string; status: string };
  qualitySample?: { id: string; sampleNo: string; sampleLabel: string | null } | null;
}
interface Sample {
  id: string; sampleNo: string; sampleLabel: string | null; sampledAt: string; samplerName: string;
  samplingMethod: string | null; sealNo: string | null; destinationInstitutionName: string | null;
  sentAt: string | null; remarks: string | null; status: string; attachments: Attachment[];
  creator: { name: string }; reports: Array<{ id: string; inspectionNo: string; reportNo: string; institutionName: string; status: string }>;
}
interface Task {
  id: string; taskNo: string; status: string; plannedReportCount: number; sampledAt: string | null; samplerName: string | null;
  samplingMethod: string | null; finalConclusion: string; finalizedReportCount: number; decisionReason: string | null;
  decisionVersion: number; decidedAt: string | null; createdAt: string; handler: { name: string } | null; decider: { name: string } | null;
  qualityTemplate: { id: string; code: string; name: string; version: number } | null; attachments: Attachment[]; samples: Sample[];
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

const TASK_STATUS: Record<string, string> = { PENDING_SAMPLING: '待取样', PENDING_SENDING: '待送检', INSPECTING: '检测中', PENDING_DECISION: '待综合判定', COMPLETED: '已完成', RECHECK_REQUIRED: '待复判', EXCEPTION: '异常处理中', VOIDED: '已作废' };
const REPORT_STATUS: Record<string, string> = { DRAFT: '草稿', TESTING: '化验中', REPORTED: '已出报告', CONFIRMED: '已确认', VOIDED: '已作废' };
const CONCLUSION: Record<string, string> = { PENDING: '待判定', PASS: '合格', DEDUCTION: '超标扣款', FUSE: '不合格（拒收）' };
const INSTITUTION: Record<string, string> = { OUR: '我方', PARTNER: '合作方', THIRD_PARTY: '第三方', OTHER: '其他' };
const OPERATOR: Record<string, string> = { GTE: '≥', LTE: '≤', EQ: '=', RANGE: '范围' };
const EVIDENCE_CATEGORY: Record<string, string> = { SAMPLING_PHOTO: '取样照片', MIXING_PHOTO: '混样照片', SPLITTING_PHOTO: '分样照片', SEALING_PHOTO: '封样照片', OTHER: '其他影像' };
const EVIDENCE_SOURCE: Record<string, string> = { WEB_UPLOAD: '电脑上传', RICSE_IMPORT: '系统导入', THIRD_PARTY_WATERMARK: '第三方水印相机', EXTERNAL: '外部影像', MINI_PROGRAM_CAPTURE: '小程序现场拍摄' };

export default function QualityTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Task | null>(null);
  const [basisInspectionId, setBasisInspectionId] = useState('');
  const [reason, setReason] = useState('');
  const [sampledAt, setSampledAt] = useState('');
  const [samplerName, setSamplerName] = useState('');
  const [samplingMethod, setSamplingMethod] = useState('多点混合取样');
  const [sampleNo, setSampleNo] = useState('');
  const [sampleLabel, setSampleLabel] = useState('');
  const [sealNo, setSealNo] = useState('');
  const [destinationInstitutionName, setDestinationInstitutionName] = useState('');
  const [sentAt, setSentAt] = useState('');
  const [sampleRemarks, setSampleRemarks] = useState('');
  const [editingSampleId, setEditingSampleId] = useState('');
  const [plannedReportCount, setPlannedReportCount] = useState('1');
  const [evidenceCategory, setEvidenceCategory] = useState('SAMPLING_PHOTO');
  const [evidenceSource, setEvidenceSource] = useState('WEB_UPLOAD');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const task = await api.get<Task>(`/quality-tasks/${id}`);
      setItem(task);
      if (task.basisInspection?.id) setBasisInspectionId(task.basisInspection.id);
      setSampledAt(toLocalDateTimeInput(task.sampledAt ? new Date(task.sampledAt) : new Date()));
      setSamplerName(task.samplerName || task.handler?.name || '');
      setSamplingMethod(task.samplingMethod || '多点混合取样');
      setPlannedReportCount(String(task.plannedReportCount || 1));
    } catch (error: any) { alert(error.message || '质检任务加载失败'); router.push('/dashboard/quality'); }
  }, [id, router]);
  useEffect(() => { void load(); }, [load]);

  const confirmed = useMemo(() => item?.reports.filter(report => report.status === 'CONFIRMED') || [], [item]);
  const selectedBasis = confirmed.find(report => report.id === basisInspectionId);
  const needsDecisionReason = Boolean(item) && (
    confirmed.length === 1 || confirmed.length < (item?.plannedReportCount || 1)
  );
  const eligibleTicket = useMemo(() => {
    if (!item) return undefined;
    const tickets = item.waybill.weighTickets.filter(ticket => ['COMPLETED', 'REVIEWED'].includes(ticket.status));
    const currentTicketId = item.waybill.weightSelections.find(selection => selection.purpose === 'INVENTORY')?.weighTicketId
      || item.waybill.weightSelections.find(selection => selection.purpose === 'SETTLEMENT')?.weighTicketId;
    return tickets.find(ticket => ticket.id === currentTicketId)
      || tickets.find(ticket => ticket.status === 'REVIEWED' && ticket.weighingStage === 'SHIPPING')
      || tickets.find(ticket => ticket.status === 'REVIEWED')
      || tickets.find(ticket => ticket.weighingStage === 'SHIPPING')
      || tickets[0];
  }, [item]);

  const confirmReport = async (report: Report) => {
    let resolution: string | undefined;
    if (report.conclusion === 'FUSE') {
      resolution = prompt('该报告判定为不合格（拒收），请填写处理方案')?.trim();
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
    if (needsDecisionReason && !reason.trim()) {
      document.getElementById('quality-decision-reason')?.focus();
      return alert(confirmed.length === 1
        ? '当前仅有一份有效检测报告，请先填写采用单一报告形成结论的原因'
        : '有效报告少于计划数量，请先填写提前判定原因');
    }
    let message = `本次将依据 ${confirmed.length} 份有效检测报告形成最终结论“${CONCLUSION[selectedBasis.conclusion]}”，并以【${selectedBasis.institutionName} / ${selectedBasis.reportNo}】作为入库和结算执行口径。确认后将影响后续业务，是否继续？`;
    if (confirmed.length === 1) message = `当前仅有 1 份有效检测报告。确认后，该报告将单独作为本到货批次最终质检依据并影响入库及结算。请确认已核实合同约定、报告真实性和业务风险。是否继续？`;
    if (selectedBasis.conclusion === 'FUSE') message = `本次最终判定为“不合格（拒收）”。确认后将禁止货物入库并进入异常处理，请再次核对检测报告。是否继续？`;
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

  const deleteReportAttachment = async (attachment: Attachment) => {
    if (!confirm(`确认删除附件“${attachment.originalName}”？`)) return;
    setSaving(true);
    try { await api.delete(`/quality-inspections/attachments/${attachment.id}`); await load(); }
    catch (error: any) { alert(error.message || '检测报告附件删除失败'); }
    finally { setSaving(false); }
  };

  const voidReport = async (report: Report) => {
    if (!confirm(`确认作废检测报告 ${report.reportNo}？原报告会保留用于追溯，可重新添加正确报告。`)) return;
    setSaving(true);
    try { await api.patch(`/quality-inspections/${report.id}/status`, { status: 'VOIDED' }); await load(); }
    catch (error: any) { alert(error.message || '检测报告作废失败'); }
    finally { setSaving(false); }
  };

  const resetSampleForm = () => {
    setEditingSampleId(''); setSampleNo(''); setSampleLabel(''); setSealNo('');
    setDestinationInstitutionName(''); setSentAt(''); setSampleRemarks('');
    setSampledAt(toLocalDateTimeInput());
  };

  const editSample = (sample: Sample) => {
    setEditingSampleId(sample.id); setSampleNo(sample.sampleNo); setSampleLabel(sample.sampleLabel || '');
    setSampledAt(toLocalDateTimeInput(new Date(sample.sampledAt))); setSamplerName(sample.samplerName);
    setSamplingMethod(sample.samplingMethod || ''); setSealNo(sample.sealNo || '');
    setDestinationInstitutionName(sample.destinationInstitutionName || '');
    setSentAt(sample.sentAt ? toLocalDateTimeInput(new Date(sample.sentAt)) : ''); setSampleRemarks(sample.remarks || '');
  };

  const saveSample = async () => {
    if (!sampledAt || !samplerName.trim()) return alert('请填写取样时间和取样人');
    setSaving(true);
    try {
      const payload = {
        sampleNo: sampleNo.trim() || undefined, sampleLabel: sampleLabel.trim() || undefined,
        sampledAt, samplerName: samplerName.trim(), samplingMethod: samplingMethod.trim() || undefined,
        sealNo: sealNo.trim() || undefined, destinationInstitutionName: destinationInstitutionName.trim() || undefined,
        sentAt: sentAt || undefined, remarks: sampleRemarks.trim() || undefined,
        status: sentAt ? 'SENT' : 'SAMPLED',
        plannedReportCount: Math.max(1, Number(plannedReportCount) || 1),
      };
      if (editingSampleId) await api.patch(`/quality-tasks/samples/${editingSampleId}`, payload);
      else await api.post(`/quality-tasks/${id}/samples`, payload);
      resetSampleForm(); await load();
    } catch (error: any) { alert(error.message || '样品登记保存失败'); }
    finally { setSaving(false); }
  };

  const deleteSample = async (sample: Sample) => {
    if (!confirm(`确认删除样品“${sample.sampleNo}”？已关联有效检测报告的样品不能删除。`)) return;
    setSaving(true);
    try { await api.delete(`/quality-tasks/samples/${sample.id}`); await load(); }
    catch (error: any) { alert(error.message || '样品删除失败'); }
    finally { setSaving(false); }
  };

  const uploadTaskEvidence = async (files: FileList | null) => {
    if (!files?.length) return;
    setSaving(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append('file', file); body.append('category', evidenceCategory); body.append('sourceType', evidenceSource);
        body.append('evidenceNode', EVIDENCE_CATEGORY[evidenceCategory] || evidenceCategory);
        body.append('capturedAt', new Date().toISOString());
        await api.upload(`/quality-tasks/${id}/attachments`, body);
      }
      await load();
    } catch (error: any) { alert(error.message || '现场影像上传失败'); }
    finally { setSaving(false); }
  };

  const viewTaskAttachment = async (attachmentId: string) => {
    try { await openStoredAttachment(`/quality-tasks/attachments/${attachmentId}/view-url`); }
    catch (error: any) { alert(error.message || '现场影像打开失败'); }
  };

  const deleteTaskAttachment = async (attachment: Attachment) => {
    if (!confirm(`确认删除现场影像“${attachment.originalName}”？`)) return;
    setSaving(true);
    try { await api.delete(`/quality-tasks/attachments/${attachment.id}`); await load(); }
    catch (error: any) { alert(error.message || '现场影像删除失败'); }
    finally { setSaving(false); }
  };

  const uploadSampleEvidence = async (sampleId: string, files: FileList | null) => {
    if (!files?.length) return;
    setSaving(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData(); body.append('file', file); body.append('category', evidenceCategory);
        body.append('sourceType', evidenceSource); body.append('evidenceNode', EVIDENCE_CATEGORY[evidenceCategory] || evidenceCategory);
        body.append('capturedAt', new Date().toISOString());
        await api.upload(`/quality-tasks/samples/${sampleId}/attachments`, body);
      }
      await load();
    } catch (error: any) { alert(error.message || '样品影像上传失败'); }
    finally { setSaving(false); }
  };

  const viewSampleAttachment = async (attachmentId: string) => {
    try { await openStoredAttachment(`/quality-tasks/sample-attachments/${attachmentId}/view-url`); }
    catch (error: any) { alert(error.message || '样品影像打开失败'); }
  };

  const deleteSampleAttachment = async (attachment: Attachment) => {
    if (!confirm(`确认删除样品影像“${attachment.originalName}”？`)) return;
    setSaving(true);
    try { await api.delete(`/quality-tasks/sample-attachments/${attachment.id}`); await load(); }
    catch (error: any) { alert(error.message || '样品影像删除失败'); }
    finally { setSaving(false); }
  };

  if (!item) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;
  const materialNames = item.waybill.lineItems.map(line => line.materialName).filter(Boolean).join('、') || '-';
  const businessParty = item.waybill.dispatchNotice.type === 'PURCHASE' ? item.waybill.dispatchNotice.order.contract.seller?.name : item.waybill.dispatchNotice.order.contract.buyer?.name;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/quality')}><ArrowLeft className="h-4 w-4" /></Button><div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{item.taskNo}</h1><StatusText status={item.status}>{TASK_STATUS[item.status] || item.status}</StatusText></div><p className="mt-1 text-sm text-muted-foreground">{materialNames} · {item.waybill.plateNo || '无车牌'} · {item.reports.length} 份机构检测报告</p></div></div>
    </div>

    <Card className={`flex items-start gap-4 border-l-4 p-5 ${item.finalConclusion === 'FUSE' ? 'border-l-destructive bg-destructive/5' : item.finalConclusion === 'PASS' ? 'border-l-primary bg-primary/5' : 'border-l-amber-500 bg-amber-50/50'}`}>
      {item.finalConclusion === 'PASS' ? <CheckCircle2 className="mt-1 h-7 w-7 text-primary" /> : <AlertTriangle className="mt-1 h-7 w-7 text-amber-600" />}
      <div><div className="text-lg font-semibold">最终质检结论：{CONCLUSION[item.finalConclusion]}</div><div className="mt-1 text-sm text-muted-foreground">{item.status === 'COMPLETED' ? `已归集 ${item.finalizedReportCount} 份有效报告，判定版本 V${item.decisionVersion}。` : `计划 ${item.plannedReportCount} 份，当前已录入 ${item.reports.length} 份、已确认 ${confirmed.length} 份。至少一份有效报告即可发起最终判定。`}</div></div>
    </Card>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5"><Title>到货与任务信息</Title><div className="grid gap-4 sm:grid-cols-2"><Info label="物流运单" value={item.waybill.waybillNo} /><Info label="到货时间" value={formatDateTimeToSecond(item.waybill.arrivedAt)} /><Info label="车牌号" value={item.waybill.plateNo || '-'} /><Info label="业务单位" value={businessParty || '-'} /><Info label="物料" value={materialNames} /><Info label="目标仓库" value={item.waybill.dispatchNotice.warehouse?.name || '-'} /><Info label="质检模板" value={item.qualityTemplate ? `${item.qualityTemplate.code} · ${item.qualityTemplate.name}（v${item.qualityTemplate.version}）` : '未关联模板'} /><Info label="样品数量" value={`${item.samples.length} 份`} /><Info label="首次取样时间" value={formatDateTimeToSecond(item.sampledAt)} /><Info label="计划检测报告数" value={`${item.plannedReportCount} 份`} /><Info label="当前处理人" value={item.handler?.name || '质检管理人员均可处理'} /></div></Card>
      <Card className="p-5"><Title>上游关联单据</Title><div className="grid gap-4 sm:grid-cols-2"><BusinessLink label="合同" value={`${item.waybill.dispatchNotice.order.contract.contractNo} · ${item.waybill.dispatchNotice.order.contract.title}`} /><BusinessLink label="执行批次" value={`${item.waybill.dispatchNotice.order.name} · ${item.waybill.dispatchNotice.order.orderNo}`} href={`/dashboard/orders/${item.waybill.dispatchNotice.order.id}`} /><BusinessLink label="物流运单" value={item.waybill.waybillNo} href={`/dashboard/waybills/${item.waybill.id}`} /><Info label="磅单进度" value={`${item.waybill.weighTickets.length} 张，已复核 ${item.waybill.weighTickets.filter(ticket => ticket.status === 'REVIEWED').length} 张`} /></div>{item.waybill.inboundReceipts[0] && <Button className="mt-5" variant="outline" onClick={() => router.push(`/dashboard/inbound/${item.waybill.inboundReceipts[0].id}`)}>查看入库作业单 {item.waybill.inboundReceipts[0].receiptNo}</Button>}</Card>
    </div>

    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-semibold">取样与送检登记及现场影像</h2><p className="mt-1 text-xs text-muted-foreground">一行代表一份独立样品；每份样品单独编号、贴签、登记送检信息，并在该行下方留存现场照片。</p></div>
        {!['COMPLETED', 'VOIDED'].includes(item.status) && <Button size="sm" variant="outline" onClick={resetSampleForm}><Plus className="mr-1 h-4 w-4" />新增样品</Button>}
      </div>

      {!['COMPLETED', 'VOIDED'].includes(item.status) && <div className="rounded-lg border bg-muted/20 p-4">
        <div className="mb-3 text-sm font-medium">{editingSampleId ? '修改样品信息' : '登记新样品'}</div>
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="样品编号"><Input value={sampleNo} onChange={event => setSampleNo(event.target.value)} placeholder="留空自动生成" /></Field>
          <Field label="样品标签"><Input value={sampleLabel} onChange={event => setSampleLabel(event.target.value)} placeholder="如 A样、送检样、留样" /></Field>
          <Field label="取样时间 *"><Input type="datetime-local" step="1" value={sampledAt} onChange={event => setSampledAt(event.target.value)} /></Field>
          <Field label="取样人 *"><Input value={samplerName} onChange={event => setSamplerName(event.target.value)} /></Field>
          <Field label="取样方法"><Input value={samplingMethod} onChange={event => setSamplingMethod(event.target.value)} /></Field>
          <Field label="封签编号"><Input value={sealNo} onChange={event => setSealNo(event.target.value)} placeholder="选填" /></Field>
          <Field label="送检机构"><Input value={destinationInstitutionName} onChange={event => setDestinationInstitutionName(event.target.value)} placeholder="选填，可稍后补充" /></Field>
          <Field label="送检时间"><Input type="datetime-local" step="1" value={sentAt} onChange={event => setSentAt(event.target.value)} /></Field>
          <Field label="计划检测报告数"><Input type="number" min="1" max="20" value={plannedReportCount} onChange={event => setPlannedReportCount(event.target.value)} /></Field>
          <div className="md:col-span-3"><Field label="样品备注"><Input value={sampleRemarks} onChange={event => setSampleRemarks(event.target.value)} placeholder="取样位置、样品状态或其他说明" /></Field></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">{editingSampleId && <Button variant="outline" disabled={saving} onClick={resetSampleForm}>取消修改</Button>}<Button disabled={saving} onClick={() => void saveSample()}>{editingSampleId ? '保存修改' : '保存并生成样品'}</Button></div>
      </div>}

      {!item.samples.length ? <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">暂无样品记录，请先登记第一份样品。</div> : <div className="space-y-4">{item.samples.map((sample, index) => <div key={sample.id} className="rounded-lg border">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 p-4">
          <div className="flex items-start gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{index + 1}</div><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono font-semibold">{sample.sampleNo}</span>{sample.sampleLabel && <Badge variant="outline">{sample.sampleLabel}</Badge>}<StatusText status={sample.status}>{sample.status === 'SENT' ? '已送检' : sample.status === 'RECEIVED' ? '机构已接收' : '已取样'}</StatusText></div><div className="mt-1 text-xs text-muted-foreground">{sample.samplerName} · {formatDateTimeToSecond(sample.sampledAt)} · {sample.attachments.length} 张影像</div></div></div>
          {!['COMPLETED', 'VOIDED'].includes(item.status) && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={saving} onClick={() => editSample(sample)}><Pencil className="mr-1 h-3.5 w-3.5" />修改</Button><Button size="sm" variant="ghost" disabled={saving} onClick={() => void deleteSample(sample)}><Trash2 className="mr-1 h-3.5 w-3.5" />删除</Button></div>}
        </div>
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Info label="取样方法" value={sample.samplingMethod || '-'} /><Info label="封签编号" value={sample.sealNo || '-'} /><Info label="送检机构" value={sample.destinationInstitutionName || '-'} /><Info label="送检时间" value={formatDateTimeToSecond(sample.sentAt)} /><Info label="备注" value={sample.remarks || '-'} /></div>
          <div className="border-t pt-3"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">样品现场影像</span>{!['COMPLETED', 'VOIDED'].includes(item.status) && <div className="flex flex-wrap gap-2"><select className="h-8 rounded-md border bg-background px-2 text-xs" value={evidenceCategory} onChange={event => setEvidenceCategory(event.target.value)}>{Object.entries(EVIDENCE_CATEGORY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select className="h-8 rounded-md border bg-background px-2 text-xs" value={evidenceSource} onChange={event => setEvidenceSource(event.target.value)}>{Object.entries(EVIDENCE_SOURCE).filter(([value]) => value !== 'MINI_PROGRAM_CAPTURE').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-2 text-xs text-primary"><input type="file" multiple className="hidden" accept=".jpg,.jpeg,.png,.webp" disabled={saving} onChange={event => { void uploadSampleEvidence(sample.id, event.currentTarget.files); event.currentTarget.value = ''; }} /><Upload className="mr-1 h-3.5 w-3.5" />上传照片</label></div>}</div>
            {sample.attachments.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sample.attachments.map(attachment => <div key={attachment.id} className="rounded-md border p-3"><button className="flex w-full items-center gap-2 text-left" onClick={() => void viewSampleAttachment(attachment.id)}><FileText className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1 truncate text-sm">{attachment.originalName}</span><Eye className="h-4 w-4 text-muted-foreground" /></button><div className="mt-2 text-xs text-muted-foreground">{EVIDENCE_CATEGORY[attachment.category] || attachment.category} · {formatDateTimeToSecond(attachment.capturedAt || attachment.createdAt)}</div>{!['COMPLETED', 'VOIDED'].includes(item.status) && <Button className="mt-2 w-full" size="sm" variant="outline" disabled={saving} onClick={() => void deleteSampleAttachment(attachment)}>删除照片</Button>}</div>)}</div> : <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">尚未上传该样品的现场照片</div>}
          </div>
          {sample.reports.length > 0 && <div className="text-xs text-muted-foreground">关联检测报告：{sample.reports.map(report => `${report.institutionName} / ${report.reportNo}`).join('；')}</div>}
        </div>
      </div>)}</div>}

      {item.attachments.length > 0 && <div className="border-t pt-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-medium">历史未归属样品的现场影像</div><div className="text-xs text-muted-foreground">升级前上传的任务级影像保留在此，可继续查看和删除。</div></div>{!['COMPLETED', 'VOIDED'].includes(item.status) && <div className="flex gap-2"><select className="h-8 rounded-md border bg-background px-2 text-xs" value={evidenceCategory} onChange={event => setEvidenceCategory(event.target.value)}>{Object.entries(EVIDENCE_CATEGORY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-2 text-xs text-primary"><input type="file" multiple className="hidden" accept=".jpg,.jpeg,.png,.webp" disabled={saving} onChange={event => { void uploadTaskEvidence(event.currentTarget.files); event.currentTarget.value = ''; }} /><Upload className="mr-1 h-3.5 w-3.5" />补充历史影像</label></div>}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{item.attachments.map(attachment => <div key={attachment.id} className="rounded-md border p-3"><button className="flex w-full items-center gap-2 text-left" onClick={() => void viewTaskAttachment(attachment.id)}><FileText className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1 truncate text-sm">{attachment.originalName}</span><Eye className="h-4 w-4 text-muted-foreground" /></button>{!['COMPLETED', 'VOIDED'].includes(item.status) && <Button className="mt-2 w-full" size="sm" variant="outline" disabled={saving} onClick={() => void deleteTaskAttachment(attachment)}>删除影像</Button>}</div>)}</div></div>}
    </Card>

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="font-semibold">机构检测报告</h2><p className="mt-1 text-xs text-muted-foreground">每份报告必须选择上方已登记的一个样品，并对应一家检测机构。</p></div><div className="flex items-center gap-2"><Badge variant="secondary">{item.reports.length} / 计划 {item.plannedReportCount}</Badge><Button disabled={!eligibleTicket || !item.samples.length || item.status === 'VOIDED'} title={!item.samples.length ? '请先登记样品' : undefined} onClick={() => router.push(`/dashboard/quality/create?taskId=${item.id}&weighTicketId=${eligibleTicket?.id || ''}`)}><Plus className="mr-1 h-4 w-4" />添加检测报告</Button></div></div>
      {!item.reports.length ? <div className="border-t p-12 text-center text-muted-foreground"><FlaskConical className="mx-auto mb-2 h-8 w-8 opacity-40" />尚未录入检测报告<br /><span className="text-xs">完成磅单称重后，可在本板块添加第一份报告。</span></div> : <div className="space-y-5 border-t p-5">{item.reports.map((report, index) => {
        const editable = !['CONFIRMED', 'VOIDED'].includes(report.status);
        return <Card key={report.id} className={`overflow-hidden ${report.id === basisInspectionId ? 'ring-2 ring-primary/30' : ''}`}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 p-4"><div className="flex items-start gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{index + 1}</div><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{report.institutionName}</span><Badge variant="outline">{INSTITUTION[report.institutionType] || report.institutionType}</Badge><StatusText status={report.conclusion}>{CONCLUSION[report.conclusion]}</StatusText></div><div className="mt-1 font-mono text-xs text-muted-foreground">{report.inspectionNo} · 报告 {report.reportNo} · 样品 {report.sampleNo || '-'}</div></div></div><div className="flex items-center gap-2"><StatusText status={report.status}>{REPORT_STATUS[report.status]}</StatusText>{report.status === 'REPORTED' && <Button size="sm" disabled={saving} onClick={() => void confirmReport(report)}>确认报告有效</Button>}{editable && <Button size="sm" variant="outline" disabled={saving} onClick={() => void voidReport(report)}>作废填错报告</Button>}</div></div>
          <div className="grid gap-5 p-4 lg:grid-cols-[1.5fr_1fr]">
            <div><div className="grid gap-3 sm:grid-cols-4"><Info label="检测时间" value={formatDateTimeToSecond(report.testedAt)} /><Info label="取样人" value={report.samplerName} /><Info label="关联磅单" value={report.weighTicket.ticketNo} /><Info label="录入人" value={report.creator.name} /></div><div className="mt-4 overflow-x-auto"><table className="min-w-[640px] w-full text-sm"><thead className="border-y bg-muted/40 text-left text-muted-foreground"><tr><th className="px-3 py-2">指标</th><th className="px-3 py-2">标准</th><th className="px-3 py-2">检测值</th><th className="px-3 py-2">判定</th></tr></thead><tbody>{report.indicators.map(indicator => <tr key={indicator.id} className="border-b"><td className="px-3 py-2 font-medium">{indicator.name}</td><td className="px-3 py-2">{qualityStandard(indicator)}</td><td className="px-3 py-2 text-primary">{measure(indicator.measuredValue, indicator.unit)}</td><td className="px-3 py-2">{indicator.result === 'PASS' ? '合格' : indicator.result === 'FAIL' ? '超标' : indicator.result === 'FUSE' ? '拒收' : '待判定'}</td></tr>)}</tbody></table></div></div>
            <div className="space-y-3"><div className="flex items-center justify-between"><span className="text-sm font-medium">检测报告附件</span>{editable && <label className="inline-flex h-8 cursor-pointer items-center rounded-md border px-2 text-xs text-primary"><input type="file" multiple className="hidden" accept=".jpg,.jpeg,.png,.webp,.pdf" disabled={saving} onChange={event => { void uploadReportAttachment(report.id, event.currentTarget.files); event.currentTarget.value = ''; }} /><Upload className="mr-1 h-3.5 w-3.5" />上传</label>}</div>{report.attachments.length ? report.attachments.map(attachment => <div key={attachment.id} className="flex items-center gap-2 rounded-md border p-2"><button className="flex min-w-0 flex-1 items-center gap-2 text-left hover:bg-muted" onClick={() => void viewAttachment(attachment.id)}><FileText className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1 truncate text-sm">{attachment.originalName}</span><Eye className="h-4 w-4 text-muted-foreground" /></button>{editable && <Button size="sm" variant="ghost" disabled={saving} onClick={() => void deleteReportAttachment(attachment)}>删除</Button>}</div>) : <div className="rounded-md border border-dashed p-5 text-center text-xs text-muted-foreground">暂无检测报告附件</div>}<div className="rounded-md bg-muted/40 p-3 text-xs"><div className="flex justify-between"><span>基准重量</span><b>{weight(report.baseWeight)}</b></div><div className="mt-2 flex justify-between"><span>质检后重量</span><b>{weight(report.settlementWeight)}</b></div><div className="mt-2 flex justify-between"><span>预计扣款</span><b>¥{Number(report.deductionAmount).toLocaleString()}</b></div></div></div>
          </div>
        </Card>;
      })}</div>}
    </Card>

    {confirmed.length > 0 && item.status !== 'VOIDED' && <Card className="space-y-4 p-5"><div><h2 className="font-semibold">形成最终质检结论</h2><p className="mt-1 text-sm text-muted-foreground">选择一份已确认报告作为入库、扣重和结算执行口径；系统同时留存本次参与判定的全部有效报告。</p></div><div className="grid gap-2">{confirmed.map(report => <label key={report.id} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 ${basisInspectionId === report.id ? 'border-primary bg-primary/5' : ''}`}><input type="radio" name="basis" checked={basisInspectionId === report.id} onChange={() => setBasisInspectionId(report.id)} /><div className="min-w-0 flex-1"><div className="font-medium">{report.institutionName} · {report.reportNo}</div><div className="text-xs text-muted-foreground">{report.inspectionNo} · {CONCLUSION[report.conclusion]} · 质检后重量 {weight(report.settlementWeight)}</div></div></label>)}</div>{needsDecisionReason && <div className="rounded-md border border-warning-border bg-warning-bg p-3"><div className="mb-2 flex items-start gap-2 text-sm text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{confirmed.length === 1 ? '当前仅有一份有效检测报告，形成最终结论前必须说明采用单一报告的原因。' : `计划 ${item.plannedReportCount} 份、当前仅 ${confirmed.length} 份有效报告，提前判定必须填写原因。`}</span></div><label className="mb-1 block text-sm font-medium" htmlFor="quality-decision-reason">判定原因 *</label><textarea id="quality-decision-reason" className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={reason} onChange={event => setReason(event.target.value)} placeholder={confirmed.length === 1 ? '请填写采用单一报告形成最终结论的业务依据或核实说明' : `请填写采用当前 ${confirmed.length} 份报告提前判定的原因`} /></div>}<div className="flex justify-end"><Button disabled={saving || !basisInspectionId} onClick={() => void finalize()}>{item.status === 'COMPLETED' ? '重新形成结论' : '确认形成最终结论'}</Button></div></Card>}

    {item.decidedAt && <Card className="p-5"><Title>最终判定记录</Title><div className="grid gap-4 sm:grid-cols-4"><Info label="最终结论" value={CONCLUSION[item.finalConclusion]} /><Info label="执行口径报告" value={item.basisInspection ? `${item.basisInspection.institutionName} · ${item.basisInspection.reportNo}` : '-'} /><Info label="判定人 / 时间" value={`${item.decider?.name || '-'} · ${formatDateTimeToSecond(item.decidedAt)}`} /><Info label="判定原因" value={item.decisionReason || '-'} /></div></Card>}
    <BusinessOperationHistory logs={(item as any).operationLogs} />
  </div>;
}

function Title({ children }: { children: React.ReactNode }) { return <h2 className="mb-4 flex items-center gap-2 font-semibold"><FlaskConical className="h-4 w-4 text-primary" />{children}</h2>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1.5 block text-sm font-medium">{label}</label>{children}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 break-words text-sm font-medium">{value}</div></div>; }
function BusinessLink({ label, value, href }: { label: string; value: string; href?: string }) { const content = <><Link2 className="h-3.5 w-3.5" /><span className="truncate">{value}</span></>; return <div><div className="text-xs text-muted-foreground">{label}</div>{href ? <a className="mt-1 flex items-center gap-1 text-sm text-primary hover:underline" href={href}>{content}</a> : <div className="mt-1 flex items-center gap-1 text-sm">{content}</div>}</div>; }
function number(value: string | number | null) { return value === null ? '-' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 4 }); }
function weight(value: string | null) { return value === null ? '-' : `${number(value)} 吨`; }
function measure(value: string | null, unit: string) { return value === null ? '-' : `${number(value)} ${unit}`; }
function qualityStandard(item: Indicator) { if (item.standardValue === null) return '-'; return item.operator === 'RANGE' ? `${number(item.standardValue)}—${number(item.upperValue)} ${item.unit}` : `${OPERATOR[item.operator]} ${number(item.standardValue)} ${item.unit}`; }
