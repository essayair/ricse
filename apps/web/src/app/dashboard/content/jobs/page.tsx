'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, Play, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { contentDate, JOB_STATUS, JOB_TYPE } from '@/lib/content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type ManualJobType = 'NEWS_SYNC' | 'MARKET_SYNC' | 'HF_MARKET_SYNC' | 'FLUORSPAR_TREND_SYNC';

export default function ContentJobsPage() {
  const [data, setData] = useState<any>({ list: [], total: 0 });
  const [sources, setSources] = useState<any[]>([]);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const load = useCallback(() => {
    const params = new URLSearchParams({ pageSize: '100' });
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    api.get(`/content/jobs?${params}`).then(setData).catch((error: any) => alert(error.message));
  }, [type, status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get<any[]>('/content/data-sources').then(setSources).catch(() => []); }, []);
  const sunsirsSource = sources.find((item) => item.code === 'SUNSIRS_FLUORITE_NEWS');
  const newsCollectionReady = sunsirsSource?.status === 'ACTIVE';

  const trigger = async (jobType: ManualJobType) => {
    const sourceCode = jobType === 'NEWS_SYNC' ? ''
      : jobType === 'HF_MARKET_SYNC' ? 'BUSINESS_ANALYTIQ_HF'
      : jobType === 'FLUORSPAR_TREND_SYNC' ? 'FLUORSPAR_COM_TREND'
      : 'BAIINFO_FLUORITE';
    const source = sources.find((item) => item.code === sourceCode);
    try {
      await api.post('/content/jobs', { type: jobType, sourceId: source?.id || undefined });
      load();
    } catch (error: any) { alert(error.message); }
  };
  const retry = async (id: string) => {
    try { await api.patch(`/content/jobs/${id}/retry`, {}); load(); } catch (error: any) { alert(error.message); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">采集与 AI</h1><p className="mt-1 text-sm text-muted-foreground">产业资讯仅采集生意社萤石情报；新资讯去重后自动发布到官网和小程序</p></div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!newsCollectionReady} title={newsCollectionReady ? '采集生意社萤石情报' : '生意社资讯源尚未启用'} onClick={() => trigger('NEWS_SYNC')}><Play className="mr-1 h-4 w-4" />{newsCollectionReady ? '采集产业资讯' : '产业资讯已停用'}</Button>
        <Button variant="outline" onClick={() => trigger('MARKET_SYNC')}><Play className="mr-1 h-4 w-4" />采集萤石行情</Button>
        <Button variant="outline" onClick={() => trigger('FLUORSPAR_TREND_SYNC')}><Play className="mr-1 h-4 w-4" />采集萤石趋势</Button>
        <Button variant="outline" onClick={() => trigger('HF_MARKET_SYNC')}><Play className="mr-1 h-4 w-4" />采集国际氢氟酸行情</Button>
      </div>
    </div>
    <div className="flex gap-3">
      <select className="field w-auto" value={type} onChange={(event) => setType(event.target.value)}><option value="">全部类型</option>{Object.entries(JOB_TYPE).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
      <select className="field w-auto" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{Object.entries(JOB_STATUS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
      <Button variant="outline" onClick={load}><RefreshCw className="mr-1 h-4 w-4" />刷新</Button>
    </div>
    <Card className="overflow-hidden">
      {!data.list.length ? <div className="p-12 text-center text-muted-foreground"><Bot className="mx-auto mb-2 h-8 w-8 opacity-40" />暂无任务记录</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3">任务类型</th><th className="p-3">数据源</th><th className="p-3">业务键</th><th className="p-3">状态</th><th className="p-3 text-right">执行次数</th><th className="p-3">计划 / 开始</th><th className="p-3">结束时间</th><th className="p-3">结果或错误</th><th className="p-3">操作</th></tr></thead>
        <tbody>{data.list.map((item: any) => <tr key={item.id} className="border-b align-top"><td className="p-3 font-medium">{JOB_TYPE[item.type] || item.type}</td><td className="p-3">{item.source?.name || '-'}</td><td className="max-w-56 truncate p-3 font-mono text-xs">{item.businessKey}</td><td className="p-3"><Badge variant={item.status === 'SUCCEEDED' ? 'default' : item.status === 'FAILED' ? 'destructive' : 'secondary'} className={item.status === 'PARTIAL' ? 'border-amber-300 bg-amber-100 text-amber-800' : ''}>{JOB_STATUS[item.status] || item.status}</Badge></td><td className="p-3 text-right">{item.attempts} / {item.maxAttempts}</td><td className="p-3 text-xs">{contentDate(item.scheduledAt)}<div className="mt-1 text-muted-foreground">{contentDate(item.startedAt)}</div></td><td className="p-3 text-xs">{contentDate(item.finishedAt)}</td><td className="max-w-80 p-3 text-xs"><JobResult item={item} /></td><td className="p-3">{['FAILED', 'CANCELLED', 'PARTIAL'].includes(item.status) && <Button size="sm" variant="outline" onClick={() => retry(item.id)}>重试</Button>}</td></tr>)}</tbody>
      </table></div>}
    </Card>
  </div>;
}

function JobResult({ item }: { item: any }) {
  if (item.errorMessage) return <span className="text-destructive">{item.errorMessage}</span>;
  const result = item.result;
  if (item.type !== 'NEWS_SYNC' || !result) return <span>{result ? JSON.stringify(result) : '-'}</span>;
  const sources = Array.isArray(result.results) ? result.results : [];
  const failed = sources.filter((source: any) => source.error);
  const created = Number(result.created ?? sources.reduce((sum: number, source: any) => sum + Number(source.created || 0), 0));
  const fetched = Number(result.fetched ?? sources.reduce((sum: number, source: any) => sum + Number(source.fetched || 0), 0));
  const duplicates = Number(result.duplicates ?? sources.reduce((sum: number, source: any) => sum + Number(source.duplicates || 0), 0));
  const filtered = Number(result.filtered ?? sources.reduce((sum: number, source: any) => sum + Number(source.filtered || 0), 0));
  const published = Number(result.published ?? sources.reduce((sum: number, source: any) => sum + Number(source.published || 0), 0));
  return <div className="space-y-1 leading-5">
    <div className={created ? 'font-medium text-emerald-700' : 'font-medium text-amber-700'}>{created ? `新增并发布 ${published || created} 条资讯` : '执行完成，本次没有新增资讯'}</div>
    <div className="text-muted-foreground">抓取 {fetched} 条 · 重复 {duplicates} 条 · 不符合行业条件 {filtered} 条</div>
    {failed.map((source: any) => <div key={source.code} className="text-destructive">{source.code}：{source.error}</div>)}
  </div>;
}
