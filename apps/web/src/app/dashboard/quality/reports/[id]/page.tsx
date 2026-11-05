'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { openStoredAttachment } from '@/lib/attachment-preview';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { confirmAction, promptAction } from '@/lib/system-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusText } from '@/components/status-text';
import { StoredAttachmentThumbnail } from '@/components/attachment-thumbnail';

type Task = { id: string; taskNo: string; status: string; waybill: { waybillNo: string; plateNo: string | null; lineItems: Array<{ materialName: string | null }>; dispatchNotice: { order: { contract: { id: string; contractNo: string } } } } };
type Report = { id: string; inspectionNo: string; reportNo: string; status: string; conclusion: string; evidenceStage: string; institutionName: string; materialName: string; materialSpec: string | null; samplingGroupNo: string | null; sampleNo: string | null; sampledAt: string; testedAt: string; samplerName: string; qualityTaskId: string | null; qualitySampleId: string | null; weighTicketId: string | null; contract: { id: string; contractNo: string; title: string } | null; basisForTasks: Array<{ id: string }>; inboundReceipts: Array<{ id: string }>; indicators: Array<{ id: string; name: string; measuredValue: string | null; unit: string; result: string }>; attachments: Array<{ id: string; originalName: string }>; taskLinks: Array<{ qualityTask: { id: string; taskNo: string; status: string } }> };

export default function QualityReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setReport(await api.get<Report>(`/quality-inspections/${id}`)); } catch (error: any) { alert(error.message || '检测报告加载失败'); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  const searchTasks = async () => { try { const result = await api.get<{ items: Task[] }>(`/quality-tasks?search=${encodeURIComponent(query.trim())}&pageSize=100`); setCandidates(result.items || []); } catch (error: any) { alert(error.message || '质检任务搜索失败'); } };
  const link = async (task: Task) => {
    setBusy(true);
    try { await api.post(`/quality-inspections/${id}/tasks/${task.id}`, {}); await load(); setCandidates([]); setQuery(''); }
    catch (error: any) { alert(error.message || '关联失败'); }
    finally { setBusy(false); }
  };
  const unlink = async (taskId: string) => {
    if (!await confirmAction('解除这辆车与检测报告的关联？全部解除后，报告可以重新绑定到其他合同。', { title: '解除检测报告关联' })) return;
    setBusy(true);
    try { await api.delete(`/quality-inspections/${id}/tasks/${taskId}`); await load(); }
    catch (error: any) { alert(error.message || '解除关联失败'); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!await confirmAction('确认这份检测报告有效？确认后可被关联车辆用于最终质检判定。', { title: '确认检测报告' })) return;
    setBusy(true); try { await api.patch(`/quality-inspections/${id}/status`, { status: 'CONFIRMED' }); await load(); }
    catch (error: any) { alert(error.message || '确认失败'); } finally { setBusy(false); }
  };
  const changeStatus = async (status: string) => {
    if (!await confirmAction(status === 'VOIDED' ? '作废后此报告不会用于质检判定；未关联报告可编辑恢复或删除。确认作废？' : '确认提交检测报告，进入待确认状态？', { title: status === 'VOIDED' ? '作废检测报告' : '提交检测报告' })) return;
    setBusy(true);
    try { await api.patch(`/quality-inspections/${id}/status`, { status }); await load(); }
    catch (error: any) { alert(error.message || '操作失败'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!await confirmAction('删除后，此报告将从列表中移除，操作不可撤销。确认删除？', { title: '删除已作废检测报告' })) return;
    setBusy(true);
    try { await api.delete(`/quality-inspections/${id}`); router.push('/dashboard/quality/reports'); }
    catch (error: any) { alert(error.message || '删除失败'); setBusy(false); }
  };
  const classifyStage = async (evidenceStage: 'SHIPPING' | 'RECEIVING') => {
    const label = evidenceStage === 'SHIPPING' ? '发货侧' : '收货侧';
    const reason = (await promptAction(`请说明将这份历史检测报告标注为“${label}”的依据。此操作会写入报告备注和操作记录，不能直接改回。`, '', { title: '补录取样环节', confirmText: '确认补录' }))?.trim();
    if (!reason) return;
    setBusy(true);
    try { await api.post(`/quality-inspections/${id}/evidence-stage`, { evidenceStage, reason }); await load(); }
    catch (error: any) { alert(error.message || '补录取样环节失败'); }
    finally { setBusy(false); }
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try { for (const file of Array.from(files)) { const body = new FormData(); body.append('file', file); body.append('category', 'REPORT'); await api.upload(`/quality-inspections/${id}/attachments`, body); } await load(); }
    catch (error: any) { alert(error.message || '附件上传失败'); } finally { setBusy(false); }
  };
  if (!report) return <div className="p-10 text-center text-muted-foreground">加载中…</div>;
  const linked = new Set(report.taskLinks.map(link => link.qualityTask.id));
  const canMutate = !report.taskLinks.length && !report.qualityTaskId && !report.qualitySampleId && !report.weighTicketId && !report.contract && !report.basisForTasks.length && !report.inboundReceipts.length;
  const eligible = candidates.filter(task => !linked.has(task.id) && (!report.contract || task.waybill.dispatchNotice.order.contract.id === report.contract.id));
  return <div className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Button size="sm" variant="ghost" onClick={() => router.push('/dashboard/quality/reports')}>← 检测报告</Button><h1 className="mt-1 text-2xl font-bold">{report.inspectionNo}</h1><p className="text-sm text-muted-foreground">机构报告号 {report.reportNo} · {report.institutionName}</p></div><div className="flex flex-wrap items-center gap-2"><StatusText status={report.status}>{report.status === 'CONFIRMED' ? '已确认' : report.status === 'REPORTED' ? '已出报告' : report.status === 'VOIDED' ? '已作废' : '草稿'}</StatusText>{canMutate && <Button variant="outline" disabled={busy} onClick={() => router.push(`/dashboard/quality/reports/${id}/edit`)}>编辑</Button>}{canMutate && report.status !== 'VOIDED' && <Button variant="outline" disabled={busy} onClick={() => void changeStatus('VOIDED')}>作废</Button>}{canMutate && report.status === 'VOIDED' && <Button variant="outline" disabled={busy} onClick={() => void remove()}>删除</Button>}{report.status === 'DRAFT' && <Button disabled={busy} onClick={() => void changeStatus('REPORTED')}>提交报告</Button>}{report.status === 'REPORTED' && <Button disabled={busy} onClick={() => void confirm()}>确认报告有效</Button>}</div></div>
    <Card className="grid gap-4 p-5 sm:grid-cols-3"><Info label="物料" value={`${report.materialName}${report.materialSpec ? ` · ${report.materialSpec}` : ''}`} /><Info label="取样环节" value={report.evidenceStage === 'SHIPPING' ? '发货侧' : report.evidenceStage === 'RECEIVING' ? '收货侧' : '历史未标明'} /><Info label="混样编号" value={report.samplingGroupNo || '未填写'} /><Info label="样品编号" value={report.sampleNo || '未填写'} /><Info label="取样人" value={report.samplerName} /><Info label="取样时间" value={formatDateTimeToSecond(report.sampledAt)} /><Info label="检测时间" value={formatDateTimeToSecond(report.testedAt)} /><Info label="锁定合同" value={report.contract?.contractNo || '待首次关联'} /><Info label="结论" value={report.conclusion === 'PASS' ? '合格' : report.conclusion === 'DEDUCTION' ? '异常' : report.conclusion === 'FUSE' ? '拒收' : '待判定'} /></Card>
    {report.evidenceStage === 'UNSPECIFIED' && report.status !== 'VOIDED' && <Card className="space-y-3 border-warning-border bg-warning-bg/50 p-5"><h2 className="font-semibold">补录历史报告的取样环节</h2><p className="text-sm text-muted-foreground">该报告没有记录对应发货还是收货。请核对原始附件和取样记录后补录；销售交付完成确认不能使用未标明环节的报告。</p><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => void classifyStage('SHIPPING')}>标注为发货侧</Button><Button variant="outline" disabled={busy} onClick={() => void classifyStage('RECEIVING')}>标注为收货侧</Button></div></Card>}
    <Card className="p-5"><h2 className="mb-3 font-semibold">检测结果</h2><div className="grid gap-2 sm:grid-cols-3">{report.indicators.map(item => <div key={item.id} className="rounded-md border p-3 text-sm"><div className="font-medium">{item.name}</div><div className="mt-1">实测 {item.measuredValue ?? '—'} {item.unit}</div><div className="text-xs text-muted-foreground">{item.result === 'PASS' ? '符合标准' : item.result === 'FAIL' ? '超标' : item.result === 'FUSE' ? '拒收条件' : '待判定'}</div></div>)}</div></Card>
    <Card className="p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">报告附件</h2>{!['CONFIRMED', 'VOIDED'].includes(report.status) && <label className="cursor-pointer text-sm text-primary">上传附件<input type="file" className="hidden" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={event => { void upload(event.currentTarget.files); event.currentTarget.value = ''; }} /></label>}</div><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{report.attachments.map(file => <div key={file.id} className="min-w-0 space-y-2 rounded-md border p-3 text-sm"><StoredAttachmentThumbnail large name={file.originalName} viewUrlPath={`/quality-inspections/attachments/${file.id}/view-url`} /><div className="truncate font-medium" title={file.originalName}>{file.originalName}</div><button type="button" className="text-primary hover:underline" onClick={() => void openStoredAttachment(`/quality-inspections/attachments/${file.id}/view-url`)}>放大查看</button></div>)}{!report.attachments.length && <p className="text-sm text-muted-foreground">暂无附件</p>}</div></Card>
    <Card className="space-y-4 p-5"><div><h2 className="font-semibold">关联质检任务（车辆）</h2><p className="mt-1 text-xs text-muted-foreground">首次关联确定合同、供方和事业部；全部解除后释放范围。只关联实际参加这次取样的车辆。</p></div>
      {report.taskLinks.map(link => <div key={link.qualityTask.id} className="flex items-center justify-between rounded-md border p-3 text-sm"><button className="font-medium text-primary" onClick={() => router.push(`/dashboard/quality/${link.qualityTask.id}`)}>{link.qualityTask.taskNo} · 查看任务</button><Button size="sm" variant="outline" disabled={busy} onClick={() => void unlink(link.qualityTask.id)}>解除关联</Button></div>)}
      {!report.taskLinks.length && <p className="text-sm text-muted-foreground">尚未关联任务，可先保存报告，待车辆到达后再关联。</p>}
      {report.status !== 'VOIDED' && <div className="flex gap-2"><Input className="max-w-sm" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void searchTasks(); }} placeholder="搜索任务号、运单号或车牌" /><Button variant="outline" onClick={() => void searchTasks()}>查找任务</Button></div>}
      {!!candidates.length && <div className="max-h-64 space-y-1 overflow-y-auto">{eligible.map(task => <div key={task.id} className="flex items-center justify-between gap-3 border-b py-2 text-sm"><span>{task.taskNo} · {task.waybill.waybillNo} · {task.waybill.plateNo || '无车牌'} · {task.waybill.dispatchNotice.order.contract.contractNo}</span><Button size="sm" disabled={busy} onClick={() => void link(task)}>关联</Button></div>)}{!eligible.length && <p className="py-3 text-sm text-muted-foreground">没有同合同且未关联的任务；还须满足供方、事业部与物料一致。</p>}</div>}
    </Card>
  </div>;
}
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>; }
