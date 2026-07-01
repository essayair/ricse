'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Building2, Users, Layers, Briefcase, Plus } from 'lucide-react';

type TabKey = 'company' | 'dept' | 'group' | 'position';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'company', label: '公司维护', icon: Building2 },
  { key: 'dept', label: '部门管理', icon: Layers },
  { key: 'group', label: '部门组', icon: Users },
  { key: 'position', label: '岗位管理', icon: Briefcase },
];

/* ── Mock data (prototype-compatible) ── */

const COMPANIES = [
  { id: '1', code: 'YM-001', name: '玉门萤石运营管理有限公司', unifiedCode: '91620981MA******', legalPerson: '张建国', phone: '0937-*******', status: 'ACTIVE' },
  { id: '2', code: 'JQ-001', name: '酒泉供应链管理有限公司', unifiedCode: '91620900MA******', legalPerson: '李明', phone: '0937-*******', status: 'ACTIVE' },
  { id: '3', code: 'JH-001', name: '巨化萤石（玉门）有限公司', unifiedCode: '91620981MA******', legalPerson: '王强', phone: '0937-*******', status: 'ACTIVE' },
];

const DEPTS = [
  { id: '1', name: '运营管理部', code: 'D-001', head: '张建国', parent: '-', status: 'ACTIVE' },
  { id: '2', name: '采购部', code: 'D-002', head: '赵刚', parent: '运营管理部', status: 'ACTIVE' },
  { id: '3', name: '销售部', code: 'D-003', head: '刘洋', parent: '运营管理部', status: 'ACTIVE' },
  { id: '4', name: '仓储物流部', code: 'D-004', head: '陈实', parent: '运营管理部', status: 'ACTIVE' },
  { id: '5', name: '质检部', code: 'D-005', head: '周明', parent: '运营管理部', status: 'ACTIVE' },
  { id: '6', name: '财务部', code: 'D-006', head: '吴丽', parent: '运营管理部', status: 'ACTIVE' },
];

const GROUPS = [
  { id: '1', name: '采购一组', code: 'G-001', dept: '采购部', head: '王磊', status: 'ACTIVE' },
  { id: '2', name: '采购二组', code: 'G-002', dept: '采购部', head: '孙强', status: 'ACTIVE' },
  { id: '3', name: '仓储一组', code: 'G-003', dept: '仓储物流部', head: '刘军', status: 'ACTIVE' },
  { id: '4', name: '质检一组', code: 'G-004', dept: '质检部', head: '何平', status: 'ACTIVE' },
];

const POSITIONS = [
  { id: '1', name: '部门经理', code: 'P-001', dept: '运营管理部', level: '高级', status: 'ACTIVE' },
  { id: '2', name: '采购主管', code: 'P-002', dept: '采购部', level: '中级', status: 'ACTIVE' },
  { id: '3', name: '采购员', code: 'P-003', dept: '采购部', level: '初级', status: 'ACTIVE' },
  { id: '4', name: '销售主管', code: 'P-004', dept: '销售部', level: '中级', status: 'ACTIVE' },
  { id: '5', name: '销售员', code: 'P-005', dept: '销售部', level: '初级', status: 'ACTIVE' },
  { id: '6', name: '仓管员', code: 'P-006', dept: '仓储物流部', level: '初级', status: 'ACTIVE' },
  { id: '7', name: '质检员', code: 'P-007', dept: '质检部', level: '初级', status: 'ACTIVE' },
  { id: '8', name: '财务', code: 'P-008', dept: '财务部', level: '中级', status: 'ACTIVE' },
];

const activeBadge = (status: string) => (
  <Badge variant={status === 'ACTIVE' ? 'default' : 'secondary'} className={status === 'ACTIVE' ? 'bg-success-bg text-success border-0' : ''}>
    {status === 'ACTIVE' ? '启用' : '停用'}
  </Badge>
);

export default function OrgPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabFromUrl = searchParams.get('tab') as TabKey | null;
  const [tab, setTabState] = useState<TabKey>(tabFromUrl || 'company');

  const setTab = (t: TabKey) => {
    setTabState(t);
    if (t === 'company') router.replace('/dashboard/org');
    else router.replace(`/dashboard/org?tab=${t}`);
  };

  useEffect(() => {
    if (tabFromUrl && TABS.some((t) => t.key === tabFromUrl)) setTabState(tabFromUrl);
  }, [tabFromUrl]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">组织数据</h1>
          <p className="text-sm text-muted-foreground mt-1">管理组织架构、部门信息和人员数据</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <Card className="overflow-hidden">
        {/* 公司维护 */}
        {tab === 'company' && (
          <DataTable
            headers={['公司编码', '公司名称', '统一社会信用代码', '法人代表', '联系电话', '状态']}
            rows={COMPANIES.map((c) => [c.code, c.name, c.unifiedCode, c.legalPerson, c.phone, activeBadge(c.status)])}
            empty="暂无公司数据"
          />
        )}

        {/* 部门管理 */}
        {tab === 'dept' && (
          <DataTable
            headers={['部门编码', '部门名称', '负责人', '上级部门', '状态']}
            rows={DEPTS.map((d) => [d.code, d.name, d.head, d.parent, activeBadge(d.status)])}
            empty="暂无部门数据"
          />
        )}

        {/* 部门组 */}
        {tab === 'group' && (
          <DataTable
            headers={['组编码', '组名称', '所属部门', '组长', '状态']}
            rows={GROUPS.map((g) => [g.code, g.name, g.dept, g.head, activeBadge(g.status)])}
            empty="暂无部门组数据"
          />
        )}

        {/* 岗位管理 */}
        {tab === 'position' && (
          <DataTable
            headers={['岗位编码', '岗位名称', '所属部门', '级别', '状态']}
            rows={POSITIONS.map((p) => [p.code, p.name, p.dept, p.level, activeBadge(p.status)])}
            empty="暂无岗位数据"
          />
        )}
      </Card>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <div className="p-12 text-center text-muted-foreground text-sm">{empty}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-xs text-muted-foreground border-t">共 {rows.length} 条</div>
    </div>
  );
}
