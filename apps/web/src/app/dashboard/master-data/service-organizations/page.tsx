'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ORGANIZATION_TYPES } from './service-organization-form';

interface Item {
  id: string; code: string; organizationType: keyof typeof ORGANIZATION_TYPES; status: string;
  licenseNo: string | null; licenseExpiry: string | null; serviceScope: string | null; serviceRegions: string | null;
  qualificationNo: string | null; cmaNo: string | null; cnasNo: string | null; operationType: string | null;
  contactPerson: string | null; contactPhone: string | null;
  partner: { id: string; code: string; name: string; roles: string[] };
}

function PageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('type') || 'LOGISTICS_CARRIER';
  const type = requested in ORGANIZATION_TYPES ? requested : 'LOGISTICS_CARRIER';
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ type, pageSize: '200' });
      if (search.trim()) query.set('search', search.trim());
      const result = await api.get<{ items: Item[] }>(`/service-organizations?${query}`);
      setItems(result.items || []);
    } catch (error: any) { alert(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [type]);

  const updateStatus = async (item: Item) => {
    const status = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try { await api.patch(`/service-organizations/${item.id}`, { status }); await load(); }
    catch (error: any) { alert(error.message); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">服务生态</h1><p className="mt-1 text-sm text-muted-foreground">统一维护物流承运、质检、仓储与港口服务档案</p></div>
      <Link href={`/dashboard/master-data/service-organizations/new?type=${type}`}><Button><Plus className="mr-1 h-4 w-4" />新建{ORGANIZATION_TYPES[type as keyof typeof ORGANIZATION_TYPES]}</Button></Link>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-b">
      {Object.entries(ORGANIZATION_TYPES).map(([value, label]) => <button key={value} onClick={() => router.replace(`/dashboard/master-data/service-organizations?type=${value}`)} className={`border-b-2 px-4 py-2 text-sm ${type === value ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>{label}</button>)}
    </div>
    <div className="flex gap-2"><div className="relative w-80"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="搜索编码、名称、许可证..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && void load()} /></div><Button variant="outline" onClick={() => void load()}>查询</Button></div>
    <Card className="overflow-hidden">
      {loading ? <div className="p-12 text-center text-muted-foreground">加载中...</div> : !items.length ? <div className="p-12 text-center text-muted-foreground">暂无已维护的{ORGANIZATION_TYPES[type as keyof typeof ORGANIZATION_TYPES]}</div> :
      <div className="overflow-x-auto"><table className="min-w-[1100px] w-full text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3">档案编码</th><th className="p-3">合作伙伴</th><th className="p-3">资质信息</th><th className="p-3">服务范围 / 区域</th><th className="p-3">联系人</th><th className="p-3">状态</th><th className="p-3">操作</th></tr></thead><tbody>
        {items.map(item => <tr key={item.id} className="border-b"><td className="p-3 font-mono">{item.code}</td><td className="p-3"><div className="font-medium">{item.partner.name}</div><div className="mt-1 text-xs text-muted-foreground">{item.partner.code} · 供应商</div></td><td className="p-3"><div>{item.licenseNo || item.qualificationNo || item.cmaNo || '—'}</div><div className="mt-1 text-xs text-muted-foreground">{item.licenseExpiry ? `有效期至 ${item.licenseExpiry.slice(0, 10)}` : item.cnasNo ? `CNAS ${item.cnasNo}` : '未设置有效期'}</div></td><td className="max-w-80 p-3"><div className="truncate">{item.serviceScope || operationLabel(item.operationType) || '—'}</div><div className="mt-1 truncate text-xs text-muted-foreground">{item.serviceRegions || '未设置服务区域'}</div></td><td className="p-3"><div>{item.contactPerson || '—'}</div><div className="mt-1 text-xs text-muted-foreground">{item.contactPhone || '—'}</div></td><td className="p-3"><Badge variant={item.status === 'ACTIVE' ? 'default' : 'secondary'}>{statusLabel(item.status)}</Badge></td><td className="p-3"><div className="flex gap-1"><Link href={`/dashboard/master-data/service-organizations/${item.id}/edit`}><Button size="sm" variant="ghost">编辑</Button></Link><Button size="sm" variant="ghost" onClick={() => void updateStatus(item)}>{item.status === 'ACTIVE' ? '停用' : '启用'}</Button></div></td></tr>)}
      </tbody></table></div>}
    </Card>
  </div>;
}

export default function ServiceOrganizationsPage() {
  return <Suspense fallback={<div className="p-12 text-center text-muted-foreground">加载中...</div>}><PageContent /></Suspense>;
}

function statusLabel(value: string) { return ({ ACTIVE: '有效', INACTIVE: '停用', BLACKLIST: '黑名单' } as Record<string, string>)[value] || value; }
function operationLabel(value: string | null) { return ({ WAREHOUSE: '仓储', PORT: '港口', WAREHOUSE_PORT: '仓储与港口' } as Record<string, string>)[value || ''] || ''; }
