'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, FileText, Truck, Package, AlertTriangle, DollarSign, ChevronRight, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { unitLabel } from '@/lib/unit';

interface Contract {
  id: string;
  contractNo: string;
  title: string;
  externalNo: string | null;
  type: string;
  status: string;
  totalAmount: string;
  createdAt: string;
  signedAt: string | null;
  effectiveAt: string | null;
  expireAt: string | null;
  deliveryLocation: string | null;
  creator: { name: string };
  signingPartner: { name: string } | null;
  seller: { name: string } | null;
  buyer: { name: string } | null;
  lineItems: Array<{ materialName: string; quantity: string; unit: string }>;
  orders: Array<{ dispatchNotices: Array<{ _count?: { waybills: number } }> }>;
  fulfillment: { directions: FulfillmentDirection[] };
}

interface FulfillmentDirection {
  type: string;
  pendingQuantity: Array<{ unit: string; quantity: number }>;
  pendingAmount: number;
  executingQuantity: Array<{ unit: string; quantity: number }>;
  executingAmount: number;
  executedQuantity: Array<{ unit: string; quantity: number }>;
  executedAmount: number;
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
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [userRole, setUserRole] = useState('');

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (searchTerm) params.set('search', searchTerm);
      const json = await api.get<{ items: Contract[]; pagination: any }>(`/contracts?${params}`);
      setData(json);
    } catch (e) {
      console.error(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, typeFilter]);

  const handleDelete = async (contract: Contract) => {
    if (contract.status !== 'VOIDED') {
      alert('合同必须先作废，才能删除');
      return;
    }
    if (!confirm(`确定删除已作废合同“${contract.contractNo}”吗？删除后将不再出现在合同列表中。`)) return;
    try {
      await api.delete(`/contracts/${contract.id}`);
      fetchContracts();
    } catch (e: any) { alert(e.message || '删除失败'); }
  };

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (!stored) return;
    try { setUserRole(JSON.parse(stored).role || ''); } catch {}
  }, []);

  useEffect(() => { void fetchContracts(); }, [fetchContracts]);

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
          <p className="text-sm text-muted-foreground mt-1">管理采购与销售合同全流程；双边合同分别生成采购执行批次与销售执行批次</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {}}>
            <FileText className="h-4 w-4 mr-1" />导出
          </Button>
          <Button variant="outline" onClick={() => router.push('/dashboard/orders/create')}>
            <Package className="h-4 w-4 mr-1" />新建执行批次
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
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索合同编号 / 标题 / 合作方..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {/* 合同类型 */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>类型:</span>
            {[['', '全部'], ['PURCHASE', '采购'], ['SALES', '销售'], ['BILATERAL', '双边']].map(([v, label]) => (
              <button key={v} onClick={() => setTypeFilter(v)}
                className={`px-2.5 py-1 rounded border text-xs transition-colors ${typeFilter === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-accent'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {/* 状态筛选 */}
        <div className="flex items-center gap-1.5">
          {['', 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTING', 'COMPLETED', 'VOIDED'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent'
              }`}
            >
              {s ? STATUS_MAP[s]?.label || s : '全部状态'}
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
          <div className="overflow-x-auto">
          <table className="min-w-[1660px] w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">合同编号 / 外部编号</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">标题 / 标的</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">我方 / 对手方</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型 / 状态</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">数量 / 金额</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">有效期 / 交付地</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">履约进度</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">创建信息</th>
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
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs font-medium">{c.contractNo}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{c.externalNo || '无外部编号'}</div>
                  </td>
                  <td className="max-w-64 px-4 py-3">
                    <div className="truncate font-medium">{c.title}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {c.lineItems?.length ? `${c.lineItems[0].materialName}${c.lineItems.length > 1 ? ` 等 ${c.lineItems.length} 项` : ''}` : '未录入合同标的'}
                    </div>
                  </td>
                  <td className="max-w-64 px-4 py-3">
                    <div className="truncate">{c.signingPartner?.name || '-'}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">对手方：{counterpartyName(c)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="mb-1 text-xs text-muted-foreground">{TYPE_MAP[c.type] || c.type}</div>
                    <Badge variant={(STATUS_MAP[c.status]?.variant as any) || 'secondary'}>
                      {STATUS_MAP[c.status]?.label || c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div>{quantitySummary(c.lineItems)}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">¥{Number(c.totalAmount).toLocaleString()}</div>
                  </td>
                  <td className="max-w-60 px-4 py-3 text-xs">
                    <div>{formatDate(c.effectiveAt || c.signedAt)} — {formatDate(c.expireAt)}</div>
                    <div className="mt-1 truncate text-muted-foreground">{c.deliveryLocation || '未设置交付地点'}</div>
                  </td>
                  <td className="min-w-80 px-4 py-3">
                    <FulfillmentSummary directions={c.fulfillment?.directions || []} />
                    <div className="mt-2 text-[11px] text-muted-foreground">{c.orders?.length || 0} 个执行批次 · {noticeCount(c)} 个执行通知</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>{c.creator?.name || '-'}</div>
                    <div className="mt-1 text-muted-foreground">{formatDate(c.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3">
                    {['APPROVED', 'EXECUTING'].includes(c.status) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/dashboard/orders/create?contractId=${c.id}`);
                        }}
                      >
                        <Package className="mr-1 h-3.5 w-3.5" />新建执行批次
                      </Button>
                    ) : userRole === 'ADMIN' && c.status === 'VOIDED' ? (
                      <button onClick={(e) => { e.stopPropagation(); void handleDelete(c); }}
                        className="text-destructive hover:bg-destructive/10 rounded p-1"
                        title="删除已作废合同">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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

function counterpartyName(contract: Contract) {
  if (contract.type === 'PURCHASE') return contract.seller?.name || '-';
  if (contract.type === 'SALES') return contract.buyer?.name || '-';
  return [contract.seller?.name, contract.buyer?.name].filter(Boolean).join(' / ') || '-';
}

function quantitySummary(lines: Contract['lineItems']) {
  if (!lines?.length) return '-';
  const totals = new Map<string, number>();
  lines.forEach(line => totals.set(line.unit, (totals.get(line.unit) || 0) + Number(line.quantity)));
  return Array.from(totals.entries()).map(([unit, quantity]) => `${quantity.toLocaleString()} ${unitLabel(unit)}`).join(' / ');
}

function noticeCount(contract: Contract) {
  return (contract.orders || []).reduce((sum, order) => sum + (order.dispatchNotices?.length || 0), 0);
}

function FulfillmentSummary({ directions }: { directions: FulfillmentDirection[] }) {
  if (!directions.length) return <span className="text-xs text-muted-foreground">暂无履约数据</span>;
  return <div className="space-y-2">{directions.map(direction => <div key={direction.type}>
    {directions.length > 1 && <div className="mb-1 text-[11px] font-medium text-muted-foreground">{direction.type === 'PURCHASE' ? '采购端' : '销售端'}</div>}
    <div className="grid grid-cols-[52px_1fr_1fr] gap-x-2 text-xs">
      <span className="text-muted-foreground">待执行</span><span>{quantityText(direction.pendingQuantity)}</span><span className="text-right font-mono">{money(direction.pendingAmount)}</span>
      <span className="text-muted-foreground">执行中</span><span className="text-amber-600">{quantityText(direction.executingQuantity)}</span><span className="text-right font-mono text-amber-600">{money(direction.executingAmount)}</span>
      <span className="text-muted-foreground">已执行</span><span className="text-primary">{quantityText(direction.executedQuantity)}</span><span className="text-right font-mono text-primary">{money(direction.executedAmount)}</span>
    </div>
  </div>)}</div>;
}

function quantityText(items: Array<{ unit: string; quantity: number }>) {
  return items.length ? items.map(item => `${Number(item.quantity).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} ${unitLabel(item.unit)}`).join(' / ') : '0 吨';
}

function money(value: number) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('zh-CN') : '-';
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
