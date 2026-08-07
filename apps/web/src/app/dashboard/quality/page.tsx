'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock3, FlaskConical, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

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
  PENDING_SAMPLING: '待取样', INSPECTING: '检测中', PENDING_DECISION: '待综合判定',
  COMPLETED: '已完成', RECHECK_REQUIRED: '待复判', VOIDED: '已作废',
};
const CONCLUSION: Record<string, string> = { PENDING: '待判定', PASS: '合格', DEDUCTION: '超标扣款', FUSE: '熔断' };

export default function QualityPage() {
  const router = useRouter();
  const [data, setData] = useState<{ items: QualityTask[]; pagination: { total: number } } | null>(null);
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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
    catch (error: any) { alert(error.message || '到货质检任务加载失败'); }
    finally { setLoading(false); }
  }, [conclusion, dateFrom, dateTo, search, status]);

  useEffect(() => { void load(); }, [load]);
  const items = data?.items || [];

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold">到货质检任务</h1>
      <p className="mt-1 text-sm text-muted-foreground">物流确认到达后自动生成；每条任务归集同一到货车辆的全部机构检测报告</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Summary label="全部任务" value={data?.pagination.total || 0} />
      <Summary label="待取样" value={items.filter(item => item.status === 'PENDING_SAMPLING').length} />
      <Summary label="检测处理中" value={items.filter(item => ['INSPECTING', 'PENDING_DECISION', 'RECHECK_REQUIRED'].includes(item.status)).length} />
      <Summary label="已完成" value={items.filter(item => item.status === 'COMPLETED').length} success />
      <Summary label="异常结论" value={items.filter(item => ['DEDUCTION', 'FUSE'].includes(item.finalConclusion)).length} danger />
    </div>

    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={draftSearch} onChange={event => setDraftSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') setSearch(draftSearch.trim()); }} placeholder="检索任务号、运单、批次、物料、车牌、机构或报告号" /></div>
        <Button variant="outline" onClick={() => setSearch(draftSearch.trim())}>检索</Button>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value)}><option value="">全部状态</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={conclusion} onChange={event => setConclusion(event.target.value)}><option value="">全部结论</option>{Object.entries(CONCLUSION).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">任务日期</span><Input className="w-40" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /><span>至</span><Input className="w-40" type="date" min={dateFrom || undefined} value={dateTo} onChange={event => setDateTo(event.target.value)} />{(search || status || conclusion || dateFrom || dateTo) && <Button variant="ghost" size="sm" onClick={() => { setDraftSearch(''); setSearch(''); setStatus(''); setConclusion(''); setDateFrom(''); setDateTo(''); }}>清空条件</Button>}</div>
    </Card>

    <Card className="overflow-hidden">
      {loading ? <div className="p-12 text-center text-muted-foreground">加载中...</div> : !items.length ? <div className="p-12 text-center text-muted-foreground"><FlaskConical className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无到货质检任务<br /><span className="text-xs">物流运单确认到达后，系统会自动生成任务。</span></div> : <div className="overflow-x-auto"><table className="min-w-[1350px] w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="px-4 py-3">任务编号 / 到货</th><th className="px-4 py-3">报告进度</th><th className="px-4 py-3">物料</th><th className="px-4 py-3">业务单位 / 车辆</th><th className="px-4 py-3">执行批次 / 运单</th><th className="px-4 py-3">磅单进度</th><th className="px-4 py-3">处理人</th><th className="px-4 py-3">最终结论 / 状态</th></tr></thead>
        <tbody>{items.map(item => {
          const confirmed = item.reports.filter(report => report.status === 'CONFIRMED').length;
          const party = item.waybill.dispatchNotice.type === 'PURCHASE' ? item.waybill.dispatchNotice.order.contract.seller?.name : item.waybill.dispatchNotice.order.contract.buyer?.name;
          return <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => router.push(`/dashboard/quality/${item.id}`)}>
            <td className="px-4 py-3"><div className="font-mono font-medium text-primary">{item.taskNo}</div><div className="mt-1 text-xs text-muted-foreground">{item.waybill.arrivedAt ? formatDateTimeToSecond(item.waybill.arrivedAt) : formatDateTimeToSecond(item.createdAt)}</div></td>
            <td className="px-4 py-3"><div className="font-medium">{item.reports.length} 份报告</div><div className="mt-1 text-xs text-muted-foreground">已确认 {confirmed} / 计划 {item.plannedReportCount}</div></td>
            <td className="max-w-56 px-4 py-3"><div className="truncate font-medium">{item.waybill.lineItems.map(line => line.materialName).filter(Boolean).join('、') || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{item.waybill.dispatchNotice.type === 'PURCHASE' ? '采购到货' : '销售到货'}</div></td>
            <td className="max-w-56 px-4 py-3"><div className="truncate">{party || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{item.waybill.plateNo || '无车牌'}</div></td>
            <td className="px-4 py-3"><div>{item.waybill.dispatchNotice.order.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.waybill.waybillNo}</div></td>
            <td className="px-4 py-3"><div>{item.waybill.weighTickets.length} 张磅单</div><div className="mt-1 text-xs text-muted-foreground">已复核 {item.waybill.weighTickets.filter(ticket => ticket.status === 'REVIEWED').length} 张</div></td>
            <td className="px-4 py-3"><div>{item.handler?.name || '待处理'}</div><div className="mt-1 text-xs text-muted-foreground">{item.samplerName ? `取样：${item.samplerName}` : '质检管理人员可处理'}</div></td>
            <td className="px-4 py-3"><ConclusionBadge value={item.finalConclusion} /><div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" />{STATUS[item.status] || item.status}</div></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </Card>
  </div>;
}

function ConclusionBadge({ value }: { value: string }) {
  return <Badge variant={value === 'FUSE' ? 'destructive' : value === 'PASS' ? 'default' : 'secondary'}>{value === 'PASS' && <CheckCircle2 className="mr-1 h-3 w-3" />}{CONCLUSION[value] || value}</Badge>;
}
function Summary({ label, value, success, danger }: { label: string; value: number; success?: boolean; danger?: boolean }) {
  return <Card className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 text-xl font-bold ${danger && value ? 'text-destructive' : success && value ? 'text-primary' : ''}`}>{value}</div></Card>;
}
