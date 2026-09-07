'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Copy, Plus, Trash2, WandSparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { unitLabel } from '@/lib/unit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Notice { id: string; noticeNo: string; type: string; status: string; order: { orderNo: string; name: string; contract: { contractNo: string } } }
interface Available {
  notice: Notice & { originLocation?: string; destinationLocation?: string; warehouse?: { address?: string } | null };
  lineItems: Array<{ dispatchNoticeLineItemId: string; materialName: string | null; materialId: string; unit: string; noticeQuantity: number; waybillQuantity: number; availableQuantity: number }>;
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
interface Row {
  clientRowId: string; freightMode: string; carrierPartnerId: string; vehicleId: string;
  plateNo: string; driverSearch: string; driverId: string; driverName: string; driverPhone: string;
  plannedDepartureAt: string; plannedArrivalAt: string; quantities: Record<string, number>; remarks: string;
}
interface BatchResult {
  batchRequestId: string; createdCount: number; warnings: string[];
  items: Array<{ id: string; waybillNo: string; plateNo: string | null; driverName: string | null; totalQuantity: string }>;
}

export default function BatchCreateWaybillPage() {
  const router = useRouter();
  const params = useSearchParams();
  const requestId = useRef(makeUuid());
  const [notices, setNotices] = useState<Notice[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [carriers, setCarriers] = useState<CarrierProfile[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [data, setData] = useState<Available | null>(null);
  const [originLocation, setOriginLocation] = useState('');
  const [destinationLocation, setDestinationLocation] = useState('');
  const [defaultFreightMode, setDefaultFreightMode] = useState('SELF');
  const [defaultCarrierPartnerId, setDefaultCarrierPartnerId] = useState('');
  const [defaultDepartureAt, setDefaultDepartureAt] = useState('');
  const [defaultArrivalAt, setDefaultArrivalAt] = useState('');
  const [commonRemarks, setCommonRemarks] = useState('');
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [recognitionText, setRecognitionText] = useState('');
  const [recognitionResult, setRecognitionResult] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ items: Notice[] }>('/dispatch-notices?status=ISSUED'),
      api.get<{ items: Notice[] }>('/dispatch-notices?status=IN_PROGRESS'),
      api.get<{ items: Vehicle[] }>('/partners/vehicles?status=ACTIVE&pageSize=100'),
      api.get<{ items: CarrierProfile[] }>('/service-organizations?type=LOGISTICS_CARRIER&status=ACTIVE&pageSize=200'),
      api.get<{ items: Driver[] }>('/drivers?status=ACTIVE&pageSize=200'),
    ]).then(([issued, active, vehicleData, carrierData, driverData]) => {
      setNotices([...issued.items, ...active.items]);
      setVehicles(vehicleData.items || []); setCarriers(carrierData.items || []); setDrivers(driverData.items || []);
    }).catch(error => alert(error.message || '批量派车基础数据加载失败'));
  }, []);

  const selectNotice = useCallback(async (id: string) => {
    if (!id) { setData(null); return; }
    try {
      const available = await api.get<Available>(`/waybills/dispatch-notices/${id}/availability`);
      setData(available); setOriginLocation(available.notice.originLocation || available.notice.warehouse?.address || '');
      setDestinationLocation(available.notice.destinationLocation || '');
      setRows([blankRow()]);
      setResult(null); requestId.current = makeUuid();
    } catch (error: any) { alert(error.message || '执行通知可运输数量加载失败'); }
  }, []);

  useEffect(() => {
    const id = params.get('dispatchNoticeId');
    if (id && notices.some(item => item.id === id) && data?.notice.id !== id) void selectNotice(id);
  }, [notices, params, data?.notice.id, selectNotice]);

  const patchRow = (id: string, patch: Partial<Row>) => setRows(current => current.map(row => row.clientRowId === id ? { ...row, ...patch } : row));
  const addRow = () => setRows(current => [...current, blankRow({
    freightMode: defaultFreightMode, carrierPartnerId: defaultCarrierPartnerId,
    plannedDepartureAt: defaultDepartureAt, plannedArrivalAt: defaultArrivalAt,
  })]);
  const copyRow = (row: Row) => setRows(current => [...current, { ...row, clientRowId: makeUuid(), quantities: { ...row.quantities } }]);
  const removeRow = (id: string) => setRows(current => current.length === 1 ? current : current.filter(row => row.clientRowId !== id));
  const applyDefaults = () => setRows(current => current.map(row => {
    const carrierPartnerId = defaultFreightMode === 'THIRD_PARTY' ? defaultCarrierPartnerId : '';
    const ownerChanged = row.freightMode !== defaultFreightMode || row.carrierPartnerId !== carrierPartnerId;
    return {
      ...row, freightMode: defaultFreightMode, carrierPartnerId,
      ...(ownerChanged ? { vehicleId: '', plateNo: '', driverSearch: '', driverId: '', driverName: '', driverPhone: '' } : {}),
      plannedDepartureAt: defaultDepartureAt, plannedArrivalAt: defaultArrivalAt,
    };
  }));

  const selectCarrier = (row: Row, partnerId: string) => patchRow(row.clientRowId, {
    freightMode: 'THIRD_PARTY', carrierPartnerId: partnerId,
    vehicleId: '', plateNo: '', driverSearch: '', driverId: '', driverName: '', driverPhone: '',
  });
  const selectVehicle = (row: Row, vehicleId: string) => {
    const vehicle = vehicles.find(item => item.id === vehicleId);
    if (!vehicle) { patchRow(row.clientRowId, { vehicleId: '', plateNo: '' }); return; }
    const primary = vehicle.drivers?.find(item => item.role === 'PRIMARY')?.driver;
    const carrier = vehicle.ownerType === 'OUTSOURCED' ? carriers.find(item => item.partnerId === vehicle.owner?.id) : null;
    patchRow(row.clientRowId, {
      vehicleId: vehicle.id, plateNo: vehicle.plateNo,
      freightMode: vehicle.ownerType === 'OUTSOURCED' ? 'THIRD_PARTY' : 'SELF',
      carrierPartnerId: carrier?.partnerId || '',
      driverId: primary?.id || '', driverName: primary?.name || vehicle.driverName || '',
      driverPhone: primary?.phone || vehicle.driverPhone || '', driverSearch: primary?.name || vehicle.driverName || '',
    });
  };
  const selectDriver = (row: Row, driverId: string) => {
    const driver = drivers.find(item => item.id === driverId);
    patchRow(row.clientRowId, driver ? {
      driverId: driver.id, driverName: driver.name, driverPhone: driver.phone, driverSearch: driver.name,
    } : { driverId: '', driverName: '', driverPhone: '' });
  };

  const vehiclesFor = (row: Row) => vehicles.filter(vehicle => row.freightMode === 'SELF'
    ? vehicle.ownerType === 'SELF'
    : vehicle.ownerType === 'OUTSOURCED' && (!row.carrierPartnerId || vehicle.owner?.id === row.carrierPartnerId));
  const driversFor = (row: Row) => {
    const keyword = row.driverSearch.trim().toLowerCase();
    const linked = new Set(vehicles.find(item => item.id === row.vehicleId)?.drivers?.map(item => item.driver.id) || []);
    return drivers.filter(driver => {
      const ownerMatches = row.freightMode === 'SELF'
        ? driver.serviceOrganization.partner.isInternal
        : Boolean(row.carrierPartnerId) && driver.serviceOrganization.partnerId === row.carrierPartnerId;
      return ownerMatches && (!keyword || [driver.name, driver.phone, driver.serviceOrganization.partner.name]
        .some(value => value.toLowerCase().includes(keyword)));
    }).sort((left, right) => Number(linked.has(right.id)) - Number(linked.has(left.id)) || left.name.localeCompare(right.name, 'zh-CN'));
  };

  const assignedTotals = useMemo(() => {
    const totals = new Map<string, number>();
    rows.forEach(row => Object.entries(row.quantities).forEach(([lineId, quantity]) => totals.set(lineId, (totals.get(lineId) || 0) + (Number(quantity) || 0))));
    return totals;
  }, [rows]);
  const totalQuantity = useMemo(() => Array.from(assignedTotals.values()).reduce((sum, value) => sum + value, 0), [assignedTotals]);
  const overAllocated = data?.lineItems.some(line => (assignedTotals.get(line.dispatchNoticeLineItemId) || 0) > line.availableQuantity) || false;

  const recognizeRows = () => {
    if (!data) return alert('请先选择执行通知');
    const lines = recognitionText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) return alert('请粘贴每车一行的调度信息');
    const parsed = lines.slice(0, 100).map(line => parseDispatchLine(line, data, vehicles, carriers, drivers, {
      freightMode: defaultFreightMode, carrierPartnerId: defaultCarrierPartnerId,
      plannedDepartureAt: defaultDepartureAt, plannedArrivalAt: defaultArrivalAt,
    }));
    const currentIsBlank = rows.length === 1 && !rows[0].plateNo && !Object.values(rows[0].quantities).some(Boolean);
    setRows(current => currentIsBlank ? parsed : [...current, ...parsed].slice(0, 100));
    const quantityCount = parsed.filter(row => Object.values(row.quantities).some(Boolean)).length;
    setRecognitionResult(`已生成 ${parsed.length} 行车辆记录，其中 ${quantityCount} 行识别到运输数量，请在提交前逐行核对。`);
  };

  const submit = async () => {
    if (!data) return alert('请选择执行通知');
    if (!originLocation.trim() || !destinationLocation.trim()) return alert('请填写起运地点和目的地点');
    if (rows.length > 100) return alert('单次最多批量创建 100 张物流运单');
    const errors: string[] = [];
    rows.forEach((row, index) => {
      const prefix = `第 ${index + 1} 行`;
      if (row.freightMode === 'THIRD_PARTY' && !row.carrierPartnerId) errors.push(`${prefix}请选择物流承运商`);
      if (!row.plateNo.trim()) errors.push(`${prefix}请选择车辆或填写临时车牌号`);
      if (!row.driverName.trim()) errors.push(`${prefix}请选择或填写司机姓名`);
      if (!row.driverPhone.trim()) errors.push(`${prefix}请填写司机联系电话`);
      if (!Object.values(row.quantities).some(value => Number(value) > 0)) errors.push(`${prefix}请填写至少一种物料数量`);
      if (row.plannedDepartureAt && row.plannedArrivalAt && new Date(row.plannedArrivalAt) <= new Date(row.plannedDepartureAt)) errors.push(`${prefix}预计到达时间必须晚于计划发运时间`);
    });
    data.lineItems.forEach(line => {
      const assigned = assignedTotals.get(line.dispatchNoticeLineItemId) || 0;
      if (assigned > line.availableQuantity) errors.push(`${line.materialName || line.materialId}分配数量超过剩余可运输数量`);
    });
    if (errors.length) return alert(errors.slice(0, 8).join('\n'));

    const warnings = clientWarnings(rows, vehicles);
    if (warnings.length && !confirm(`${warnings.join('\n')}\n\n以上为提示，不会阻止建单。确认继续批量创建吗？`)) return;
    if (!confirm(`本次将从执行通知 ${data.notice.noticeNo} 创建 ${rows.length} 张独立物流运单，计划运输合计 ${totalQuantity.toLocaleString()} 吨。确认创建吗？`)) return;
    setSaving(true);
    try {
      const response = await api.post<BatchResult>('/waybills/batch', {
        dispatchNoticeId: data.notice.id, batchRequestId: requestId.current,
        items: rows.map(row => ({
          clientRowId: row.clientRowId, freightMode: row.freightMode,
          carrierPartnerId: row.carrierPartnerId || undefined, vehicleId: row.vehicleId || undefined,
          driverId: row.driverId || undefined, plateNo: row.plateNo.trim().toUpperCase(),
          driverName: row.driverName.trim(), driverPhone: row.driverPhone.trim(),
          originLocation: originLocation.trim(), destinationLocation: destinationLocation.trim(),
          plannedDepartureAt: row.plannedDepartureAt || undefined, plannedArrivalAt: row.plannedArrivalAt || undefined,
          remarks: [commonRemarks.trim(), row.remarks.trim()].filter(Boolean).join('；') || undefined,
          lineItems: data.lineItems.filter(line => Number(row.quantities[line.dispatchNoticeLineItemId]) > 0).map(line => ({
            dispatchNoticeLineItemId: line.dispatchNoticeLineItemId,
            quantity: Number(row.quantities[line.dispatchNoticeLineItemId]),
          })),
        })),
      });
      setResult(response);
    } catch (error: any) { alert(error.message || '批量创建物流运单失败'); }
    finally { setSaving(false); }
  };

  if (result) return <div className="mx-auto max-w-5xl space-y-6">
    <Card className="p-8"><div className="flex items-start gap-4"><CheckCircle2 className="mt-1 h-9 w-9 text-primary" /><div className="min-w-0 flex-1"><h1 className="text-2xl font-bold">批量派车完成</h1><p className="mt-2 text-muted-foreground">已成功创建 {result.createdCount} 张独立物流运单，后续可分别进行发运、过磅、质检和签收。</p>{result.warnings.length > 0 && <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{result.warnings.map(message => <div key={message}>{message}</div>)}</div>}</div></div></Card>
    <Card className="overflow-hidden"><div className="border-b p-5 font-semibold">本次创建结果</div><div className="divide-y">{result.items.map(item => <button key={item.id} className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted/50" onClick={() => router.push(`/dashboard/waybills/${item.id}`)}><div><div className="font-mono text-sm text-primary">{item.waybillNo}</div><div className="mt-1 text-xs text-muted-foreground">{item.plateNo} · {item.driverName || '-'} · {Number(item.totalQuantity).toLocaleString()} 吨</div></div><span className="text-sm text-primary">查看运单</span></button>)}</div></Card>
    <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => router.push(`/dashboard/dispatch-notices/${data?.notice.id}`)}>返回执行通知</Button><Button onClick={() => router.push('/dashboard/waybills')}>进入物流运单管理</Button></div>
  </div>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-2xl font-bold">批量派车</h1><p className="mt-1 text-sm text-muted-foreground">一行生成一张独立物流运单，整批校验通过后统一创建</p></div></div><Button variant="outline" onClick={() => router.push(`/dashboard/waybills/create${data ? `?dispatchNoticeId=${data.notice.id}` : ''}`)}>切换为单车建单</Button></div>

    <Card className="space-y-5 p-6"><div><label className="mb-1 block text-sm font-medium">执行通知 *</label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={data?.notice.id || ''} onChange={event => void selectNotice(event.target.value)}><option value="">请选择</option>{notices.map(notice => <option key={notice.id} value={notice.id}>{notice.order.name} · {notice.noticeNo} · {notice.order.orderNo} · {notice.order.contract.contractNo}</option>)}</select></div>
      {data && <><div className="grid gap-4 md:grid-cols-2"><Field label="起运地点 *"><Input value={originLocation} onChange={event => setOriginLocation(event.target.value)} /></Field><Field label="目的地点 *"><Input value={destinationLocation} onChange={event => setDestinationLocation(event.target.value)} /></Field></div><div className="grid gap-4 md:grid-cols-5"><Field label="默认运输方式"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={defaultFreightMode} onChange={event => { setDefaultFreightMode(event.target.value); if (event.target.value === 'SELF') setDefaultCarrierPartnerId(''); }}><option value="SELF">自有运力</option><option value="THIRD_PARTY">第三方承运</option></select></Field><Field label="默认承运商"><select disabled={defaultFreightMode !== 'THIRD_PARTY'} className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50" value={defaultCarrierPartnerId} onChange={event => setDefaultCarrierPartnerId(event.target.value)}><option value="">请选择</option>{carriers.map(carrier => <option key={carrier.id} value={carrier.partnerId}>{carrier.partner.name}</option>)}</select></Field><Field label="默认发运时间"><Input type="datetime-local" value={defaultDepartureAt} onChange={event => setDefaultDepartureAt(event.target.value)} /></Field><Field label="默认到达时间"><Input type="datetime-local" min={defaultDepartureAt || undefined} value={defaultArrivalAt} onChange={event => setDefaultArrivalAt(event.target.value)} /></Field><div className="flex items-end"><Button className="w-full" type="button" variant="outline" onClick={applyDefaults}>应用到全部车辆</Button></div></div><Field label="统一备注"><Input value={commonRemarks} onChange={event => setCommonRemarks(event.target.value)} placeholder="将写入本次所有物流运单" /></Field></>}
    </Card>

    {data && <><Card className="space-y-4 p-6"><div className="flex items-center gap-2"><WandSparkles className="h-5 w-5 text-primary" /><div><h2 className="font-semibold">多行调度信息识别</h2><p className="text-xs text-muted-foreground">每辆车一行，建议格式：车牌，司机，手机号，数量吨，承运商。识别后仍需人工核对。</p></div></div><textarea className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" value={recognitionText} onChange={event => setRecognitionText(event.target.value)} placeholder={'甘A12345，张三，13800138000，32吨，某某物流\n甘A56789，李四，13900139000，35吨，某某物流'} /><div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{recognitionResult || '多物料通知只识别车辆信息，物料数量请在下方分别填写。'}</span><Button variant="outline" onClick={recognizeRows}><WandSparkles className="mr-1 h-4 w-4" />识别并生成车辆行</Button></div></Card>

      <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-semibold">车辆与运输数量</h2><p className="mt-1 text-xs text-muted-foreground">支持已维护车辆和临时车辆；同一车辆多趟运输时请分别保留一行。</p></div><div className="flex gap-2"><Badge variant="secondary">{rows.length} 辆 / 趟</Badge><Button size="sm" onClick={addRow} disabled={rows.length >= 100}><Plus className="mr-1 h-4 w-4" />添加车辆</Button></div></div><div className="overflow-x-auto"><table className="min-w-[1780px] w-full text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="w-24 px-3 py-3">序号</th><th className="w-56 px-3 py-3">运输方式 / 承运商</th><th className="w-64 px-3 py-3">车辆 / 临时车牌</th><th className="w-72 px-3 py-3">司机 / 联系电话</th>{data.lineItems.map(line => <th key={line.dispatchNoticeLineItemId} className="w-44 px-3 py-3 text-right">{line.materialName || line.materialId}<div className="font-normal">剩余 {line.availableQuantity.toLocaleString()} {unitLabel(line.unit)}</div></th>)}<th className="w-56 px-3 py-3">计划时间</th><th className="w-52 px-3 py-3">备注</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.clientRowId} className="border-b align-top"><td className="px-3 py-3"><div className="font-semibold">{index + 1}</div><div className="mt-2 flex gap-1"><button title="复制此行" className="rounded border p-1 text-muted-foreground hover:text-primary" onClick={() => copyRow(row)}><Copy className="h-3.5 w-3.5" /></button><button title="删除此行" className="rounded border p-1 text-muted-foreground hover:text-destructive" disabled={rows.length === 1} onClick={() => removeRow(row.clientRowId)}><Trash2 className="h-3.5 w-3.5" /></button></div></td><td className="space-y-2 px-3 py-3"><select className="h-9 w-full rounded-md border bg-background px-2" value={row.freightMode} onChange={event => patchRow(row.clientRowId, { freightMode: event.target.value, carrierPartnerId: '', vehicleId: '', plateNo: '', driverId: '', driverName: '', driverPhone: '' })}><option value="SELF">自有运力</option><option value="THIRD_PARTY">第三方承运</option></select>{row.freightMode === 'THIRD_PARTY' && <select className="h-9 w-full rounded-md border bg-background px-2" value={row.carrierPartnerId} onChange={event => selectCarrier(row, event.target.value)}><option value="">选择承运商</option>{carriers.map(carrier => <option key={carrier.id} value={carrier.partnerId}>{carrier.partner.name}</option>)}</select>}</td><td className="space-y-2 px-3 py-3"><select className="h-9 w-full rounded-md border bg-background px-2" value={row.vehicleId} onChange={event => selectVehicle(row, event.target.value)}><option value="">临时车辆 / 手工填写</option>{vehiclesFor(row).map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNo} · 载重 {Number(vehicle.loadCapacity)} 吨</option>)}</select><Input className="h-9" value={row.plateNo} onChange={event => patchRow(row.clientRowId, { vehicleId: '', plateNo: event.target.value })} placeholder="车牌号" /></td><td className="space-y-2 px-3 py-3"><Input className="h-9" value={row.driverSearch} onChange={event => patchRow(row.clientRowId, { driverSearch: event.target.value, driverId: '', driverName: event.target.value })} placeholder="姓名、手机号、服务商" /><select className="h-9 w-full rounded-md border bg-background px-2" value={row.driverId} onChange={event => selectDriver(row, event.target.value)}><option value="">手工填写司机</option>{driversFor(row).map(driver => <option key={driver.id} value={driver.id}>{driver.name} · {driver.phone}</option>)}</select><Input className="h-9" value={row.driverPhone} onChange={event => patchRow(row.clientRowId, { driverId: '', driverPhone: event.target.value })} placeholder="联系电话" /></td>{data.lineItems.map(line => { const value = row.quantities[line.dispatchNoticeLineItemId] || 0; return <td key={line.dispatchNoticeLineItemId} className="px-3 py-3"><Input className="ml-auto h-9 w-36 text-right" type="number" min="0" max={line.availableQuantity} value={value || ''} onChange={event => patchRow(row.clientRowId, { quantities: { ...row.quantities, [line.dispatchNoticeLineItemId]: Number(event.target.value) } })} placeholder="0" /><div className="mt-1 text-right text-xs text-muted-foreground">{unitLabel(line.unit)}</div></td>; })}<td className="space-y-2 px-3 py-3"><Input className="h-9" type="datetime-local" value={row.plannedDepartureAt} onChange={event => patchRow(row.clientRowId, { plannedDepartureAt: event.target.value })} /><Input className="h-9" type="datetime-local" min={row.plannedDepartureAt || undefined} value={row.plannedArrivalAt} onChange={event => patchRow(row.clientRowId, { plannedArrivalAt: event.target.value })} /></td><td className="px-3 py-3"><textarea className="min-h-20 w-full rounded-md border bg-background p-2 text-sm" value={row.remarks} onChange={event => patchRow(row.clientRowId, { remarks: event.target.value })} /></td></tr>)}</tbody></table></div></Card>

      <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-5"><div><h2 className="font-semibold">数量分配汇总</h2><div className="mt-3 flex flex-wrap gap-3">{data.lineItems.map(line => { const assigned = assignedTotals.get(line.dispatchNoticeLineItemId) || 0; const remaining = line.availableQuantity - assigned; return <div key={line.dispatchNoticeLineItemId} className={`rounded-md border px-4 py-3 ${remaining < 0 ? 'border-destructive bg-destructive/5' : 'bg-muted/30'}`}><div className="text-xs text-muted-foreground">{line.materialName || line.materialId}</div><div className="mt-1 font-semibold">本次 {assigned.toLocaleString()} / 剩余 {remaining.toLocaleString()} {unitLabel(line.unit)}</div></div>; })}</div></div><div className="text-right"><div className="text-sm text-muted-foreground">本次共 {rows.length} 辆 / 趟</div><div className="mt-1 text-xl font-bold">合计 {totalQuantity.toLocaleString()} 吨</div></div></div></Card>
      <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => router.back()}>取消</Button><Button disabled={saving || overAllocated || totalQuantity <= 0} onClick={() => void submit()}>{saving ? '正在批量创建...' : `批量创建 ${rows.length} 张物流运单`}</Button></div>
    </>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="mb-1 block text-sm font-medium">{label}</label>{children}</div>; }
function blankRow(defaults: Partial<Row> = {}): Row { return { clientRowId: makeUuid(), freightMode: 'SELF', carrierPartnerId: '', vehicleId: '', plateNo: '', driverSearch: '', driverId: '', driverName: '', driverPhone: '', plannedDepartureAt: '', plannedArrivalAt: '', quantities: {}, remarks: '', ...defaults }; }
function makeUuid() { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, value => { const random = Math.random() * 16 | 0; return (value === 'x' ? random : (random & 0x3) | 0x8).toString(16); }); }

function parseDispatchLine(line: string, data: Available, vehicles: Vehicle[], carriers: CarrierProfile[], drivers: Driver[], defaults: Partial<Row>) {
  const plateNo = line.match(/([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9挂学警港澳]{5,6})/i)?.[1]?.toUpperCase() || '';
  const phone = line.match(/(1[3-9]\d{9})/)?.[1] || '';
  const quantity = line.match(/(\d+(?:\.\d+)?)\s*(?:吨|t)(?:\s|$|[,，；;])/i)?.[1];
  const carrier = carriers.find(item => line.includes(item.partner.name));
  const vehicle = vehicles.find(item => item.plateNo.toUpperCase() === plateNo);
  const vehiclePrimary = vehicle?.drivers?.find(item => item.role === 'PRIMARY')?.driver;
  const namedDriver = line.match(/(?:司机|驾驶员)[：:\s]*([\u4e00-\u9fa5·]{2,8})/)?.[1]
    || line.split(/[,，；;\t]/).map(value => value.trim()).find(value => /^[\u4e00-\u9fa5·]{2,8}$/.test(value) && !carrier?.partner.name.includes(value)) || '';
  const matchedDriver = drivers.find(item => (phone && item.phone === phone) || (namedDriver && item.name === namedDriver));
  const outsourced = vehicle?.ownerType === 'OUTSOURCED' || Boolean(carrier);
  const carrierPartnerId = carrier?.partnerId || (vehicle?.ownerType === 'OUTSOURCED' ? vehicle.owner?.id || '' : defaults.carrierPartnerId || '');
  const row = blankRow({
    ...defaults, freightMode: outsourced ? 'THIRD_PARTY' : defaults.freightMode || 'SELF', carrierPartnerId,
    vehicleId: vehicle?.id || '', plateNo,
    driverId: matchedDriver?.id || vehiclePrimary?.id || '', driverName: matchedDriver?.name || vehiclePrimary?.name || namedDriver,
    driverSearch: matchedDriver?.name || vehiclePrimary?.name || namedDriver,
    driverPhone: matchedDriver?.phone || vehiclePrimary?.phone || phone,
  });
  if (quantity && data.lineItems.length === 1) row.quantities[data.lineItems[0].dispatchNoticeLineItemId] = Number(quantity);
  return row;
}

function clientWarnings(rows: Row[], vehicles: Vehicle[]) {
  const warnings: string[] = [];
  rows.forEach((row, index) => {
    const vehicle = vehicles.find(item => item.id === row.vehicleId);
    const quantity = Object.values(row.quantities).reduce((sum, value) => sum + Number(value || 0), 0);
    if (vehicle && quantity > Number(vehicle.loadCapacity)) warnings.push(`第 ${index + 1} 行计划数量超过车辆登记载重`);
    const duplicate = rows.findIndex((other, otherIndex) => otherIndex < index && other.plateNo.trim().toUpperCase() === row.plateNo.trim().toUpperCase()
      && (!other.plannedDepartureAt || !row.plannedDepartureAt || other.plannedDepartureAt === row.plannedDepartureAt));
    if (duplicate >= 0) warnings.push(`第 ${duplicate + 1}、${index + 1} 行使用同一车辆，请确认属于不同运输趟次`);
  });
  return warnings;
}
