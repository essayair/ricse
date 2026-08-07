'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { WandSparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { unitLabel } from '@/lib/unit';

interface Notice { id: string; noticeNo: string; type: string; status: string; order: { orderNo: string; name: string; contract: { contractNo: string } } }
interface Available {
  notice: Notice & { originLocation?: string; destinationLocation?: string; warehouse?: { address?: string } | null };
  lineItems: Array<{ dispatchNoticeLineItemId: string; materialName: string | null; materialId: string; unit: string; noticeQuantity: number; availableQuantity: number }>;
}
interface Vehicle {
  id: string; plateNo: string; vehicleType: string; brand?: string; driverName?: string; driverPhone?: string; loadCapacity: string;
  ownerType: string; owner: { id: string; name: string } | null;
  drivers: Array<{ role: string; driver: { id: string; name: string; phone: string } }>;
}
interface CarrierProfile { id: string; partnerId: string; partner: { id: string; code: string; name: string } }
interface Driver {
  id: string; name: string; phone: string; licenseClass?: string | null;
  serviceOrganization: { id: string; partnerId: string; partner: { id: string; name: string; isInternal: boolean } };
}

export default function CreateWaybillPage() {
  const router = useRouter(); const params = useSearchParams();
  const [notices, setNotices] = useState<Notice[]>([]); const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [carriers, setCarriers] = useState<CarrierProfile[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [data, setData] = useState<Available | null>(null); const [freightMode, setFreightMode] = useState('SELF');
  const [vehicleId, setVehicleId] = useState(''); const [carrierPartnerId, setCarrierPartnerId] = useState(''); const [carrierName, setCarrierName] = useState('');
  const [plateNo, setPlateNo] = useState(''); const [driverId, setDriverId] = useState(''); const [driverSearch, setDriverSearch] = useState(''); const [driverName, setDriverName] = useState(''); const [driverPhone, setDriverPhone] = useState('');
  const [originLocation, setOriginLocation] = useState(''); const [destinationLocation, setDestinationLocation] = useState('');
  const [plannedDepartureAt, setPlannedDepartureAt] = useState(''); const [plannedArrivalAt, setPlannedArrivalAt] = useState(''); const [remarks, setRemarks] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [recognitionText, setRecognitionText] = useState('');
  const [recognitionResult, setRecognitionResult] = useState('');
  useEffect(() => {
    Promise.all([
      api.get<{ items: Notice[] }>('/dispatch-notices?status=ISSUED'),
      api.get<{ items: Notice[] }>('/dispatch-notices?status=IN_PROGRESS'),
      api.get<{ items: Vehicle[] }>('/partners/vehicles?status=ACTIVE&pageSize=100'),
      api.get<{ items: CarrierProfile[] }>('/service-organizations?type=LOGISTICS_CARRIER&status=ACTIVE&pageSize=200'),
      api.get<{ items: Driver[] }>('/drivers?status=ACTIVE&pageSize=200'),
    ]).then(([issued, active, vehicleData, carrierData, driverData]) => { setNotices([...issued.items, ...active.items]); setVehicles(vehicleData.items); setCarriers(carrierData.items || []); setDrivers(driverData.items || []); }).catch(error => alert(error.message));
  }, []);
  const selectNotice = async (id: string) => {
    if (!id) { setData(null); return null; }
    try {
      const result = await api.get<Available>(`/waybills/dispatch-notices/${id}/availability`);
      setData(result); setOriginLocation(result.notice.originLocation || result.notice.warehouse?.address || ''); setDestinationLocation(result.notice.destinationLocation || '');
      setQuantities(Object.fromEntries(result.lineItems.map(item => [item.dispatchNoticeLineItemId, item.availableQuantity])));
      return result;
    } catch (error: any) { alert(error.message); }
    return null;
  };
  useEffect(() => {
    const id = params.get('dispatchNoticeId'); if (id && notices.some(item => item.id === id) && data?.notice.id !== id) void selectNotice(id);
  }, [notices, params, data]);
  const selectVehicle = (id: string) => {
    setVehicleId(id); const vehicle = vehicles.find(item => item.id === id);
    if (vehicle) {
      setPlateNo(vehicle.plateNo);
      if (!driverId) {
        const primary = vehicle.drivers?.find(item => item.role === 'PRIMARY')?.driver;
        if (primary) { setDriverId(primary.id); setDriverName(primary.name); setDriverPhone(primary.phone); }
        else { setDriverName(vehicle.driverName || ''); setDriverPhone(vehicle.driverPhone || ''); }
      }
      if (vehicle.ownerType === 'OUTSOURCED' && vehicle.owner) {
        const carrier = carriers.find(item => item.partnerId === vehicle.owner!.id);
        if (carrier) { setCarrierPartnerId(carrier.partnerId); setCarrierName(carrier.partner.name); }
      }
    }
  };
  const selectableVehicles = useMemo(() => vehicles.filter(vehicle => {
    if (freightMode === 'SELF') return vehicle.ownerType === 'SELF';
    if (vehicle.ownerType !== 'OUTSOURCED') return false;
    return !carrierPartnerId || vehicle.owner?.id === carrierPartnerId;
  }), [carrierPartnerId, freightMode, vehicles]);
  const selectableDrivers = useMemo(() => {
    const keyword = driverSearch.trim().toLowerCase();
    const linkedIds = new Set(vehicles.find(item => item.id === vehicleId)?.drivers?.map(item => item.driver.id) || []);
    return drivers.filter(driver => {
      const matchesOwner = freightMode === 'SELF'
        ? driver.serviceOrganization.partner.isInternal
        : Boolean(carrierPartnerId) && driver.serviceOrganization.partnerId === carrierPartnerId;
      if (!matchesOwner) return false;
      if (!keyword) return true;
      return [driver.name, driver.phone, driver.serviceOrganization.partner.name, driver.licenseClass || '']
        .some(value => value.toLowerCase().includes(keyword));
    }).sort((left, right) => Number(linkedIds.has(right.id)) - Number(linkedIds.has(left.id)) || left.name.localeCompare(right.name, 'zh-CN'));
  }, [carrierPartnerId, driverSearch, drivers, freightMode, vehicleId, vehicles]);
  const selectDriver = (id: string) => {
    setDriverId(id);
    const driver = drivers.find(item => item.id === id);
    if (driver) { setDriverName(driver.name); setDriverPhone(driver.phone); }
  };
  const changeFreightMode = (value: string) => {
    setFreightMode(value); setVehicleId(''); setPlateNo(''); setDriverId(''); setDriverSearch(''); setDriverName(''); setDriverPhone('');
    if (value === 'SELF') { setCarrierPartnerId(''); setCarrierName(''); }
  };
  const total = useMemo(() => Object.values(quantities).reduce((sum, value) => sum + (value || 0), 0), [quantities]);
  const recognizeText = async () => {
    const text = recognitionText.trim();
    if (!text) return alert('请粘贴或输入物流信息');
    const recognized: string[] = [];
    const matchedNotice = notices.find(item => [item.noticeNo, item.order.orderNo, item.order.contract.contractNo, item.order.name].some(value => value && text.toLowerCase().includes(value.toLowerCase())));
    let selectedData = data;
    if (matchedNotice && data?.notice.id !== matchedNotice.id) {
      selectedData = await selectNotice(matchedNotice.id);
      recognized.push(`执行通知：${matchedNotice.noticeNo}`);
    }
    const plate = text.match(/(?:车牌(?:号)?|车辆)?[：:\s]*([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9挂学警港澳]{5,6})/i)?.[1]?.toUpperCase();
    const phone = text.match(/(?:司机电话|联系电话|手机(?:号)?|电话)?[：:\s]*(1[3-9]\d{9})/)?.[1];
    const driver = matchField(text, ['司机姓名', '驾驶员', '司机']);
    const carrier = matchField(text, ['承运单位', '承运公司', '承运商']);
    const origin = matchField(text, ['起运地点', '起运地', '发货地点', '装货地点']);
    const destination = matchField(text, ['目的地点', '目的地', '收货地点', '卸货地点']);
    const departure = matchDateField(text, ['计划发运时间', '发运时间', '出发时间']);
    const arrival = matchDateField(text, ['预计到达时间', '到达时间']);
    if (plate) {
      const vehicle = vehicles.find(item => item.plateNo.toUpperCase() === plate);
      if (vehicle) selectVehicle(vehicle.id); else { setVehicleId(''); setPlateNo(plate); }
      recognized.push(`车牌：${plate}`);
    }
    if (driver) { setDriverId(''); setDriverName(driver); setDriverSearch(driver); recognized.push(`司机：${driver}`); }
    if (phone) { setDriverPhone(phone); recognized.push(`电话：${phone}`); }
    if (carrier) {
      const matchedCarrier = carriers.find(item => item.partner.name.includes(carrier) || carrier.includes(item.partner.name));
      setCarrierPartnerId(matchedCarrier?.partnerId || '');
      setCarrierName(matchedCarrier?.partner.name || carrier);
      setFreightMode('THIRD_PARTY');
      recognized.push(`承运单位：${matchedCarrier?.partner.name || carrier}${matchedCarrier ? '' : '（请在下方选择已维护承运商）'}`);
    }
    if (/第三方|委外|外包/.test(text)) setFreightMode('THIRD_PARTY');
    if (/自营|自有运力/.test(text)) setFreightMode('SELF');
    if (origin) { setOriginLocation(origin); recognized.push(`起运地：${origin}`); }
    if (destination) { setDestinationLocation(destination); recognized.push(`目的地：${destination}`); }
    if (departure) { setPlannedDepartureAt(departure); recognized.push(`计划发运：${departure.replace('T', ' ')}`); }
    if (arrival) { setPlannedArrivalAt(arrival); recognized.push(`预计到达：${arrival.replace('T', ' ')}`); }
    if (selectedData) {
      const nextQuantities = { ...Object.fromEntries(selectedData.lineItems.map(item => [item.dispatchNoticeLineItemId, 0])) };
      let quantityFound = false;
      for (const item of selectedData.lineItems) {
        const materialPattern = item.materialName ? new RegExp(`${escapeRegExp(item.materialName)}[^\\d]{0,12}(\\d+(?:\\.\\d+)?)\\s*(?:吨|ton)`, 'i') : null;
        const value = materialPattern?.exec(text)?.[1];
        if (value) {
          nextQuantities[item.dispatchNoticeLineItemId] = Math.min(Number(value), item.availableQuantity);
          quantityFound = true;
          recognized.push(`${item.materialName}：${nextQuantities[item.dispatchNoticeLineItemId]} 吨`);
        }
      }
      if (!quantityFound && selectedData.lineItems.length === 1) {
        const value = text.match(/(?:运输数量|本车数量|数量|重量)[：:\s]*(\d+(?:\.\d+)?)\s*(?:吨|ton)/i)?.[1];
        if (value) {
          const item = selectedData.lineItems[0];
          nextQuantities[item.dispatchNoticeLineItemId] = Math.min(Number(value), item.availableQuantity);
          recognized.push(`运输数量：${nextQuantities[item.dispatchNoticeLineItemId]} 吨`);
        }
      }
      if (quantityFound || Object.values(nextQuantities).some(Boolean)) setQuantities(nextQuantities);
    }
    setRecognitionResult(recognized.length ? `已识别并填入 ${recognized.length} 项：${recognized.join('；')}` : '未识别到明确字段，请使用“字段名：内容”的格式后重试。');
  };
  const submit = async () => {
    if (!data) return alert('请选择执行通知');
    if (freightMode === 'THIRD_PARTY' && !carrierPartnerId) return alert('请选择已维护的物流承运商');
    const lineItems = data.lineItems.filter(item => quantities[item.dispatchNoticeLineItemId] > 0).map(item => ({ dispatchNoticeLineItemId: item.dispatchNoticeLineItemId, quantity: quantities[item.dispatchNoticeLineItemId] }));
    try {
      const waybill = await api.post<{ id: string }>('/waybills', { dispatchNoticeId: data.notice.id, freightMode, vehicleId: vehicleId || undefined, driverId: driverId || undefined, carrierPartnerId: carrierPartnerId || undefined, plateNo: plateNo || undefined, driverName: driverName || undefined, driverPhone: driverPhone || undefined, originLocation, destinationLocation, plannedDepartureAt: plannedDepartureAt || undefined, plannedArrivalAt: plannedArrivalAt || undefined, remarks: remarks || undefined, lineItems });
      router.push(`/dashboard/waybills/${waybill.id}`);
    } catch (error: any) { alert(error.message); }
  };
  return <div className="mx-auto max-w-5xl space-y-6"><div><h1 className="text-2xl font-bold">新建物流运单</h1><p className="mt-1 text-sm text-muted-foreground">从已下达执行通知拆分车次，可先建单后调度车辆</p></div>
    <Card className="space-y-4 p-6"><div className="flex items-center gap-2"><WandSparkles className="h-5 w-5 text-primary" /><div><h2 className="font-semibold">文字信息自动识别</h2><p className="text-xs text-muted-foreground">粘贴微信、短信或调度信息，系统识别后回填下方表单，请核对后再创建</p></div></div><textarea className="min-h-32 w-full rounded-md border bg-background p-3 text-sm" value={recognitionText} onChange={event => setRecognitionText(event.target.value)} placeholder={'示例：\\n执行通知：PI-20260720-0001\\n车牌：甘A12345，司机：张师傅，电话：13800138000\\n承运单位：某某物流，运输数量：32.5吨\\n起运地：兰州，目的地：衢州\\n计划发运时间：2026-07-21 08:30，预计到达时间：2026-07-22 16:00'} /><div className="flex items-center justify-between gap-3"><div className="text-xs text-muted-foreground">{recognitionResult || '支持通知号、批次号、合同号、车牌、司机、电话、地点、数量和时间。'}</div><Button type="button" variant="outline" onClick={() => void recognizeText()}><WandSparkles className="mr-2 h-4 w-4" />识别并填入</Button></div></Card>
    <Card className="space-y-5 p-6">
    <div><label className="mb-1 block text-sm font-medium">执行通知 *</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={data?.notice.id || ''} onChange={e => void selectNotice(e.target.value)}><option value="">请选择</option>{notices.map(item => <option key={item.id} value={item.id}>{item.order.name} · {item.noticeNo} · {item.order.orderNo} · {item.order.contract.contractNo}</option>)}</select><p className="mt-1 text-xs text-muted-foreground">优先显示执行批次名称，同时保留通知号、批次编号和合同号便于核对。</p></div>
    {data && <><div className="grid gap-4 md:grid-cols-4"><div><label className="mb-1 block text-sm font-medium">运输方式</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={freightMode} onChange={e => changeFreightMode(e.target.value)}><option value="SELF">自有运力</option><option value="THIRD_PARTY">第三方承运</option></select></div><div><div className="mb-1 flex items-center justify-between"><label className="block text-sm font-medium">车辆</label><Link href="/dashboard/master-data/vehicles/new" className="text-xs text-primary hover:underline">维护车辆</Link></div><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={vehicleId} onChange={e => selectVehicle(e.target.value)}><option value="">稍后调度或手工填写</option>{selectableVehicles.map(item => <option key={item.id} value={item.id}>{item.plateNo} · {item.brand || vehicleTypeLabel(item.vehicleType)} · 载重 {Number(item.loadCapacity)} 吨{item.owner?.name ? ` · ${item.owner.name}` : ''}</option>)}</select></div><div><label className="mb-1 block text-sm font-medium">计划发运时间</label><Input type="datetime-local" value={plannedDepartureAt} onChange={e => setPlannedDepartureAt(e.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">预计到达时间</label><Input type="datetime-local" min={plannedDepartureAt || undefined} value={plannedArrivalAt} onChange={e => setPlannedArrivalAt(e.target.value)} /></div></div>
      {freightMode === 'THIRD_PARTY' && <div><label className="mb-1 block text-sm font-medium">物流承运商 *</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={carrierPartnerId} onChange={e => { const id = e.target.value; const item = carriers.find(value => value.partnerId === id); setCarrierPartnerId(id); setCarrierName(item?.partner.name || ''); setVehicleId(''); setPlateNo(''); setDriverId(''); setDriverSearch(''); setDriverName(''); setDriverPhone(''); }}><option value="">请选择已维护的物流承运商</option>{carriers.map(item => <option key={item.id} value={item.partnerId}>{item.partner.code} · {item.partner.name}</option>)}</select>{carrierName && !carrierPartnerId && <p className="mt-1 text-xs text-amber-600">识别到“{carrierName}”，但未匹配主数据，请选择或先到主数据维护。</p>}</div>}
      <div className="grid gap-4 md:grid-cols-5"><div><label className="mb-1 block text-sm font-medium">车牌号</label><Input value={plateNo} onChange={e => setPlateNo(e.target.value)} /></div><div><div className="mb-1 flex items-center justify-between"><label className="block text-sm font-medium">司机搜索</label><Link href="/dashboard/master-data/service-organizations?type=LOGISTICS_CARRIER" className="text-xs text-primary hover:underline">维护司机</Link></div><Input value={driverSearch} onChange={e => setDriverSearch(e.target.value)} placeholder="姓名、手机号、服务商" /></div><div><label className="mb-1 block text-sm font-medium">选择司机</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={driverId} onChange={e => selectDriver(e.target.value)}><option value="">手工填写</option>{selectableDrivers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.phone} · {item.serviceOrganization.partner.name}</option>)}</select></div><div><label className="mb-1 block text-sm font-medium">司机姓名</label><Input value={driverName} onChange={e => { setDriverId(''); setDriverName(e.target.value); }} /></div><div><label className="mb-1 block text-sm font-medium">司机电话</label><Input value={driverPhone} onChange={e => { setDriverId(''); setDriverPhone(e.target.value); }} /></div></div>
      <div className="grid gap-4 md:grid-cols-2"><div><label className="mb-1 block text-sm font-medium">起运地点</label><Input value={originLocation} onChange={e => setOriginLocation(e.target.value)} /></div><div><label className="mb-1 block text-sm font-medium">目的地点</label><Input value={destinationLocation} onChange={e => setDestinationLocation(e.target.value)} /></div></div>
      <div><h2 className="mb-2 font-semibold">运单明细</h2><table className="w-full text-sm"><thead className="border-b bg-muted/50"><tr><th className="px-3 py-2 text-left">物料</th><th className="px-3 py-2 text-right">通知数量</th><th className="px-3 py-2 text-right">剩余可运输</th><th className="px-3 py-2 text-right">本车数量</th></tr></thead><tbody>{data.lineItems.map(item => <tr key={item.dispatchNoticeLineItemId} className="border-b"><td className="px-3 py-2">{item.materialName || item.materialId}</td><td className="px-3 py-2 text-right">{item.noticeQuantity} {unitLabel(item.unit)}</td><td className="px-3 py-2 text-right">{item.availableQuantity} {unitLabel(item.unit)}</td><td className="px-3 py-2"><Input className="ml-auto w-36 text-right" type="number" min="0" max={item.availableQuantity} value={quantities[item.dispatchNoticeLineItemId] || 0} onChange={e => setQuantities(current => ({ ...current, [item.dispatchNoticeLineItemId]: Number(e.target.value) }))} /></td></tr>)}</tbody></table><div className="mt-3 text-right font-bold">本车总数量：{total.toLocaleString()} 吨</div></div>
      <div><label className="mb-1 block text-sm font-medium">备注</label><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
    </>}</Card><div className="flex justify-end gap-3"><Button variant="outline" onClick={() => router.back()}>取消</Button><Button disabled={!data} onClick={() => void submit()}>创建物流运单</Button></div></div>;
}

function matchField(text: string, labels: string[]) {
  const pattern = new RegExp(`(?:${labels.join('|')})[：:\\s]*([^，,；;\\n]+)`, 'i');
  return pattern.exec(text)?.[1]?.trim();
}

function matchDateField(text: string, labels: string[]) {
  const pattern = new RegExp(`(?:${labels.join('|')})[：:\\s]*(20\\d{2})[-/.年](\\d{1,2})[-/.月](\\d{1,2})日?(?:[ T\\s]+)(\\d{1,2})[:：](\\d{2})`, 'i');
  const match = pattern.exec(text);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}T${match[4].padStart(2, '0')}:${match[5]}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function vehicleTypeLabel(value: string) {
  return ({ SEMI_TRAILER: '半挂车', HEAVY_SEMI_TRAILER: '超重半挂', BOX_TRUCK: '厢式货车', DUMP_TRUCK: '自卸车', TANK_TRUCK: '槽罐车', TRUCK: '自卸车', TANK: '罐车', TRAILER: '挂车' } as Record<string, string>)[value] || value;
}
