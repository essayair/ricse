'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export const ORGANIZATION_TYPES = {
  LOGISTICS_CARRIER: '物流承运商',
  QUALITY_INSTITUTION: '质检机构',
  WAREHOUSE_PORT: '仓储与港口',
  PROCESSING_PROVIDER: '加工服务商',
} as const;

interface Partner { id: string; code: string; name: string }
interface Organization {
  id: string; partnerId: string; organizationType: keyof typeof ORGANIZATION_TYPES;
  licenseNo?: string | null; licenseExpiry?: string | null; qualificationNo?: string | null;
  cmaNo?: string | null; cnasNo?: string | null; serviceScope?: string | null; serviceRegions?: string | null;
  transportModes?: string[]; cargoTypes?: string | null; supportedMaterials?: string | null;
  supportedItems?: string | null; operationType?: string | null; storageCapacity?: string | null;
  dispatcherName?: string | null; dispatcherPhone?: string | null; contactPerson?: string | null;
  contactPhone?: string | null; settlementMethod?: string | null; reportCycleDays?: number | null;
  insuranceInfo?: string | null; status: string; remark?: string | null;
}

const empty = {
  partnerId: '', licenseNo: '', licenseExpiry: '', qualificationNo: '', cmaNo: '', cnasNo: '',
  serviceScope: '', serviceRegions: '', cargoTypes: '', supportedMaterials: '', supportedItems: '',
  operationType: 'WAREHOUSE_PORT', storageCapacity: '', dispatcherName: '', dispatcherPhone: '',
  contactPerson: '', contactPhone: '', settlementMethod: '', reportCycleDays: '', insuranceInfo: '',
  status: 'ACTIVE', remark: '',
};

export function ServiceOrganizationForm({ type, id }: { type?: string; id?: string }) {
  const router = useRouter();
  const [organizationType, setOrganizationType] = useState(type || 'LOGISTICS_CARRIER');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [form, setForm] = useState<Record<string, string>>(empty);
  const [transportModes, setTransportModes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<{ items: Partner[] }>('/partners?role=SUPPLIER&status=ACTIVE&pageSize=200')
      .then(result => setPartners(result.items || []))
      .catch(error => alert(error.message));
    if (id) {
      api.get<Organization>(`/service-organizations/${id}`).then(item => {
        setOrganizationType(item.organizationType);
        setTransportModes(item.transportModes || []);
        setForm(Object.fromEntries(Object.entries({
          ...empty,
          ...item,
          licenseExpiry: item.licenseExpiry?.slice(0, 10) || '',
          storageCapacity: item.storageCapacity || '',
          reportCycleDays: item.reportCycleDays?.toString() || '',
        }).map(([key, value]) => [key, value == null ? '' : String(value)])));
      }).catch(error => alert(error.message));
    }
  }, [id]);

  const set = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  const toggleMode = (mode: string) => setTransportModes(current =>
    current.includes(mode) ? current.filter(item => item !== mode) : [...current, mode],
  );
  const back = () => router.push(`/dashboard/master-data/service-organizations?type=${organizationType}`);

  const submit = async () => {
    if (!form.partnerId) return alert('请选择关联合作伙伴');
    setLoading(true);
    const payload = {
      ...form,
      partnerId: form.partnerId,
      organizationType,
      transportModes,
      storageCapacity: form.storageCapacity ? Number(form.storageCapacity) : undefined,
      reportCycleDays: form.reportCycleDays ? Number(form.reportCycleDays) : undefined,
    };
    try {
      if (id) await api.patch(`/service-organizations/${id}`, payload);
      else await api.post('/service-organizations', payload);
      back();
    } catch (error: any) {
      alert(error.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const title = ORGANIZATION_TYPES[organizationType as keyof typeof ORGANIZATION_TYPES] || '服务生态档案';
  return <div className="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 className="text-2xl font-bold">{id ? `编辑${title}` : `新建${title}`}</h1>
      <p className="mt-1 text-sm text-muted-foreground">专业档案关联统一合作伙伴，业务单据使用合作伙伴 ID 并保留名称快照。</p>
    </div>

    <Card className="space-y-5 p-6">
      <h2 className="font-semibold">主体与状态</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="关联合作伙伴（供应商）*">
          <select disabled={Boolean(id)} value={form.partnerId} onChange={e => set('partnerId', e.target.value)} className={selectClass}>
            <option value="">请选择</option>
            {partners.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
          </select>
        </Field>
        <Field label="档案状态">
          <select value={form.status} onChange={e => set('status', e.target.value)} className={selectClass}>
            <option value="ACTIVE">有效</option><option value="INACTIVE">停用</option><option value="BLACKLIST">黑名单</option>
          </select>
        </Field>
        <Field label="联系人"><Input value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></Field>
        <Field label="联系电话"><Input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} /></Field>
      </div>
    </Card>

    <Card className="space-y-5 p-6">
      <h2 className="font-semibold">资质与服务范围</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="许可证/资质证号"><Input value={form.licenseNo} onChange={e => set('licenseNo', e.target.value)} /></Field>
        <Field label="资质有效期"><Input type="date" value={form.licenseExpiry} onChange={e => set('licenseExpiry', e.target.value)} /></Field>
        <Field label="服务范围"><Input value={form.serviceScope} onChange={e => set('serviceScope', e.target.value)} /></Field>
        <Field label="服务区域"><Input value={form.serviceRegions} onChange={e => set('serviceRegions', e.target.value)} /></Field>
      </div>

      {organizationType === 'LOGISTICS_CARRIER' && <>
        <div>
          <div className="mb-2 text-sm font-medium">运输方式</div>
          <div className="flex flex-wrap gap-4">{[['ROAD', '公路'], ['RAIL', '铁路'], ['WATER', '水路'], ['MULTIMODAL', '多式联运']].map(([value, label]) =>
            <label key={value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={transportModes.includes(value)} onChange={() => toggleMode(value)} />{label}</label>,
          )}</div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="承运货物类型"><Input value={form.cargoTypes} onChange={e => set('cargoTypes', e.target.value)} /></Field>
          <Field label="保险信息"><Input value={form.insuranceInfo} onChange={e => set('insuranceInfo', e.target.value)} /></Field>
          <Field label="调度联系人"><Input value={form.dispatcherName} onChange={e => set('dispatcherName', e.target.value)} /></Field>
          <Field label="调度电话"><Input value={form.dispatcherPhone} onChange={e => set('dispatcherPhone', e.target.value)} /></Field>
        </div>
      </>}

      {organizationType === 'QUALITY_INSTITUTION' && <div className="grid gap-4 md:grid-cols-2">
        <Field label="机构资质编号"><Input value={form.qualificationNo} onChange={e => set('qualificationNo', e.target.value)} /></Field>
        <Field label="CMA 编号"><Input value={form.cmaNo} onChange={e => set('cmaNo', e.target.value)} /></Field>
        <Field label="CNAS 编号"><Input value={form.cnasNo} onChange={e => set('cnasNo', e.target.value)} /></Field>
        <Field label="报告周期（天）"><Input type="number" min="0" value={form.reportCycleDays} onChange={e => set('reportCycleDays', e.target.value)} /></Field>
        <Field label="支持物料"><Input value={form.supportedMaterials} onChange={e => set('supportedMaterials', e.target.value)} /></Field>
        <Field label="支持检测项目"><Input value={form.supportedItems} onChange={e => set('supportedItems', e.target.value)} /></Field>
      </div>}

      {organizationType === 'WAREHOUSE_PORT' && <div className="grid gap-4 md:grid-cols-2">
        <Field label="运营类型">
          <select value={form.operationType} onChange={e => set('operationType', e.target.value)} className={selectClass}>
            <option value="WAREHOUSE">仓储</option><option value="PORT">港口</option><option value="WAREHOUSE_PORT">仓储与港口</option>
          </select>
        </Field>
        <Field label="仓储能力（吨）"><Input type="number" min="0" step="0.001" value={form.storageCapacity} onChange={e => set('storageCapacity', e.target.value)} /></Field>
        <Field label="支持货物类型"><Input value={form.cargoTypes} onChange={e => set('cargoTypes', e.target.value)} /></Field>
        <Field label="结算方式"><Input value={form.settlementMethod} onChange={e => set('settlementMethod', e.target.value)} /></Field>
      </div>}

      {organizationType === 'PROCESSING_PROVIDER' && <div className="grid gap-4 md:grid-cols-2">
        <Field label="加工能力/工艺范围"><Input value={form.serviceScope} onChange={e => set('serviceScope', e.target.value)} placeholder="破碎、筛分、混配、精加工等" /></Field>
        <Field label="支持加工物料"><Input value={form.supportedMaterials} onChange={e => set('supportedMaterials', e.target.value)} /></Field>
        <Field label="加工项目"><Input value={form.supportedItems} onChange={e => set('supportedItems', e.target.value)} /></Field>
        <Field label="结算方式"><Input value={form.settlementMethod} onChange={e => set('settlementMethod', e.target.value)} placeholder="按合格产量/投料量/固定金额" /></Field>
        <Field label="产能说明"><Input value={form.storageCapacity} onChange={e => set('storageCapacity', e.target.value)} placeholder="可填写参考日产能（吨）" /></Field>
        <Field label="资质编号"><Input value={form.qualificationNo} onChange={e => set('qualificationNo', e.target.value)} /></Field>
      </div>}
    </Card>

    <Card className="p-6">
      <Field label="备注"><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={form.remark} onChange={e => set('remark', e.target.value)} /></Field>
    </Card>
    <div className="flex justify-end gap-3 pb-8"><Button variant="outline" onClick={back}>取消</Button><Button disabled={loading} onClick={() => void submit()}>{loading ? '保存中...' : '保存'}</Button></div>
  </div>;
}

const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium">{label}</span>{children}</label>;
}
