'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, FileText, Truck, Package, AlertTriangle, DollarSign, ChevronRight, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Contract {
  id: string;
  contractNo: string;
  title: string;
  type: string;
  status: string;
  totalAmount: string;
  createdAt: string;
  creator: { name: string };
}

const STATUS_MAP: Record<string, { label: string; variant: string }> = {
  DRAFT: { label: '草稿', variant: 'secondary' },
  PENDING_APPROVAL: { label: '待审批', variant: 'outline' },
  APPROVED: { label: '已通过', variant: 'default' },
  REJECTED: { label: '已驳回', variant: 'destructive' },
  EXECUTING: { label: '执行中', variant: 'default' },
  COMPLETED: { label: '已完成', variant: 'default' },
  VOIDED: { label: '已作废', variant: 'outline' },
};

const TYPE_MAP: Record<string, string> = {
  PURCHASE: '采购合同',
  SALES: '销售合同',
  BILATERAL: '双边合同',
};

export default function ContractsPage() {
  const router = useRouter();
  const [data, setData] = useState<{ items: Contract[]; pagination: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchContracts = async (status?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (searchTerm) params.set('search', searchTerm);
      const json = await api.get<{ items: Contract[]; pagination: any }>(`/contracts?${params}`);
      setData(json);
    } catch (e) {
      console.error(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (contractId: string) => {
    if (!confirm('确定删除此合同？')) return;
    try {
      await api.delete(`/contracts/${contractId}`);
      fetchContracts(statusFilter);
    } catch (e: any) { alert(e.message || '删除失败'); }
  };

  useEffect(() => { fetchContracts(statusFilter); }, [statusFilter, searchTerm]);

  // Summary stats computed from contract data
  const contractItems = data?.items ?? [];
  const executing = contractItems.filter((c) => c.status === 'EXECUTING').length;
  const pendingApproval = contractItems.filter((c) => c.status === 'PENDING_APPROVAL').length;
  const totalAmount = contractItems.reduce((sum, c) => sum + Number(c.totalAmount), 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">合同管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理采购与销售合同全流程；双边合同自动拆分采购单与销售单</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {}}>
            <FileText className="h-4 w-4 mr-1" />导出
          </Button>
          <Button onClick={() => router.push('/dashboard/contracts/create')}>
            <Plus className="h-4 w-4 mr-1" />新建合同
          </Button>
        </div>
      </div>

      {/* Summary Row (matches prototype) */}
      <div className="flex gap-6 p-3 rounded-lg bg-muted/50">
        <SummaryItem label="全部合同" value={data?.pagination?.total ?? 0} />
        <SummaryItem label="执行中" value={executing} color="primary" />
        <SummaryItem label="待审核" value={pendingApproval} color="warning" />
        <SummaryItem label="总金额" value={`¥${(totalAmount / 10000).toFixed(1)}万`} />
      </div>

      {/* Filter & Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索合同编号 / 标题..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {['', 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'COMPLETED'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent'
              }`}
            >
              {s ? STATUS_MAP[s]?.label || s : '全部'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">加载中...</div>
        ) : !data?.items?.length ? (
          <div className="p-12 text-center text-muted-foreground">暂无合同数据</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">合同编号</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">标题</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">金额</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">创建人</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">创建时间</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr
                  key={c.id}
                  className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/dashboard/contracts/${c.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-xs">{c.contractNo}</td>
                  <td className="px-4 py-3 font-medium">{c.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{TYPE_MAP[c.type] || c.type}</td>
                  <td className="px-4 py-3">
                    <Badge variant={(STATUS_MAP[c.status]?.variant as any) || 'secondary'}>
                      {STATUS_MAP[c.status]?.label || c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">¥{Number(c.totalAmount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.creator?.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                      className="text-destructive hover:bg-destructive/10 rounded p-1"
                      title="删除">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {data && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>共 {data?.pagination?.total ?? 0} 条</span>
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const colorClass = color === 'primary' ? 'text-primary' : color === 'warning' ? 'text-warning' : '';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-base font-bold ${colorClass}`}>{value}</span>
    </div>
  );
}
