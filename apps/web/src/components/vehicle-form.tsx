'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export interface VehicleDriverValue { driverId: string; role: 'PRIMARY' | 'SECONDARY' }
export interface VehicleFormValue {
  plateNo: string;
  vehicleType: string;
  brand: string;
  tareWeight: string;
  loadCapacity: string;
  plateColor: string;
  licenseNo: string;
  annualInspectionExpiry: string;
  compulsoryInsuranceExpiry: string;
  commercialInsuranceExpiry: string;
  ownerType: string;
  ownerId: string;
  ownerName: string;
  ownerPhone: string;
  drivers: VehicleDriverValue[];
  deviceType: string;
  deviceNo: string;
  deviceInstalledAt: string;
  status: string;
  remark: string;
}

interface PartnerOption { id: string; code: string; name: string; isInternal: boolean; status: string }
interface CarrierProfile { id: string; partnerId: string; partner: PartnerOption }
interface DriverOption {
  id: string; name: string; phone: string; licenseClass: string | null; status: string;
  serviceOrganization: { id: string; partnerId: string; partner: PartnerOption };
}

const EMPTY_VALUE: VehicleFormValue = {
  plateNo: '', vehicleType: 'SEMI_TRAILER', brand: '', tareWeight: '', loadCapacity: '', plateColor: 'YELLOW',
  licenseNo: '', annualInspectionExpiry: '', compulsoryInsuranceExpiry: '', commercialInsuranceExpiry: '',
  ownerType: 'OUTSOURCED', ownerId: '', ownerName: '', ownerPhone: '', drivers: [],
  deviceType: 'NONE', deviceNo: '', deviceInstalledAt: '', status: 'ACTIVE', remark: '',
};

const normalizePlateNo = (value: string) => value.replace(/[\s·•]/g, '').toUpperCase();

export function VehicleForm({ initialValue, submitLabel, onSubmit, onCancel, showStatus = false }: {
  initialValue?: VehicleFormValue;
  submitLabel: string;
  onSubmit: (value: VehicleFormValue) => Promise<void>;
  onCancel: () => void;
  showStatus?: boolean;
}) {
  const [form, setForm] = useState<VehicleFormValue>(initialValue || EMPTY_VALUE);
  const [internalPartners, setInternalPartners] = useState<PartnerOption[]>([]);
  const [carriers, setCarriers] = useState<CarrierProfile[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [driverSearch, setDriverSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ items: PartnerOption[] }>('/partners?pageSize=200&status=ACTIVE'),
      api.get<{ items: CarrierProfile[] }>('/service-organizations?type=LOGISTICS_CARRIER&status=ACTIVE&pageSize=200'),
      api.get<{ items: DriverOption[] }>('/drivers?pageSize=200'),
    ]).then(([partnerData, carrierData, driverData]) => {
      setInternalPartners((partnerData.items || []).filter(item => item.isInternal));
      setCarriers(carrierData.items || []);
      setDrivers(driverData.items || []);
    }).catch((error) => alert(error.message || '车辆关联主数据加载失败'));
  }, []);

  const ownerOptions = useMemo(() => form.ownerType === 'SELF'
    ? internalPartners
    : carriers.map(item => item.partner), [carriers, form.ownerType, internalPartners]);
  const eligibleDrivers = useMemo(() => {
    const keyword = driverSearch.trim().toLowerCase();
    return drivers.filter(driver => {
      const selected = form.drivers.some(item => item.driverId === driver.id);
      if (driver.status !== 'ACTIVE' && !selected) return false;
      const ownerMatched = form.ownerType === 'SELF'
        ? driver.serviceOrganization.partner.isInternal
        : Boolean(form.ownerId) && driver.serviceOrganization.partnerId === form.ownerId;
      if (!ownerMatched) return false;
      return !keyword || selected || [driver.name, driver.phone, driver.licenseClass || '', driver.serviceOrganization.partner.name]
        .some(value => value.toLowerCase().includes(keyword));
    });
  }, [driverSearch, drivers, form.ownerId, form.ownerType]);

  const set = (key: keyof VehicleFormValue, value: string) => setForm(current => ({ ...current, [key]: value }));
  const changeOwner = (ownerType: string, ownerId = '') => setForm(current => ({
    ...current, ownerType, ownerId, drivers: [],
  }));
  const toggleDriver = (driverId: string) => setForm(current => {
    const exists = current.drivers.some(item => item.driverId === driverId);
    if (!exists) return { ...current, drivers: [...current.drivers, { driverId, role: current.drivers.length ? 'SECONDARY' : 'PRIMARY' }] };
    const remaining = current.drivers.filter(item => item.driverId !== driverId);
    if (remaining.length && !remaining.some(item => item.role === 'PRIMARY')) remaining[0] = { ...remaining[0], role: 'PRIMARY' };
    return { ...current, drivers: remaining };
  });
  const setDriverRole = (driverId: string, role: 'PRIMARY' | 'SECONDARY') => setForm(current => ({
    ...current,
    drivers: current.drivers.map(item => item.driverId === driverId
      ? { ...item, role }
      : role === 'PRIMARY' ? { ...item, role: 'SECONDARY' } : item),
  }));

  const submit = async () => {
    const plateNo = normalizePlateNo(form.plateNo);
    if (!/^[\u4e00-\u9fa5][A-Z][A-Z0-9挂学警港澳]{5,6}$/.test(plateNo)) return alert('请输入正确的完整车牌号，例如：甘A12345');
    if (!form.loadCapacity || Number(form.loadCapacity) <= 0) return alert('核定载重必须大于 0');
    if (form.tareWeight && Number(form.tareWeight) < 0) return alert('整备质量不能小于 0');
    if (form.ownerType === 'OUTSOURCED' && !form.ownerId) return alert('外协车辆必须选择所属物流承运商');
    if (form.ownerPhone && !/^1[3-9]\d{9}$/.test(form.ownerPhone)) return alert('车主手机号必须是11位有效手机号');
    if (form.deviceType !== 'NONE' && !form.deviceNo.trim()) return alert('绑定北斗或 GPS 设备时必须填写设备编号');
    setSubmitting(true);
    try { await onSubmit({ ...form, plateNo }); }
    finally { setSubmitting(false); }
  };

  return <div className="space-y-5">
    <Card className="space-y-5 p-6">
      <SectionTitle>车辆基本信息</SectionTitle>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="车牌号码" required><Input value={form.plateNo} onChange={e => set('plateNo', e.target.value)} onBlur={e => set('plateNo', normalizePlateNo(e.target.value))} placeholder="如：甘A12345" autoCapitalize="characters" /><Hint>支持拼音输入省份简称，保存时自动规范字母和分隔符。</Hint></Field>
        <Field label="车辆类型" required><select className={SELECT_CLASS} value={form.vehicleType} onChange={e => set('vehicleType', e.target.value)}><option value="SEMI_TRAILER">半挂车（标准型）</option><option value="HEAVY_SEMI_TRAILER">半挂车（超重型）</option><option value="BOX_TRUCK">厢式货车</option><option value="DUMP_TRUCK">自卸车</option><option value="TANK_TRUCK">槽罐车</option></select></Field>
        {showStatus ? <Field label="车辆档案状态" required><select className={SELECT_CLASS} value={form.status} onChange={e => set('status', e.target.value)}><option value="ACTIVE">可用</option><option value="MAINTENANCE">维修中</option><option value="RETIRED">已退役</option></select></Field> : <Field label="车牌颜色"><select className={SELECT_CLASS} value={form.plateColor} onChange={e => set('plateColor', e.target.value)}><PlateColorOptions /></select></Field>}
        <Field label="品牌型号"><Input value={form.brand} maxLength={100} onChange={e => set('brand', e.target.value)} placeholder="如：东风天龙 KL" /></Field>
        <Field label="整备质量（皮重，吨）"><Input type="number" min="0" max="9999.99" step="0.01" value={form.tareWeight} onChange={e => set('tareWeight', e.target.value)} placeholder="车辆空载重量" /><Hint>现场磅单皮重仍以实际称重为准。</Hint></Field>
        <Field label="核定载重（吨）" required><Input type="number" min="0.01" max="9999.99" step="0.01" value={form.loadCapacity} onChange={e => set('loadCapacity', e.target.value)} /></Field>
        {showStatus && <Field label="车牌颜色"><select className={SELECT_CLASS} value={form.plateColor} onChange={e => set('plateColor', e.target.value)}><PlateColorOptions /></select></Field>}
      </div>

      <SectionTitle>证件与年检</SectionTitle>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="行驶证号"><Input value={form.licenseNo} maxLength={100} onChange={e => set('licenseNo', e.target.value)} /></Field>
        <Field label="年检到期日"><Input type="date" value={form.annualInspectionExpiry} onChange={e => set('annualInspectionExpiry', e.target.value)} /></Field>
        <Field label="交强险到期日"><Input type="date" value={form.compulsoryInsuranceExpiry} onChange={e => set('compulsoryInsuranceExpiry', e.target.value)} /></Field>
        <Field label="商业险到期日"><Input type="date" value={form.commercialInsuranceExpiry} onChange={e => set('commercialInsuranceExpiry', e.target.value)} /></Field>
      </div>
    </Card>

    <Card className="space-y-5 p-6">
      <SectionTitle>承运商 / 车主信息</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="归属类型" required><select className={SELECT_CLASS} value={form.ownerType} onChange={e => changeOwner(e.target.value)}><option value="SELF">自有车辆</option><option value="OUTSOURCED">外协车辆</option></select></Field>
        <Field label={form.ownerType === 'SELF' ? '所属内部主体' : '归属物流承运商'} required={form.ownerType === 'OUTSOURCED'}><select className={SELECT_CLASS} value={form.ownerId} onChange={e => changeOwner(form.ownerType, e.target.value)}><option value="">{form.ownerType === 'SELF' ? '可不选择' : '请选择承运商'}</option>{ownerOptions.map(option => <option key={option.id} value={option.id}>{option.code} · {option.name}</option>)}</select></Field>
        <Field label="实际车主姓名"><Input value={form.ownerName} maxLength={50} onChange={e => set('ownerName', e.target.value)} placeholder="可与司机不同" /></Field>
        <Field label="车主手机号"><Input inputMode="numeric" maxLength={11} value={form.ownerPhone} onChange={e => set('ownerPhone', e.target.value.replace(/\D/g, '').slice(0, 11))} /></Field>
      </div>
    </Card>

    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">关联司机</h2><p className="mt-1 text-xs text-muted-foreground">一辆车可关联一名主驾和多名副驾；运单调度时仍可选择同一承运商的其他司机。</p></div><Link href="/dashboard/master-data/service-organizations?type=LOGISTICS_CARRIER" className="text-sm text-primary hover:underline">维护司机档案</Link></div>
      <div className="relative max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={driverSearch} onChange={e => setDriverSearch(e.target.value)} placeholder="搜索司机姓名、手机号、准驾车型" /></div>
      {form.ownerType === 'OUTSOURCED' && !form.ownerId ? <div className="rounded-md bg-muted p-5 text-sm text-muted-foreground">请先选择归属物流承运商，再关联其司机。</div> : !eligibleDrivers.length ? <div className="rounded-md bg-muted p-5 text-sm text-muted-foreground">当前所属单位没有可关联司机，可先到服务生态维护司机档案。</div> : <div className="grid gap-3 md:grid-cols-2">{eligibleDrivers.map(driver => {
        const link = form.drivers.find(item => item.driverId === driver.id);
        return <div key={driver.id} className={`flex items-center gap-3 rounded-lg border p-3 ${link ? 'border-primary bg-primary/5' : ''}`}><input type="checkbox" checked={Boolean(link)} onChange={() => toggleDriver(driver.id)} /><UserRound className="h-5 w-5 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="font-medium">{driver.name}{driver.status !== 'ACTIVE' && <span className="ml-2 text-xs text-amber-700">已停用，请解除关联</span>}</div><div className="truncate text-xs text-muted-foreground">{driver.phone} · {driver.licenseClass || '未填写准驾车型'} · {driver.serviceOrganization.partner.name}</div></div>{link && <select className="h-8 rounded-md border bg-background px-2 text-xs" value={link.role} onChange={e => setDriverRole(driver.id, e.target.value as 'PRIMARY' | 'SECONDARY')}><option value="PRIMARY">主驾</option><option value="SECONDARY">副驾</option></select>}</div>;
      })}</div>}
    </Card>

    <Card className="space-y-5 p-6">
      <SectionTitle>北斗 / GPS 设备绑定</SectionTitle>
      <div className="grid gap-3 md:grid-cols-3">{[['BEIDOU', '北斗 OBD 终端', '适用于重点监控货运车辆'], ['GPS', 'GPS 移动设备', '手机 APP 或独立定位终端'], ['NONE', '暂不绑定', '不展示实时位置与围栏状态']].map(([value, label, desc]) => <button type="button" key={value} onClick={() => setForm(current => ({ ...current, deviceType: value, ...(value === 'NONE' ? { deviceNo: '', deviceInstalledAt: '' } : {}) }))} className={`rounded-lg border p-4 text-left ${form.deviceType === value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}><div className="font-medium">{label}</div><div className="mt-1 text-xs text-muted-foreground">{desc}</div></button>)}</div>
      {form.deviceType !== 'NONE' && <div className="grid gap-4 md:grid-cols-2"><Field label="设备编号 / 终端号" required><Input value={form.deviceNo} maxLength={100} onChange={e => set('deviceNo', e.target.value)} /></Field><Field label="设备安装日期"><Input type="date" value={form.deviceInstalledAt} onChange={e => set('deviceInstalledAt', e.target.value)} /></Field></div>}
      <div className="rounded-md bg-blue-50 px-4 py-3 text-xs text-blue-800">当前仅维护设备档案。车辆位置、围栏和轨迹必须在真实定位平台接入后展示，不生成模拟数据。</div>
    </Card>

    <Card className="p-6"><Field label="备注"><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" maxLength={500} value={form.remark} onChange={e => set('remark', e.target.value)} /></Field></Card>
    <div className="flex justify-end gap-3 pb-8"><Button variant="outline" onClick={onCancel}>取消</Button><Button disabled={submitting} onClick={() => void submit()}>{submitting ? '保存中...' : submitLabel}</Button></div>
  </div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) { return <h2 className="border-b pb-2 font-semibold">{children}</h2>; }
function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <div><label className="mb-1.5 block text-sm font-medium">{label}{required && <span className="ml-0.5 text-destructive">*</span>}</label>{children}</div>; }
function Hint({ children }: { children: React.ReactNode }) { return <p className="mt-1 text-xs text-muted-foreground">{children}</p>; }
function PlateColorOptions() { return <><option value="YELLOW">黄牌</option><option value="GREEN">绿牌（新能源）</option><option value="BLUE">蓝牌</option><option value="BLACK">黑牌（港澳）</option><option value="OTHER">其他</option></>; }
const SELECT_CLASS = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
