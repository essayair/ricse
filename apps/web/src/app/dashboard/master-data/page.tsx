'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, Search, Truck, DollarSign,
  Building2, Package, Warehouse, X, MapPin, ExternalLink, FolderTree,
  Network, FlaskConical, Save, Settings2,
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { unitLabel } from '@/lib/unit';
import { StatusText } from '@/components/status-text';
import { FleetMemberManager } from '@/components/fleet-member-manager';
import { ORGANIZATION_TYPES } from './service-organizations/service-organization-form';

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
interface Driver {
  id: string; name: string; phone: string; idCardNo: string | null; licenseNo: string | null;
  licenseClass: string | null; licenseExpiry: string | null; status: string; remark: string | null;
  serviceOrganizationId: string | null;
  serviceOrganization: { id: string; partnerId: string; partner: { id: string; name: string; isInternal: boolean } } | null;
  fleetLinks: Array<{ fleet: { id: string; name: string; carrierPartnerId: string | null } }>;
  _count: { waybills: number; vehicleLinks: number };
}
interface Fleet {
  id: string; name: string; contactPerson: string | null; contactPhone: string | null;
  carrierPartnerId: string | null; carrierPartner: { id: string; code: string; name: string; status: string } | null;
  status: string; remark: string | null;
  _count: { driverLinks: number; vehicleLinks: number };
}
type OrganizationType = keyof typeof ORGANIZATION_TYPES;
interface ServiceOrgItem {
  id: string; code: string; organizationType: OrganizationType; status: string;
  licenseNo: string | null; licenseExpiry: string | null; serviceScope: string | null; serviceRegions: string | null;
  qualificationNo: string | null; cmaNo: string | null; cnasNo: string | null; operationType: string | null;
  contactPerson: string | null; contactPhone: string | null;
  partner: { id: string; code: string; name: string; roles: string[] };
}
interface QualityMethod {
  id: string; code: string; name: string; standardNo: string | null; standardVersion: string | null;
  description: string | null; status: string;
}
interface QualityIndicatorMethod { methodId: string; isDefault: boolean; method: QualityMethod }
interface QualityIndicator {
  id: string; code: string; name: string; symbol: string | null; defaultUnit: string; dataType: string;
  decimalPlaces: number; status: string; remark: string | null; methods: QualityIndicatorMethod[];
}
interface QualityTemplateItem {
  id?: string; indicatorId: string; defaultMethodId: string | null; operator: string;
  standardValue: string | null; upperValue: string | null; fuseValue: string | null; unit: string;
  required: boolean; core: boolean; participates: boolean; sort: number;
  indicator?: QualityIndicator; defaultMethod?: QualityMethod | null;
}
interface QualityTemplate {
  id: string; code: string; name: string; materialCategoryId: string | null; businessScene: string;
  version: number; status: string; remark: string | null; items: QualityTemplateItem[];
  materialCategory: { id: string; name: string } | null; _count: { materials: number; qualityTasks: number };
}

type TabKey = 'partners' | 'service-organizations' | 'materials' | 'warehouses' | 'vehicles' | 'price' | 'quality-standards';
type ResourceTab = 'vehicle' | 'driver' | 'fleet';
type QualityTab = 'indicators' | 'methods' | 'templates';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'partners',              label: '合作伙伴', icon: Building2 },
  { key: 'service-organizations', label: '服务生态', icon: Network },
  { key: 'materials',             label: '物料品类', icon: Package },
  { key: 'warehouses',            label: '仓库库位', icon: Warehouse },
  { key: 'vehicles',              label: '运力管理', icon: Truck },
  { key: 'price',                 label: '价格基准', icon: DollarSign },
  { key: 'quality-standards',     label: '质检标准', icon: FlaskConical },
];

const RESOURCE_TABS: { key: ResourceTab; label: string }[] = [
  { key: 'vehicle', label: '车辆' },
  { key: 'driver',  label: '司机' },
  { key: 'fleet',   label: '车队' },
];

const QUALITY_TABS: { key: QualityTab; label: string }[] = [
  { key: 'indicators', label: '检测指标' },
  { key: 'methods',    label: '检测方法' },
  { key: 'templates',  label: '质检模板' },
];

const QUALITY_SCENES: Record<string, string> = { GENERAL: '通用', PURCHASE: '采购', SALES: '销售', PRODUCTION: '生产' };
const QUALITY_OPERATORS: Record<string, string> = { GTE: '≥', LTE: '≤', EQ: '=', RANGE: '范围' };

const driverEmpty = { name: '', phone: '', idCardNo: '', licenseNo: '', licenseClass: '', licenseExpiry: '', serviceOrganizationId: '', status: 'ACTIVE', remark: '' };
const fleetEmpty = { name: '', contactPerson: '', contactPhone: '', carrierPartnerId: '', status: 'ACTIVE', remark: '' };
function emptyIndicatorForm() { return { id: '', code: '', name: '', symbol: '', defaultUnit: '%', decimalPlaces: '4', status: 'ACTIVE', remark: '', methodIds: [] as string[], defaultMethodId: '' }; }
function emptyMethodForm() { return { id: '', code: '', name: '', standardNo: '', standardVersion: '', description: '', status: 'ACTIVE' }; }
function emptyTemplateForm() { return { id: '', code: '', name: '', materialCategoryId: '', businessScene: 'GENERAL', version: '1', status: 'ACTIVE', remark: '', items: [] as QualityTemplateItem[] }; }
function qualityNumberValue(value: string | number | null | undefined) { return value === '' || value === null || value === undefined ? undefined : Number(value); }
function qualityTextValue(value: string | number | null | undefined) { return value === null || value === undefined ? '' : String(value); }
function serviceOrgStatusLabel(value: string) { return ({ ACTIVE: '有效', INACTIVE: '停用', BLACKLIST: '黑名单' } as Record<string, string>)[value] || value; }
function serviceOrgOperationLabel(value: string | null) { return ({ WAREHOUSE: '仓储', PORT: '港口', WAREHOUSE_PORT: '仓储与港口' } as Record<string, string>)[value || ''] || ''; }

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
  const map: Record<string, string> = {
    ACTIVE: '启用', INACTIVE: '停用', BLACKLIST: '黑名单', MAINTENANCE: '维修停用', RETIRED: '已退役',
  };
  return <StatusText status={status}>{map[status] || status}</StatusText>;
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
  const typeFromUrl = searchParams.get('type') as OrganizationType | null;
  const resourceFromUrl = searchParams.get('resource') as ResourceTab | null;

  const setTab = (t: TabKey) => {
    setTabState(t);
    router.replace(`/dashboard/master-data?tab=${t}`);
  };

  useEffect(() => {
    if (tabFromUrl && TABS.some((t) => t.key === tabFromUrl)) {
      setTabState(tabFromUrl);
    }
  }, [tabFromUrl]);

  useEffect(() => {
    if (typeFromUrl && typeFromUrl in ORGANIZATION_TYPES) {
      setServiceOrgType(typeFromUrl);
    }
  }, [typeFromUrl]);

  // Data
  const [partners, setPartners] = useState<Partner[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleOwners, setVehicleOwners] = useState<VehicleOwnerOption[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [serviceOrgs, setServiceOrgs] = useState<ServiceOrgItem[]>([]);
  const [serviceOrgType, setServiceOrgType] = useState<OrganizationType>('LOGISTICS_CARRIER');
  const [qualityTab, setQualityTab] = useState<QualityTab>('indicators');
  const [qualityIndicators, setQualityIndicators] = useState<QualityIndicator[]>([]);
  const [qualityMethods, setQualityMethods] = useState<QualityMethod[]>([]);
  const [qualityTemplates, setQualityTemplates] = useState<QualityTemplate[]>([]);
  const [qualitySaving, setQualitySaving] = useState(false);
  const [indicatorForm, setIndicatorForm] = useState(() => emptyIndicatorForm());
  const [methodForm, setMethodForm] = useState(() => emptyMethodForm());
  const [templateForm, setTemplateForm] = useState(() => emptyTemplateForm());

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vehicleOwnerFilter, setVehicleOwnerFilter] = useState('');
  const [vehicleOwnerIdFilter, setVehicleOwnerIdFilter] = useState('');
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState('');
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState('');
  const [resourceTab, setResourceTab] = useState<ResourceTab>(resourceFromUrl && RESOURCE_TABS.some(item => item.key === resourceFromUrl) ? resourceFromUrl : 'vehicle');
  const [driverOrgFilter, setDriverOrgFilter] = useState('');
  const [driverFleetFilter, setDriverFleetFilter] = useState('');

  // 司机独立管理：表单状态
  const [driverForm, setDriverForm] = useState({ ...driverEmpty });
  const [driverEditingId, setDriverEditingId] = useState<string | null>(null);
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [driverSaving, setDriverSaving] = useState(false);

  // 车队管理：表单状态 + 成员管理面板
  const [fleetForm, setFleetForm] = useState({ ...fleetEmpty });
  const [fleetEditingId, setFleetEditingId] = useState<string | null>(null);
  const [showFleetForm, setShowFleetForm] = useState(false);
  const [fleetSaving, setFleetSaving] = useState(false);
  const [fleetMembersId, setFleetMembersId] = useState<string | null>(null);

  useEffect(() => {
    if (resourceFromUrl && RESOURCE_TABS.some(item => item.key === resourceFromUrl)) {
      setResourceTab(resourceFromUrl);
    }
  }, [resourceFromUrl]);

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

  const fetchDrivers = useCallback(() => {
    const params = new URLSearchParams({ pageSize: '200' });
    if (searchTerm) params.set('search', searchTerm);
    if (driverOrgFilter) params.set('serviceOrganizationId', driverOrgFilter);
    if (driverFleetFilter) params.set('fleetId', driverFleetFilter);
    api.get<{ items: Driver[] }>(`/drivers?${params}`).then((d) => setDrivers(d.items || [])).catch(() => {});
  }, [searchTerm, driverOrgFilter, driverFleetFilter]);

  const fetchFleets = useCallback(() => {
    const params = new URLSearchParams({ pageSize: '200' });
    if (searchTerm) params.set('search', searchTerm);
    api.get<{ items: Fleet[] }>(`/fleets?${params}`).then((d) => setFleets(d.items || [])).catch(() => {});
  }, [searchTerm]);

  const fetchServiceOrgs = useCallback(() => {
    const params = new URLSearchParams({ type: serviceOrgType, pageSize: '200' });
    if (searchTerm) params.set('search', searchTerm);
    api.get<{ items: ServiceOrgItem[] }>(`/service-organizations?${params}`).then((d) => setServiceOrgs(d.items || [])).catch(() => {});
  }, [serviceOrgType, searchTerm]);

  const fetchQualityData = useCallback(() => {
    api.get<QualityIndicator[]>('/quality-standards/indicators').then(setQualityIndicators).catch(() => {});
    api.get<QualityMethod[]>('/quality-standards/methods').then(setQualityMethods).catch(() => {});
    api.get<QualityTemplate[]>('/quality-standards/templates').then(setQualityTemplates).catch(() => {});
  }, []);

  useEffect(() => { fetchPartners(); }, [fetchPartners]);
  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);
  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);
  useEffect(() => { fetchDrivers(); }, [fetchDrivers]);
  useEffect(() => { fetchFleets(); }, [fetchFleets]);
  useEffect(() => { fetchServiceOrgs(); }, [fetchServiceOrgs]);
  useEffect(() => { fetchQualityData(); }, [fetchQualityData]);

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

  const setDriverField = (key: keyof typeof driverEmpty, value: string) => setDriverForm((cur) => ({ ...cur, [key]: value }));
  const resetDriverForm = () => { setDriverForm({ ...driverEmpty }); setDriverEditingId(null); setShowDriverForm(false); };
  const editDriver = (driver: Driver) => {
    setDriverEditingId(driver.id);
    setDriverForm({
      name: driver.name, phone: driver.phone, idCardNo: driver.idCardNo || '', licenseNo: driver.licenseNo || '',
      licenseClass: driver.licenseClass || '', licenseExpiry: driver.licenseExpiry?.slice(0, 10) || '',
      serviceOrganizationId: driver.serviceOrganizationId || '', status: driver.status, remark: driver.remark || '',
    });
    setShowDriverForm(true);
  };
  const saveDriver = async () => {
    if (!driverForm.name.trim()) return alert('请输入司机姓名');
    if (!/^1[3-9]\d{9}$/.test(driverForm.phone)) return alert('请输入11位有效手机号');
    setDriverSaving(true);
    const payload = {
      ...driverForm,
      idCardNo: driverForm.idCardNo || null,
      licenseNo: driverForm.licenseNo || null,
      licenseClass: driverForm.licenseClass || null,
      licenseExpiry: driverForm.licenseExpiry || null,
      remark: driverForm.remark || null,
    };
    try {
      if (driverEditingId) await api.patch(`/drivers/${driverEditingId}`, payload);
      else await api.post('/drivers', payload);
      resetDriverForm();
      fetchDrivers();
    } catch (error: any) { alert(error.message || '司机保存失败'); }
    finally { setDriverSaving(false); }
  };
  const toggleDriverStatus = async (driver: Driver) => {
    try {
      await api.patch(`/drivers/${driver.id}`, { status: driver.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
      fetchDrivers();
    } catch (error: any) { alert(error.message); }
  };

  const setFleetField = (key: keyof typeof fleetEmpty, value: string) => setFleetForm((cur) => ({ ...cur, [key]: value }));
  const resetFleetForm = () => { setFleetForm({ ...fleetEmpty }); setFleetEditingId(null); setShowFleetForm(false); };
  const editFleet = (fleet: Fleet) => {
    setFleetEditingId(fleet.id);
    setFleetForm({
      name: fleet.name, contactPerson: fleet.contactPerson || '', contactPhone: fleet.contactPhone || '',
      carrierPartnerId: fleet.carrierPartnerId || '', status: fleet.status, remark: fleet.remark || '',
    });
    setShowFleetForm(true);
  };
  const saveFleet = async () => {
    if (!fleetForm.name.trim()) return alert('请输入车队名称');
    setFleetSaving(true);
    const payload = {
      ...fleetForm,
      contactPerson: fleetForm.contactPerson || null,
      contactPhone: fleetForm.contactPhone || null,
      remark: fleetForm.remark || null,
    };
    try {
      if (fleetEditingId) await api.patch(`/fleets/${fleetEditingId}`, payload);
      else await api.post('/fleets', payload);
      resetFleetForm();
      fetchFleets();
    } catch (error: any) { alert(error.message || '车队保存失败'); }
    finally { setFleetSaving(false); }
  };
  const toggleFleetStatus = async (fleet: Fleet) => {
    try {
      await api.patch(`/fleets/${fleet.id}`, { status: fleet.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
      fetchFleets();
    } catch (error: any) { alert(error.message); }
  };
  const removeFleet = async (fleet: Fleet) => {
    if (!confirm(`确定删除车队"${fleet.name}"？仅无成员车队可删除。`)) return;
    try { await api.delete(`/fleets/${fleet.id}`); fetchFleets(); }
    catch (error: any) { alert(error.message); }
  };
  const openFleetMembers = (fleetId: string) => setFleetMembersId(fleetId);

  const toggleServiceOrgStatus = async (item: ServiceOrgItem) => {
    const status = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try { await api.patch(`/service-organizations/${item.id}`, { status }); fetchServiceOrgs(); }
    catch (error: any) { alert(error.message); }
  };

  const resetIndicatorForm = () => setIndicatorForm(emptyIndicatorForm());
  const editIndicator = (item: QualityIndicator) => setIndicatorForm({
    id: item.id, code: item.code, name: item.name, symbol: item.symbol || '', defaultUnit: item.defaultUnit,
    decimalPlaces: String(item.decimalPlaces), status: item.status, remark: item.remark || '',
    methodIds: item.methods.map((link) => link.methodId),
    defaultMethodId: item.methods.find((link) => link.isDefault)?.methodId || '',
  });
  const saveIndicator = async () => {
    if (!indicatorForm.code.trim() || !indicatorForm.name.trim() || !indicatorForm.defaultUnit.trim()) return alert('请填写指标编码、名称和单位');
    setQualitySaving(true);
    const body = {
      code: indicatorForm.code, name: indicatorForm.name, symbol: indicatorForm.symbol || undefined,
      defaultUnit: indicatorForm.defaultUnit, dataType: 'NUMBER', decimalPlaces: Number(indicatorForm.decimalPlaces),
      status: indicatorForm.status, remark: indicatorForm.remark || undefined,
      methodIds: indicatorForm.methodIds, defaultMethodId: indicatorForm.defaultMethodId || undefined,
    };
    try {
      if (indicatorForm.id) await api.patch(`/quality-standards/indicators/${indicatorForm.id}`, body);
      else await api.post('/quality-standards/indicators', body);
      resetIndicatorForm(); fetchQualityData();
    } catch (error: any) { alert(error.message || '检测指标保存失败'); }
    finally { setQualitySaving(false); }
  };

  const resetMethodForm = () => setMethodForm(emptyMethodForm());
  const editMethod = (item: QualityMethod) => setMethodForm({
    id: item.id, code: item.code, name: item.name, standardNo: item.standardNo || '',
    standardVersion: item.standardVersion || '', description: item.description || '', status: item.status,
  });
  const saveMethod = async () => {
    if (!methodForm.code.trim() || !methodForm.name.trim()) return alert('请填写方法编码和名称');
    setQualitySaving(true);
    const body = {
      code: methodForm.code, name: methodForm.name, standardNo: methodForm.standardNo || undefined,
      standardVersion: methodForm.standardVersion || undefined, description: methodForm.description || undefined,
      status: methodForm.status,
    };
    try {
      if (methodForm.id) await api.patch(`/quality-standards/methods/${methodForm.id}`, body);
      else await api.post('/quality-standards/methods', body);
      resetMethodForm(); fetchQualityData();
    } catch (error: any) { alert(error.message || '检测方法保存失败'); }
    finally { setQualitySaving(false); }
  };

  const resetTemplateForm = () => setTemplateForm(emptyTemplateForm());
  const editTemplate = (item: QualityTemplate) => setTemplateForm({
    id: item.id, code: item.code, name: item.name, materialCategoryId: item.materialCategoryId || '',
    businessScene: item.businessScene, version: String(item.version), status: item.status, remark: item.remark || '',
    items: item.items.map((value) => ({
      ...value,
      standardValue: qualityTextValue(value.standardValue),
      upperValue: qualityTextValue(value.upperValue),
      fuseValue: qualityTextValue(value.fuseValue),
    })),
  });
  const saveTemplate = async () => {
    if (!templateForm.code.trim() || !templateForm.name.trim()) return alert('请填写模板编码和名称');
    if (!templateForm.items.length) return alert('请至少添加一个检测指标');
    setQualitySaving(true);
    const body = {
      code: templateForm.code, name: templateForm.name,
      materialCategoryId: templateForm.materialCategoryId || undefined,
      businessScene: templateForm.businessScene, version: Number(templateForm.version),
      status: templateForm.status, remark: templateForm.remark || undefined,
      items: templateForm.items.map((item, index) => ({
        indicatorId: item.indicatorId, defaultMethodId: item.defaultMethodId || undefined,
        operator: item.operator, standardValue: qualityNumberValue(item.standardValue), upperValue: qualityNumberValue(item.upperValue),
        fuseValue: qualityNumberValue(item.fuseValue), unit: item.unit, required: item.required,
        core: item.core, participates: item.participates, sort: index,
      })),
    };
    try {
      if (templateForm.id) await api.patch(`/quality-standards/templates/${templateForm.id}`, body);
      else await api.post('/quality-standards/templates', body);
      resetTemplateForm(); fetchQualityData();
    } catch (error: any) { alert(error.message || '质检模板保存失败'); }
    finally { setQualitySaving(false); }
  };

  const qualitySearchFiltered = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const values: Array<QualityIndicator | QualityMethod | QualityTemplate> = qualityTab === 'indicators' ? qualityIndicators : qualityTab === 'methods' ? qualityMethods : qualityTemplates;
    if (!keyword) return values;
    return values.filter((item: any) => `${item.code} ${item.name} ${item.standardNo || ''}`.toLowerCase().includes(keyword));
  }, [qualityIndicators, qualityMethods, qualityTab, qualityTemplates, searchTerm]);

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
        {tab === 'service-organizations' && (
          <Link href={`/dashboard/master-data/service-organizations/new?type=${serviceOrgType}`}>
            <Button>
              <Plus className="h-4 w-4 mr-1" />新建{ORGANIZATION_TYPES[serviceOrgType]}
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
        {tab === 'vehicles' && resourceTab === 'vehicle' && (
          <Link href="/dashboard/master-data/transport-resources/new">
            <Button>
              <Plus className="h-4 w-4 mr-1" />新建司机与车辆
            </Button>
          </Link>
        )}
        {tab === 'vehicles' && resourceTab === 'driver' && (
          <Button onClick={() => { router.push('/dashboard/master-data/transport-resources/new'); }}>
            <Plus className="h-4 w-4 mr-1" />新建司机与车辆
          </Button>
        )}
        {tab === 'vehicles' && resourceTab === 'fleet' && (
          <Button onClick={() => { resetFleetForm(); setShowFleetForm(true); }}>
            <Plus className="h-4 w-4 mr-1" />新增车队
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

      {/* 运力管理子页签：车辆 / 司机 / 车队 */}
      {tab === 'vehicles' && (
        <div className="flex gap-1">
          {RESOURCE_TABS.map((r) => (
            <button
              key={r.key}
              onClick={() => setResourceTab(r.key)}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                resourceTab === r.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* 服务生态子页签：物流承运商 / 质检机构 / 仓储与港口 / 加工服务商 */}
      {tab === 'service-organizations' && (
        <div className="flex gap-1 flex-wrap">
          {Object.entries(ORGANIZATION_TYPES).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setServiceOrgType(value as OrganizationType)}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                serviceOrgType === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* 质检标准子页签：检测指标 / 检测方法 / 质检模板 */}
      {tab === 'quality-standards' && (
        <div className="flex gap-1">
          {QUALITY_TABS.map((q) => (
            <button
              key={q.key}
              onClick={() => setQualityTab(q.key)}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                qualityTab === q.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

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

        {tab === 'vehicles' && resourceTab === 'vehicle' && (
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
            <Link href="/dashboard/master-data/transport-resources/new" className="ml-auto">
              <Button>
                <Plus className="mr-1 h-4 w-4" />新建司机与车辆
              </Button>
            </Link>
          </>
        )}

        {tab === 'vehicles' && resourceTab === 'driver' && (
          <>
            <select className="h-9 max-w-52 rounded-md border bg-background px-3 text-sm" value={driverOrgFilter} onChange={(event) => setDriverOrgFilter(event.target.value)}>
              <option value="">全部承运商</option>
              <option value="NONE">无承运商（社会运力）</option>
              {vehicleOwners.map((item) => <option key={item.id} value={item.id}>{item.partner.name}</option>)}
            </select>
            <select className="h-9 max-w-52 rounded-md border bg-background px-3 text-sm" value={driverFleetFilter} onChange={(event) => setDriverFleetFilter(event.target.value)}>
              <option value="">全部车队</option>
              {fleets.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </>
        )}

        {tab === 'vehicles' && resourceTab === 'fleet' && (
          <span className="text-xs text-muted-foreground">车队为纯分组管理，不是正式合作伙伴档案；绑定承运商后队内司机车辆在业务上继承该承运商关系</span>
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

      {/* 司机字段快捷编辑；新建统一进入司机与车辆登记页 */}
      {tab === 'vehicles' && resourceTab === 'driver' && showDriverForm && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{driverEditingId ? '编辑司机档案' : '新增司机档案'}</h2>
            <Button variant="ghost" size="sm" onClick={resetDriverForm}>取消</Button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="司机姓名 *"><Input value={driverForm.name} maxLength={50} onChange={(e) => setDriverField('name', e.target.value)} /></Field>
            <Field label="手机号 *"><Input inputMode="numeric" maxLength={11} value={driverForm.phone} onChange={(e) => setDriverField('phone', e.target.value.replace(/\D/g, '').slice(0, 11))} /><p className="mt-1 text-xs text-muted-foreground">全平台唯一，用于识别同一名司机。</p></Field>
            <Field label="所属承运商（可不选）">
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={driverForm.serviceOrganizationId} onChange={(e) => setDriverField('serviceOrganizationId', e.target.value)}>
                <option value="">无承运商（社会运力专用）</option>
                {vehicleOwners.map((item) => <option key={item.id} value={item.id}>{item.partner.name}</option>)}
              </select>
            </Field>
            <Field label="身份证号"><Input maxLength={18} value={driverForm.idCardNo} onChange={(e) => setDriverField('idCardNo', e.target.value.toUpperCase())} /><p className="mt-1 text-xs text-muted-foreground">填写后全平台唯一。</p></Field>
            <Field label="驾驶证号"><Input maxLength={50} value={driverForm.licenseNo} onChange={(e) => setDriverField('licenseNo', e.target.value.toUpperCase())} /><p className="mt-1 text-xs text-muted-foreground">填写后全平台唯一。</p></Field>
            <Field label="准驾车型"><Input maxLength={20} value={driverForm.licenseClass} onChange={(e) => setDriverField('licenseClass', e.target.value)} placeholder="如：A2、B2" /></Field>
            <Field label="驾驶证有效期"><Input type="date" value={driverForm.licenseExpiry} onChange={(e) => setDriverField('licenseExpiry', e.target.value)} /></Field>
            <Field label="状态">
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={driverForm.status} onChange={(e) => setDriverField('status', e.target.value)}>
                <option value="ACTIVE">启用</option>
                <option value="INACTIVE">停用</option>
              </select>
            </Field>
            <div className="md:col-span-2"><Field label="备注"><Input maxLength={500} value={driverForm.remark} onChange={(e) => setDriverField('remark', e.target.value)} /></Field></div>
          </div>
          <div className="flex justify-end">
            <Button disabled={driverSaving} onClick={() => void saveDriver()}>{driverSaving ? '保存中...' : '保存司机'}</Button>
          </div>
        </Card>
      )}

      {/* 车队新增/编辑表单 */}
      {tab === 'vehicles' && resourceTab === 'fleet' && showFleetForm && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{fleetEditingId ? '编辑车队' : '新增车队'}</h2>
            <Button variant="ghost" size="sm" onClick={resetFleetForm}>取消</Button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="车队名称 *"><Input value={fleetForm.name} maxLength={100} onChange={(e) => setFleetField('name', e.target.value)} /></Field>
            <Field label="联系人"><Input maxLength={50} value={fleetForm.contactPerson} onChange={(e) => setFleetField('contactPerson', e.target.value)} /></Field>
            <Field label="联系电话"><Input maxLength={30} value={fleetForm.contactPhone} onChange={(e) => setFleetField('contactPhone', e.target.value)} /></Field>
            <Field label="挂靠开票承运商（可不选）">
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={fleetForm.carrierPartnerId} onChange={(e) => setFleetField('carrierPartnerId', e.target.value)}>
                <option value="">暂未挂靠</option>
                {vehicleOwners.map((item) => <option key={item.id} value={item.partnerId}>{item.partner.name}</option>)}
              </select>
            </Field>
            <Field label="状态">
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={fleetForm.status} onChange={(e) => setFleetField('status', e.target.value)}>
                <option value="ACTIVE">启用</option>
                <option value="INACTIVE">停用</option>
              </select>
            </Field>
            <div className="md:col-span-2"><Field label="备注"><Input maxLength={500} value={fleetForm.remark} onChange={(e) => setFleetField('remark', e.target.value)} /></Field></div>
          </div>
          <div className="flex justify-end">
            <Button disabled={fleetSaving} onClick={() => void saveFleet()}>{fleetSaving ? '保存中...' : '保存车队'}</Button>
          </div>
        </Card>
      )}

      {/* Content */}
      {tab !== 'quality-standards' && (
      <Card className="overflow-hidden">
        {/* 合作伙伴 */}
        {tab === 'partners' && (
          <DataTable
            headers={['编码 / 信用代码', '企业名称', '合作伙伴角色', '状态', '省市', '法人', '联系人 / 电话', '类别', '纳税评级', '授信额度', '操作']}
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
                <StatusBadge key="s" status={p.status} />,
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

        {/* 服务生态 */}
        {tab === 'service-organizations' && (
          <DataTable
            headers={['档案编码', '合作伙伴', '资质信息', '状态', '服务范围 / 区域', '联系人', '操作']}
            rows={serviceOrgs.map((item) => [
              <span key="c" className="font-mono">{item.code}</span>,
              <div key="p"><div className="font-medium">{item.partner.name}</div><div className="mt-1 text-xs text-muted-foreground">{item.partner.code} · 供应商</div></div>,
              <div key="q"><div>{item.licenseNo || item.qualificationNo || item.cmaNo || '—'}</div><div className="mt-1 text-xs text-muted-foreground">{item.licenseExpiry ? `有效期至 ${item.licenseExpiry.slice(0, 10)}` : item.cnasNo ? `CNAS ${item.cnasNo}` : '未设置有效期'}</div></div>,
              <StatusText key="s" status={item.status}>{serviceOrgStatusLabel(item.status)}</StatusText>,
              <div key="scope" className="max-w-80"><div className="truncate">{item.serviceScope || serviceOrgOperationLabel(item.operationType) || '—'}</div><div className="mt-1 truncate text-xs text-muted-foreground">{item.serviceRegions || '未设置服务区域'}</div></div>,
              <div key="contact"><div>{item.contactPerson || '—'}</div><div className="mt-1 text-xs text-muted-foreground">{item.contactPhone || '—'}</div></div>,
              <div key="ops" className="flex gap-1.5">
                {item.organizationType === 'LOGISTICS_CARRIER' && (
                  <Link href={`/dashboard/master-data/service-organizations/${item.id}/drivers`}><Button variant="outline" size="sm" className="h-7 px-2 text-xs">司机</Button></Link>
                )}
                <Link href={`/dashboard/master-data/service-organizations/${item.id}/edit`}><Button variant="ghost" size="sm" className="h-7 px-2 text-xs">编辑</Button></Link>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void toggleServiceOrgStatus(item)}>{item.status === 'ACTIVE' ? '停用' : '启用'}</Button>
              </div>,
            ])}
            empty={(
              <div className="flex flex-col items-center gap-3">
                <span>暂无已维护的{ORGANIZATION_TYPES[serviceOrgType]}</span>
                <Link href={`/dashboard/master-data/service-organizations/new?type=${serviceOrgType}`}>
                  <Button size="sm">
                    <Plus className="mr-1 h-4 w-4" />新建{ORGANIZATION_TYPES[serviceOrgType]}
                  </Button>
                </Link>
              </div>
            )}
          />
        )}

        {/* 商品物料 */}
        {tab === 'materials' && (
          <DataTable
            headers={['业务编码 / 标准编码', '商品名称 / 形态', '参考类型 / 包装', '状态', '商品分类', '核心规格', '单位', '质检模板', '操作']}
            rows={materials.map((m) => [
              <div key="c"><div className="font-mono text-xs">{m.code}</div><div className="mt-1 font-mono text-[11px] text-muted-foreground">{m.standardCommodity?.code || '历史物料'}</div></div>,
              <div key="n"><Link href={`/dashboard/master-data/materials/${m.id}`} className="font-medium hover:text-primary hover:underline">{m.standardCommodity?.name || m.name}</Link><div className="mt-1 max-w-56 truncate text-xs text-muted-foreground">{m.commodityForm || '未设置形态'}</div></div>,
              <div key="rt"><div className="text-xs">{MATERIAL_REFERENCE_LABELS[m.referenceType] || m.referenceType || '贸易商品'}</div><div className="mt-1 text-xs text-muted-foreground">{m.packageType || '未设置包装'}</div></div>,
              <StatusBadge key="s" status={m.status} />,
              <Badge key="cat" variant="outline" className="text-xs">{m.category?.name || '-'}</Badge>,
              <div key="g"><div className="text-xs">{m.grade || '-'}</div><div className="mt-1 font-mono text-[11px] text-muted-foreground">{m.internalCode || '无内部编码'}</div></div>,
              unitLabel(m.unit),
              <span key="qc" className="text-xs text-muted-foreground">{m.qcTemplate || '—'}</span>,
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
            headers={['编码', '名称 / 权属方', '类型', '状态', '仓管员 / 电话', '地址', '操作']}
            rows={warehouses.map((w) => [
              <span key="c" className="font-mono text-xs">{w.code}</span>,
              <div key="n">
                <div className="font-medium">{w.name}</div>
                {w.partner && <div className="text-xs text-muted-foreground">{w.partner.name}</div>}
              </div>,
              <Badge key="t" variant="outline" className="text-xs">{w.type === 'SELF' ? '自有' : '租赁'}</Badge>,
              <StatusBadge key="s" status={w.status} />,
              <div key="mgr"><div>{w.manager || '-'}</div><div className="mt-1 text-xs text-muted-foreground">{w.managerPhone || '无联系电话'}</div></div>,
              w.address || '-',
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
        {tab === 'vehicles' && resourceTab === 'vehicle' && (
          <DataTable
            headers={['车牌号', '车型 / 品牌', '核定载重 / 皮重', '运行 / 档案状态', '定位设备', '运力归属 / 车主', '关联司机', '引用运单', '操作']}
            rows={vehicles.map((v) => [
              <Link key="p" href={`/dashboard/master-data/vehicles/${v.id}`} className="font-mono font-medium text-primary hover:underline">{v.plateNo}</Link>,
              <div key="vt"><div>{VEHICLE_TYPE[v.vehicleType] || v.vehicleType}</div><div className="mt-1 text-xs text-muted-foreground">{v.brand || '未设置品牌'}</div></div>,
              <div key="l"><div>{Number(v.loadCapacity).toFixed(2)} 吨</div><div className="mt-1 text-xs text-muted-foreground">皮重 {v.tareWeight ? `${Number(v.tareWeight).toFixed(2)} 吨` : '—'}</div></div>,
              <div key="status"><StatusText status={v.operationStatus}>{v.operationStatus === 'IN_TRANSIT' ? '在途' : '空闲'}</StatusText><div className="mt-1"><StatusBadge status={v.status} /></div></div>,
              <div key="dev"><div>{v.deviceType === 'BEIDOU' ? '北斗' : v.deviceType === 'GPS' ? 'GPS' : '未绑定'}</div><div className="mt-1 text-xs text-muted-foreground">{v.deviceNo || '—'}</div></div>,
              <div key="o">
                <div><Badge variant="outline" className="text-xs mr-1">{v.ownerType === 'SELF' ? '自有' : v.owner ? '承运商车辆' : '社会运力'}</Badge>{v.owner?.name && <span className="text-xs text-muted-foreground">{v.owner.name}</span>}</div>
                {v.ownerName && <div className="mt-1 text-xs text-muted-foreground">车主：{v.ownerName}{v.ownerPhone ? ` · ${v.ownerPhone}` : ''}</div>}
              </div>,
              <div key="drv">{v.drivers.length ? v.drivers.map(link => <div key={link.id} className="whitespace-nowrap"><span>{link.driver.name}</span><span className="ml-1 text-xs text-muted-foreground">{link.role === 'PRIMARY' ? '主驾' : '副驾'} · {link.driver.phone}</span></div>) : <span className="text-muted-foreground">未关联</span>}</div>,
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
                <Link href="/dashboard/master-data/transport-resources/new">
                  <Button size="sm">
                    <Plus className="mr-1 h-4 w-4" />创建第一辆车辆
                  </Button>
                </Link>
              </div>
            )}
          />
        )}

        {/* 司机管理（独立于物流承运商档案） */}
        {tab === 'vehicles' && resourceTab === 'driver' && (
          <DataTable
            headers={['司机 / 手机', '所属承运商', '所属车队', '驾驶证 / 准驾车型', '状态', '有效期', '引用运单', '操作']}
            rows={drivers.map((d) => [
              <div key="n"><Link href={`/dashboard/master-data/drivers/${d.id}`} className="font-medium text-primary hover:underline">{d.name}</Link><div className="mt-1 text-xs text-muted-foreground">{d.phone}</div></div>,
              d.serviceOrganization
                ? <span key="org" className="text-sm">{d.serviceOrganization.partner.name}</span>
                : <Badge key="org2" variant="outline" className="text-xs">无承运商 · 社会运力</Badge>,
              d.fleetLinks.length
                ? <div key="fl">{d.fleetLinks.map((link) => <Badge key={link.fleet.id} variant="secondary" className="mr-1 text-xs">{link.fleet.name}</Badge>)}</div>
                : <span key="fl2" className="text-muted-foreground text-xs">未加入</span>,
              <div key="lic"><div>{d.licenseNo || '—'}</div><div className="mt-1 text-xs text-muted-foreground">{d.licenseClass || '未填写'}</div></div>,
              <StatusText key="s" status={d.status}>{d.status === 'ACTIVE' ? '启用' : '停用'}</StatusText>,
              <span key="exp">{d.licenseExpiry?.slice(0, 10) || '—'}</span>,
              <span key="refs" className="font-mono text-xs">{d._count.waybills}</span>,
              <div key="ops" className="flex gap-1.5">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => editDriver(d)}>编辑</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void toggleDriverStatus(d)}>{d.status === 'ACTIVE' ? '停用' : '启用'}</Button>
              </div>,
            ])}
            empty={(
              <div className="flex flex-col items-center gap-3">
                <span>暂无司机档案</span>
                <Button size="sm" onClick={() => { router.push('/dashboard/master-data/transport-resources/new'); }}>
                  <Plus className="mr-1 h-4 w-4" />新增第一位司机
                </Button>
              </div>
            )}
          />
        )}

        {/* 车队管理 */}
        {tab === 'vehicles' && resourceTab === 'fleet' && (
          <DataTable
            headers={['车队名称', '联系人 / 电话', '挂靠承运商', '状态', '司机数', '车辆数', '操作']}
            rows={fleets.map((f) => [
              <span key="n" className="font-medium">{f.name}</span>,
              <div key="c"><div>{f.contactPerson || '—'}</div><div className="mt-1 text-xs text-muted-foreground">{f.contactPhone || '无联系电话'}</div></div>,
              f.carrierPartner
                ? <span key="cp" className="text-sm">{f.carrierPartner.name}</span>
                : <Badge key="cp2" variant="outline" className="text-xs">暂未挂靠</Badge>,
              <StatusText key="s" status={f.status}>{f.status === 'ACTIVE' ? '启用' : '停用'}</StatusText>,
              <span key="dc" className="font-mono text-xs">{f._count.driverLinks}</span>,
              <span key="vc" className="font-mono text-xs">{f._count.vehicleLinks}</span>,
              <div key="ops" className="flex gap-1.5">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void openFleetMembers(f.id)}>成员管理</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => editFleet(f)}>编辑</Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void toggleFleetStatus(f)}>{f.status === 'ACTIVE' ? '停用' : '启用'}</Button>
                {f._count.driverLinks === 0 && f._count.vehicleLinks === 0 && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => void removeFleet(f)}>删除</Button>
                )}
              </div>,
            ])}
            empty={(
              <div className="flex flex-col items-center gap-3">
                <span>暂无车队</span>
                <Button size="sm" onClick={() => { resetFleetForm(); setShowFleetForm(true); }}>
                  <Plus className="mr-1 h-4 w-4" />创建第一个车队
                </Button>
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
      )}

      {/* 质检标准：检测指标 / 检测方法 / 质检模板 */}
      {tab === 'quality-standards' && (
        <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b p-4">
              <Badge variant="secondary">{qualitySearchFiltered.length} 条</Badge>
            </div>
            <div className="max-h-[680px] overflow-auto">
              {qualityTab === 'indicators' && (qualitySearchFiltered as QualityIndicator[]).map((item) => (
                <button key={item.id} className="block w-full border-b p-4 text-left hover:bg-muted/50" onClick={() => editIndicator(item)}>
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{item.name} <span className="ml-2 font-mono text-xs text-muted-foreground">{item.code}</span></div>
                    <StatusText status={item.status}>{item.status === 'ACTIVE' ? '启用' : '停用'}</StatusText>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">单位 {item.defaultUnit} · 方法 {item.methods.map((link) => link.method.name).join('、') || '未配置'}</div>
                </button>
              ))}
              {qualityTab === 'methods' && (qualitySearchFiltered as QualityMethod[]).map((item) => (
                <button key={item.id} className="block w-full border-b p-4 text-left hover:bg-muted/50" onClick={() => editMethod(item)}>
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{item.name} <span className="ml-2 font-mono text-xs text-muted-foreground">{item.code}</span></div>
                    <StatusText status={item.status}>{item.status === 'ACTIVE' ? '启用' : '停用'}</StatusText>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">{item.standardNo || '暂无标准编号'}{item.standardVersion ? ` · ${item.standardVersion}` : ''}</div>
                </button>
              ))}
              {qualityTab === 'templates' && (qualitySearchFiltered as QualityTemplate[]).map((item) => (
                <button key={item.id} className="block w-full border-b p-4 text-left hover:bg-muted/50" onClick={() => editTemplate(item)}>
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{item.name} <span className="ml-2 font-mono text-xs text-muted-foreground">{item.code}</span></div>
                    <Badge>{QUALITY_SCENES[item.businessScene]}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">{item.materialCategory?.name || '全部物料'} · {item.items.length} 项指标 · 已关联 {item._count.materials} 个物料</div>
                </button>
              ))}
              {!qualitySearchFiltered.length && <div className="p-16 text-center text-sm text-muted-foreground">暂无数据</div>}
            </div>
          </Card>

          {qualityTab === 'indicators' && (
            <Card className="space-y-4 p-5">
              <QualityEditorTitle title={indicatorForm.id ? '编辑检测指标' : '新增检测指标'} onNew={resetIndicatorForm} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="指标编码 *"><Input value={indicatorForm.code} onChange={(event) => setIndicatorForm((value) => ({ ...value, code: event.target.value }))} /></Field>
                <Field label="指标名称 *"><Input value={indicatorForm.name} onChange={(event) => setIndicatorForm((value) => ({ ...value, name: event.target.value }))} /></Field>
                <Field label="指标符号"><Input value={indicatorForm.symbol} onChange={(event) => setIndicatorForm((value) => ({ ...value, symbol: event.target.value }))} /></Field>
                <Field label="默认单位 *"><Input value={indicatorForm.defaultUnit} onChange={(event) => setIndicatorForm((value) => ({ ...value, defaultUnit: event.target.value }))} /></Field>
              </div>
              <Field label="允许的检测方法">
                <div className="grid gap-2 sm:grid-cols-2">
                  {qualityMethods.filter((item) => item.status === 'ACTIVE').map((method) => (
                    <label key={method.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                      <input type="checkbox" checked={indicatorForm.methodIds.includes(method.id)} onChange={(event) => setIndicatorForm((value) => ({
                        ...value,
                        methodIds: event.target.checked ? [...value.methodIds, method.id] : value.methodIds.filter((id) => id !== method.id),
                        defaultMethodId: !event.target.checked && value.defaultMethodId === method.id ? '' : value.defaultMethodId,
                      }))} />
                      {method.name}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="默认检测方法">
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={indicatorForm.defaultMethodId} onChange={(event) => setIndicatorForm((value) => ({ ...value, defaultMethodId: event.target.value }))}>
                  <option value="">暂不指定</option>
                  {qualityMethods.filter((item) => indicatorForm.methodIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <Field label="备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={indicatorForm.remark} onChange={(event) => setIndicatorForm((value) => ({ ...value, remark: event.target.value }))} /></Field>
              <QualitySaveButton saving={qualitySaving} onClick={saveIndicator} />
            </Card>
          )}

          {qualityTab === 'methods' && (
            <Card className="space-y-4 p-5">
              <QualityEditorTitle title={methodForm.id ? '编辑检测方法' : '新增检测方法'} onNew={resetMethodForm} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="方法编码 *"><Input value={methodForm.code} onChange={(event) => setMethodForm((value) => ({ ...value, code: event.target.value }))} /></Field>
                <Field label="方法名称 *"><Input value={methodForm.name} onChange={(event) => setMethodForm((value) => ({ ...value, name: event.target.value }))} /></Field>
                <Field label="标准编号"><Input value={methodForm.standardNo} onChange={(event) => setMethodForm((value) => ({ ...value, standardNo: event.target.value }))} /></Field>
                <Field label="标准版本"><Input value={methodForm.standardVersion} onChange={(event) => setMethodForm((value) => ({ ...value, standardVersion: event.target.value }))} /></Field>
              </div>
              <Field label="方法说明"><textarea className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" value={methodForm.description} onChange={(event) => setMethodForm((value) => ({ ...value, description: event.target.value }))} /></Field>
              <QualitySaveButton saving={qualitySaving} onClick={saveMethod} />
            </Card>
          )}

          {qualityTab === 'templates' && (
            <Card className="space-y-4 p-5">
              <QualityEditorTitle title={templateForm.id ? '编辑质检模板' : '新增质检模板'} onNew={resetTemplateForm} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="模板编码 *"><Input value={templateForm.code} onChange={(event) => setTemplateForm((value) => ({ ...value, code: event.target.value }))} /></Field>
                <Field label="模板名称 *"><Input value={templateForm.name} onChange={(event) => setTemplateForm((value) => ({ ...value, name: event.target.value }))} /></Field>
                <Field label="适用物料大类">
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={templateForm.materialCategoryId} onChange={(event) => setTemplateForm((value) => ({ ...value, materialCategoryId: event.target.value }))}>
                    <option value="">全部物料</option>
                    {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="业务场景">
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={templateForm.businessScene} onChange={(event) => setTemplateForm((value) => ({ ...value, businessScene: event.target.value }))}>
                    {Object.entries(QUALITY_SCENES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
              </div>
              <QualityTemplateItems value={templateForm.items} indicators={qualityIndicators} onChange={(items) => setTemplateForm((value) => ({ ...value, items }))} />
              <Field label="备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={templateForm.remark} onChange={(event) => setTemplateForm((value) => ({ ...value, remark: event.target.value }))} /></Field>
              <QualitySaveButton saving={qualitySaving} onClick={saveTemplate} />
            </Card>
          )}
        </div>
      )}

      <FleetMemberManager fleetId={tab === 'vehicles' && resourceTab === 'fleet' ? fleetMembersId : null} onClose={() => setFleetMembersId(null)} onChanged={() => { fetchFleets(); fetchDrivers(); fetchVehicles(); }} />

    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium">{label}</span>{children}</label>;
}

/* ── 质检标准辅助组件 ── */

function QualityEditorTitle({ title, onNew }: { title: string; onNew: () => void }) {
  return (
    <div className="flex items-center justify-between border-b pb-3">
      <div className="flex items-center gap-2 font-semibold"><Settings2 className="h-4 w-4 text-primary" />{title}</div>
      <Button size="sm" variant="outline" onClick={onNew}><Plus className="mr-1 h-4 w-4" />新增</Button>
    </div>
  );
}

function QualitySaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return <div className="flex justify-end"><Button disabled={saving} onClick={() => void onClick()}><Save className="mr-1 h-4 w-4" />{saving ? '保存中...' : '保存'}</Button></div>;
}

function QualityTemplateItems({ value, indicators, onChange }: {
  value: QualityTemplateItem[]; indicators: QualityIndicator[]; onChange: (value: QualityTemplateItem[]) => void;
}) {
  const available = indicators.filter((item) => item.status === 'ACTIVE' && !value.some((row) => row.indicatorId === item.id));
  const add = (indicatorId: string) => {
    const indicator = indicators.find((item) => item.id === indicatorId);
    if (!indicator) return;
    const defaultLink = indicator.methods.find((item) => item.isDefault) || indicator.methods[0];
    onChange([...value, {
      indicatorId, defaultMethodId: defaultLink?.methodId || null, operator: 'GTE', standardValue: '',
      upperValue: '', fuseValue: '', unit: indicator.defaultUnit, required: true, core: false,
      participates: true, sort: value.length, indicator,
    }]);
  };
  const update = (index: number, patch: Partial<QualityTemplateItem>) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">模板指标 *</label>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value="" onChange={(event) => add(event.target.value)}>
          <option value="">+ 添加指标</option>
          {available.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      {value.map((item, index) => {
        const indicator = indicators.find((candidate) => candidate.id === item.indicatorId) || item.indicator;
        const allowedMethods = indicator?.methods || [];
        return (
          <div key={item.indicatorId} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">{indicator?.name || item.indicatorId}</div>
              <button className="text-xs text-destructive" onClick={() => onChange(value.filter((_, rowIndex) => rowIndex !== index))}>移除</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={item.defaultMethodId || ''} onChange={(event) => update(index, { defaultMethodId: event.target.value || null })}>
                <option value="">暂不指定方法</option>
                {allowedMethods.map((link) => <option key={link.methodId} value={link.methodId}>{link.method.name}</option>)}
              </select>
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={item.operator} onChange={(event) => update(index, { operator: event.target.value })}>
                {Object.entries(QUALITY_OPERATORS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <Input type="number" step="0.0001" placeholder="标准值" value={qualityTextValue(item.standardValue)} onChange={(event) => update(index, { standardValue: event.target.value })} />
              <Input type="number" step="0.0001" placeholder={item.operator === 'RANGE' ? '上限值' : '拒收线'} value={qualityTextValue(item.operator === 'RANGE' ? item.upperValue : item.fuseValue)} onChange={(event) => update(index, item.operator === 'RANGE' ? { upperValue: event.target.value } : { fuseValue: event.target.value })} />
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              <label><input className="mr-1" type="checkbox" checked={item.required} onChange={(event) => update(index, { required: event.target.checked })} />必检</label>
              <label><input className="mr-1" type="checkbox" checked={item.core} onChange={(event) => update(index, { core: event.target.checked })} />核心指标</label>
              <label><input className="mr-1" type="checkbox" checked={item.participates} onChange={(event) => update(index, { participates: event.target.checked })} />参与判定</label>
            </div>
          </div>
        );
      })}
      {!value.length && (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <FlaskConical className="mx-auto mb-2 h-6 w-6 opacity-40" />请添加检测指标
        </div>
      )}
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
