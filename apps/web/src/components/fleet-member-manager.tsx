'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmAction } from '@/lib/system-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { StatusText } from '@/components/status-text';

interface FleetDriver {
  id: string; name: string; phone: string; status: string;
  serviceOrganization?: { partner?: { name: string } | null } | null;
}
interface FleetVehicle { id: string; plateNo: string; status: string }
interface FleetDetail {
  id: string; name: string; status: string; carrierPartner?: { name: string } | null;
  driverLinks: Array<{ driver: FleetDriver }>;
  vehicleLinks: Array<{ vehicle: FleetVehicle }>;
}

function useCandidates<T>(path: string, search: string, fleetId: string | null) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setItems([]); setError(''); setLoading(Boolean(fleetId));
    if (!fleetId) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ pageSize: '50', status: 'ACTIVE' });
      if (search.trim()) params.set('search', search.trim());
      api.get<{ items: T[] }>(`${path}?${params}`)
        .then(result => { if (!cancelled) setItems(result.items || []); })
        .catch((reason: Error) => { if (!cancelled) setError(reason.message || '候选档案加载失败'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [fleetId, path, search]);
  return { items, loading, error };
}

export function FleetMemberManager({ fleetId, onClose, onChanged }: {
  fleetId: string | null; onClose: () => void; onChanged: () => void;
}) {
  const [detail, setDetail] = useState<FleetDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const requestRef = useRef(0);
  const [canManage, setCanManage] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const drivers = useCandidates<FleetDriver>('/drivers', driverSearch, fleetId);
  const vehicles = useCandidates<FleetVehicle>('/partners/vehicles', vehicleSearch, fleetId);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      setCanManage(user.role === 'ADMIN' || (user.permissions || []).includes('transport_resource.manage'));
    } catch { setCanManage(false); }
  }, []);

  const reload = useCallback(async (isCurrent: () => boolean = () => true) => {
    if (!fleetId) return;
    const request = ++requestRef.current;
    const result = await api.get<FleetDetail>(`/fleets/${fleetId}`);
    if (request === requestRef.current && isCurrent()) setDetail(result);
  }, [fleetId]);

  useEffect(() => {
    ++requestRef.current;
    setDetail(null); setError(''); setMessage(''); setDriverId(''); setVehicleId('');
    setDriverSearch(''); setVehicleSearch(''); setLoading(Boolean(fleetId));
    let cancelled = false;
    if (fleetId) void reload(() => !cancelled)
      .catch((reason: Error) => { if (!cancelled) setError(reason.message || '车队成员加载失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fleetId, reload]);

  const updateMember = async (kind: 'drivers' | 'vehicles', memberId: string, remove = false) => {
    if (!fleetId || !memberId || !canManage || busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(''); setMessage('');
    const label = kind === 'drivers' ? '司机' : '车辆';
    try {
      if (remove && !await confirmAction(`确认将该${label}移出当前车队？仅解除车队关系，不会删除档案或影响历史运单。`, { title: `移出${label}确认` })) return;
      if (remove) await api.delete(`/fleets/${fleetId}/${kind}/${memberId}`);
      else await api.post(`/fleets/${fleetId}/${kind}`, kind === 'drivers' ? { driverId: memberId } : { vehicleId: memberId });
      if (kind === 'drivers') setDriverId(''); else setVehicleId('');
      setMessage(`${label}已${remove ? '移出' : '加入'}车队`);
      onChanged();
      await reload();
    } catch (reason: any) {
      setError(reason.message || `${label}成员更新失败，请刷新重试`);
      await reload().catch(() => {});
    }
    finally { busyRef.current = false; setBusy(false); }
  };

  const driverCandidates = drivers.items.filter(item => !detail?.driverLinks.some(link => link.driver.id === item.id));
  const vehicleCandidates = vehicles.items.filter(item => !detail?.vehicleLinks.some(link => link.vehicle.id === item.id));
  const editable = canManage && detail?.status === 'ACTIVE';

  return <Dialog open={Boolean(fleetId)} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[88vh] w-[calc(100%_-_2rem)] max-w-5xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{detail ? `${detail.name} · 成员管理` : '车队成员管理'}</DialogTitle>
        <DialogDescription>司机与车辆分别加入车队，互不强制绑定；移出只解除分组关系，不删除档案。{detail?.carrierPartner ? `挂靠承运商：${detail.carrierPartner.name}` : ''}</DialogDescription>
      </DialogHeader>
      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {message && <p role="status" className="text-sm text-primary">{message}</p>}
      {busy && <p role="status" className="text-sm text-muted-foreground">正在处理车队成员，请稍候…</p>}
      {loading ? <p className="py-8 text-center text-sm text-muted-foreground">正在加载车队成员…</p> : !detail ? <Button variant="outline" onClick={() => void reload().catch(reason => setError(reason.message))}>重新加载</Button> : <>
        {canManage && !editable && <p className="text-sm text-muted-foreground">车队已停用，请先启用后再加入成员；仍可移出现有成员。</p>}
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <section className="min-w-0 space-y-3">
            <h3 className="text-sm font-semibold">司机（{detail.driverLinks.length}）</h3>
            {editable && <>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="搜索待加入司机" className="pl-9" placeholder="搜索姓名、手机号、承运商" value={driverSearch} disabled={busy} onChange={event => { setDriverSearch(event.target.value); setDriverId(''); }} /></div>
              <div className="flex min-w-0 gap-2">
                <select aria-label="选择要加入的司机" className="h-10 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" value={driverId} disabled={busy || drivers.loading} onChange={event => setDriverId(event.target.value)}>
                  <option value="">{drivers.loading ? '搜索中…' : driverCandidates.length ? '选择要加入的司机' : '暂无可加入司机，请更换关键词'}</option>
                  {driverCandidates.map(item => <option key={item.id} value={item.id}>{item.name} · {item.phone} · {item.serviceOrganization?.partner?.name || '社会运力'}</option>)}
                </select>
                <Button disabled={busy || drivers.loading || !driverCandidates.some(item => item.id === driverId)} onClick={() => void updateMember('drivers', driverId)}>加入司机</Button>
              </div>
              {drivers.error && <p className="text-xs text-destructive">{drivers.error}</p>}
            </>}
            <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
              {!detail.driverLinks.length ? <p className="p-5 text-center text-sm text-muted-foreground">暂无司机</p> : detail.driverLinks.map(({ driver }) => <div key={driver.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0"><Link className="font-medium hover:text-primary" href={`/dashboard/master-data/drivers/${driver.id}`}>{driver.name}</Link><div className="mt-1 truncate text-xs text-muted-foreground" title={driver.serviceOrganization?.partner?.name}>{driver.phone} · {driver.serviceOrganization?.partner?.name || '社会运力'}</div><StatusText status={driver.status}>{driver.status === 'ACTIVE' ? '启用' : '停用'}</StatusText></div>
                {canManage && <Button variant="ghost" size="sm" className="shrink-0 text-destructive" disabled={busy} onClick={() => void updateMember('drivers', driver.id, true)}>移出司机</Button>}
              </div>)}
            </div>
          </section>
          <section className="min-w-0 space-y-3">
            <h3 className="text-sm font-semibold">车辆（{detail.vehicleLinks.length}）</h3>
            {editable && <>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="搜索待加入车辆" className="pl-9" placeholder="搜索车牌、车主或车辆信息" value={vehicleSearch} disabled={busy} onChange={event => { setVehicleSearch(event.target.value); setVehicleId(''); }} /></div>
              <div className="flex min-w-0 gap-2">
                <select aria-label="选择要加入的车辆" className="h-10 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" value={vehicleId} disabled={busy || vehicles.loading} onChange={event => setVehicleId(event.target.value)}>
                  <option value="">{vehicles.loading ? '搜索中…' : vehicleCandidates.length ? '选择要加入的车辆' : '暂无可加入车辆，请更换关键词'}</option>
                  {vehicleCandidates.map(item => <option key={item.id} value={item.id}>{item.plateNo}</option>)}
                </select>
                <Button disabled={busy || vehicles.loading || !vehicleCandidates.some(item => item.id === vehicleId)} onClick={() => void updateMember('vehicles', vehicleId)}>加入车辆</Button>
              </div>
              {vehicles.error && <p className="text-xs text-destructive">{vehicles.error}</p>}
            </>}
            <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
              {!detail.vehicleLinks.length ? <p className="p-5 text-center text-sm text-muted-foreground">暂无车辆</p> : detail.vehicleLinks.map(({ vehicle }) => <div key={vehicle.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0"><Link className="font-mono font-medium hover:text-primary" href={`/dashboard/master-data/vehicles/${vehicle.id}`}>{vehicle.plateNo}</Link><div className="mt-1"><StatusText status={vehicle.status}>{vehicle.status === 'ACTIVE' ? '启用' : vehicle.status === 'MAINTENANCE' ? '维修停用' : vehicle.status === 'RETIRED' ? '已退役' : '停用'}</StatusText></div></div>
                {canManage && <Button variant="ghost" size="sm" className="shrink-0 text-destructive" disabled={busy} onClick={() => void updateMember('vehicles', vehicle.id, true)}>移出车辆</Button>}
              </div>)}
            </div>
          </section>
        </div>
      </>}
      <div className="flex justify-end border-t pt-4"><Button variant="outline" disabled={busy} onClick={onClose}>关闭</Button></div>
    </DialogContent>
  </Dialog>;
}
