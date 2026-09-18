'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { StatusText } from '@/components/status-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface SettlementItem {
  id: string;
  settlementNo: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  totalNetWeight: string;
  totalAmount: string;
  payerCompany: { id: string; name: string };
  preparer: { id: string; name: string };
  lines: Array<unknown>;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿', SUBMITTED: '已提交', REVIEWED: '已复核', VOIDED: '已作废',
};

export default function LogisticsSettlementsPage() {
  const [items, setItems] = useState<SettlementItem[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (status) query.set('status', status);
      const result = await api.get<SettlementItem[]>(`/logistics-settlements?${query}`);
      setItems(result || []);
    } catch (error: any) { alert(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [status]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">物流结算单</h1>
          <p className="mt-1 text-sm text-muted-foreground">运费结算对象为承运方，区别于合同买卖双方的应收应付结算</p>
        </div>
        <Link href="/dashboard/logistics-settlements/new">
          <Button><Plus className="mr-1 h-4 w-4" />新建结算单</Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">加载中...</div>
        ) : !items.length ? (
          <div className="p-12 text-center text-muted-foreground">暂无结算单</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="p-3">结算单号</th>
                  <th className="p-3">货主方</th>
                  <th className="p-3">结算周期</th>
                  <th className="p-3">车次</th>
                  <th className="p-3">净重合计</th>
                  <th className="p-3">金额合计</th>
                  <th className="p-3">制表人</th>
                  <th className="p-3">状态</th>
                  <th className="p-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="p-3 font-mono">{item.settlementNo}</td>
                    <td className="p-3">{item.payerCompany.name}</td>
                    <td className="p-3 text-xs text-muted-foreground">{item.periodStart.slice(0, 10)} ~ {item.periodEnd.slice(0, 10)}</td>
                    <td className="p-3">{item.lines.length}</td>
                    <td className="p-3">{item.totalNetWeight}</td>
                    <td className="p-3">{item.totalAmount}</td>
                    <td className="p-3">{item.preparer.name}</td>
                    <td className="p-3"><StatusText status={item.status}>{STATUS_LABEL[item.status] || item.status}</StatusText></td>
                    <td className="p-3">
                      <Link href={`/dashboard/logistics-settlements/${item.id}`}>
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
