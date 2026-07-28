'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface Permission {
  id: string;
  code: string;
}

interface RoleOption {
  id: string;
  code: string;
  name: string;
  status: string;
  permissions: Array<{ permission: Permission }>;
  _count?: { assignments: number };
}

interface FlowNode {
  id: string;
  nodeName: string;
  step: number;
  condition: string;
  enabled: boolean;
  roleId: string;
  approvalMode: string;
  scopeType: string;
  role: RoleOption & { _count?: { assignments: number } };
}

interface ApprovalFlow {
  id: string;
  name: string;
  contractType: string;
  amountThreshold: string | null;
  status: string;
  nodes: FlowNode[];
  updatedAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  PURCHASE: '采购合同',
  SALES: '销售合同',
  BILATERAL: '双边合同',
};

const CONDITION_LABEL: Record<string, string> = {
  ALWAYS: '固定执行',
  AMOUNT_GTE_THRESHOLD: '达到金额门槛时执行',
};

const MODE_LABEL: Record<string, string> = {
  ALL: '会签（全部通过）',
  ANY: '或签（一人通过）',
};

const SCOPE_LABEL: Record<string, string> = {
  DEPARTMENT: '合同业务部门',
  COMPANY: '合同所属企业',
  ALL: '全平台',
};

export default function ApprovalFlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<ApprovalFlow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);

  const load = async () => {
    try {
      const [flowData, roleData] = await Promise.all([
        api.get<ApprovalFlow[]>('/approval-flows'),
        api.get<RoleOption[]>('/access-control/roles'),
      ]);
      setFlows(flowData || []);
      setRoles((roleData || []).filter((role) =>
        role.status === 'ACTIVE'
        && role.permissions.some((entry) => entry.permission.code === 'contract.approve'),
      ));
      setSelectedFlowId((current) =>
        current && flowData.some((flow) => flow.id === current)
          ? current
          : flowData[0]?.id || '',
      );
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

  const selectedFlow = useMemo(
    () => flows.find((flow) => flow.id === selectedFlowId),
    [flows, selectedFlowId],
  );

  const updateFlow = async (
    flow: ApprovalFlow,
    data: { amountThreshold?: number | null; status?: string },
  ) => {
    setSaving(flow.id);
    try {
      await api.patch(`/approval-flows/${flow.id}`, data);
      await load();
    } catch (error: any) {
      alert(error.message || '保存失败');
    } finally {
      setSaving(null);
    }
  };

  const updateNode = async (
    node: FlowNode,
    data: { roleId?: string; approvalMode?: string; scopeType?: string; enabled?: boolean },
  ) => {
    setSaving(node.id);
    try {
      await api.patch(`/approval-flows/nodes/${node.id}`, data);
      await load();
    } catch (error: any) {
      alert(error.message || '保存失败');
    } finally {
      setSaving(null);
    }
  };

  if (!authorized || loading) {
    return (
      <div className="flex justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />加载中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">审批流程</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          审批节点绑定角色；提交合同时按人员范围生成审批人快照。
        </p>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">审批流程列表</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-3 font-medium">合同类型</th>
                <th className="px-3 py-3 font-medium">流程名称</th>
                <th className="px-3 py-3 font-medium">流程状态</th>
                <th className="px-3 py-3 font-medium">总经理审批金额门槛（元）</th>
                <th className="px-3 py-3 font-medium">审批节点数</th>
                <th className="px-3 py-3 font-medium">最后更新时间</th>
                <th className="px-3 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((flow) => (
                <tr key={flow.id} className="border-b last:border-0">
                  <td className="px-3 py-3">{TYPE_LABEL[flow.contractType] || flow.contractType}</td>
                  <td className="px-3 py-3 font-medium">{flow.name}</td>
                  <td className="px-3 py-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={flow.status === 'ACTIVE'}
                        onChange={(event) => void updateFlow(flow, {
                          status: event.target.checked ? 'ACTIVE' : 'INACTIVE',
                        })}
                      />
                      {flow.status === 'ACTIVE'
                        ? <Badge>已启用</Badge>
                        : <Badge variant="secondary">已停用</Badge>}
                    </label>
                  </td>
                  <td className="px-3 py-3">
                    {flow.contractType === 'PURCHASE' ? (
                      <Input
                        type="number"
                        min="0"
                        className="h-8 w-44"
                        defaultValue={flow.amountThreshold || '1000000'}
                        onBlur={(event) => void updateFlow(flow, {
                          amountThreshold: Number(event.target.value) || 0,
                        })}
                      />
                    ) : '不适用'}
                  </td>
                  <td className="px-3 py-3">{flow.nodes.length}</td>
                  <td className="px-3 py-3">
                    {new Date(flow.updatedAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button
                      size="sm"
                      variant={selectedFlowId === flow.id ? 'default' : 'outline'}
                      onClick={() => setSelectedFlowId(flow.id)}
                    >
                      配置节点
                    </Button>
                    {saving === flow.id && (
                      <span className="ml-2 text-xs text-muted-foreground">保存中...</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedFlow && (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">{selectedFlow.name}—审批节点列表</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                会签节点需要范围内所有角色成员通过；或签节点由任意一名角色成员通过。
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-4 w-4" />
              角色成员请在“系统管理 → 用户与权限 → 用户授权”中维护
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-3 py-3 font-medium">审批顺序</th>
                  <th className="px-3 py-3 font-medium">节点名称</th>
                  <th className="px-3 py-3 font-medium">绑定审批角色</th>
                  <th className="px-3 py-3 font-medium">角色有效人数</th>
                  <th className="px-3 py-3 font-medium">审批方式</th>
                  <th className="px-3 py-3 font-medium">人员范围</th>
                  <th className="px-3 py-3 font-medium">启用条件</th>
                  <th className="px-3 py-3 font-medium">节点状态</th>
                </tr>
              </thead>
              <tbody>
                {selectedFlow.nodes.map((node) => (
                  <tr key={node.id} className="border-b align-middle last:border-0">
                    <td className="px-3 py-3">第 {node.step} 级</td>
                    <td className="px-3 py-3 font-medium">{node.nodeName}</td>
                    <td className="px-3 py-3">
                      <select
                        className="h-9 w-52 rounded-md border border-input bg-background px-3 text-sm"
                        value={node.roleId}
                        onChange={(event) => void updateNode(node, { roleId: event.target.value })}
                      >
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}（{role.code}）
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">{node.role?._count?.assignments || 0} 人</td>
                    <td className="px-3 py-3">
                      <select
                        className="h-9 w-44 rounded-md border border-input bg-background px-3 text-sm"
                        value={node.approvalMode}
                        onChange={(event) => void updateNode(node, { approvalMode: event.target.value })}
                      >
                        {Object.entries(MODE_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        className="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm"
                        value={node.scopeType}
                        onChange={(event) => void updateNode(node, { scopeType: event.target.value })}
                      >
                        {Object.entries(SCOPE_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      {CONDITION_LABEL[node.condition] || node.condition}
                    </td>
                    <td className="px-3 py-3">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={node.enabled}
                          onChange={(event) => void updateNode(node, { enabled: event.target.checked })}
                        />
                        {node.enabled ? '已启用' : '已停用'}
                      </label>
                      {saving === node.id && (
                        <span className="mt-1 block text-xs text-muted-foreground">保存中...</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
