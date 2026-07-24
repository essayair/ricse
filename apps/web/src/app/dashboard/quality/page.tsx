'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FlaskConical, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Inspection {
  id: string; inspectionNo: string; status: string; conclusion: string; sampledAt: string;
  institutionType: string; institutionName: string; reportNo: string; testedAt: string;
  materialName: string; materialSpec: string | null; supplierName: string | null; plateNo: string | null;
  samplerName: string; baseWeight: string | null; settlementWeight: string | null;
  moistureDeductionWeight: string; impurityDeductionWeight: string; deductionAmount: string;
  createdAt: string;
  weighTicket: { id: string; ticketNo: string; waybill: { id: string; waybillNo: string; dispatchNotice: { order: { name: string; orderNo: string } } } };
}

const STATUS: Record<string, string> = { DRAFT: '草稿', TESTING: '化验中', REPORTED: '已出报告', CONFIRMED: '已确认', VOIDED: '已作废' };
const CONCLUSION: Record<string, string> = { PENDING: '待判定', PASS: '合格', DEDUCTION: '扣款入库', FUSE: '熔断' };
const INSTITUTION: Record<string, string> = { OUR: '我方', PARTNER: '合作方', THIRD_PARTY: '第三方', OTHER: '其他' };

export default function QualityPage() {
  const router = useRouter();
  const [data, setData] = useState<{ items: Inspection[]; pagination: { total: number } } | null>(null);
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (conclusion) params.set('conclusion', conclusion);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    try { setData(await api.get(`/quality-inspections?${params}`)); }
    catch (error: any) { alert(error.message || '质检单加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [search, status, conclusion, dateFrom, dateTo]);
  const items = data?.items || [];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">质检单管理</h1><p className="mt-1 text-sm text-muted-foreground">每张质检单对应一个检测机构，同一车辆可关联多张机构质检单</p></div>
      <Button onClick={() => router.push('/dashboard/quality/create')}><Plus className="mr-1 h-4 w-4" />新建质检单</Button>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Summary label="全部质检单" value={data?.pagination.total || 0} />
      <Summary label="化验中" value={items.filter(item => ['DRAFT', 'TESTING'].includes(item.status)).length} />
      <Summary label="合格" value={items.filter(item => item.conclusion === 'PASS').length} success />
      <Summary label="扣款入库" value={items.filter(item => item.conclusion === 'DEDUCTION').length} />
      <Summary label="熔断" value={items.filter(item => item.conclusion === 'FUSE').length} danger />
    </div>

    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={draftSearch} onChange={event => setDraftSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') setSearch(draftSearch.trim()); }} placeholder="检索质检号、机构、报告号、物料、车牌、磅单、运单或批次" /></div>
        <Button variant="outline" onClick={() => setSearch(draftSearch.trim())}>检索</Button>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value)}><option value="">全部状态</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={conclusion} onChange={event => setConclusion(event.target.value)}><option value="">全部结论</option>{Object.entries(CONCLUSION).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">取样日期</span><Input className="w-40" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /><span>至</span><Input className="w-40" type="date" min={dateFrom || undefined} value={dateTo} onChange={event => setDateTo(event.target.value)} />{(search || status || conclusion || dateFrom || dateTo) && <Button variant="ghost" size="sm" onClick={() => { setDraftSearch(''); setSearch(''); setStatus(''); setConclusion(''); setDateFrom(''); setDateTo(''); }}>清空条件</Button>}</div>
    </Card>

    <Card className="overflow-hidden">
      {loading ? <div className="p-12 text-center text-muted-foreground">加载中...</div> : !items.length ? <div className="p-12 text-center text-muted-foreground"><FlaskConical className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无符合条件的质检单</div> : <div className="overflow-x-auto"><table className="min-w-[1500px] w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="px-4 py-3">质检单 / 取样时间</th><th className="px-4 py-3">检测机构 / 报告</th><th className="px-4 py-3">物料 / 规格</th><th className="px-4 py-3">供应商 / 车辆</th><th className="px-4 py-3">执行批次 / 运单</th><th className="px-4 py-3">关联磅单</th><th className="px-4 py-3 text-right">基准 / 结算重量</th><th className="px-4 py-3 text-right">扣水 / 扣杂 / 金额</th><th className="px-4 py-3">结论 / 状态</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => router.push(`/dashboard/quality/${item.id}`)}>
          <td className="px-4 py-3"><div className="font-mono font-medium text-primary">{item.inspectionNo}</div><div className="mt-1 text-xs text-muted-foreground">{formatDateTimeToSecond(item.sampledAt)}</div></td>
          <td className="max-w-56 px-4 py-3"><div className="flex items-center gap-2"><Badge variant="outline">{INSTITUTION[item.institutionType] || item.institutionType}</Badge><span className="truncate font-medium" title={item.institutionName}>{item.institutionName}</span></div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.reportNo} · {formatDateTimeToSecond(item.testedAt)}</div></td>
          <td className="max-w-56 px-4 py-3"><div className="truncate font-medium">{item.materialName}</div><div className="mt-1 truncate text-xs text-muted-foreground">{item.materialSpec || '-'}</div></td>
          <td className="max-w-56 px-4 py-3"><div className="truncate">{item.supplierName || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{item.plateNo || '无车牌'}</div></td>
          <td className="px-4 py-3"><div>{item.weighTicket.waybill.dispatchNotice.order.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{item.weighTicket.waybill.waybillNo}</div></td>
          <td className="px-4 py-3"><div className="font-mono text-xs text-primary">{item.weighTicket.ticketNo}</div><div className="mt-1 text-xs text-muted-foreground">取样人：{item.samplerName}</div></td>
          <td className="px-4 py-3 text-right"><div>{weight(item.baseWeight)}</div><div className="mt-1 font-medium text-primary">{weight(item.settlementWeight)}</div></td>
          <td className="px-4 py-3 text-right text-xs"><div>{weight(item.moistureDeductionWeight)} / {weight(item.impurityDeductionWeight)}</div><div className="mt-1 font-mono text-destructive">¥{Number(item.deductionAmount).toLocaleString()}</div></td>
          <td className="px-4 py-3"><ConclusionBadge value={item.conclusion} /><div className="mt-1 text-xs text-muted-foreground">{STATUS[item.status] || item.status}</div></td>
        </tr>)}</tbody>
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
function weight(value: string | null) { return value === null ? '-' : `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`; }
