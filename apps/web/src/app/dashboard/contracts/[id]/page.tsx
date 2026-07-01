'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface ContractDetail {
  id: string;
  contractNo: string;
  title: string;
  type: string;
  status: string;
  totalAmount: string;
  settlementMethod: string;
  signedAt: string;
  effectiveAt: string;
  expireAt: string;
  remarks: string | null;
  createdAt: string;
  creator: { name: string };
  lineItems: Array<{
    id: string;
    materialName: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    totalPrice: string;
    deliveryDate: string | null;
  }>;
}

const STATUS_ACTIONS: Record<string, { next: string; label: string; variant: 'default' | 'destructive' | 'outline' | 'secondary' }[]> = {
  DRAFT: [
    { next: 'PENDING_APPROVAL', label: '提交审批', variant: 'default' },
    { next: 'VOIDED', label: '作废', variant: 'destructive' },
  ],
  PENDING_APPROVAL: [
    { next: 'APPROVED', label: '审核通过', variant: 'default' },
    { next: 'REJECTED', label: '驳回', variant: 'destructive' },
  ],
  APPROVED: [
    { next: 'EXECUTING', label: '开始执行', variant: 'default' },
  ],
  EXECUTING: [
    { next: 'COMPLETED', label: '完成', variant: 'default' },
    { next: 'VOIDED', label: '终止', variant: 'destructive' },
  ],
};

const STATUS_STEPS = [
  { key: 'DRAFT', label: '草稿', icon: '📝' },
  { key: 'PENDING_APPROVAL', label: '待审批', icon: '⏳' },
  { key: 'APPROVED', label: '已通过', icon: '✅' },
  { key: 'EXECUTING', label: '执行中', icon: '🚀' },
  { key: 'COMPLETED', label: '已完成', icon: '🎯' },
];

export default function ContractDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchContract = async () => {
    try {
      const res = await fetch(`http://localhost:3000/api/v1/contracts/${params.id}`);
      const json = await res.json();
      setContract(json);
    } catch {
      console.error('Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchContract(); }, [params.id]);

  const handleStatusChange = async (status: string) => {
    try {
      const res = await fetch(`http://localhost:3000/api/v1/contracts/${params.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) fetchContract();
      else {
        const err = await res.json();
        alert(err.message || '操作失败');
      }
    } catch {
      alert('操作失败');
    }
  };

  if (loading) return <div className="p-12 text-center text-muted-foreground">加载中...</div>;
  if (!contract) return <div className="p-12 text-center text-destructive">合同不存在</div>;

  const actions = STATUS_ACTIONS[contract.status] || [];
  const currentStepIdx = STATUS_STEPS.findIndex((s) => s.key === contract.status);

  return (
    <div className="space-y-6">
      <button onClick={() => router.push('/dashboard/contracts')} className="text-sm text-primary hover:underline">
        &larr; 返回合同列表
      </button>

      {/* Status Progress Bar */}
      <Card>
        <CardContent className="p-0">
          <div className="flex">
            {STATUS_STEPS.map((step, i) => {
              const isDone = i < currentStepIdx;
              const isCurrent = i === currentStepIdx;
              return (
                <div
                  key={step.key}
                  className={`flex-1 p-4 text-center text-sm border-r last:border-r-0 ${
                    isCurrent ? 'bg-primary/5 font-semibold text-primary' :
                    isDone ? 'bg-success-bg text-success' : 'text-muted-foreground'
                  }`}
                >
                  <div className="text-lg mb-1">{step.icon}</div>
                  <div>{step.label}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Main Info */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>{contract.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {contract.contractNo} · 创建人: {contract.creator?.name}
            </p>
          </div>
          <Badge variant="secondary" className="text-sm px-3 py-1">
            {contract.status === 'DRAFT' && '草稿'}
            {contract.status === 'PENDING_APPROVAL' && '待审批'}
            {contract.status === 'APPROVED' && '已通过'}
            {contract.status === 'REJECTED' && '已驳回'}
            {contract.status === 'EXECUTING' && '执行中'}
            {contract.status === 'COMPLETED' && '已完成'}
            {contract.status === 'VOIDED' && '已作废'}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">类型</span>
              <p className="font-medium">{contract.type === 'PURCHASE' ? '采购合同' : contract.type === 'SALES' ? '销售合同' : '双边合同'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">总金额</span>
              <p className="font-medium text-lg text-primary">¥{Number(contract.totalAmount).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">结算方式</span>
              <p className="font-medium">{contract.settlementMethod}</p>
            </div>
            <div>
              <span className="text-muted-foreground">签订日期</span>
              <p className="font-medium">{contract.signedAt ? new Date(contract.signedAt).toLocaleDateString('zh-CN') : '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">生效日期</span>
              <p className="font-medium">{contract.effectiveAt ? new Date(contract.effectiveAt).toLocaleDateString('zh-CN') : '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">到期日期</span>
              <p className="font-medium">{contract.expireAt ? new Date(contract.expireAt).toLocaleDateString('zh-CN') : '-'}</p>
            </div>
          </div>
          {contract.remarks && (
            <div className="mt-4 text-sm">
              <span className="text-muted-foreground">备注: </span>
              {contract.remarks}
            </div>
          )}

          {actions.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="flex gap-2">
                {actions.map((action) => (
                  <Button
                    key={action.next}
                    variant={action.variant}
                    onClick={() => handleStatusChange(action.next)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">合同行项</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4">物料名称</th>
                <th className="pb-2 pr-4">数量</th>
                <th className="pb-2 pr-4">单位</th>
                <th className="pb-2 pr-4">单价</th>
                <th className="pb-2 pr-4 text-right">小计</th>
              </tr>
            </thead>
            <tbody>
              {contract.lineItems.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{item.materialName}</td>
                  <td className="py-3 pr-4">{item.quantity}</td>
                  <td className="py-3 pr-4">{item.unit}</td>
                  <td className="py-3 pr-4 font-mono">¥{Number(item.unitPrice).toLocaleString()}</td>
                  <td className="py-3 pr-4 text-right font-mono">¥{Number(item.totalPrice).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
