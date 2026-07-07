'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Building2, MapPin, Phone, CreditCard, Truck,
  Landmark, Package, AlertTriangle, Loader2, ChevronDown,
} from 'lucide-react';
import { api } from '@/lib/api';

/* ── Types ── */

interface PartnerDetail {
  id: string; code: string; name: string; shortName: string | null;
  shortCode: string | null; taxId: string | null; orgType: string | null;
  category: string | null; isInternal: boolean;
  legalPerson: string | null; legalPersonType: string | null; legalIdCard: string | null;
  controller: string | null; controllerTitle: string | null; controllerPhone: string | null;
  contactPerson: string | null; contactPhone: string | null;
  country: string | null; province: string | null; city: string | null;
  address: string | null; bizAddress: string | null;
  regNo: string | null; estDate: string | null;
  regCapital: string | null; regCurrency: string | null;
  revenueScale: string | null; corpType: string | null;
  groupName: string | null; isParent: boolean | null;
  taxType: string | null; taxRating: string | null; invoiceType: string | null;
  relatedPartyType: string | null; industry: string | null;
  licenseType: string | null; licenseExpiry: string | null;
  sourceRegion: string | null; mainBiz: string | null; tradingGoods: string | null;
  bizScope: string | null; equityStructure: string | null; intro: string | null;
  creditLimit: string | null; roles: string[]; status: string; remark: string | null;
  createdAt: string; updatedAt: string;
  creator: { id: string; name: string } | null;
  attachments: Attachment[];
  bankAccounts: BankAccount[];
  vehicles: VehicleItem[];
  warehouses: WarehouseItem[];
}

interface BankAccount {
  id: string; accountName: string; accountNo: string; bankName: string;
  bankCode: string | null; accountType: string; currency: string; isDefault: boolean;
}

interface VehicleItem {
  id: string; plateNo: string; vehicleType: string; brand: string | null;
  loadCapacity: string; driverName: string | null; driverPhone: string | null;
  status: string;
}

interface Attachment {
  id: string; fileName: string; originalName: string;
  mimeType: string; size: number; category: string; createdAt: string;
}

interface WarehouseItem {
  id: string; code: string; name: string; type: string;
  address: string | null; manager: string | null; managerPhone: string | null;
}

/* ── Constants ── */

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  ACTIVE:    { label: '正常',   variant: 'default' },
  INACTIVE:  { label: '已停用', variant: 'secondary' },
  BLACKLIST: { label: '黑名单', variant: 'destructive' },
};

const CATEGORY_LABELS: Record<string, string> = {
  CORE: '核心合作伙伴', NORMAL: '普通合作伙伴', TEMP: '临时合作伙伴',
};

const VEHICLE_TYPE: Record<string, string> = {
  TRUCK: '自卸车', TANK: '罐车', TRAILER: '挂车',
};

const ACCOUNT_TYPE: Record<string, string> = {
  BASIC: '基本户', GENERAL: '一般户',
};

/* ── Helpers ── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-2 mb-4 mt-6 first:mt-0">
      {children}
    </div>
  );
}

function DetailItem({ label, value, span }: { label: string; value: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-medium min-h-[20px]">
        {value || <span className="text-muted-foreground italic font-normal">—</span>}
      </div>
    </div>
  );
}

function fmtDate(d: string | null) {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('zh-CN');
}

function fmtMoney(val: string | null | undefined): string | null {
  if (val == null || val === '' || val === '0') return null;
  const n = Number(val);
  if (isNaN(n) || n === 0) return null;
  if (n >= 10000) return `¥${(n / 10000).toFixed(0)}万`;
  return `¥${n.toLocaleString()}`;
}

/* ── Page ── */

export default function PartnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [partner, setPartner] = useState<PartnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [statusMenu, setStatusMenu] = useState(false);
  const [tab, setTab] = useState('basic');

  const fetchPartner = async () => {
    setLoading(true);
    try {
      const data = await api.get<PartnerDetail>(`/partners/${id}`);
      setPartner(data);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPartner(); }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === partner?.status) { setStatusMenu(false); return; }
    const label = STATUS_MAP[newStatus]?.label || newStatus;
    if (newStatus === 'BLACKLIST' && !confirm(`确定要将「${partner?.name}」加入黑名单吗？黑名单单位将被冻结，不可参与任何新业务。`)) {
      setStatusMenu(false);
      return;
    }
    setUpdating(true);
    setStatusMenu(false);
    try {
      await api.patch(`/partners/${id}`, { status: newStatus });
      setPartner((prev) => prev ? { ...prev, status: newStatus } : prev);
    } catch (e: any) {
      alert(e.message || '状态更新失败');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...
      </div>
    );
  }

  if (error || !partner) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">{error || '未找到该合作伙伴'}</p>
        <Link href="/dashboard/master-data?tab=partners"><Button variant="outline">返回列表</Button></Link>
      </div>
    );
  }

  const statusCfg = STATUS_MAP[partner.status] || STATUS_MAP.ACTIVE;
  const p = partner;
  const tabs = [
    { key: 'basic', label: '基本信息' },
    { key: 'bank', label: `银行账户 (${p.bankAccounts?.length || 0})` },
    { key: 'vehicle', label: `车辆 (${p.vehicles?.length || 0})` },
    { key: 'warehouse', label: `仓库 (${p.warehouses?.length || 0})` },
    { key: 'attachments', label: `影像附件 (${p.attachments?.length || 0})` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-1" />返回
            </Button>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
          <h1 className="text-2xl font-bold">{p.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono">{p.code}</span>
            {p.shortName && <span className="ml-2">· {p.shortName}</span>}
            <span className="ml-2 text-muted-foreground">
              {p.createdAt ? `建档于 ${fmtDate(p.createdAt)}` : ''}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Status management */}
          <div className="relative">
            <Button
              variant="outline" size="sm"
              disabled={updating}
              onClick={() => setStatusMenu(!statusMenu)}
            >
              {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              变更状态 <ChevronDown className="h-3.5 w-3.5 ml-1" />
            </Button>
            {statusMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setStatusMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-popover border rounded-md shadow-md py-1">
                  {Object.entries(STATUS_MAP).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => handleStatusChange(key)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between ${
                        key === partner.status ? 'font-semibold text-primary' : ''
                      }`}
                    >
                      {cfg.label}
                      {key === partner.status && <span className="text-xs">✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <Link href={`/dashboard/master-data/partners/${p.id}/edit`}>
            <Button variant="outline" size="sm">编辑</Button>
          </Link>
        </div>
      </div>

      {/* Quick info cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">业务角色</div>
          <div className="text-sm font-semibold flex flex-wrap gap-1">
            {p.isInternal && (
              <span className="text-orange-600 font-medium">内部</span>
            )}
            {p.roles?.map((r) => (
              <span key={r} className={r === 'SUPPLIER' ? 'text-blue-600' : 'text-emerald-600'}>
                {r === 'SUPPLIER' ? '供应商' : '客户'}
              </span>
            ))}
            {!p.roles?.length && !p.isInternal && <span className="text-muted-foreground">—</span>}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">合作伙伴类别</div>
          <div className="text-sm font-semibold">{CATEGORY_LABELS[p.category || ''] || p.category || '—'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">授信额度</div>
          <div className="text-sm font-semibold font-mono">{fmtMoney(p.creditLimit) || '—'}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">电话</div>
          <div className="text-sm font-semibold flex items-center gap-1">
            <Phone className="h-3 w-3 text-muted-foreground" />
            {p.contactPhone || '—'}
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-[2px] ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'basic' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">

            {/* 企业基本信息 */}
            <Card className="p-6">
              <SectionTitle>企业基本信息</SectionTitle>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <DetailItem label="企业名称" value={p.name} span />
                <DetailItem label="统一社会信用代码" value={<span className="font-mono">{p.taxId || '—'}</span>} />
                <DetailItem label="国家 / 地区" value={p.country || '—'} />
                <DetailItem label="简称 / 别名" value={p.shortName || '—'} />
                <DetailItem label="搜索简码" value={<span className="font-mono">{p.shortCode || '—'}</span>} />
                <DetailItem label="组织性质" value={p.orgType || '—'} />
                <DetailItem label="合作伙伴类别" value={CATEGORY_LABELS[p.category || ''] || p.category || '—'} />
              </div>

              <SectionTitle>法人 / 实际控制人</SectionTitle>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <DetailItem label="法定代表人" value={p.legalPerson || '—'} />
                <DetailItem label="法人类型" value={p.legalPersonType || '—'} />
                <DetailItem label="法人身份证号" value={<span className="font-mono">{p.legalIdCard || '—'}</span>} />
                <DetailItem label="实际控制人" value={p.controller || '—'} />
                <DetailItem label="实际控制人职务" value={p.controllerTitle || '—'} />
                <DetailItem label="实控人联系方式" value={p.controllerPhone || '—'} />
              </div>

              <SectionTitle>工商登记信息</SectionTitle>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <DetailItem label="注册登记号" value={<span className="font-mono">{p.regNo || '—'}</span>} />
                <DetailItem label="成立日期" value={fmtDate(p.estDate) || '—'} />
                <DetailItem label="注册资本" value={
                  p.regCapital
                    ? `${Number(p.regCapital).toLocaleString()} 万元${p.regCurrency ? `（${p.regCurrency}）` : ''}`
                    : '—'
                } />
                <DetailItem label="企业类型" value={p.corpType || '—'} />
                <DetailItem label="营业收入规模" value={p.revenueScale || '—'} />
                <DetailItem label="所属集团" value={
                  p.groupName
                    ? `${p.groupName}${p.isParent ? '（本身为母公司）' : ''}`
                    : (p.isParent ? '本身为母公司' : '—')
                } />
              </div>

              <SectionTitle>税务 / 发票</SectionTitle>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <DetailItem label="纳税人类型" value={p.taxType || '—'} />
                <DetailItem label="纳税评级" value={p.taxRating || '—'} />
                <DetailItem label="发票类型" value={p.invoiceType || '—'} />
                <DetailItem label="行业" value={p.industry || '—'} />
                <DetailItem label="是否为关联方" value={p.relatedPartyType || '—'} />
              </div>

              {p.licenseType && (
                <>
                  <SectionTitle>特殊资质</SectionTitle>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <DetailItem label="特殊证照" value={p.licenseType} />
                    <DetailItem label="资质到期" value={fmtDate(p.licenseExpiry) || '—'} />
                  </div>
                </>
              )}

              <SectionTitle>业务信息</SectionTitle>
              <div className="space-y-3">
                <DetailItem label="主要货源地" value={p.sourceRegion || '—'} />
                <DetailItem label="主营业务" value={p.mainBiz || '—'} />
                <DetailItem label="拟合作品种 / 业务" value={p.tradingGoods || '—'} />
                <DetailItem label="经营范围" value={p.bizScope || '—'} span />
                <DetailItem label="股权结构" value={p.equityStructure || '—'} span />
                <DetailItem label="企业介绍" value={p.intro || '—'} span />
              </div>

              <SectionTitle>联系 / 地址</SectionTitle>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <DetailItem label="主联系人" value={p.contactPerson || '—'} />
                <DetailItem label="联系电话" value={p.contactPhone || '—'} />
                <DetailItem label="省份" value={p.province || '—'} />
                <DetailItem label="城市" value={p.city || '—'} />
                <DetailItem label="注册地址" value={p.address || '—'} span />
                <DetailItem label="办公地址" value={p.bizAddress || '—'} span />
              </div>
            </Card>
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            <Card className="p-5">
              <SectionTitle>备注</SectionTitle>
              <p className="text-sm text-muted-foreground">{p.remark || '暂无备注'}</p>
            </Card>

            <Card className="p-5 bg-muted/30">
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">档案摘要</div>
              <div className="space-y-2 text-sm">
                <Row label="编码" value={<span className="font-mono font-medium">{p.code}</span>} />
                <Row label="名称" value={p.name} />
                <Row label="性质" value={p.isInternal ? '内部企业' : '外部单位'} />
                <Row label="角色" value={
                  <span>
                    {p.roles?.map((r) => r === 'SUPPLIER' ? '供应商' : '客户').join(' · ') || '—'}
                  </span>
                } />
                {(p.province || p.city) && (
                  <Row label="地区" value={`${p.province || ''} ${p.city || ''}`} />
                )}
                <Row label="联系人" value={p.contactPerson || '—'} />
                <Row label="电话" value={p.contactPhone || '—'} />
                <Row label="状态" value={statusCfg.label} />
                <Row label="更新于" value={fmtDate(p.updatedAt) || '—'} />
                <Row label="创建人" value={p.creator?.name || '—'} />
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Bank Accounts Tab */}
      {tab === 'bank' && (
        <Card className="overflow-hidden">
          {!p.bankAccounts?.length ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              <Landmark className="h-8 w-8 mx-auto mb-2 opacity-30" />
              暂无银行账户
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">开户名称</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">银行账号</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">开户行</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">账户类型</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">币种</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">默认</th>
                </tr>
              </thead>
              <tbody>
                {p.bankAccounts.map((a) => (
                  <tr key={a.id} className="border-b">
                    <td className="px-4 py-3 font-medium">{a.accountName}</td>
                    <td className="px-4 py-3 font-mono">{a.accountNo}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.bankName}</td>
                    <td className="px-4 py-3">{ACCOUNT_TYPE[a.accountType] || a.accountType}</td>
                    <td className="px-4 py-3">{a.currency}</td>
                    <td className="px-4 py-3">{a.isDefault ? <Badge variant="secondary" className="text-xs">默认</Badge> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Vehicles Tab */}
      {tab === 'vehicle' && (
        <Card className="overflow-hidden">
          {!p.vehicles?.length ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              <Truck className="h-8 w-8 mx-auto mb-2 opacity-30" />
              暂无车辆信息
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">车牌号</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">车型</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">品牌</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">载重（吨）</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">驾驶员</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">电话</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
                </tr>
              </thead>
              <tbody>
                {p.vehicles.map((v) => (
                  <tr key={v.id} className="border-b">
                    <td className="px-4 py-3 font-mono font-medium">{v.plateNo}</td>
                    <td className="px-4 py-3">{VEHICLE_TYPE[v.vehicleType] || v.vehicleType}</td>
                    <td className="px-4 py-3 text-muted-foreground">{v.brand || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{Number(v.loadCapacity).toFixed(1)}</td>
                    <td className="px-4 py-3">{v.driverName || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{v.driverPhone || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={v.status === 'ACTIVE' ? 'default' : v.status === 'MAINTENANCE' ? 'secondary' : 'outline'}>
                        {v.status === 'ACTIVE' ? '运营中' : v.status === 'MAINTENANCE' ? '维修中' : '退役'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Warehouses Tab */}
      {tab === 'warehouse' && (
        <Card className="overflow-hidden">
          {!p.warehouses?.length ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              暂无仓库信息
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">编码</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">名称</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">地址</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">仓管员</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">电话</th>
                </tr>
              </thead>
              <tbody>
                {p.warehouses.map((w) => (
                  <tr key={w.id} className="border-b">
                    <td className="px-4 py-3 font-mono">{w.code}</td>
                    <td className="px-4 py-3 font-medium">{w.name}</td>
                    <td className="px-4 py-3">{w.type === 'SELF' ? '自有仓' : '租赁仓'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{w.address || '—'}</td>
                    <td className="px-4 py-3">{w.manager || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{w.managerPhone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Attachments Tab */}
      {tab === 'attachments' && (
        <Card className="overflow-hidden">
          {!p.attachments?.length ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              <div className="text-2xl mb-2 opacity-30">📎</div>
              暂无影像附件
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 p-4">
              {p.attachments.map((a) => (
                <div key={a.id} className="border rounded-lg p-3 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                  <span className="text-xl mt-0.5">{a.mimeType.startsWith('image/') ? '🖼' : '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" title={a.originalName}>{a.originalName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.category === 'BUSINESS_LICENSE' ? '营业执照' : a.category} · {(a.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-14 shrink-0 text-xs">{label}</span>
      <span>{value}</span>
    </div>
  );
}
