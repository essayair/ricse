'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Paperclip, Save, WandSparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { pastedAttachmentFiles, readClipboardAttachmentFiles, selectValidAttachmentFiles } from '@/lib/attachment-file';
import { openLocalAttachment } from '@/lib/attachment-preview';
import { alertAction, confirmAction } from '@/lib/system-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AttachmentPanel, BusinessAttachment } from '@/components/attachment-panel';
import { EMPTY_VEHICLE_VALUE, VehicleForm, VehicleFormValue } from '@/components/vehicle-form';

type Mode = 'new' | 'existing' | 'none';
interface Driver { id: string; name: string; phone: string; status: string; licenseClass?: string; idCardNo?: string; licenseNo?: string; serviceOrganizationId?: string; serviceOrganization?: { partner: { name: string } }; attachments?: BusinessAttachment[]; vehicleLinks?: Array<{ vehicle: { plateNo: string; deletedAt?: string | null } }> }
interface Vehicle { id: string; plateNo: string; loadCapacity: string; status: string; attachments?: BusinessAttachment[]; owner?: { name: string }; drivers?: Array<{ driver: { name: string }; role: string }> }
interface Carrier { id: string; partnerId: string; partner: { id: string; name: string } }
const driverDefaults = { name: '', phone: '', idCardNo: '', licenseNo: '', licenseClass: '', licenseExpiry: '', serviceOrganizationId: '', remark: '' };
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

export function TransportResourceEditor() {
  const router = useRouter(), params = useSearchParams();
  const [driverMode, setDriverMode] = useState<Mode>('new'), [vehicleMode, setVehicleMode] = useState<Mode>('new');
  const [driver, setDriver] = useState(driverDefaults), [vehicle, setVehicle] = useState<VehicleFormValue>({ ...EMPTY_VEHICLE_VALUE, drivers: [] });
  const [driverFiles, setDriverFiles] = useState<File[]>([]), [vehicleFiles, setVehicleFiles] = useState<File[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null), [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [driverSearch, setDriverSearch] = useState(''), [vehicleSearch, setVehicleSearch] = useState('');
  const [drivers, setDrivers] = useState<Driver[]>([]), [vehicles, setVehicles] = useState<Vehicle[]>([]), [carriers, setCarriers] = useState<Carrier[]>([]);
  const [text, setText] = useState(''), [recognition, setRecognition] = useState(''), [busy, setBusy] = useState(false), [recognizing, setRecognizing] = useState(false), [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const selectionVersion = useRef({ driver: 0, vehicle: 0 });
  const [driverLoading, setDriverLoading] = useState(false), [vehicleLoading, setVehicleLoading] = useState(false);
  const organizationId = params.get('serviceOrganizationId') || '';
  const selectedDriverId = params.get('driverId') || '', selectedVehicleId = params.get('vehicleId') || '';
  const driverOrganizationId = driverMode === 'existing' ? selectedDriver?.serviceOrganizationId : driverMode === 'new' ? driver.serviceOrganizationId : '';
  const showError = (message: string) => { setError(message); void alertAction(message, { title: '请检查司机与车辆信息' }); };

  useEffect(() => {
    let current = true;
    void api.get<{ items: Carrier[] }>('/transport-resources/carriers').then(result => {
      if (!current) return;
      setCarriers(result.items || []);
      const carrier = result.items.find(item => item.id === organizationId);
      if (carrier) { setDriver(value => ({ ...value, serviceOrganizationId: carrier.id })); setVehicle(value => ({ ...value, ownerId: carrier.partnerId, ownerType: 'OUTSOURCED' })); }
    }).catch(e => { if (current) setError(e.message || '承运商加载失败'); });
    if (selectedDriverId) void api.get<Driver>('/drivers/' + selectedDriverId).then(item => { if (current) { setSelectedDriver(item); setDriverMode('existing'); } }).catch(e => { if (current) setError(e.message); });
    if (selectedVehicleId) void api.get<Vehicle>('/partners/vehicles/' + selectedVehicleId).then(item => { if (current) { setSelectedVehicle(item); setVehicleMode('existing'); } }).catch(e => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [organizationId, selectedDriverId, selectedVehicleId]);
  useEffect(() => {
    if (vehicleMode !== 'new' || !driverOrganizationId) return;
    const carrier = carriers.find(item => item.id === driverOrganizationId);
    if (carrier) setVehicle(current => current.ownerType === 'OUTSOURCED' && !current.ownerId ? { ...current, ownerId: carrier.partnerId } : current);
  }, [carriers, driverOrganizationId, vehicleMode]);
  useEffect(() => {
    if (driverMode !== 'existing') return;
    let current = true;
    const timer = setTimeout(() => void api.get<{ items: Driver[] }>('/drivers?' + new URLSearchParams({ pageSize: '50', status: 'ACTIVE', search: driverSearch.trim() })).then(r => { if (current) setDrivers(r.items); }).catch(e => { if (current) setError(e.message); }), 250);
    return () => { current = false; clearTimeout(timer); };
  }, [driverMode, driverSearch]);
  useEffect(() => {
    if (vehicleMode !== 'existing') return;
    let current = true;
    const timer = setTimeout(() => void api.get<{ items: Vehicle[] }>('/partners/vehicles?' + new URLSearchParams({ pageSize: '50', status: 'ACTIVE', search: vehicleSearch.trim() })).then(r => { if (current) setVehicles(r.items); }).catch(e => { if (current) setError(e.message); }), 250);
    return () => { current = false; clearTimeout(timer); };
  }, [vehicleMode, vehicleSearch]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);

  const back = async () => { if (dirty && !await confirmAction('有未保存的司机或车辆信息，确认离开吗？', { title: '离开运力登记' })) return; router.push('/dashboard/transport-resources'); };
  const driverPut = (key: keyof typeof driverDefaults, value: string) => { setDirty(true); setDriver(current => ({ ...current, [key]: value })); };
  const chooseDriver = async (id: string) => {
    const version = ++selectionVersion.current.driver; setDirty(true); setSelectedDriver(null); setDriverLoading(Boolean(id));
    if (!id) return;
    try { const item = await api.get<Driver>('/drivers/' + id); if (version === selectionVersion.current.driver) setSelectedDriver(item); }
    catch (e: any) { if (version === selectionVersion.current.driver) showError(e.message); }
    finally { if (version === selectionVersion.current.driver) setDriverLoading(false); }
  };
  const chooseVehicle = async (id: string) => {
    const version = ++selectionVersion.current.vehicle; setDirty(true); setSelectedVehicle(null); setVehicleLoading(Boolean(id));
    if (!id) return;
    try { const item = await api.get<Vehicle>('/partners/vehicles/' + id); if (version === selectionVersion.current.vehicle) setSelectedVehicle(item); }
    catch (e: any) { if (version === selectionVersion.current.vehicle) showError(e.message); }
    finally { if (version === selectionVersion.current.vehicle) setVehicleLoading(false); }
  };

  const recognize = async () => {
    if (!text.trim()) return showError('请先粘贴一组司机和车辆信息');
    setRecognizing(true); setError('');
    try {
      const result = await api.post<{ driver: Partial<typeof driverDefaults>; vehicle: Partial<Record<keyof VehicleFormValue, string | number>>; carrierName?: string; warnings: string[]; matchedFields: number }>('/transport-resources/recognize', { text });
      if (!result.matchedFields) { setRecognition('未识别到明确字段，请使用“字段名称：内容”的格式，或直接手工填写。'); return; }
      const messages = [...result.warnings];
      if (Object.keys(result.driver).length) {
        const matches = result.driver.phone ? await api.get<{ items: Driver[] }>('/drivers?' + new URLSearchParams({ search: result.driver.phone, pageSize: '50' })) : { items: [] };
        const existing = matches.items.find(item => item.phone === result.driver.phone);
        if (existing?.status === 'ACTIVE') { setDriverMode('existing'); setSelectedDriver(await api.get('/drivers/' + existing.id)); messages.push('司机手机号匹配已有档案，已选用；不会覆盖原档案信息。'); }
        else { setDriverMode('new'); setDriver(current => ({ ...current, ...result.driver })); if (existing) messages.push('该手机号对应的司机已停用，请先维护原档案，不能重复新建。'); }
      }
      if (Object.keys(result.vehicle).length) {
        const plate = String(result.vehicle.plateNo || '');
        const matches = plate ? await api.get<{ items: Vehicle[] }>('/partners/vehicles?' + new URLSearchParams({ search: plate, pageSize: '50' })) : { items: [] };
        const existing = matches.items.find(item => item.plateNo.replace(/\s/g, '').toUpperCase() === plate);
        if (existing?.status === 'ACTIVE') { setVehicleMode('existing'); setSelectedVehicle(await api.get('/partners/vehicles/' + existing.id)); messages.push('车牌匹配已有档案，已选用；不会覆盖原车辆信息。'); }
        else { setVehicleMode('new'); setVehicle(current => ({ ...current, ...Object.fromEntries(Object.entries(result.vehicle).map(([key, val]) => [key, String(val)])) })); if (existing) messages.push('该车牌已有不可用档案，请先维护车辆状态，不能重复新建。'); }
      }
      if (result.carrierName) {
        const matches = carriers.filter(item => item.partner.name === result.carrierName);
        if (matches.length === 1) { setDriver(current => ({ ...current, serviceOrganizationId: matches[0].id })); setVehicle(current => ({ ...current, ownerType: 'OUTSOURCED', ownerId: matches[0].partnerId })); }
        else messages.push(`承运商“${result.carrierName}”未唯一匹配，请手动选择；不会自动新建企业。`);
      }
      setDirty(true); setRecognition(`已识别 ${result.matchedFields} 项，请核对后保存。${messages.join(' ')}`);
    } catch (e: any) { showError(e.message || '文字识别失败'); } finally { setRecognizing(false); }
  };

  const save = async () => {
    setError('');
    const driverFilled = driverMode === 'new' && (Object.entries(driver).some(([key, value]) => key !== 'serviceOrganizationId' && value.trim()) || driverFiles.length > 0);
    const vehicleFilled = vehicleMode === 'new' && (Object.entries(vehicle).some(([key, value]) => !['vehicleType', 'ownerType', 'ownerId', 'plateColor', 'deviceType', 'status', 'drivers'].includes(key) && typeof value === 'string' && value.trim()) || vehicleFiles.length > 0);
    try {
      if (driverMode === 'existing' && !selectedDriver) throw new Error('请选择已有司机，或切换为“暂不填写”');
      if (vehicleMode === 'existing' && !selectedVehicle) throw new Error('请选择已有车辆，或切换为“暂不填写”');
      if (!driverFilled && !vehicleFilled && !(driverMode === 'existing' && selectedDriver) && !(vehicleMode === 'existing' && selectedVehicle)) throw new Error('请至少完整填写一名司机或一辆车辆');
      if (driverFilled) {
        if (!driver.name.trim()) throw new Error('请填写司机姓名，或清空司机区域仅创建车辆');
        if (!/^1[3-9]\d{9}$/.test(driver.phone)) throw new Error('司机手机号必须是11位有效手机号');
      }
      if (vehicleFilled) {
        if (!/^[\u4e00-\u9fa5][A-Z][A-Z0-9挂学警港澳]{5,6}$/.test(vehicle.plateNo.replace(/[\s·•]/g, '').toUpperCase())) throw new Error('请填写正确的完整车牌号，或清空车辆区域仅创建司机');
        if (!vehicle.loadCapacity || !Number.isFinite(Number(vehicle.loadCapacity)) || Number(vehicle.loadCapacity) <= 0) throw new Error('车辆核定载重必须大于0');
        if (vehicle.ownerPhone && !/^1[3-9]\d{9}$/.test(vehicle.ownerPhone)) throw new Error('车主手机号必须是11位有效手机号');
        if (vehicle.deviceType !== 'NONE' && !vehicle.deviceNo.trim()) throw new Error('绑定定位设备时请填写设备编号');
      }
      const newDriver = driverFilled ? Object.fromEntries(Object.entries(driver).map(([key, value]) => [key, value.trim() || undefined])) : undefined;
      const { drivers: _links, ...vehicleData } = vehicle;
      const newVehicle = vehicleFilled ? { ...Object.fromEntries(Object.entries(vehicleData).map(([key, value]) => [key, value.trim() || undefined])),
        plateNo: vehicle.plateNo.replace(/[\s·•]/g, '').toUpperCase(), loadCapacity: Number(vehicle.loadCapacity), tareWeight: vehicle.tareWeight ? Number(vehicle.tareWeight) : undefined,
      } : undefined;
      const body = new FormData();
      body.append('payload', JSON.stringify({ newDriver, newVehicle, driverId: driverMode === 'existing' ? selectedDriver?.id : undefined, vehicleId: vehicleMode === 'existing' ? selectedVehicle?.id : undefined }));
      if (driverFilled || (driverMode === 'existing' && selectedDriver)) driverFiles.forEach(file => body.append('driverAttachments', file));
      if (vehicleFilled || (vehicleMode === 'existing' && selectedVehicle)) vehicleFiles.forEach(file => body.append('vehicleAttachments', file));
      setBusy(true);
      const result = await api.upload<{ driverId: string | null; vehicleId: string | null }>('/transport-resources', body);
      setDirty(false); router.push(result.vehicleId ? '/dashboard/master-data/vehicles/' + result.vehicleId : '/dashboard/master-data/drivers/' + result.driverId);
    } catch (e: any) { showError(e.message || '司机与车辆保存失败'); } finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-6xl space-y-5 pb-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold">新建司机与车辆</h1><p className="mt-1 text-sm text-muted-foreground">司机在上、车辆在下。可只填写一项，也可选择已有档案与新建档案一起关联。</p></div><Button variant="outline" disabled={busy} onClick={() => void back()}><ArrowLeft className="mr-1 h-4 w-4"/>返回运力管理</Button></div>
    {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
    <Card className="space-y-3 p-5"><h2 className="flex items-center gap-2 font-semibold"><WandSparkles className="h-4 w-4 text-primary"/>文字信息自动识别</h2><p className="text-xs text-muted-foreground">粘贴一组微信、短信或文档信息，识别后请核对。仅填入识别到的字段，已有档案不会被覆盖；证件附件可稍后补充。</p><textarea className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" value={text} maxLength={10000} onChange={e => setText(e.target.value)} placeholder={'司机：张三，手机号：13800138000，准驾车型：A2\n车牌：甘A12345，车型：半挂车，核定载重：32吨，皮重：15吨\n身份证号：……，驾驶证号：……，承运商：……'}/><div className="flex flex-wrap items-center justify-between gap-3"><p className="flex-1 text-xs text-muted-foreground">{recognition || '使用本地规则识别，不会把个人信息发送给第三方识别服务。'}</p><Button variant="outline" disabled={busy || recognizing || driverLoading || vehicleLoading} onClick={() => void recognize()}>{recognizing ? '识别中…' : '识别并填入'}</Button></div></Card>
    <fieldset disabled={busy || recognizing} className="space-y-5"><section className="space-y-4"><Card className="space-y-4 p-5"><SectionHeader title="司机信息" mode={driverMode} setMode={mode => { setDriverMode(mode); setDirty(true); }}/>
      {driverMode === 'new' && <><p className="text-xs text-muted-foreground">单独创建司机时，车辆区域可留空或选“暂不填写”。手机号、已填写的身份证及驾驶证号继续按全平台唯一校验。</p><div className="grid gap-4 md:grid-cols-3"><Field label="司机姓名 *"><Input value={driver.name} maxLength={50} onChange={e => driverPut('name', e.target.value)}/></Field><Field label="手机号 *"><Input value={driver.phone} inputMode="numeric" maxLength={11} onChange={e => driverPut('phone', e.target.value.replace(/\D/g, '').slice(0, 11))}/></Field><Field label="所属物流承运商（可选）"><select className={selectClass} value={driver.serviceOrganizationId} onChange={e => driverPut('serviceOrganizationId', e.target.value)}><option value="">暂不绑定 / 社会运力</option>{carriers.map(item => <option key={item.id} value={item.id}>{item.partner.name}</option>)}</select></Field><Field label="身份证号"><Input maxLength={18} value={driver.idCardNo} onChange={e => driverPut('idCardNo', e.target.value)} onBlur={e => driverPut('idCardNo', e.target.value.trim().toUpperCase())}/></Field><Field label="驾驶证号"><Input maxLength={50} value={driver.licenseNo} onChange={e => driverPut('licenseNo', e.target.value)}/></Field><Field label="准驾车型"><Input maxLength={20} value={driver.licenseClass} placeholder="如：A2、B2" onChange={e => driverPut('licenseClass', e.target.value)}/></Field><Field label="驾驶证有效期"><Input type="date" value={driver.licenseExpiry} onChange={e => driverPut('licenseExpiry', e.target.value)}/></Field><div className="md:col-span-2"><Field label="司机备注"><Input value={driver.remark} maxLength={500} onChange={e => driverPut('remark', e.target.value)}/></Field></div></div></>}
      {driverMode === 'existing' && <><Field label="搜索已有司机"><Input value={driverSearch} onChange={e => setDriverSearch(e.target.value)} placeholder="姓名、手机号、证件号模糊搜索"/></Field><select aria-label="选择已有司机" className={selectClass} value={selectedDriver?.id || ''} onChange={e => void chooseDriver(e.target.value)}><option value="">请选择司机</option>{selectedDriver && !drivers.some(item => item.id === selectedDriver.id) && <option value={selectedDriver.id}>{selectedDriver.name} · {selectedDriver.phone}</option>}{drivers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.phone} · {item.serviceOrganization?.partner.name || '社会运力'}</option>)}</select>{selectedDriver && <div className="rounded-md bg-muted/50 p-3 text-sm"><div>{selectedDriver.name} · {selectedDriver.phone} · {selectedDriver.licenseClass || '准驾车型未填写'}</div><p className="mt-1 text-xs text-muted-foreground">已关联车辆：{selectedDriver.vehicleLinks?.filter(link => !link.vehicle.deletedAt).map(link => link.vehicle.plateNo).join('、') || '无'}</p><Link className="mt-2 inline-block text-primary hover:underline" href={'/dashboard/master-data/drivers/' + selectedDriver.id} target="_blank">查看司机档案</Link></div>}</>}
      {driverMode === 'none' && <p className="text-sm text-muted-foreground">本次不创建或关联司机，车辆仍可独立保存。</p>}
    </Card>
    {driverMode !== 'none' && <PendingFiles title="司机证件附件（选填）" description="驾驶证、身份证等资料可稍后补充。支持选择或粘贴图片、PDF，单个不超过20MB，最多6份。" files={driverFiles} onChange={files => { setDriverFiles(files); setDirty(true); }} disabled={busy}/>}
    {driverMode === 'existing' && selectedDriver && <AttachmentPanel title="司机已有资料" description="下列为已有附件，本次新选附件将在保存时追加。" canUpload={false} canDelete={false} attachments={selectedDriver.attachments || []} uploadPath={`/transport-resources/drivers/${selectedDriver.id}/attachments`} attachmentPath={`/transport-resources/drivers/${selectedDriver.id}/attachments`} onChanged={async () => setSelectedDriver(await api.get('/drivers/' + selectedDriver.id))}/>}
    </section>
    <section className="space-y-4"><Card className="space-y-4 p-5"><SectionHeader title="车辆信息" mode={vehicleMode} setMode={mode => { setVehicleMode(mode); setDirty(true); }}/>{vehicleMode === 'new' && <p className="text-xs text-muted-foreground">车辆区域完全留空时不会创建车辆；填写后请补齐车牌和核定载重。车辆资料附件可稍后补充。</p>}{vehicleMode === 'none' && <p className="text-sm text-muted-foreground">本次不创建或关联车辆，司机仍可独立保存。</p>}{vehicleMode === 'existing' && <><Field label="搜索已有车辆"><Input value={vehicleSearch} onChange={e => setVehicleSearch(e.target.value)} placeholder="车牌、司机、车主、所属单位模糊搜索"/></Field><select aria-label="选择已有车辆" className={selectClass} value={selectedVehicle?.id || ''} onChange={e => void chooseVehicle(e.target.value)}><option value="">请选择车辆</option>{selectedVehicle && !vehicles.some(item => item.id === selectedVehicle.id) && <option value={selectedVehicle.id}>{selectedVehicle.plateNo}</option>}{vehicles.map(item => <option key={item.id} value={item.id}>{item.plateNo} · {item.owner?.name || '社会运力'} · 载重 {item.loadCapacity} 吨</option>)}</select>{selectedVehicle && <div className="rounded-md bg-muted/50 p-3 text-sm"><div>{selectedVehicle.plateNo} · 核定载重 {selectedVehicle.loadCapacity} 吨</div><p className="mt-1 text-xs text-muted-foreground">已关联司机：{selectedVehicle.drivers?.map(link => link.driver.name + (link.role === 'PRIMARY' ? '（主驾）' : '（副驾）')).join('、') || '无'}</p><Link className="mt-2 inline-block text-primary hover:underline" href={'/dashboard/master-data/vehicles/' + selectedVehicle.id} target="_blank">查看车辆档案</Link></div>}</>}</Card>
    {vehicleMode === 'new' && <VehicleForm value={vehicle} onValueChange={value => { setVehicle(value); setDirty(true); }} submitLabel="保存" onSubmit={async () => undefined} onCancel={() => void back()} hideActions showDriverLinks={false}/>}
    {vehicleMode !== 'none' && <PendingFiles title="车辆资料附件（选填）" description="行驶证等资料可稍后补充。支持选择或粘贴图片、PDF，单个不超过20MB，最多6份。" files={vehicleFiles} onChange={files => { setVehicleFiles(files); setDirty(true); }} disabled={busy}/>}
    {vehicleMode === 'existing' && selectedVehicle && <AttachmentPanel title="车辆已有资料" description="下列为已有附件，本次新选附件将在保存时追加。" canUpload={false} canDelete={false} attachments={selectedVehicle.attachments || []} uploadPath={`/transport-resources/vehicles/${selectedVehicle.id}/attachments`} attachmentPath={`/transport-resources/vehicles/${selectedVehicle.id}/attachments`} onChanged={async () => setSelectedVehicle(await api.get('/partners/vehicles/' + selectedVehicle.id))}/>}
    </section></fieldset>
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 p-4"><p className="text-xs text-muted-foreground">两边有档案时自动关联。已有主驾保持不变，新关联司机为副驾；无主驾则自动设为主驾。</p><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => void back()}>取消</Button><Button disabled={busy || recognizing || driverLoading || vehicleLoading} onClick={() => void save()}><Save className="mr-1 h-4 w-4"/>{busy ? '保存中…' : '保存档案'}</Button></div></div>
  </div>;
}

function SectionHeader({ title, mode, setMode }: { title: string; mode: Mode; setMode: (mode: Mode) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{title}</h2><div className="flex gap-1 rounded-md bg-muted p-1">{[['new', '新建'], ['existing', '选择已有'], ['none', '暂不填写']].map(([key, label]) => <button type="button" key={key} onClick={() => setMode(key as Mode)} className={`rounded px-3 py-1.5 text-sm ${mode === key ? 'bg-background font-medium text-primary shadow-sm' : 'text-muted-foreground'}`}>{label}</button>)}</div></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
function PendingFiles({ title, description, files, onChange, disabled }: { title: string; description: string; files: File[]; onChange: (files: File[]) => void; disabled: boolean }) {
  const add = (incoming: File[]) => {
    if (disabled) return;
    const selected = selectValidAttachmentFiles(incoming);
    if (files.length + selected.length > 6) return alert('每份档案最多选择6个附件');
    if (selected.length) onChange([...files, ...selected]);
  };
  return <Card tabIndex={0} onPaste={event => { const selected = pastedAttachmentFiles(event.clipboardData); if (selected.length) { event.preventDefault(); add(selected); } }} className="space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-medium">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void readClipboardAttachmentFiles().then(add).catch(error => alert(error.message || '粘贴附件失败'))}>粘贴附件</Button><label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm"><Paperclip className="mr-1 h-4 w-4"/>选择附件<input className="hidden" aria-label={'选择' + title} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" disabled={disabled} onChange={e => { add(Array.from(e.currentTarget.files || [])); e.target.value = ''; }}/></label></div></div>{files.length ? files.map((file, index) => <div className="flex items-center gap-3 rounded-md border p-3 text-sm" key={index}><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="shrink-0 text-xs text-muted-foreground">待上传</span><Button type="button" variant="ghost" size="sm" onClick={() => { try { openLocalAttachment(file); } catch (e: any) { alert(e.message); } }}>预览</Button><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(files.filter((_, i) => i !== index))}>移除</Button></div>) : <p className="text-xs text-muted-foreground">尚未选择待上传附件；可直接粘贴截图或复制的图片/PDF</p>}</Card>;
}
