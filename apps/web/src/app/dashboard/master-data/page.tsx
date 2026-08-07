'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, Search, Truck, DollarSign,
  Building2, Package, Warehouse, X, MapPin, ExternalLink, FolderTree,
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { unitLabel } from '@/lib/unit';

/* ── Types ── */

interface Partner {
  id: string; code: string; name: string; shortName: string | null;
  roles: string[]; isInternal: boolean;
  category: string | null; legalPerson: string | null;
  contactPerson: string | null; contactPhone: string | null;
  province: string | null; city: string | null;
  taxId: string | null; taxRating: string | null;
  creditLimit: string | null; status: string;
}
interface MaterialCategory { id: string; name: string; }
interface Material {
  id: string; code: string; name: string;
  category: { id: string; name: string }; grade: string | null; unit: string; status: string;
  referenceType: string; commodityForm: string | null;
  standardCommodity: { id: string; code: string; name: string } | null;
  internalCode: string | null; spec: string | null; sourceRegion: string | null; packageType: string | null;
  hsCode: string | null; qcTemplate: string | null; isVirtual: boolean;
}
interface WarehouseItem {
  id: string; code: string; name: string; type: string;
  address: string | null; manager: string | null; managerPhone: string | null;
  partner: { id: string; name: string } | null; status: string;
}
interface Vehicle {
  id: string; plateNo: string; vehicleType: string; loadCapacity: string;
  brand: string | null; tareWeight: string | null; plateColor: string | null; deviceType: string | null; deviceNo: string | null; remark: string | null;
  owner: { id: string; name: string; isInternal: boolean } | null; ownerType: string;
  ownerName: string | null; ownerPhone: string | null;
  driverName: string | null; driverPhone: string | null; status: string;
  drivers: Array<{ id: string; role: string; driver: { id: string; name: string; phone: string } }>;
  operationStatus: string;
  _count: { waybills: number };
}
interface VehicleOwnerOption { id: string; partnerId: string; partner: { id: string; code: string; name: string } }
interface PriceItem { id: string; material: string; buyPrice: number; sellPrice: number; effectiveAt: string; status: string; }

type TabKey = 'partners' | 'materials' | 'warehouses' | 'vehicles' | 'price';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'partners',   label: '合作伙伴', icon: Building2 },
  { key: 'materials',  label: '商品物料', icon: Package },
  { key: 'warehouses', label: '仓库管理', icon: Warehouse },
  { key: 'vehicles',   label: '车辆管理', icon: Truck },
  { key: 'price',      label: '价格基准', icon: DollarSign },
];

const PARTNER_ROLES = [
  { key: '',         label: '全部' },
  { key: 'SUPPLIER', label: '供应商' },
  { key: 'CUSTOMER', label: '客户' },
];

const ROLE_CONFIG: Record<string, { label: string; className: string }> = {
  SUPPLIER: { label: '供应商', className: 'text-blue-600 dark:text-blue-400 font-medium' },
  CUSTOMER: { label: '客户',   className: 'text-emerald-600 dark:text-emerald-400 font-medium' },
};

const VEHICLE_TYPE: Record<string, string> = {
  SEMI_TRAILER: '半挂车（标准型）', HEAVY_SEMI_TRAILER: '半挂车（超重型）', BOX_TRUCK: '厢式货车', DUMP_TRUCK: '自卸车', TANK_TRUCK: '槽罐车',
  TRUCK: '自卸车', TANK: '罐车', TRAILER: '挂车',
};

const CATEGORY_CONFIG: Record<string, { label: string; className: string }> = {
  CORE:   { label: '核心', className: 'bg-primary-bg text-primary border-0' },
  NORMAL: { label: '普通', className: '' },
  TEMP:   { label: '临时', className: 'bg-warning-bg text-warning border-0' },
};

const TAX_RATING_CONFIG: Record<string, string> = {
  A级: 'bg-success-bg text-success border-0',
  B级: 'bg-warning-bg text-warning border-0',
  C级: '',
  D级: 'bg-destructive-bg text-destructive border-0',
};

const MATERIAL_REFERENCE_LABELS: Record<string, string> = {
  TRADING_GOODS: '贸易商品（TRD）', RAW_MATERIAL: '原材料（RAW）', SEMI_FINISHED: '半成品（SFG）',
  FINISHED_GOODS: '产成品（FGD）', AUXILIARY: '辅助材料（AUX）', PACKAGING: '包装材料（PKG）',
  SERVICE: '服务项目（SRV）', OTHER: '其他物料（OTH）',
};

/* ── Mock data (price — 后续迭代接真实接口) ── */

const MOCK_PRICES: PriceItem[] = [
  { id: '1', material: '萤石粉 CaF₂≥97%', buyPrice: 1450, sellPrice: 1550, effectiveAt: '2026-06-01', status: 'ACTIVE' },
  { id: '2', material: '萤石粉 CaF₂≥95%', buyPrice: 1280, sellPrice: 1380, effectiveAt: '2026-06-01', status: 'ACTIVE' },
  { id: '3', material: '萤石粉 CaF₂≥90%', buyPrice: 980,  sellPrice: 1060, effectiveAt: '2026-06-05', status: 'ACTIVE' },
];
/* ── Helpers ── */

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; className: string }> = {
    ACTIVE:    { label: '启用',  className: 'bg-success-bg text-success border-0' },
    INACTIVE:  { label: '停用',  className: '' },
    BLACKLIST: { label: '黑名单', className: 'bg-destructive-bg text-destructive border-0' },
    MAINTENANCE: { label: '维修停用', className: 'bg-warning-bg text-warning border-0' },
    RETIRED: { label: '已退役', className: '' },
  };
  const cfg = map[status] || { label: status, className: '' };
  return <Badge variant="secondary" className={cfg.className}>{cfg.label}</Badge>;
};

const RoleBadges = ({ roles, isInternal }: { roles: string[]; isInternal: boolean }) => (
  <span className="text-sm">
    {isInternal && (
      <span className="text-orange-600 dark:text-orange-400 font-medium">内部</span>
    )}
    {isInternal && roles.length > 0 && <span className="text-muted-foreground/40 mx-1">·</span>}
    {roles.map((r, i) => {
      const cfg = ROLE_CONFIG[r];
      if (!cfg) return null;
      return (
        <span key={r}>
          {i > 0 && <span className="text-muted-foreground/40 mx-1">·</span>}
          <span className={cfg.className}>{cfg.label}</span>
        </span>
      );
    })}
  </span>
);

/* ── Page ── */

function MasterDataPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabFromUrl = searchParams.get('tab') as TabKey | null;
  const initialTab = tabFromUrl && TABS.some((item) => item.key === tabFromUrl) ? tabFromUrl : 'partners';
  const [tab, setTabState] = useState<TabKey>(initialTab);

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
  const [vehicleOwners, setVehicleOwners] = useState<VehicleOwnerOption[]>([]);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vehicleOwnerFilter, setVehicleOwnerFilter] = useState('');
  const [vehicleOwnerIdFilter, setVehicleOwnerIdFilter] = useState('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('');
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState('');

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

  const fetchVehicles = useCallback(() => {
    const params = new URLSearchParams({ pageSize: '100' });
    if (searchTerm) params.set('search', searchTerm);
    if (vehicleOwnerFilter) params.set('ownerType', vehicleOwnerFilter);
    if (vehicleOwnerIdFilter) params.set('ownerId', vehicleOwnerIdFilter);
    if (vehicleTypeFilter) params.set('vehicleType', vehicleTypeFilter);
    if (vehicleStatusFilter) params.set('status', vehicleStatusFilter);
    api.get<{ items: Vehicle[] }>(`/partners/vehicles?${params}`).then((d) => setVehicles(d.items || [])).catch(() => {});
  }, [searchTerm, vehicleOwnerFilter, vehicleOwnerIdFilter, vehicleStatusFilter, vehicleTypeFilter]);

  useEffect(() => {
    api.get<MaterialCategory[]>('/master-data/material-categories').then(setCategories).catch(() => {});
    api.get<WarehouseItem[]>('/master-data/warehouses').then((d) => setWarehouses(Array.isArray(d) ? d : [])).catch(() => {});
    api.get<{ items: VehicleOwnerOption[] }>('/service-organizations?type=LOGISTICS_CARRIER&status=ACTIVE&pageSize=200').then(d => setVehicleOwners(d.items || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchPartners(); }, [fetchPartners]);
  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);
  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  // Clear search when switching tabs
  useEffect(() => { setSearchTerm(''); }, [tab]);

  // Status toggles
  const toggleMaterialStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.patch(`/master-data/materials/${id}`, { status: newStatus });
      fetchMaterials();
    } catch (e: unknown) { /* ignore */ }
  };

  const toggleWarehouseStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.patch(`/master-data/warehouses/${id}`, { status: newStatus });
      const data = await api.get<WarehouseItem[]>('/master-data/warehouses');
      setWarehouses(Array.isArray(data) ? data : []);
    } catch (e: unknown) { /* ignore */ }
  };

  const toggleVehicleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'MAINTENANCE' : 'ACTIVE';
    try {
      await api.patch(`/partners/vehicles/${id}`, { status: newStatus });
      fetchVehicles();
    } catch (error: any) {
      alert(error.message || '车辆状态更新失败');
    }
  };

  const currentLabel = TABS.find((t) => t.key === tab)?.label || '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">主数据管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理基础档案数据，支撑业务运行</p>
        </div>
        {tab === 'partners' && (
          <Link href="/dashboard/master-data/partners/new">
            <Button>
              <Plus className="h-4 w-4 mr-1" />新建合作伙伴
            </Button>
          </Link>
        )}
        {tab === 'materials' && (
          <div className="flex gap-2">
            <Link href="/dashboard/master-data/material-categories">
              <Button variant="outline">
                <FolderTree className="h-4 w-4 mr-1" />分类管理
              </Button>
            </Link>
            <Link href="/dashboard/master-data/materials/new">
              <Button>
                <Plus className="h-4 w-4 mr-1" />新建商品物料
              </Button>
            </Link>
          </div>
        )}
        {tab === 'warehouses' && (
          <Link href="/dashboard/master-data/warehouses/new">
            <Button>
              <Plus className="h-4 w-4 mr-1" />新建仓库
            </Button>
          </Link>
        )}
        {tab === 'vehicles' && (
          <Link href="/dashboard/master-data/vehicles/new">
            <Button>
              <Plus className="h-4 w-4 mr-1" />新建车辆
            </Button>
          </Link>
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
        {/* 合作伙伴角色筛选（合作伙伴 tab） */}
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

        {tab === 'vehicles' && (
          <>
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={vehicleOwnerFilter} onChange={(event) => setVehicleOwnerFilter(event.target.value)}>
              <option value="">全部归属</option>
              <option value="SELF">自有车辆</option>
              <option value="OUTSOURCED">外协车辆</option>
            </select>
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={vehicleStatusFilter} onChange={(event) => setVehicleStatusFilter(event.target.value)}>
              <option value="">全部状态</option>
              <option value="ACTIVE">启用</option>
              <option value="MAINTENANCE">维修停用</option>
              <option value="RETIRED">已退役</option>
            </select>
            <select className="h-9 max-w-52 rounded-md border bg-background px-3 text-sm" value={vehicleOwnerIdFilter} onChange={(event) => setVehicleOwnerIdFilter(event.target.value)}><option value="">全部承运商</option>{vehicleOwners.map(item => <option key={item.id} value={item.partnerId}>{item.partner.name}</option>)}</select>
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={vehicleTypeFilter} onChange={(event) => setVehicleTypeFilter(event.target.value)}><option value="">全部车型</option><option value="SEMI_TRAILER">半挂车（标准型）</option><option value="HEAVY_SEMI_TRAILER">半挂车（超重型）</option><option value="BOX_TRUCK">厢式货车</option><option value="DUMP_TRUCK">自卸车</option><option value="TANK_TRUCK">槽罐车</option></select>
            <Link href="/dashboard/master-data/vehicles/new" className="ml-auto">
              <Button>
                <Plus className="mr-1 h-4 w-4" />新建车辆
              </Button>
            </Link>
          </>
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
        {/* 合作伙伴 */}
        {tab === 'partners' && (
          <DataTable
            headers={['编码 / 信用代码', '企业名称', '合作伙伴角色', '省市', '法人', '联系人 / 电话', '类别', '纳税评级', '授信额度', '状态', '操作']}
            rows={partners.map((p) => {
              const catCfg = p.category ? CATEGORY_CONFIG[p.category] : null;
              const creditNum = p.creditLimit ? parseFloat(p.creditLimit) : 0;
              return [
                <div key="c"><div className="font-mono text-xs">{p.code}</div><div className="mt-1 max-w-44 truncate font-mono text-[11px] text-muted-foreground">{p.taxId || '无统一信用代码'}</div></div>,
                <div key="n">
                  <div className="font-medium text-sm">{p.name}</div>
                  {p.shortName && <div className="text-xs text-muted-foreground">{p.shortName}</div>}
                </div>,
                <RoleBadges key="r" roles={p.roles} isInternal={p.isInternal} />,
                <div key="loc" className="flex items-center gap-1 text-xs text-muted-foreground">
                  {(p.province || p.city) ? (
                    <><MapPin className="h-3 w-3" />{p.province?.replace('省','').replace('市','')} {p.city?.replace('市','')}</>
                  ) : '—'}
                </div>,
                <span key="lp" className="text-sm">{p.legalPerson || '—'}</span>,
                <div key="ph"><div className="text-sm">{p.contactPerson || '—'}</div><div className="mt-1 text-xs text-muted-foreground">{p.contactPhone || '无联系电话'}</div></div>,
                catCfg
                  ? <Badge key="cat" variant="secondary" className={catCfg.className}>{catCfg.label}</Badge>
                  : <span key="cat2" className="text-muted-foreground text-xs">—</span>,
                p.taxRating
                  ? <Badge key="tax" variant="secondary" className={TAX_RATING_CONFIG[p.taxRating] || ''}>{p.taxRating}</Badge>
                  : <span key="tax2" className="text-muted-foreground text-xs">—</span>,
                creditNum > 0
                  ? <span key="cl" className="font-mono text-sm">¥{(creditNum / 10000).toFixed(0)}万</span>
                  : <span key="cl2" className="text-muted-foreground text-xs">—</span>,
                <StatusBadge key="s" status={p.status} />,
                <div key="ops" className="flex gap-1.5">
                  <Link href={`/dashboard/master-data/partners/${p.id}`}>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">详情</Button>
                  </Link>
                  <Link href={`/dashboard/master-data/partners/${p.id}/edit`}>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">编辑</Button>
                  </Link>
                </div>,
              ];
            })}
            empty="暂无合作伙伴数据"
          />
        )}

        {/* 商品物料 */}
        {tab === 'materials' && (
          <DataTable
            headers={['业务编码 / 标准编码', '商品名称 / 形态', '参考类型 / 包装', '商品分类', '核心规格', '单位', '质检模板', '状态', '操作']}
            rows={materials.map((m) => [
              <div key="c"><div className="font-mono text-xs">{m.code}</div><div className="mt-1 font-mono text-[11px] text-muted-foreground">{m.standardCommodity?.code || '历史物料'}</div></div>,
              <div key="n"><Link href={`/dashboard/master-data/materials/${m.id}`} className="font-medium hover:text-primary hover:underline">{m.standardCommodity?.name || m.name}</Link><div className="mt-1 max-w-56 truncate text-xs text-muted-foreground">{m.commodityForm || '未设置形态'}</div></div>,
              <div key="rt"><div className="text-xs">{MATERIAL_REFERENCE_LABELS[m.referenceType] || m.referenceType || '贸易商品'}</div><div className="mt-1 text-xs text-muted-foreground">{m.packageType || '未设置包装'}</div></div>,
              <Badge key="cat" variant="outline" className="text-xs">{m.category?.name || '-'}</Badge>,
              <div key="g"><div className="text-xs">{m.grade || '-'}</div><div className="mt-1 font-mono text-[11px] text-muted-foreground">{m.internalCode || '无内部编码'}</div></div>,
              unitLabel(m.unit),
              <span key="qc" className="text-xs text-muted-foreground">{m.qcTemplate || '—'}</span>,
              <StatusBadge key="s" status={m.status} />,
              <div key="ops" className="flex gap-1.5">
                <Link href={`/dashboard/master-data/materials/${m.id}`}>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">详情</Button>
                </Link>
                <Link href={`/dashboard/master-data/materials/${m.id}/edit`}>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">编辑</Button>
                </Link>
                <Button
                  variant="ghost" size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => toggleMaterialStatus(m.id, m.status)}
                >
                  {m.status === 'ACTIVE' ? '停用' : '启用'}
                </Button>
              </div>,
            ])}
            empty="暂无物料数据"
          />
        )}

        {/* 仓库管理 */}
        {tab === 'warehouses' && (
          <DataTable
            headers={['编码', '名称 / 权属方', '类型', '仓管员 / 电话', '地址', '状态', '操作']}
            rows={warehouses.map((w) => [
              <span key="c" className="font-mono text-xs">{w.code}</span>,
              <div key="n">
                <div className="font-medium">{w.name}</div>
                {w.partner && <div className="text-xs text-muted-foreground">{w.partner.name}</div>}
              </div>,
              <Badge key="t" variant="outline" className="text-xs">{w.type === 'SELF' ? '自有' : '租赁'}</Badge>,
              <div key="mgr"><div>{w.manager || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{w.managerPhone || '无联系电话'}</div></div>,
              w.address || '-',
              <StatusBadge key="s" status={w.status} />,
              <div key="ops" className="flex gap-1.5">
                <Link href={`/dashboard/master-data/warehouses/${w.id}/edit`}>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">编辑</Button>
                </Link>
                <Button
                  variant="ghost" size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => toggleWarehouseStatus(w.id, w.status)}
                >
                  {w.status === 'ACTIVE' ? '停用' : '启用'}
                </Button>
              </div>,
            ])}
            empty="暂无仓库数据"
          />
        )}

        {/* 车辆管理 */}
        {tab === 'vehicles' && (
          <DataTable
            headers={['车牌号', '车型 / 品牌', '核定载重 / 皮重', '定位设备', '所属承运商 / 车主', '关联司机', '运行 / 档案状态', '引用运单', '操作']}
            rows={vehicles.map((v) => [
              <Link key="p" href={`/dashboard/master-data/vehicles/${v.id}`} className="font-mono font-medium text-primary hover:underline">{v.plateNo}</Link>,
              <div key="vt"><div>{VEHICLE_TYPE[v.vehicleType] || v.vehicleType}</div><div className="mt-1 text-xs text-muted-foreground">{v.brand || '未设置品牌'}</div></div>,
              <div key="l"><div>{Number(v.loadCapacity).toFixed(2)} 吨</div><div className="mt-1 text-xs text-muted-foreground">皮重 {v.tareWeight ? `${Number(v.tareWeight).toFixed(2)} 吨` : '—'}</div></div>,
              <div key="dev"><div>{v.deviceType === 'BEIDOU' ? '北斗' : v.deviceType === 'GPS' ? 'GPS' : '未绑定'}</div><div className="mt-1 text-xs text-muted-foreground">{v.deviceNo || '—'}</div></div>,
              <div key="o">
                <div><Badge variant="outline" className="text-xs mr-1">{v.ownerType === 'SELF' ? '自有' : '外协'}</Badge>{v.owner?.name && <span className="text-xs text-muted-foreground">{v.owner.name}</span>}</div>
                {v.ownerName && <div className="mt-1 text-xs text-muted-foreground">车主：{v.ownerName}{v.ownerPhone ? ` · ${v.ownerPhone}` : ''}</div>}
              </div>,
              <div key="drv">{v.drivers.length ? v.drivers.map(link => <div key={link.id} className="whitespace-nowrap"><span>{link.driver.name}</span><span className="ml-1 text-xs text-muted-foreground">{link.role === 'PRIMARY' ? '主驾' : '副驾'} · {link.driver.phone}</span></div>) : <span className="text-muted-foreground">未关联</span>}</div>,
              <div key="status"><Badge variant="outline" className={v.operationStatus === 'IN_TRANSIT' ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}>{v.operationStatus === 'IN_TRANSIT' ? '在途' : '空闲'}</Badge><div className="mt-1"><StatusBadge status={v.status} /></div></div>,
              <span key="refs" className="font-mono text-xs">{v._count?.waybills || 0}</span>,
              <div key="ops" className="flex gap-1.5">
                <Link href={`/dashboard/master-data/vehicles/${v.id}`}><Button variant="ghost" size="sm" className="h-7 px-2 text-xs">详情</Button></Link>
                <Link href={`/dashboard/master-data/vehicles/${v.id}/edit`}>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">编辑</Button>
                </Link>
                {v.status !== 'RETIRED' && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void toggleVehicleStatus(v.id, v.status)}>
                    {v.status === 'ACTIVE' ? '暂停使用' : '恢复使用'}
                  </Button>
                )}
              </div>,
            ])}
            empty={(
              <div className="flex flex-col items-center gap-3">
                <span>暂无车辆数据</span>
                <Link href="/dashboard/master-data/vehicles/new">
                  <Button size="sm">
                    <Plus className="mr-1 h-4 w-4" />创建第一辆车辆
                  </Button>
                </Link>
              </div>
            )}
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

      </Card>

    </div>
  );
}

/* ── Shared DataTable ── */

function DataTable({ headers, rows, empty }: {
  headers: string[]; rows: React.ReactNode[][]; empty: React.ReactNode;
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

export default function MasterDataPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>}>
      <MasterDataPageInner />
    </Suspense>
  );
}
