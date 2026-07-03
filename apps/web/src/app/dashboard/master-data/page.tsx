'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus, Search, Truck, DollarSign, Users, GitBranch,
  Building2, Package, Warehouse, X,
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

/* ── Types ── */

interface Partner {
  id: string; code: string; name: string; shortName: string | null;
  roles: string[]; contactPerson: string | null; contactPhone: string | null;
  taxId: string | null; status: string;
}
interface MaterialCategory { id: string; name: string; }
interface Material {
  id: string; code: string; name: string;
  category: { id: string; name: string }; grade: string; unit: string; status: string;
}
interface WarehouseItem {
  id: string; code: string; name: string; type: string;
  address: string | null; manager: string | null;
  partner: { id: string; name: string } | null; status: string;
}
interface Vehicle {
  id: string; plateNo: string; vehicleType: string; loadCapacity: string;
  owner: { name: string } | null; ownerType: string;
  driverName: string | null; driverPhone: string | null; status: string;
}
interface PriceItem { id: string; material: string; buyPrice: number; sellPrice: number; effectiveAt: string; status: string; }
interface UserItem { id: string; name: string; role: string; phone: string; status: string; }
interface ApprovalFlow { id: string; name: string; type: string; steps: number; status: string; }

type TabKey = 'partners' | 'materials' | 'warehouses' | 'vehicles' | 'price' | 'users' | 'approval';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'partners',   label: '往来单位', icon: Building2 },
  { key: 'materials',  label: '物料品类', icon: Package },
  { key: 'warehouses', label: '仓库管理', icon: Warehouse },
  { key: 'vehicles',   label: '车辆管理', icon: Truck },
  { key: 'price',      label: '价格基准', icon: DollarSign },
  { key: 'users',      label: '用户与权限', icon: Users },
  { key: 'approval',   label: '审批流程', icon: GitBranch },
];

const PARTNER_ROLES = [
  { key: '',         label: '全部' },
  { key: 'SUPPLIER', label: '供应商' },
  { key: 'CUSTOMER', label: '客户' },
  { key: 'CARRIER',  label: '承运商' },
  { key: 'INTERNAL', label: '内部企业' },
];

const ROLE_CONFIG: Record<string, { label: string; className: string }> = {
  SUPPLIER: { label: '供应商', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  CUSTOMER: { label: '客户',   className: 'bg-success-bg text-success border-0' },
  CARRIER:  { label: '承运商', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  INTERNAL: { label: '内部企业', className: 'bg-orange-50 text-orange-700 border-orange-200' },
};

const VEHICLE_TYPE: Record<string, string> = {
  TRUCK: '自卸车', TANK: '罐车', TRAILER: '挂车',
};

/* ── Mock data (price / users / approval — 后续迭代接真实接口) ── */

const MOCK_PRICES: PriceItem[] = [
  { id: '1', material: '萤石粉 CaF₂≥97%', buyPrice: 1450, sellPrice: 1550, effectiveAt: '2026-06-01', status: 'ACTIVE' },
  { id: '2', material: '萤石粉 CaF₂≥95%', buyPrice: 1280, sellPrice: 1380, effectiveAt: '2026-06-01', status: 'ACTIVE' },
  { id: '3', material: '萤石粉 CaF₂≥90%', buyPrice: 980,  sellPrice: 1060, effectiveAt: '2026-06-05', status: 'ACTIVE' },
];
const MOCK_USERS: UserItem[] = [
  { id: '1', name: '系统管理员', role: 'ADMIN',    phone: '13900000001', status: 'ACTIVE' },
  { id: '2', name: '采购员张三', role: 'USER',     phone: '13900000002', status: 'ACTIVE' },
  { id: '3', name: '审批人李四', role: 'APPROVER', phone: '13900000003', status: 'ACTIVE' },
];
const MOCK_APPROVALS: ApprovalFlow[] = [
  { id: '1', name: '合同审批流', type: '合同', steps: 3, status: 'ACTIVE' },
  { id: '2', name: '结算审批流', type: '结算', steps: 2, status: 'ACTIVE' },
];

/* ── Helpers ── */

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; className: string }> = {
    ACTIVE:    { label: '启用',  className: 'bg-success-bg text-success border-0' },
    INACTIVE:  { label: '停用',  className: '' },
    BLACKLIST: { label: '黑名单', className: 'bg-destructive-bg text-destructive border-0' },
  };
  const cfg = map[status] || { label: status, className: '' };
  return <Badge variant="secondary" className={cfg.className}>{cfg.label}</Badge>;
};

const RoleBadges = ({ roles }: { roles: string[] }) => (
  <div className="flex flex-wrap gap-1">
    {roles.map((r) => {
      const cfg = ROLE_CONFIG[r];
      if (!cfg) return null;
      return <Badge key={r} variant="outline" className={`text-xs ${cfg.className}`}>{cfg.label}</Badge>;
    })}
  </div>
);

/* ── Create Partner Modal ── */

const INIT_FORM = {
  code: '', name: '', shortName: '', taxId: '', legalPerson: '',
  contactPerson: '', contactPhone: '', address: '',
  roles: [] as string[], remark: '',
  codeMode: 'auto' as 'auto' | 'manual',
};

function CreatePartnerModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [form, setForm] = useState(INIT_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isInternal = form.roles.includes('INTERNAL');

  // Auto-generate code (non-internal only)
  useEffect(() => {
    if (open && !isInternal && form.codeMode === 'auto') {
      api.get<string>('/partners/next-code')
        .then((code) => setForm((f) => ({ ...f, code })))
        .catch(() => {});
    }
  }, [open, isInternal, form.codeMode]);

  const toggleRole = (role: string) => {
    setForm((f) => {
      const next = f.roles.includes(role)
        ? f.roles.filter((r) => r !== role)
        : [...f.roles, role];
      // 切到内部企业时，清除编码以便手动输入
      if (role === 'INTERNAL' && !f.roles.includes('INTERNAL')) {
        return { ...f, roles: next, code: '', codeMode: 'manual' as const };
      }
      return { ...f, roles: next };
    });
  };

  const handleSubmit = async () => {
    if (!form.name) { setError('请填写企业名称'); return; }
    if (!form.roles.length) { setError('请至少选择一个角色'); return; }
    if (!form.code) { setError('请填写合作伙伴编码'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post('/partners', {
        code: form.code,
        name: form.name,
        shortName: form.shortName || undefined,
        taxId: form.taxId || undefined,
        legalPerson: form.legalPerson || undefined,
        contactPerson: form.contactPerson || undefined,
        contactPhone: form.contactPhone || undefined,
        address: form.address || undefined,
        roles: form.roles,
        remark: form.remark || undefined,
      });
      onCreated();
      onClose();
      setForm(INIT_FORM);
    } catch (e: any) {
      setError(e.message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新建往来单位</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 角色 */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">角色 <span className="text-destructive">*</span></label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleRole(key)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    form.roles.includes(key)
                      ? `${cfg.className} font-medium`
                      : 'border-input text-muted-foreground hover:border-foreground'
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* 合作伙伴编码 */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              合作伙伴编码 <span className="text-destructive">*</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {isInternal ? '（内部：4位字母数字，手动录入）' : '（外部：6位数字）'}
              </span>
            </label>
            <div className="flex gap-2">
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder={isInternal ? '如：HQ01' : '000001'}
                maxLength={isInternal ? 4 : 6}
                disabled={!isInternal && form.codeMode === 'auto'}
                className="font-mono"
              />
              {!isInternal && (
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => setForm((f) => ({
                    ...f,
                    codeMode: f.codeMode === 'auto' ? 'manual' : 'auto',
                    code: f.codeMode === 'auto' ? '' : f.code,
                  }))}
                >
                  {form.codeMode === 'auto' ? '手动输入' : '自动生成'}
                </Button>
              )}
            </div>
          </div>

          {/* 企业名称 */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">企业名称 <span className="text-destructive">*</span></label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="企业全称" />
          </div>

          {/* 统一信用代码 */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">统一社会信用代码</label>
            <Input value={form.taxId} onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))} placeholder="18位信用代码" maxLength={18} />
          </div>

          {/* 简称 + 法人 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">简称</label>
              <Input value={form.shortName} onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">法定代表人</label>
              <Input value={form.legalPerson} onChange={(e) => setForm((f) => ({ ...f, legalPerson: e.target.value }))} />
            </div>
          </div>

          {/* 联系人 + 电话 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">联系人</label>
              <Input value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">联系电话</label>
              <Input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} />
            </div>
          </div>

          {/* 地址 */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">注册地址</label>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? '创建中...' : '确认创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ── */

export default function MasterDataPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabFromUrl = searchParams.get('tab') as TabKey | null;
  const [tab, setTabState] = useState<TabKey>(tabFromUrl || 'partners');

  const setTab = (t: TabKey) => {
    setTabState(t);
    router.replace(`/dashboard/master-data?tab=${t}`);
  };

  useEffect(() => {
    if (tabFromUrl && TABS.some((t) => t.key === tabFromUrl)) {
      setTabState(tabFromUrl);
    }
  }, [tabFromUrl]);

  // Data
  const [partners, setPartners] = useState<Partner[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // UI state
  const [showCreate, setShowCreate] = useState(false);

  const fetchPartners = useCallback(() => {
    const params = new URLSearchParams();
    if (roleFilter) params.set('role', roleFilter);
    if (searchTerm) params.set('search', searchTerm);
    api.get<{ items: Partner[] }>(`/partners?${params}`).then((d) => setPartners(d.items || [])).catch(() => {});
  }, [roleFilter, searchTerm]);

  const fetchMaterials = useCallback(() => {
    const params = new URLSearchParams();
    if (categoryFilter) params.set('categoryId', categoryFilter);
    if (searchTerm) params.set('search', searchTerm);
    api.get<{ items: Material[] }>(`/master-data/materials?${params}`).then((d) => setMaterials(d.items || [])).catch(() => {});
  }, [categoryFilter, searchTerm]);

  useEffect(() => {
    api.get<MaterialCategory[]>('/master-data/material-categories').then(setCategories).catch(() => {});
    api.get<WarehouseItem[]>('/master-data/warehouses').then((d) => setWarehouses(Array.isArray(d) ? d : [])).catch(() => {});
    api.get<{ items: Vehicle[] }>('/partners/vehicles').then((d) => setVehicles(d.items || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchPartners(); }, [fetchPartners]);
  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  // Clear search when switching tabs
  useEffect(() => { setSearchTerm(''); }, [tab]);

  const currentLabel = TABS.find((t) => t.key === tab)?.label || '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">主数据管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理基础档案数据，支撑业务运行</p>
        </div>
        {(tab === 'partners') && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />新建往来单位
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
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

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* 角色筛选（往来单位 tab） */}
        {tab === 'partners' && (
          <div className="flex gap-1">
            {PARTNER_ROLES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRoleFilter(r.key)}
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  roleFilter === r.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* 分类筛选（物料 tab） */}
        {tab === 'materials' && categories.length > 0 && (
          <div className="flex gap-1">
            <button
              onClick={() => setCategoryFilter('')}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                !categoryFilter ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >全部</button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryFilter(c.id)}
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  categoryFilter === c.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* 搜索 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`搜索${currentLabel}...`}
            className="pl-9 w-56"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <Card className="overflow-hidden">
        {/* 往来单位 */}
        {tab === 'partners' && (
          <DataTable
            headers={['编码', '名称', '角色', '联系人', '联系电话', '状态']}
            rows={partners.map((p) => [
              <span key="c" className="font-mono text-xs">{p.code}</span>,
              <div key="n">
                <div className="font-medium">{p.name}</div>
                {p.shortName && <div className="text-xs text-muted-foreground">{p.shortName}</div>}
              </div>,
              <RoleBadges key="r" roles={p.roles} />,
              p.contactPerson || '-',
              p.contactPhone || '-',
              <StatusBadge key="s" status={p.status} />,
            ])}
            empty="暂无往来单位数据"
          />
        )}

        {/* 物料品类 */}
        {tab === 'materials' && (
          <DataTable
            headers={['编码', '品名', '分类', '品级', '单位', '状态']}
            rows={materials.map((m) => [
              <span key="c" className="font-mono text-xs">{m.code}</span>,
              m.name,
              <Badge key="cat" variant="outline" className="text-xs">{m.category?.name || '-'}</Badge>,
              <span key="g" className="text-xs text-muted-foreground">{m.grade}</span>,
              m.unit,
              <StatusBadge key="s" status={m.status} />,
            ])}
            empty="暂无物料数据"
          />
        )}

        {/* 仓库管理 */}
        {tab === 'warehouses' && (
          <DataTable
            headers={['编码', '名称', '类型', '仓管员', '地址', '状态']}
            rows={warehouses.map((w) => [
              <span key="c" className="font-mono text-xs">{w.code}</span>,
              <div key="n">
                <div className="font-medium">{w.name}</div>
                {w.partner && <div className="text-xs text-muted-foreground">{w.partner.name}</div>}
              </div>,
              <Badge key="t" variant="outline" className="text-xs">{w.type === 'SELF' ? '自有' : '租赁'}</Badge>,
              w.manager || '-',
              w.address || '-',
              <StatusBadge key="s" status={w.status} />,
            ])}
            empty="暂无仓库数据"
          />
        )}

        {/* 车辆管理 */}
        {tab === 'vehicles' && (
          <DataTable
            headers={['车牌号', '车型', '核定载重(吨)', '归属', '驾驶员', '状态']}
            rows={vehicles.map((v) => [
              <span key="p" className="font-mono font-medium">{v.plateNo}</span>,
              VEHICLE_TYPE[v.vehicleType] || v.vehicleType,
              <span key="l" className="font-mono">{Number(v.loadCapacity).toFixed(1)}</span>,
              <div key="o">
                <Badge variant="outline" className="text-xs mr-1">{v.ownerType === 'SELF' ? '自有' : '外协'}</Badge>
                {v.owner?.name && <span className="text-xs text-muted-foreground">{v.owner.name}</span>}
              </div>,
              v.driverName ? `${v.driverName} ${v.driverPhone || ''}` : '-',
              <StatusBadge key="s" status={v.status} />,
            ])}
            empty="暂无车辆数据"
          />
        )}

        {/* 价格基准（mock） */}
        {tab === 'price' && (
          <>
            <div className="px-4 py-2.5 bg-warning-bg text-warning text-xs border-b">
              价格基准模块将在行情模块中实现，当前为示例数据
            </div>
            <DataTable
              headers={['物料', '采购价 (¥/吨)', '销售价 (¥/吨)', '生效日期', '状态']}
              rows={MOCK_PRICES.filter((p) => !searchTerm || p.material.includes(searchTerm)).map((p) => [
                p.material,
                <span key="b" className="font-mono">¥{p.buyPrice.toLocaleString()}</span>,
                <span key="s2" className="font-mono">¥{p.sellPrice.toLocaleString()}</span>,
                p.effectiveAt,
                <StatusBadge key="st" status={p.status} />,
              ])}
              empty="暂无价格数据"
            />
          </>
        )}

        {/* 用户与权限（mock） */}
        {tab === 'users' && (
          <DataTable
            headers={['姓名', '角色', '电话', '状态']}
            rows={MOCK_USERS.filter((u) => !searchTerm || u.name.includes(searchTerm)).map((u) => [
              u.name,
              <Badge key="r" variant="outline">
                {u.role === 'ADMIN' ? '管理员' : u.role === 'APPROVER' ? '审批人' : '普通用户'}
              </Badge>,
              u.phone,
              <StatusBadge key="s" status={u.status} />,
            ])}
            empty="暂无用户数据"
          />
        )}

        {/* 审批流程（mock） */}
        {tab === 'approval' && (
          <DataTable
            headers={['流程名称', '类型', '审批节点数', '状态']}
            rows={MOCK_APPROVALS.filter((a) => !searchTerm || a.name.includes(searchTerm)).map((a) => [
              a.name, a.type, `${a.steps} 级`, <StatusBadge key="s" status={a.status} />,
            ])}
            empty="暂无审批流程配置"
          />
        )}
      </Card>

      {/* Create Partner Modal */}
      <CreatePartnerModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchPartners}
      />
    </div>
  );
}

/* ── Shared DataTable ── */

function DataTable({ headers, rows, empty }: {
  headers: string[]; rows: React.ReactNode[][]; empty: string;
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
              <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider whitespace-nowrap">
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
