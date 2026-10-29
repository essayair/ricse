'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { openStoredAttachment } from '@/lib/attachment-preview';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { confirmAction } from '@/lib/system-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusText } from '@/components/status-text';

type Task = { id: string; taskNo: string; status: string; waybill: { waybillNo: string; plateNo: string | null; lineItems: Array<{ materialName: string | null }>; dispatchNotice: { order: { contract: { id: string; contractNo: string } } } } };
type Report = { id: string; inspectionNo: string; reportNo: string; status: string; conclusion: string; institutionName: string; materialName: string; materialSpec: string | null; samplingGroupNo: string | null; sampleNo: string | null; sampledAt: string; testedAt: string; samplerName: string; contract: { id: string; contractNo: string; title: string } | null; indicators: Array<{ id: string; name: string; measuredValue: string | null; unit: string; result: string }>; attachments: Array<{ id: string; originalName: string }>; taskLinks: Array<{ qualityTask: { id: string; taskNo: string; status: string } }> };

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
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try { for (const file of Array.from(files)) { const body = new FormData(); body.append('file', file); body.append('category', 'REPORT'); await api.upload(`/quality-inspections/${id}/attachments`, body); } await load(); }
    catch (error: any) { alert(error.message || '附件上传失败'); } finally { setBusy(false); }
  };
  if (!report) return <div className="p-10 text-center text-muted-foreground">加载中…</div>;
  const linked = new Set(report.taskLinks.map(link => link.qualityTask.id));
  const eligible = candidates.filter(task => !linked.has(task.id) && (!report.contract || task.waybill.dispatchNotice.order.contract.id === report.contract.id));
  return <div className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><Button size="sm" variant="ghost" onClick={() => router.push('/dashboard/quality/reports')}>← 检测报告</Button><h1 className="mt-1 text-2xl font-bold">{report.inspectionNo}</h1><p className="text-sm text-muted-foreground">机构报告号 {report.reportNo} · {report.institutionName}</p></div><div className="flex items-center gap-2"><StatusText status={report.status}>{report.status === 'CONFIRMED' ? '已确认' : report.status === 'REPORTED' ? '已出报告' : report.status}</StatusText>{report.status === 'REPORTED' && <Button disabled={busy} onClick={() => void confirm()}>确认报告有效</Button>}</div></div>
    <Card className="grid gap-4 p-5 sm:grid-cols-3"><Info label="物料" value={`${report.materialName}${report.materialSpec ? ` · ${report.materialSpec}` : ''}`} /><Info label="混样编号" value={report.samplingGroupNo || '未填写'} /><Info label="样品编号" value={report.sampleNo || '未填写'} /><Info label="取样人" value={report.samplerName} /><Info label="取样时间" value={formatDateTimeToSecond(report.sampledAt)} /><Info label="检测时间" value={formatDateTimeToSecond(report.testedAt)} /><Info label="锁定合同" value={report.contract?.contractNo || '待首次关联'} /><Info label="结论" value={report.conclusion === 'PASS' ? '合格' : report.conclusion === 'DEDUCTION' ? '异常' : report.conclusion === 'FUSE' ? '拒收' : '待判定'} /></Card>
    <Card className="p-5"><h2 className="mb-3 font-semibold">检测结果</h2><div className="grid gap-2 sm:grid-cols-3">{report.indicators.map(item => <div key={item.id} className="rounded-md border p-3 text-sm"><div className="font-medium">{item.name}</div><div className="mt-1">实测 {item.measuredValue ?? '—'} {item.unit}</div><div className="text-xs text-muted-foreground">{item.result === 'PASS' ? '符合标准' : item.result === 'FAIL' ? '超标' : item.result === 'FUSE' ? '拒收条件' : '待判定'}</div></div>)}</div></Card>
    <Card className="p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">报告附件</h2>{!['CONFIRMED', 'VOIDED'].includes(report.status) && <label className="cursor-pointer text-sm text-primary">上传附件<input type="file" className="hidden" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={event => { void upload(event.currentTarget.files); event.currentTarget.value = ''; }} /></label>}</div><div className="mt-3 space-y-2">{report.attachments.map(file => <button key={file.id} className="block w-full rounded-md border p-3 text-left text-sm hover:bg-muted" onClick={() => void openStoredAttachment(`/quality-inspections/attachments/${file.id}/view-url`)}>{file.originalName} · 查看</button>)}{!report.attachments.length && <p className="text-sm text-muted-foreground">暂无附件</p>}</div></Card>
    <Card className="space-y-4 p-5"><div><h2 className="font-semibold">关联质检任务（车辆）</h2><p className="mt-1 text-xs text-muted-foreground">首次关联确定合同、供方和事业部；全部解除后释放范围。只关联实际参加这次取样的车辆。</p></div>
      {report.taskLinks.map(link => <div key={link.qualityTask.id} className="flex items-center justify-between rounded-md border p-3 text-sm"><button className="font-medium text-primary" onClick={() => router.push(`/dashboard/quality/${link.qualityTask.id}`)}>{link.qualityTask.taskNo} · 查看任务</button><Button size="sm" variant="outline" disabled={busy} onClick={() => void unlink(link.qualityTask.id)}>解除关联</Button></div>)}
      {!report.taskLinks.length && <p className="text-sm text-muted-foreground">尚未关联任务，可先保存报告，待车辆到达后再关联。</p>}
      <div className="flex gap-2"><Input className="max-w-sm" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void searchTasks(); }} placeholder="搜索任务号、运单号或车牌" /><Button variant="outline" onClick={() => void searchTasks()}>查找任务</Button></div>
      {!!candidates.length && <div className="max-h-64 space-y-1 overflow-y-auto">{eligible.map(task => <div key={task.id} className="flex items-center justify-between gap-3 border-b py-2 text-sm"><span>{task.taskNo} · {task.waybill.waybillNo} · {task.waybill.plateNo || '无车牌'} · {task.waybill.dispatchNotice.order.contract.contractNo}</span><Button size="sm" disabled={busy} onClick={() => void link(task)}>关联</Button></div>)}{!eligible.length && <p className="py-3 text-sm text-muted-foreground">没有同合同且未关联的任务；还须满足供方、事业部与物料一致。</p>}</div>}
    </Card>
  </div>;
}
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>; }
