'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, Edit3 } from 'lucide-react';
import { api } from '@/lib/api';

interface ContractDetail {
  id: string; contractNo: string; title: string; type: string; status: string;
  totalAmount: string; settlementMethod: string;
  signedAt: string; effectiveAt: string; expireAt: string;
  remarks: string | null; createdAt: string;
  creator: { name: string };
  seller: { id: string; code: string; name: string; roles: string[] } | null;
  buyer: { id: string; code: string; name: string; roles: string[] } | null;
  lineItems: Array<{ id: string; materialName: string; quantity: string; unit: string; unitPrice: string; totalPrice: string; deliveryDate: string | null }>;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'destructive' | 'outline' | 'secondary' }> = {
  DRAFT: { label: '草稿', variant: 'secondary' },
  PENDING_APPROVAL: { label: '待审批', variant: 'outline' },
  APPROVED: { label: '已通过', variant: 'default' },
  REJECTED: { label: '已驳回', variant: 'destructive' },
  EXECUTING: { label: '执行中', variant: 'default' },
  COMPLETED: { label: '已完成', variant: 'default' },
  VOIDED: { label: '已作废', variant: 'outline' },
};

const STATUS_ACTIONS: Record<string, { next: string; label: string; variant: 'default' | 'destructive' | 'outline' | 'secondary' }[]> = {
  DRAFT: [
    { next: 'PENDING_APPROVAL', label: '提交审批', variant: 'default' },
    { next: 'VOIDED', label: '作废', variant: 'destructive' },
  ],
  PENDING_APPROVAL: [
    { next: 'APPROVED', label: '审核通过', variant: 'default' },
    { next: 'REJECTED', label: '驳回', variant: 'destructive' },
  ],
  REJECTED: [
    { next: 'DRAFT', label: '修改重提', variant: 'default' },
  ],
  APPROVED: [
    { next: 'EXECUTING', label: '开始执行', variant: 'default' },
  ],
  EXECUTING: [
    { next: 'COMPLETED', label: '完成', variant: 'default' },
    { next: 'VOIDED', label: '终止', variant: 'destructive' },
  ],
};

const TYPE_LABEL: Record<string, string> = { PURCHASE: '采购合同', SALES: '销售合同', BILATERAL: '双边合同' };

export default function ContractDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchContract = async () => {
    try {
      const data = await api.get<ContractDetail>(`/contracts/${params.id}`);
      setContract(data);
    } catch { console.error('Failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchContract(); }, [params.id]);

  const handleStatusChange = async (status: string) => {
    try {
      await api.patch(`/contracts/${params.id}/status`, { status });
      fetchContract();
    } catch (e: any) { alert(e.message || '操作失败'); }
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...</div>;
  if (!contract) return <div className="p-12 text-center text-destructive">合同不存在</div>;

  const c = contract;
  const cfg = STATUS_MAP[c.status] || { label: c.status, variant: 'secondary' as const };
  const actions = STATUS_ACTIONS[c.status] || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.push('/dashboard/contracts')} className="text-sm text-primary hover:underline">&larr; 返回合同列表</button>
        {c.status === 'DRAFT' && (
          <Link href={`/dashboard/contracts/${c.id}/edit`}><Button variant="outline" size="sm"><Edit3 className="h-4 w-4 mr-1" />编辑</Button></Link>
        )}
      </div>

      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>{c.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{c.contractNo} · {TYPE_LABEL[c.type] || c.type} · 创建人: {c.creator?.name}</p>
          </div>
          <Badge variant={cfg.variant} className="text-sm px-3 py-1">{cfg.label}</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <Field label="卖方" value={<span>{c.seller ? `${c.seller.code} ${c.seller.name}` : '—'}</span>} />
            <Field label="买方" value={<span>{c.buyer ? `${c.buyer.code} ${c.buyer.name}` : '—'}</span>} />
            <Field label="总金额" value={<span className="text-lg font-bold text-primary">¥{Number(c.totalAmount).toLocaleString()}</span>} />
            <Field label="结算方式" value={c.settlementMethod} />
            <Field label="签订日期" value={c.signedAt ? new Date(c.signedAt).toLocaleDateString('zh-CN') : '—'} />
            <Field label="生效日期" value={c.effectiveAt ? new Date(c.effectiveAt).toLocaleDateString('zh-CN') : '—'} />
            <Field label="到期日期" value={c.expireAt ? new Date(c.expireAt).toLocaleDateString('zh-CN') : '—'} />
          </div>
          {c.remarks && <div className="mt-4 text-sm text-muted-foreground">备注: {c.remarks}</div>}

          {actions.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="flex gap-2">
                {actions.map((a) => <Button key={a.next} variant={a.variant} onClick={() => handleStatusChange(a.next)}>{a.label}</Button>)}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader><CardTitle className="text-base">合同行项</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2">物料</th><th className="pb-2">数量</th><th className="pb-2">单位</th><th className="pb-2">单价</th><th className="pb-2 text-right">小计</th></tr></thead>
            <tbody>
              {c.lineItems.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-3 font-medium">{item.materialName}</td>
                  <td className="py-3">{item.quantity}</td>
                  <td className="py-3">{item.unit}</td>
                  <td className="py-3 font-mono">¥{Number(item.unitPrice).toLocaleString()}</td>
                  <td className="py-3 text-right font-mono">¥{Number(item.totalPrice).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><span className="text-muted-foreground text-xs">{label}</span><p className="font-medium mt-0.5">{value}</p></div>;
}
