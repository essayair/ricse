'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, Edit3, CheckCircle2, XCircle, Clock, User } from 'lucide-react';
import { api } from '@/lib/api';

interface Approval {
  id: string;
  status: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: { id: string; name: string; role: string };
}

interface ContractDetail {
  id: string; contractNo: string; title: string; type: string; status: string;
  totalAmount: string; settlementMethod: string;
  signedAt: string | null; effectiveAt: string | null; expireAt: string | null;
  remarks: string | null; createdAt: string;
  company?: { code: string; name: string } | null;
  externalNo?: string; contactPerson?: string; contactPhone?: string;
  pricingType?: string; overfillPct?: string; shortfallPct?: string;
  deliveryMethod?: string; deliveryLocation?: string;
  settlementBasis?: string; prepayPct?: string; paymentDays?: number; paymentMethod?: string;
  moistureRule?: string; impurityRule?: string;
  creator: { name: string };
  seller: { id: string; code: string; name: string; roles: string[] } | null;
  buyer: { id: string; code: string; name: string; roles: string[] } | null;
  attachments?: Array<{ id: string; originalName: string; mimeType: string; size: number; category: string }>;
  lineItems: Array<{ id: string; materialName: string | null; quantity: string; unit: string; unitPrice: string; totalPrice: string; deliveryDate: string | null }>;
  approvals: Approval[];
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
    USER:        [{ next: 'PENDING_APPROVAL', label: '提交审批', variant: 'default' }],
  },
  PENDING_APPROVAL: {
    APPROVER: [
      { next: 'APPROVED', label: '审核通过', variant: 'default', needsComment: true },
      { next: 'REJECTED', label: '驳回', variant: 'destructive', needsComment: true },
    ],
    ADMIN: [
      { next: 'APPROVED', label: '审核通过', variant: 'default', needsComment: true },
      { next: 'REJECTED', label: '驳回', variant: 'destructive', needsComment: true },
    ],
    SALESPERSON: [{ next: 'DRAFT', label: '撤回', variant: 'outline' }],
    MANAGER:     [{ next: 'DRAFT', label: '撤回', variant: 'outline' }],
  },
  REJECTED: {
    SALESPERSON: [{ next: 'DRAFT', label: '修改重提', variant: 'default' }],
    MANAGER:     [{ next: 'DRAFT', label: '修改重提', variant: 'default' }],
    ADMIN:       [{ next: 'DRAFT', label: '修改重提', variant: 'default' }],
  },
  APPROVED: {
    MANAGER: [{ next: 'EXECUTING', label: '开始执行', variant: 'default' }],
    ADMIN:   [{ next: 'EXECUTING', label: '开始执行', variant: 'default' }, { next: 'VOIDED', label: '作废', variant: 'destructive' }],
  },
  EXECUTING: {
    MANAGER: [{ next: 'COMPLETED', label: '标记完成', variant: 'default' }, { next: 'CLOSED', label: '关闭', variant: 'outline' }],
    ADMIN:   [{ next: 'COMPLETED', label: '标记完成', variant: 'default' }, { next: 'CLOSED', label: '关闭', variant: 'outline' }, { next: 'VOIDED', label: '终止', variant: 'destructive' }],
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
                  <span className="text-sm font-medium">{a.assignee?.name}</span>
                  <Badge variant={a.status === 'APPROVED' ? 'default' : a.status === 'REJECTED' ? 'destructive' : 'secondary'} className="text-xs">
                    {a.status === 'APPROVED' ? '已通过' : a.status === 'REJECTED' ? '已驳回' : '待审批'}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(a.status !== 'PENDING' ? a.updatedAt : a.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
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

  const fetchContract = async () => {
    try {
      const data = await api.get<ContractDetail>(`/contracts/${params.id}`);
      setContract(data);
    } catch { console.error('Failed to load contract'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchContract(); }, [params.id]);

  const handleStatusChange = async (status: string, comment?: string) => {
    try {
      await api.patch(`/contracts/${params.id}/status`, { status, comment });
      setPendingAction(null);
      fetchContract();
    } catch (e: any) { alert(e.message || '操作失败'); }
  };

  const handleActionClick = (action: typeof pendingAction) => {
    if (!action) return;
    if (action.needsComment) {
      setPendingAction(action);
    } else {
      handleStatusChange(action.next);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...</div>;
  if (!contract) return <div className="p-12 text-center text-destructive">合同不存在</div>;

  const c = contract;
  const cfg = STATUS_MAP[c.status] || { label: c.status, variant: 'secondary' as const };
  const userRole = currentUser?.role || 'USER';
  const actions = ROLE_ACTIONS[c.status]?.[userRole] || ROLE_ACTIONS[c.status]?.['USER'] || [];
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
        {canEdit && (
          <Link href={`/dashboard/contracts/${c.id}/edit`}>
            <Button variant="outline" size="sm"><Edit3 className="h-4 w-4 mr-1" />编辑</Button>
          </Link>
        )}
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
            <Field label="卖方" value={c.seller ? `${c.seller.code} ${c.seller.name}` : '—'} />
            <Field label="买方" value={c.buyer ? `${c.buyer.code} ${c.buyer.name}` : '—'} />
            <Field label="签约主体" value={c.company ? `${c.company.code} ${c.company.name}` : '—'} />
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
          </div>

          {(c.prepayPct || c.paymentDays || c.paymentMethod || c.moistureRule) && (
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
          )}

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
                  <th className="pb-2 text-right">小计</th>
                </tr>
              </thead>
              <tbody>
                {c.lineItems.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{item.materialName || '—'}</td>
                    <td className="py-3">{Number(item.quantity).toLocaleString()}</td>
                    <td className="py-3">{item.unit}</td>
                    <td className="py-3 font-mono">¥{Number(item.unitPrice).toLocaleString()}</td>
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
                  <span className="flex-1">{att.originalName}</span>
                  <span className="text-xs text-muted-foreground">{(att.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approval Timeline */}
      <ApprovalTimeline approvals={c.approvals} />
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
