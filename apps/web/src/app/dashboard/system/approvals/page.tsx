'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface UserOption { id: string; username: string; name: string; role: string; status: string }
interface FlowNode { id: string; nodeName: string; step: number; condition: string; enabled: boolean; assigneeId: string; assignee: UserOption }
interface ApprovalFlow { id: string; name: string; contractType: string; amountThreshold: string | null; status: string; nodes: FlowNode[]; updatedAt: string }

const TYPE_LABEL: Record<string, string> = { PURCHASE: '采购合同', SALES: '销售合同', BILATERAL: '双边合同' };

export default function ApprovalFlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<ApprovalFlow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);

  const load = async () => {
    try {
      const [flowData, userData] = await Promise.all([
        api.get<ApprovalFlow[]>('/approval-flows'),
        api.get<UserOption[]>('/users'),
      ]);
      setFlows(flowData);
      setUsers(userData.filter(user => user.status === 'ACTIVE' && ['APPROVER', 'ADMIN'].includes(user.role)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem('user');
    const user = stored ? JSON.parse(stored) as { role?: string } : null;

    if (user?.role !== 'ADMIN') {
      router.replace('/dashboard');
      return;
    }

    setAuthorized(true);
    void load();
  }, [router]);

  const updateFlow = async (flow: ApprovalFlow, data: { amountThreshold?: number | null; status?: string }) => {
    setSaving(flow.id);
    try {
      await api.patch(`/approval-flows/${flow.id}`, data);
      await load();
    } catch (e: any) {
      alert(e.message || '保存失败');
    } finally {
      setSaving(null);
    }
  };

  const updateNode = async (node: FlowNode, data: { assigneeId?: string; enabled?: boolean }) => {
    setSaving(node.id);
    try {
      await api.patch(`/approval-flows/nodes/${node.id}`, data);
      await load();
    } catch (e: any) {
      alert(e.message || '保存失败');
    } finally {
      setSaving(null);
    }
  };

  if (!authorized || loading) return <div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载中...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">审批流程</h1>
        <p className="mt-1 text-sm text-muted-foreground">配置固定顺序合同审批链、审批人和金额门槛</p>
      </div>

      <div className="grid gap-5">
        {flows.map(flow => (
          <Card key={flow.id} className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="font-semibold">{flow.name}</h2>
                  <p className="text-xs text-muted-foreground">{TYPE_LABEL[flow.contractType]} · 顺序审批</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={flow.status === 'ACTIVE'} onChange={e => void updateFlow(flow, { status: e.target.checked ? 'ACTIVE' : 'INACTIVE' })} />
                {flow.status === 'ACTIVE' ? <Badge>已启用</Badge> : <Badge variant="secondary">已停用</Badge>}
              </label>
            </div>

            {flow.contractType === 'PURCHASE' && (
              <div className="mb-5 max-w-sm">
                <label className="mb-1 block text-sm font-medium">总经理审批金额门槛（元）</label>
                <Input type="number" defaultValue={flow.amountThreshold || '1000000'} onBlur={e => void updateFlow(flow, { amountThreshold: Number(e.target.value) || 0 })} />
                <p className="mt-1 text-xs text-muted-foreground">合同金额达到该值时增加总经理审批节点</p>
              </div>
            )}

            <div className="space-y-3">
              {flow.nodes.map(node => (
                <div key={node.id} className="grid grid-cols-[80px_1fr_260px_100px] items-center gap-4 rounded-lg border p-3">
                  <span className="text-sm font-medium">第 {node.step} 级</span>
                  <div>
                    <div className="text-sm font-medium">{node.nodeName}</div>
                    <div className="text-xs text-muted-foreground">{node.condition === 'ALWAYS' ? '固定节点' : '达到金额门槛时启用'}</div>
                  </div>
                  <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={node.assigneeId} onChange={e => void updateNode(node, { assigneeId: e.target.value })}>
                    {users.map(user => <option key={user.id} value={user.id}>{user.name}（{user.username}）</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={node.enabled} onChange={e => void updateNode(node, { enabled: e.target.checked })} />启用
                  </label>
                  {saving === node.id && <span className="col-span-4 text-xs text-muted-foreground">保存中...</span>}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
