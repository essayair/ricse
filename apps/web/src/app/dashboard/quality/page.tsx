'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock3, FlaskConical, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusText } from '@/components/status-text';
import { ClickableRow } from '@/components/clickable-row';
import { useListQuery } from '@/lib/use-list-query';

interface QualityTask {
  id: string; taskNo: string; status: string; finalConclusion: string; plannedReportCount: number;
  sampledAt: string | null; samplerName: string | null; createdAt: string;
  handler: { name: string } | null;
  reports: Array<{ id: string; status: string; conclusion: string; institutionName: string; reportNo: string }>;
  waybill: {
    id: string; waybillNo: string; status: string; plateNo: string | null; arrivedAt: string | null;
    lineItems: Array<{ materialName: string | null }>;
    weighTickets: Array<{ id: string; ticketNo: string; status: string }>;
    dispatchNotice: { type: string; order: { name: string; orderNo: string; contract: { seller: { name: string } | null; buyer: { name: string } | null; signingPartner: { name: string } | null } } };
  };
}

const STATUS: Record<string, string> = {
  PENDING_SAMPLING: '待取样', PENDING_SENDING: '待送检', INSPECTING: '检测中', PENDING_DECISION: '待综合判定',
  COMPLETED: '已完成', RECHECK_REQUIRED: '待复判', EXCEPTION: '异常处理中', VOIDED: '已作废',
};
const CONCLUSION: Record<string, string> = { PENDING: '待判定', PASS: '合格', DEDUCTION: '超标扣款', FUSE: '不合格（拒收）' };

export default function QualityPage() {
  const [data, setData] = useState<{ items: QualityTask[]; pagination: { total: number } } | null>(null);
  const [query, setQuery, resetQuery] = useListQuery({ search: '', status: '', conclusion: '', dateFrom: '', dateTo: '' });
  const { search, status, conclusion, dateFrom, dateTo } = query;
  const [draftSearch, setDraftSearch] = useState(search);
  useEffect(() => setDraftSearch(search), [search]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (conclusion) params.set('conclusion', conclusion);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    try { setData(await api.get(`/quality-tasks?${params}`)); }
    catch (error: any) { alert(error.message || '质检任务加载失败'); }
    finally { setLoading(false); }
  }, [conclusion, dateFrom, dateTo, search, status]);

  useEffect(() => { void load(); }, [load]);
  const items = data?.items || [];

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold">质检管理</h1>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Summary label="全部任务" value={data?.pagination.total || 0} />
      <Summary label="待取样" value={items.filter(item => item.status === 'PENDING_SAMPLING').length} />
      <Summary label="检测处理中" value={items.filter(item => ['PENDING_SENDING', 'INSPECTING', 'PENDING_DECISION', 'RECHECK_REQUIRED', 'EXCEPTION'].includes(item.status)).length} />
      <Summary label="已完成" value={items.filter(item => item.status === 'COMPLETED').length} success />
      <Summary label="异常结论" value={items.filter(item => ['DEDUCTION', 'FUSE'].includes(item.finalConclusion)).length} danger />
    </div>

    <Card className="p-4">
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 text-sm">
        <div className="relative min-w-72 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={draftSearch} onChange={event => setDraftSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') setQuery({ search: draftSearch.trim() }); }} placeholder="检索任务号、运单、批次、物料、车牌、机构或报告号" /></div>
        <Button className="shrink-0" variant="outline" onClick={() => setQuery({ search: draftSearch.trim() })}>检索</Button>
        <select className="h-10 shrink-0 rounded-md border bg-background px-3 text-sm" value={status} onChange={event => setQuery({ status: event.target.value })}><option value="">全部状态</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select className="h-10 shrink-0 rounded-md border bg-background px-3 text-sm" value={conclusion} onChange={event => setQuery({ conclusion: event.target.value })}><option value="">全部结论</option>{Object.entries(CONCLUSION).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <span className="shrink-0 text-muted-foreground">任务日期</span><Input className="w-36 shrink-0" type="date" value={dateFrom} onChange={event => setQuery({ dateFrom: event.target.value })} /><span className="shrink-0">至</span><Input className="w-36 shrink-0" type="date" min={dateFrom || undefined} value={dateTo} onChange={event => setQuery({ dateTo: event.target.value })} />{(search || status || conclusion || dateFrom || dateTo) && <Button className="shrink-0" variant="ghost" size="sm" onClick={resetQuery}>清空条件</Button>}
      </div>
    </Card>

    <Card className="overflow-hidden">
      {loading ? <div className="p-12 text-center text-muted-foreground">加载中...</div> : !items.length ? <div className="p-12 text-center text-muted-foreground"><FlaskConical className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无质检任务<br /><span className="text-xs">执行通知已配置质检时，运单到达或送达后系统自动生成任务。</span></div> : <div className="overflow-x-auto"><table className="min-w-[1350px] w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="px-4 py-3">任务编号 / 交接时间</th><th className="px-4 py-3">物料</th><th className="px-4 py-3">业务单位 / 车辆</th><th className="px-4 py-3">最终结论 / 状态</th><th className="px-4 py-3">报告进度</th><th className="px-4 py-3">执行批次 / 运单</th><th className="px-4 py-3">磅单进度</th><th className="px-4 py-3">处理人</th></tr></thead>
        <tbody>{items.map(item => {
          const confirmed = item.reports.filter(report => report.status === 'CONFIRMED').length;
          const party = item.waybill.dispatchNotice.type === 'PURCHASE' ? item.waybill.dispatchNotice.order.contract.seller?.name : item.waybill.dispatchNotice.order.contract.buyer?.name;
          return <ClickableRow key={item.id} href={`/dashboard/quality/${item.id}`} className="border-b hover:bg-muted/50">
            <td className="px-4 py-3"><Link href={`/dashboard/quality/${item.id}`} className="font-mono font-medium text-primary hover:underline">{item.taskNo}</Link><div className="mt-1 text-xs text-muted-foreground">{item.waybill.arrivedAt ? formatDateTimeToSecond(item.waybill.arrivedAt) : formatDateTimeToSecond(item.createdAt)}</div></td>
            <td className="max-w-56 px-4 py-3"><div className="truncate font-medium">{item.waybill.lineItems.map(line => line.materialName).filter(Boolean).join('、') || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{item.waybill.dispatchNotice.type === 'PURCHASE' ? '采购到货质检' : '销售交付质检'}</div></td>
            <td className="max-w-56 px-4 py-3"><div className="truncate">{party || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{item.waybill.plateNo || '无车牌'}</div></td>
            <td className="px-4 py-3"><ConclusionBadge value={item.finalConclusion} /><div className="mt-1 flex items-center gap-1"><Clock3 className="h-3 w-3 text-muted-foreground" /><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText></div></td>
            <td className="px-4 py-3"><div className="font-medium">{item.reports.length} 份报告</div><div className="mt-1 text-xs text-muted-foreground">已确认 {confirmed} / 计划 {item.plannedReportCount}</div></td>
            <td className="px-4 py-3"><div>{item.waybill.dispatchNotice.order.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.waybill.waybillNo}</div></td>
            <td className="px-4 py-3"><div>{item.waybill.weighTickets.length} 张磅单</div><div className="mt-1 text-xs text-muted-foreground">已复核 {item.waybill.weighTickets.filter(ticket => ticket.status === 'REVIEWED').length} 张</div></td>
            <td className="px-4 py-3"><div>{item.handler?.name || '待处理'}</div><div className="mt-1 text-xs text-muted-foreground">{item.samplerName ? `取样：${item.samplerName}` : '质检管理人员可处理'}</div></td>
          </ClickableRow>;
        })}</tbody>
      </table></div>}
    </Card>
  </div>;
}

function ConclusionBadge({ value }: { value: string }) {
  return <StatusText status={value}>{CONCLUSION[value] || value}</StatusText>;
}
function Summary({ label, value, success, danger }: { label: string; value: number; success?: boolean; danger?: boolean }) {
  return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-xl font-bold ${danger && value ? 'text-destructive' : success && value ? 'text-primary' : ''}`}>{value}</div></Card>;
}
