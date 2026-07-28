'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, Edit3, CheckCircle2, XCircle, Clock, User, ClipboardList, Truck, Warehouse, ReceiptText, ChevronRight, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { openStoredAttachment } from '@/lib/attachment-preview';
import { unitLabel } from '@/lib/unit';

interface Approval {
  id: string;
  status: string;
  nodeName: string;
  roleCode: string | null;
  roleName: string | null;
  approvalMode: string;
  step: number;
  round: number;
  actedAt: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: { id: string; name: string; role: string };
  actedBy: { id: string; name: string; role: string } | null;
}

interface ContractDetail {
  id: string; contractNo: string; title: string; type: string; status: string;
  totalAmount: string; settlementMethod: string;
  signedAt: string | null; effectiveAt: string | null; expireAt: string | null;
  remarks: string | null; createdAt: string; updatedAt: string;
  signingPartnerId?: string;
  signingPartner?: { id: string; code: string; name: string; roles: string[]; isInternal: boolean } | null;
  company?: { code: string; name: string } | null;
  externalNo?: string; contactPerson?: string; contactPhone?: string;
  pricingType?: string; overfillPct?: string; shortfallPct?: string;
  deliveryMethod?: string; deliveryLocation?: string;
  settlementBasis?: string; prepayPct?: string; paymentDays?: number; paymentMethod?: string;
  moistureRule?: string; impurityRule?: string;
  creator: { id: string; name: string };
  seller: { id: string; code: string; name: string; roles: string[] } | null;
  buyer: { id: string; code: string; name: string; roles: string[] } | null;
  attachments?: Array<{ id: string; originalName: string; mimeType: string; size: number; category: string }>;
  lineItems: Array<{ id: string; materialName: string | null; quantity: string; unit: string; unitPrice: string; totalPrice: string; deliveryDate: string | null; remarks?: string | null }>;
  approvals: Approval[];
  fulfillment: { directions: FulfillmentDirection[] };
  orders: Array<{
    id: string;
    orderNo: string;
    name: string;
    type: string;
    status: string;
    totalAmount: string;
    plannedDate: string | null;
    dispatchedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    dispatchNotices: Array<{
      id: string; noticeNo: string; type: string; status: string; totalQuantity: string;
      _count: { waybills: number };
    }>;
  }>;
}

interface FulfillmentDirection {
  type: string;
  totalQuantity: Array<{ unit: string; quantity: number }>;
  totalAmount: number;
  pendingQuantity: Array<{ unit: string; quantity: number }>;
  pendingAmount: number;
  executingQuantity: Array<{ unit: string; quantity: number }>;
  executingAmount: number;
  executedQuantity: Array<{ unit: string; quantity: number }>;
  executedAmount: number;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'destructive' | 'outline' | 'secondary' }> = {
  DRAFT:            { label: '草稿', variant: 'secondary' },
  PENDING_APPROVAL: { label: '待审批', variant: 'outline' },
  APPROVED:         { label: '已通过', variant: 'default' },
  REJECTED:         { label: '已驳回', variant: 'destructive' },
  EXECUTING:        { label: '执行中', variant: 'default' },
  COMPLETED:        { label: '已完成', variant: 'default' },
  CLOSED:           { label: '已关闭', variant: 'outline' },
  VOIDED:           { label: '已作废', variant: 'outline' },
};

const TYPE_LABEL: Record<string, string> = {
  PURCHASE: '采购合同', SALES: '销售合同', BILATERAL: '双边合同',
};

// 每个状态下，各角色可执行的操作
const ROLE_ACTIONS: Record<string, Record<string, { next: string; label: string; variant: 'default' | 'destructive' | 'outline' | 'secondary'; needsComment?: boolean }[]>> = {
  DRAFT: {
    SALESPERSON: [{ next: 'PENDING_APPROVAL', label: '提交审批', variant: 'default' }, { next: 'VOIDED', label: '作废', variant: 'destructive' }],
    MANAGER:     [{ next: 'PENDING_APPROVAL', label: '提交审批', variant: 'default' }, { next: 'VOIDED', label: '作废', variant: 'destructive' }],
    ADMIN:       [{ next: 'PENDING_APPROVAL', label: '提交审批', variant: 'default' }, { next: 'VOIDED', label: '作废', variant: 'destructive' }],
    USER:        [{ next: 'PENDING_APPROVAL', label: '提交审批', variant: 'default' }, { next: 'VOIDED', label: '作废', variant: 'destructive' }],
  },
  PENDING_APPROVAL: {
    APPROVER: [
      { next: 'APPROVED', label: '审核通过', variant: 'default', needsComment: true },
      { next: 'REJECTED', label: '驳回', variant: 'destructive', needsComment: true },
    ],
    ADMIN: [
      { next: 'APPROVED', label: '审核通过', variant: 'default', needsComment: true },
      { next: 'REJECTED', label: '驳回', variant: 'destructive', needsComment: true },
      { next: 'VOIDED', label: '作废', variant: 'destructive' },
    ],
    SALESPERSON: [{ next: 'DRAFT', label: '撤回', variant: 'outline' }, { next: 'VOIDED', label: '作废', variant: 'destructive' }],
    MANAGER:     [{ next: 'DRAFT', label: '撤回', variant: 'outline' }, { next: 'VOIDED', label: '作废', variant: 'destructive' }],
    USER:        [{ next: 'VOIDED', label: '作废', variant: 'destructive' }],
  },
  REJECTED: {
    SALESPERSON: [{ next: 'DRAFT', label: '修改重提', variant: 'default' }, { next: 'VOIDED', label: '作废', variant: 'destructive' }],
    MANAGER:     [{ next: 'DRAFT', label: '修改重提', variant: 'default' }, { next: 'VOIDED', label: '作废', variant: 'destructive' }],
    ADMIN:       [{ next: 'DRAFT', label: '修改重提', variant: 'default' }, { next: 'VOIDED', label: '作废', variant: 'destructive' }],
    USER:        [{ next: 'VOIDED', label: '作废', variant: 'destructive' }],
  },
  APPROVED: {
    SALESPERSON: [{ next: 'VOIDED', label: '作废', variant: 'destructive' }],
    MANAGER: [{ next: 'EXECUTING', label: '开始执行', variant: 'default' }, { next: 'VOIDED', label: '作废', variant: 'destructive' }],
    ADMIN:   [{ next: 'EXECUTING', label: '开始执行', variant: 'default' }, { next: 'VOIDED', label: '作废', variant: 'destructive' }],
    USER: [{ next: 'VOIDED', label: '作废', variant: 'destructive' }],
  },
  EXECUTING: {
    SALESPERSON: [{ next: 'VOIDED', label: '终止并作废', variant: 'destructive' }],
    MANAGER: [{ next: 'COMPLETED', label: '标记完成', variant: 'default' }, { next: 'CLOSED', label: '关闭', variant: 'outline' }, { next: 'VOIDED', label: '终止并作废', variant: 'destructive' }],
    ADMIN:   [{ next: 'COMPLETED', label: '标记完成', variant: 'default' }, { next: 'CLOSED', label: '关闭', variant: 'outline' }, { next: 'VOIDED', label: '终止', variant: 'destructive' }],
    USER: [{ next: 'VOIDED', label: '终止并作废', variant: 'destructive' }],
  },
  COMPLETED: {
    MANAGER: [{ next: 'CLOSED', label: '归档关闭', variant: 'outline' }],
    ADMIN:   [{ next: 'CLOSED', label: '归档关闭', variant: 'outline' }],
  },
};

function ApprovalModal({ onConfirm, onCancel, action }: {
  onConfirm: (comment: string) => void;
  onCancel: () => void;
  action: { label: string; variant: string };
}) {
  const [comment, setComment] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-1">{action.label}</h3>
        <p className="text-sm text-muted-foreground mb-4">请填写审批意见（必填）</p>
        <textarea
          className="w-full h-28 px-3 py-2 border border-input rounded-md text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="请输入审批意见..."
          value={comment}
          onChange={e => setComment(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onCancel}>取消</Button>
          <Button
            variant={action.variant as any}
            onClick={() => { if (!comment.trim()) { alert('请填写审批意见'); return; } onConfirm(comment.trim()); }}
          >
            确认{action.label}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ApprovalTimeline({ approvals }: { approvals: Approval[] }) {
  if (!approvals || approvals.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">审批记录</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-4">
          {approvals.map((a, idx) => (
            <div key={a.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  a.status === 'APPROVED' ? 'bg-green-100 text-green-600' :
                  a.status === 'REJECTED' ? 'bg-red-100 text-red-600' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {a.status === 'APPROVED' ? <CheckCircle2 className="h-4 w-4" /> :
                   a.status === 'REJECTED' ? <XCircle className="h-4 w-4" /> :
                   <Clock className="h-4 w-4" />}
                </div>
                {idx < approvals.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
              </div>
              <div className="pb-4 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    第 {a.step} 级 · {a.nodeName || '合同审批'} · {a.roleName || '审批角色'} · {a.assignee?.name}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {a.approvalMode === 'ANY' ? '或签' : '会签'}
                  </Badge>
                  <Badge variant={a.status === 'APPROVED' ? 'default' : a.status === 'REJECTED' ? 'destructive' : 'secondary'} className="text-xs">
                    {a.status === 'APPROVED' ? '已通过' : a.status === 'REJECTED' ? '已驳回' : a.status === 'PENDING' ? '待审批' : a.status === 'WAITING' ? '等待中' : '已取消'}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(a.actedAt || a.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
                {a.actedBy && a.actedBy.id !== a.assignee?.id && (
                  <p className="mt-1 text-xs text-amber-600">由系统管理员 {a.actedBy.name} 代为处理</p>
                )}
                {a.comment && (
                  <p className="text-sm text-muted-foreground mt-1 bg-muted/50 rounded px-2 py-1">
                    {a.comment}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  DISPATCHED: '执行中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

function FulfillmentProgress({ contract }: { contract: ContractDetail }) {
  const activeOrders = (contract.orders || []).filter(order => order.status !== 'CANCELLED');
  const weights: Record<string, number> = { DRAFT: 10, CONFIRMED: 35, DISPATCHED: 70, COMPLETED: 100 };
  const orderProgress = activeOrders.length
    ? Math.round(activeOrders.reduce((sum, order) => sum + (weights[order.status] || 0), 0) / activeOrders.length)
    : 0;
  const progress = ['COMPLETED', 'CLOSED'].includes(contract.status)
    ? 100
    : activeOrders.length
      ? orderProgress
      : ['APPROVED', 'EXECUTING'].includes(contract.status) ? 5 : 0;
  const completedOrders = activeOrders.filter(order => order.status === 'COMPLETED').length;
  const notices = activeOrders.flatMap(order => order.dispatchNotices || []).filter(notice => notice.status !== 'CANCELLED');
  const waybillCount = notices.reduce((sum, notice) => sum + notice._count.waybills, 0);

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">履约进度</CardTitle>
        <p className="text-xs text-muted-foreground">关联合同下游的具体执行单据</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 text-sm font-medium">履约数量与金额</div>
          <div className="space-y-3">
            {(contract.fulfillment?.directions || []).map(direction => <FulfillmentDirectionPanel key={direction.type} direction={direction} showDirection={contract.type === 'BILATERAL'} />)}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-end justify-between">
            <span className="text-sm text-muted-foreground">总体进度</span>
            <span className="text-2xl font-bold text-primary">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{activeOrders.length} 个执行批次</span>
            <span>{completedOrders} 个已完成</span>
          </div>
        </div>

        <div className="space-y-1">
          <ProgressModule icon={CheckCircle2} label="合同生效" status={['APPROVED', 'EXECUTING', 'COMPLETED', 'CLOSED'].includes(contract.status) ? '已完成' : '未完成'} active />

          <div className="rounded-lg border">
            <div className="flex items-center gap-3 p-3">
              <ClipboardList className="h-4 w-4 text-primary" />
              <div className="flex-1">
                <div className="text-sm font-medium">执行批次</div>
                <div className="text-xs text-muted-foreground">{activeOrders.length ? `${completedOrders}/${activeOrders.length} 已完成` : '暂无执行批次'}</div>
              </div>
              {['APPROVED', 'EXECUTING'].includes(contract.status) && (
                <Link href={`/dashboard/orders/create?contractId=${contract.id}`} className="text-xs text-primary hover:underline">新建</Link>
              )}
            </div>
            {contract.orders?.length > 0 && (
              <div className="border-t px-3 py-2">
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {contract.orders.map(order => (
                    <Link key={order.id} href={`/dashboard/orders/${order.id}`} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{order.name}</div>
                        <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{order.orderNo}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {order.type === 'PURCHASE' ? '采购执行批次' : '销售执行批次'} · ¥{Number(order.totalAmount).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant={order.status === 'COMPLETED' ? 'default' : order.status === 'CANCELLED' ? 'destructive' : 'secondary'} className="shrink-0 text-[10px]">
                        {ORDER_STATUS_LABEL[order.status] || order.status}
                      </Badge>
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <ProgressModule icon={ClipboardList} label="执行通知" status={notices.length ? `${notices.length} 张，${notices.filter(item => item.status === 'COMPLETED').length} 张已完成` : '暂无关联单据'} active={notices.length > 0} />
          <ProgressModule icon={Truck} label="物流运输" status={waybillCount ? `${waybillCount} 张物流运单` : '暂无关联单据'} active={waybillCount > 0} />
          <ProgressModule icon={Warehouse} label="出入库执行" status="暂无关联单据" />
          <ProgressModule icon={ReceiptText} label="结算执行" status="暂无关联单据" />
        </div>
      </CardContent>
    </Card>
  );
}

function FulfillmentDirectionPanel({ direction, showDirection }: { direction: FulfillmentDirection; showDirection: boolean }) {
  const rows = [
    { label: '待执行', quantity: direction.pendingQuantity, amount: direction.pendingAmount, className: '' },
    { label: '执行中', quantity: direction.executingQuantity, amount: direction.executingAmount, className: 'text-amber-600' },
    { label: '已执行', quantity: direction.executedQuantity, amount: direction.executedAmount, className: 'text-primary' },
  ];
  return <div className="overflow-hidden rounded-lg border">
    {showDirection && <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium">{direction.type === 'PURCHASE' ? '采购端' : '销售端'}</div>}
    <div className="grid grid-cols-[58px_1fr_1fr] gap-x-2 gap-y-2 p-3 text-xs">
      <span className="text-muted-foreground">状态</span><span className="text-muted-foreground">数量</span><span className="text-right text-muted-foreground">金额</span>
      {rows.map(row => <Fragment key={row.label}>
        <span className="text-muted-foreground">{row.label}</span>
        <span className={`font-medium ${row.className}`}>{fulfillmentQuantity(row.quantity)}</span>
        <span className={`text-right font-mono font-medium ${row.className}`}>{fulfillmentMoney(row.amount)}</span>
      </Fragment>)}
    </div>
  </div>;
}

function fulfillmentQuantity(items: Array<{ unit: string; quantity: number }>) {
  return items.length
    ? items.map(item => `${Number(item.quantity).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} ${unitLabel(item.unit)}`).join(' / ')
    : '0 吨';
}

function fulfillmentMoney(value: number) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function ProgressModule({ icon: Icon, label, status, active = false }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  status: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{status}</div>
      </div>
    </div>
  );
}

export default function ContractDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<{ next: string; label: string; variant: string; needsComment?: boolean } | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string; name: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try { setCurrentUser(JSON.parse(stored)); } catch {}
    }
  }, []);

  const fetchContract = useCallback(async () => {
    try {
      const data = await api.get<ContractDetail>(`/contracts/${params.id}`);
      setContract(data);
    } catch { console.error('Failed to load contract'); }
    finally { setLoading(false); }
  }, [params.id]);

  useEffect(() => { void fetchContract(); }, [fetchContract]);

  const handleStatusChange = async (status: string, comment?: string) => {
    try {
      await api.patch(`/contracts/${params.id}/status`, { status, comment });
      setPendingAction(null);
      fetchContract();
    } catch (e: any) { alert(e.message || '操作失败'); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`确定删除已作废合同“${contract?.contractNo || ''}”吗？删除后将不再出现在合同列表中。`)) return;
    try {
      await api.delete(`/contracts/${params.id}`);
      router.push('/dashboard/contracts');
    } catch (e: any) {
      alert(e.message || '删除失败');
    }
  };

  const handleActionClick = (action: typeof pendingAction) => {
    if (!action) return;
    if (action.next === 'VOIDED' && !window.confirm('确定作废此合同吗？作废后不能恢复，如需删除还必须由系统管理员操作。')) {
      return;
    }
    if (action.needsComment) {
      setPendingAction(action);
    } else {
      handleStatusChange(action.next);
    }
  };

  const viewAttachment = async (id: string) => {
    try {
      await openStoredAttachment(`/contracts/attachments/${id}/view-url`);
    } catch (e: any) {
      alert(e.message || '附件打开失败');
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...</div>;
  if (!contract) return <div className="p-12 text-center text-destructive">合同不存在</div>;

  const c = contract;
  const cfg = STATUS_MAP[c.status] || { label: c.status, variant: 'secondary' as const };
  const userRole = currentUser?.role || 'USER';
  const roleActions = ROLE_ACTIONS[c.status]?.[userRole] || ROLE_ACTIONS[c.status]?.['USER'] || [];
  const hasCurrentApprovalTask = c.approvals?.some(
    (approval) => approval.status === 'PENDING' && approval.assignee.id === currentUser?.id,
  );
  let actions = roleActions;
  if (c.status === 'PENDING_APPROVAL' && userRole !== 'ADMIN') {
    const approvalActions = hasCurrentApprovalTask
      ? ROLE_ACTIONS.PENDING_APPROVAL.APPROVER
      : [];
    const ownerActions = c.creator.id === currentUser?.id
      ? roleActions.filter((action) => ['DRAFT', 'VOIDED'].includes(action.next))
      : [];
    actions = [...approvalActions, ...ownerActions].filter(
      (action, index, items) => items.findIndex((item) => item.next === action.next) === index,
    );
  }
  const canEdit = ['DRAFT', 'REJECTED'].includes(c.status) && ['SALESPERSON', 'MANAGER', 'ADMIN', 'USER'].includes(userRole);

  return (
    <div className="space-y-6">
      {pendingAction && (
        <ApprovalModal
          action={pendingAction}
          onCancel={() => setPendingAction(null)}
          onConfirm={(comment) => handleStatusChange(pendingAction.next, comment)}
        />
      )}

      <div className="flex items-center justify-between">
        <button onClick={() => router.push('/dashboard/contracts')} className="text-sm text-primary hover:underline">&larr; 返回合同列表</button>
        <div className="flex gap-2">
          {canEdit && (
            <Link href={`/dashboard/contracts/${c.id}/edit`}>
              <Button variant="outline" size="sm"><Edit3 className="h-4 w-4 mr-1" />编辑</Button>
            </Link>
          )}
          {userRole === 'ADMIN' && c.status === 'VOIDED' && (
            <Button variant="destructive" size="sm" onClick={() => void handleDelete()}>
              <Trash2 className="h-4 w-4 mr-1" />删除合同
            </Button>
          )}
        </div>
      </div>

      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>{c.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {c.contractNo} · {TYPE_LABEL[c.type] || c.type} · 创建人: {c.creator?.name}
            </p>
          </div>
          <Badge variant={cfg.variant} className="text-sm px-3 py-1">{cfg.label}</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <Field label={c.type === 'PURCHASE' ? '对手方（供应商）' : c.type === 'SALES' ? '对手方（客户）' : '上游对手方（供应商）'} value={c.seller ? `${c.seller.code} ${c.seller.name}` : '—'} />
            {c.type === 'BILATERAL' && <Field label="下游对手方（客户）" value={c.buyer ? `${c.buyer.code} ${c.buyer.name}` : '—'} />}
            <Field label="我方签约主体（内部）" value={c.signingPartner ? `${c.signingPartner.code} ${c.signingPartner.name}` : c.company ? `${c.company.code} ${c.company.name}（旧数据）` : '—'} />
            <Field label="总金额" value={<span className="text-lg font-bold text-primary">¥{Number(c.totalAmount).toLocaleString()}</span>} />
            <Field label="外部合同号" value={c.externalNo || '—'} />
            <Field label="联系人" value={`${c.contactPerson || '—'}${c.contactPhone ? ` ${c.contactPhone}` : ''}`} />
            <Field label="定价类型" value={c.pricingType === 'FIXED' ? '一口价' : c.pricingType === 'BASIS' ? '基差定价' : c.pricingType === 'FLOATING' ? '不定价' : '—'} />
            <Field label="溢装/短装" value={`${c.overfillPct || '—'}% / ${c.shortfallPct || '—'}%`} />
            <Field label="交货方式" value={c.deliveryMethod || '—'} />
            <Field label="交货地点" value={c.deliveryLocation || '—'} />
            <Field label="签订日期" value={c.signedAt ? new Date(c.signedAt).toLocaleDateString('zh-CN') : '—'} />
            <Field label="生效日期" value={c.effectiveAt ? new Date(c.effectiveAt).toLocaleDateString('zh-CN') : '—'} />
            <Field label="到期日期" value={c.expireAt ? new Date(c.expireAt).toLocaleDateString('zh-CN') : '—'} />
            <Field label="创建时间" value={new Date(c.createdAt).toLocaleString('zh-CN')} />
            <Field label="最后修改" value={new Date(c.updatedAt).toLocaleString('zh-CN')} />
          </div>

          <>
              <Separator className="my-4" />
              <h4 className="text-sm font-semibold mb-3">结算条款</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <Field label="结算依据" value={c.settlementBasis === 'WEIGHT' ? '地磅净重' : c.settlementBasis === 'QUALITY' ? '质检干重' : '合同量'} />
                <Field label="结算方式" value={c.settlementMethod} />
                <Field label="预付比例" value={c.prepayPct ? `${c.prepayPct}%` : '—'} />
                <Field label="尾款账期" value={c.paymentDays ? `${c.paymentDays} 天` : '—'} />
                <Field label="付款方式" value={c.paymentMethod || '—'} />
                <Field label="扣水规则" value={c.moistureRule || '—'} />
                <Field label="扣杂规则" value={c.impurityRule || '—'} />
              </div>
            </>

          {c.remarks && <div className="mt-4 text-sm text-muted-foreground">备注: {c.remarks}</div>}

          {actions.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">当前角色: {userRole}</span>
                <div className="flex gap-2 ml-4">
                  {actions.map((a) => (
                    <Button key={a.next} variant={a.variant} onClick={() => handleActionClick(a)}>
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
      {/* Line Items */}
      <Card>
        <CardHeader><CardTitle className="text-base">合同行项</CardTitle></CardHeader>
        <CardContent>
          {c.lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无行项数据</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2">物料</th>
                  <th className="pb-2">数量</th>
                  <th className="pb-2">单位</th>
                  <th className="pb-2">单价</th>
                  <th className="pb-2">交货日期</th>
                  <th className="pb-2">行项备注</th>
                  <th className="pb-2 text-right">小计</th>
                </tr>
              </thead>
              <tbody>
                {c.lineItems.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{item.materialName || '—'}</td>
                    <td className="py-3">{Number(item.quantity).toLocaleString()}</td>
                    <td className="py-3">{unitLabel(item.unit)}</td>
                    <td className="py-3 font-mono">¥{Number(item.unitPrice).toLocaleString()}</td>
                    <td className="py-3">{item.deliveryDate ? new Date(item.deliveryDate).toLocaleDateString('zh-CN') : '—'}</td>
                    <td className="py-3">{item.remarks || '—'}</td>
                    <td className="py-3 text-right font-mono">¥{Number(item.totalPrice).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Attachments */}
      {c.attachments && c.attachments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">合同附件</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {c.attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded bg-muted/50">
                  <button type="button" onClick={() => viewAttachment(att.id)} className="flex-1 text-left text-primary hover:underline">{att.originalName}</button>
                  <span className="text-xs text-muted-foreground">{(att.size / 1024).toFixed(0)} KB</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => viewAttachment(att.id)}>查看</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approval Timeline */}
      <ApprovalTimeline approvals={c.approvals} />
        </div>

        <FulfillmentProgress contract={c} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="font-medium mt-0.5">{value}</p>
    </div>
  );
}
