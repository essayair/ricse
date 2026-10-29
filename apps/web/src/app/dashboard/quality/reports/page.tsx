'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusText } from '@/components/status-text';

type Report = { id: string; inspectionNo: string; reportNo: string; materialName: string; institutionName: string; sampledAt: string; status: string; conclusion: string; samplingGroupNo: string | null; contract: { contractNo: string } | null; taskLinks: Array<{ qualityTask: { taskNo: string } }> };

export default function QualityReportsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await api.get<{ items: Report[] }>(`/quality-inspections?search=${encodeURIComponent(search)}&pageSize=100`); setReports(data.items || []); }
    catch (error: any) { alert(error.message || '检测报告加载失败'); }
    finally { setLoading(false); }
  }, [search]);
  useEffect(() => { void load(); }, [load]);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">检测报告</h1><p className="mt-1 text-sm text-muted-foreground">检测报告是独立单据，可关联同一合同、供方和事业部的多项车辆质检任务。</p></div><Button onClick={() => router.push('/dashboard/quality/reports/new')}>录入检测报告</Button></div>
    <Card className="flex flex-wrap gap-2 p-4"><Input className="max-w-md" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') setSearch(query.trim()); }} placeholder="搜索报告编号、机构、物料、车牌或运单" /><Button variant="outline" onClick={() => setSearch(query.trim())}>检索</Button></Card>
    <Card className="overflow-x-auto">{loading ? <div className="p-10 text-center text-muted-foreground">加载中…</div> : !reports.length ? <div className="p-10 text-center text-muted-foreground">暂无检测报告</div> : <table className="min-w-[1000px] w-full text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="px-4 py-3">系统编号 / 机构报告号</th><th className="px-4 py-3">物料 / 混样编号</th><th className="px-4 py-3">检测机构</th><th className="px-4 py-3">状态 / 结论</th><th className="px-4 py-3">合同 / 关联任务</th><th className="px-4 py-3">取样时间</th></tr></thead><tbody>{reports.map(report => <tr key={report.id} className="cursor-pointer border-b hover:bg-muted/40" onClick={() => router.push(`/dashboard/quality/reports/${report.id}`)}><td className="px-4 py-3"><div className="font-mono font-medium text-primary">{report.inspectionNo}</div><div className="text-xs text-muted-foreground">{report.reportNo}</div></td><td className="px-4 py-3"><div>{report.materialName}</div><div className="text-xs text-muted-foreground">{report.samplingGroupNo || '未填写混样编号'}</div></td><td className="px-4 py-3">{report.institutionName}</td><td className="px-4 py-3"><StatusText status={report.status}>{report.status === 'CONFIRMED' ? '已确认' : report.status === 'REPORTED' ? '已出报告' : report.status === 'VOIDED' ? '已作废' : '草稿'}</StatusText><div className="text-xs text-muted-foreground">{report.conclusion === 'PASS' ? '合格' : report.conclusion === 'DEDUCTION' ? '异常' : report.conclusion === 'FUSE' ? '拒收' : '待判定'}</div></td><td className="px-4 py-3"><div>{report.contract?.contractNo || '待关联'}</div><div className="text-xs text-muted-foreground">{report.taskLinks.length} 项任务</div></td><td className="whitespace-nowrap px-4 py-3">{formatDateTimeToSecond(report.sampledAt)}</td></tr>)}</tbody></table>}</Card>
  </div>;
}
