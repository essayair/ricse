'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Truck, DollarSign, Users, GitBranch, Building2, Package, Warehouse } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';

/* ── Types ── */

interface Supplier {
  id: string; code: string; name: string; contactPerson: string | null; contactPhone: string | null; status: string;
}
interface Material {
  id: string; code: string; name: string; category: string; unit: string; status: string;
}
interface Warehouse {
  id: string; code: string; name: string; address: string | null; status: string;
}
interface Vehicle {
  id: string; plate: string; driver: string; phone: string; carrier: string; status: string;
}
interface PriceItem {
  id: string; material: string; buyPrice: number; sellPrice: number; effectiveAt: string; status: string;
}
interface UserItem {
  id: string; name: string; role: string; phone: string; status: string;
}
interface ApprovalFlow {
  id: string; name: string; type: string; steps: number; status: string;
}

type TabKey = 'suppliers' | 'materials' | 'warehouses' | 'vehicles' | 'price' | 'users' | 'approval';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'suppliers', label: '往来单位', icon: Building2 },
  { key: 'materials', label: '物料品类', icon: Package },
  { key: 'warehouses', label: '仓库库位', icon: Warehouse },
  { key: 'vehicles', label: '车辆管理', icon: Truck },
  { key: 'price', label: '价格基准', icon: DollarSign },
  { key: 'users', label: '用户与权限', icon: Users },
  { key: 'approval', label: '审批流程', icon: GitBranch },
];

const API = 'http://localhost:3000/api/v1/master-data';

/* ── mock data for tabs without backend ── */

const MOCK_VEHICLES: Vehicle[] = [
  { id: '1', plate: '甘A·12345', driver: '王师傅', phone: '13800138001', carrier: '玉门运输公司', status: 'ACTIVE' },
  { id: '2', plate: '甘B·88890', driver: '李师傅', phone: '13800138002', carrier: '酒泉物流', status: 'ACTIVE' },
  { id: '3', plate: '甘C·66789', driver: '张师傅', phone: '13800138003', carrier: '玉门运输', status: 'INACTIVE' },
];

const MOCK_PRICES: PriceItem[] = [
  { id: '1', material: '萤石粉 CaF₂≥97%', buyPrice: 1450, sellPrice: 1550, effectiveAt: '2026-06-01', status: 'ACTIVE' },
  { id: '2', material: '萤石粉 CaF₂≥95%', buyPrice: 1280, sellPrice: 1380, effectiveAt: '2026-06-01', status: 'ACTIVE' },
  { id: '3', material: '萤石粉 CaF₂≥90%', buyPrice: 980, sellPrice: 1060, effectiveAt: '2026-06-05', status: 'ACTIVE' },
];

const MOCK_USERS: UserItem[] = [
  { id: '1', name: '运营管理员', role: 'ADMIN', phone: '13900000001', status: 'ACTIVE' },
  { id: '2', name: '采购员张三', role: 'USER', phone: '13900000002', status: 'ACTIVE' },
  { id: '3', name: '审批人李四', role: 'APPROVER', phone: '13900000003', status: 'ACTIVE' },
];

const MOCK_APPROVALS: ApprovalFlow[] = [
  { id: '1', name: '合同审批流', type: '合同', steps: 3, status: 'ACTIVE' },
  { id: '2', name: '结算审批流', type: '结算', steps: 2, status: 'ACTIVE' },
];

/* ── Badge helper ── */

const StatusBadge = ({ status }: { status: string }) => {
  const active = status === 'ACTIVE';
  return (
    <Badge variant={active ? 'default' : 'secondary'} className={active ? 'bg-success-bg text-success border-0' : ''}>
      {active ? '启用' : '停用'}
    </Badge>
  );
};

/* ── Page ── */

export default function MasterDataPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabFromUrl = searchParams.get('tab') as TabKey | null;
  const [tab, setTabState] = useState<TabKey>(tabFromUrl || 'suppliers');

  // Sync tab to URL
  const setTab = (t: TabKey) => {
    setTabState(t);
    router.replace(`/dashboard/master-data?tab=${t}`);
  };

  // Read tab from URL on mount and navigation
  useEffect(() => {
    if (tabFromUrl && TABS.some((t) => t.key === tabFromUrl)) {
      setTabState(tabFromUrl);
    }
  }, [tabFromUrl]);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = () => {
    fetch(`${API}/suppliers`).then((r) => r.json()).then((d) => setSuppliers(d.items || [])).catch(() => {});
    fetch(`${API}/materials`).then((r) => r.json()).then((d) => setMaterials(d.items || [])).catch(() => {});
    fetch(`${API}/warehouses`).then((r) => r.json()).then((d) => setWarehouses(Array.isArray(d) ? d : d.items || [])).catch(() => {});
  };

  useEffect(() => { fetchData(); }, []);

  const filteredSuppliers = suppliers.filter((s) => !searchTerm || s.name.includes(searchTerm) || s.code.includes(searchTerm));
  const filteredMaterials = materials.filter((m) => !searchTerm || m.name.includes(searchTerm) || m.code.includes(searchTerm));
  const filteredWarehouses = warehouses.filter((w) => !searchTerm || w.name.includes(searchTerm) || w.code.includes(searchTerm));
  const filteredVehicles = MOCK_VEHICLES.filter((v) => !searchTerm || v.plate.includes(searchTerm) || v.driver.includes(searchTerm));
  const filteredPrices = MOCK_PRICES.filter((p) => !searchTerm || p.material.includes(searchTerm));
  const filteredUsers = MOCK_USERS.filter((u) => !searchTerm || u.name.includes(searchTerm));
  const filteredApprovals = MOCK_APPROVALS.filter((a) => !searchTerm || a.name.includes(searchTerm));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">主数据管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理基础档案数据，支撑业务运行</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />新增
        </Button>
      </div>

      {/* Tabs (underline style matching prototype) */}
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

      {/* Search / Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`搜索${TABS.find((t) => t.key === tab)?.label || ''}...`}
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Content Tables */}
      <Card className="overflow-hidden">
        {/* 往来单位 */}
        {tab === 'suppliers' && (
          <DataTable
            headers={['编码', '名称', '联系人', '电话', '状态']}
            rows={filteredSuppliers.map((s) => [s.code, s.name, s.contactPerson || '-', s.contactPhone || '-', <StatusBadge key={s.id} status={s.status} />])}
            empty="暂无往来单位数据"
          />
        )}

        {/* 物料品类 */}
        {tab === 'materials' && (
          <DataTable
            headers={['编码', '名称', '分类', '单位', '状态']}
            rows={filteredMaterials.map((m) => [m.code, m.name, m.category, m.unit, <StatusBadge key={m.id} status={m.status} />])}
            empty="暂无物料数据"
          />
        )}

        {/* 仓库库位 */}
        {tab === 'warehouses' && (
          <DataTable
            headers={['编码', '名称', '地址', '状态']}
            rows={filteredWarehouses.map((w) => [w.code, w.name, w.address || '-', <StatusBadge key={w.id} status={w.status} />])}
            empty="暂无仓库数据"
          />
        )}

        {/* 车辆管理 */}
        {tab === 'vehicles' && (
          <DataTable
            headers={['车牌号', '司机', '电话', '承运商', '状态']}
            rows={filteredVehicles.map((v) => [v.plate, v.driver, v.phone, v.carrier, <StatusBadge key={v.id} status={v.status} />])}
            empty="暂无车辆数据"
          />
        )}

        {/* 价格基准 */}
        {tab === 'price' && (
          <DataTable
            headers={['物料', '采购价 (¥/吨)', '销售价 (¥/吨)', '生效日期', '状态']}
            rows={filteredPrices.map((p) => [
              p.material,
              <span key="bp" className="font-mono">{p.buyPrice.toLocaleString()}</span>,
              <span key="sp" className="font-mono">{p.sellPrice.toLocaleString()}</span>,
              p.effectiveAt,
              <StatusBadge key={p.id} status={p.status} />,
            ])}
            empty="暂无价格数据"
          />
        )}

        {/* 用户与权限 */}
        {tab === 'users' && (
          <DataTable
            headers={['姓名', '角色', '电话', '状态']}
            rows={filteredUsers.map((u) => [
              u.name,
              <Badge key="role" variant="outline">{u.role === 'ADMIN' ? '管理员' : u.role === 'APPROVER' ? '审批人' : '普通用户'}</Badge>,
              u.phone,
              <StatusBadge key={u.id} status={u.status} />,
            ])}
            empty="暂无用户数据"
          />
        )}

        {/* 审批流程 */}
        {tab === 'approval' && (
          <DataTable
            headers={['流程名称', '类型', '审批节点数', '状态']}
            rows={filteredApprovals.map((a) => [a.name, a.type, `${a.steps} 级`, <StatusBadge key={a.id} status={a.status} />])}
            empty="暂无审批流程配置"
          />
        )}
      </Card>
    </div>
  );
}

/* ── Shared data table ── */

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
                <td key={j} className="px-4 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 text-xs text-muted-foreground border-t">共 {rows.length} 条</div>
    </div>
  );
}
