'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { StatusText } from '@/components/status-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface ContractItem {
  id: string;
  contractNo: string;
  status: string;
  settlementBasis: string;
  effectiveAt: string | null;
  expireAt: string | null;
  carrierPartner: { id: string; name: string; code: string };
  priceTerms: Array<{ id: string; expiresAt: string | null }>;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿', ACTIVE: '生效中', EXPIRED: '已到期', TERMINATED: '已终止',
};

export default function LogisticsContractsPage() {
  const [items, setItems] = useState<ContractItem[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (status) query.set('status', status);
      const result = await api.get<ContractItem[]>(`/logistics-contracts?${query}`);
      setItems(result || []);
    } catch (error: any) { alert(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">物流合同</h1>
          <p className="mt-1 text-sm text-muted-foreground">维护长期合同物流公司的运价条款，运满满、临时车辆不在此建档</p>
        </div>
        <Link href="/dashboard/logistics-contracts/new">
          <Button><Plus className="mr-1 h-4 w-4" />新建物流合同</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative w-72">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="搜索合同号..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()} />
        </div>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={status} onChange={(e) => { setStatus(e.target.value); }}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Button variant="outline" onClick={() => void load()}>查询</Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">加载中...</div>
        ) : !items.length ? (
          <div className="p-12 text-center text-muted-foreground">暂无物流合同</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="p-3">合同号</th>
                  <th className="p-3">承运方</th>
                  <th className="p-3">结算方式</th>
                  <th className="p-3">生效期</th>
                  <th className="p-3">当前运价条款数</th>
                  <th className="p-3">状态</th>
                  <th className="p-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="p-3 font-mono">{item.contractNo}</td>
                    <td className="p-3">
                      <div className="font-medium">{item.carrierPartner.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.carrierPartner.code}</div>
                    </td>
                    <td className="p-3">{item.settlementBasis === 'NET_WEIGHT' ? '按净重' : item.settlementBasis === 'GROSS_WEIGHT' ? '按毛重' : '按车次'}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {item.effectiveAt ? item.effectiveAt.slice(0, 10) : '—'} ~ {item.expireAt ? item.expireAt.slice(0, 10) : '不限'}
                    </td>
                    <td className="p-3">{item.priceTerms.filter((term) => !term.expiresAt).length} 条当前生效</td>
                    <td className="p-3"><StatusText status={item.status}>{STATUS_LABEL[item.status] || item.status}</StatusText></td>
                    <td className="p-3">
                      <Link href={`/dashboard/logistics-contracts/${item.id}`}>
                        <Button size="sm" variant="ghost">详情</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
