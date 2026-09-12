'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, KeyRound, Pencil, Plus, RefreshCw, Trash2, Video, Wifi, WifiOff } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MonitorPreview } from './monitor-preview';
import { StatusText } from '@/components/status-text';

interface Platform {
  id: string; code: string; name: string; appKey: string; appSecret: string; baseUrl: string;
  status: string; remark: string | null; appSecretConfigured: boolean; _count: { sites: number };
}
interface Site {
  id: string; platformId: string; code: string; name: string; warehouseId: string | null;
  sortOrder: number; status: string;
  warehouse: { id: string; code: string; name: string } | null;
  platform: { id: string; code: string; name: string; status: string };
  _count: { cameras: number };
}
interface CameraItem {
  id: string; siteId: string; code: string; name: string; deviceSerial: string; channelNo: number;
  streamQuality: string; ptzSupport: boolean; purpose: string | null; online: boolean;
  statusSyncAt: string | null; sortOrder: number; status: string; verifyCodeConfigured: boolean;
  site: { id: string; code: string; name: string };
}
interface Warehouse { id: string; code: string; name: string }

const PURPOSES: Record<string, string> = {
  WEIGHBRIDGE: '地磅', UNLOADING: '卸货区', WAREHOUSE: '仓库', LAB: '化验室', OTHER: '其他',
};

const emptySite = () => ({ id: '', platformId: '', code: '', name: '', warehouseId: '', sortOrder: 0 });
const emptyCamera = () => ({
  id: '', siteId: '', code: '', name: '', deviceSerial: '', channelNo: 1,
  verifyCode: '', streamQuality: 'hd', ptzSupport: false, purpose: 'WAREHOUSE', sortOrder: 0,
});

export default function MonitorPage() {
  const [tab, setTab] = useState<'cameras' | 'platform'>('cameras');
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [siteFilter, setSiteFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [siteForm, setSiteForm] = useState(emptySite);
  const [cameraForm, setCameraForm] = useState(emptyCamera);
  const [platformForm, setPlatformForm] = useState({ id: '', name: '', appKey: '', appSecret: '', baseUrl: '', status: 'ACTIVE' });
  const [preview, setPreview] = useState<CameraItem | null>(null);

  const load = useCallback(async () => {
    try {
      const [platformData, siteData, cameraData] = await Promise.all([
        api.get<Platform[]>('/monitor/platforms'),
        api.get<Site[]>('/monitor/sites'),
        api.get<CameraItem[]>('/monitor/cameras'),
      ]);
      setPlatforms(platformData); setSites(siteData); setCameras(cameraData);
    } catch (error: any) { alert(error.message || '监控配置加载失败'); }
    // 仓库仅用于分组绑定，缺少主数据查看权限时不阻断监控配置。
    try { setWarehouses(await api.get<Warehouse[]>('/master-data/warehouses')); } catch { setWarehouses([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const activePlatform = platforms.find((item) => item.status === 'ACTIVE') || platforms[0];
  const visibleCameras = useMemo(
    () => (siteFilter ? cameras.filter((item) => item.siteId === siteFilter) : cameras),
    [cameras, siteFilter],
  );
  const onlineCount = visibleCameras.filter((item) => item.online).length;

  const run = async (task: () => Promise<unknown>, done?: () => void) => {
    setBusy(true);
    try { await task(); await load(); done?.(); }
    catch (error: any) { alert(error.message || '操作失败'); }
    finally { setBusy(false); }
  };

  const saveSite = () => run(async () => {
    const body = {
      code: siteForm.code.trim(), name: siteForm.name.trim(),
      warehouseId: siteForm.warehouseId || undefined, sortOrder: Number(siteForm.sortOrder) || 0,
    };
    if (siteForm.id) await api.patch(`/monitor/sites/${siteForm.id}`, body);
    else await api.post('/monitor/sites', { ...body, platformId: siteForm.platformId || activePlatform?.id });
  }, () => setSiteForm(emptySite()));

  const saveCamera = () => run(async () => {
    const body = {
      name: cameraForm.name.trim(), deviceSerial: cameraForm.deviceSerial.trim().toUpperCase(),
      channelNo: Number(cameraForm.channelNo) || 1, streamQuality: cameraForm.streamQuality,
      ptzSupport: cameraForm.ptzSupport, purpose: cameraForm.purpose,
      sortOrder: Number(cameraForm.sortOrder) || 0,
      ...(cameraForm.verifyCode ? { verifyCode: cameraForm.verifyCode.trim() } : {}),
    };
    if (cameraForm.id) await api.patch(`/monitor/cameras/${cameraForm.id}`, { ...body, siteId: cameraForm.siteId });
    else await api.post('/monitor/cameras', { ...body, siteId: cameraForm.siteId, code: cameraForm.code.trim() });
  }, () => setCameraForm(emptyCamera()));

  const savePlatform = () => run(async () => {
    await api.patch(`/monitor/platforms/${platformForm.id}`, {
      name: platformForm.name.trim(), appKey: platformForm.appKey.trim(),
      baseUrl: platformForm.baseUrl.trim(), status: platformForm.status,
      // 留空表示保持原有 appSecret，避免掩码回显覆盖真实凭据。
      ...(platformForm.appSecret ? { appSecret: platformForm.appSecret.trim() } : {}),
    });
  }, () => setPlatformForm((prev) => ({ ...prev, appSecret: '' })));

  const testPlatform = (id: string) => run(async () => {
    const result = await api.post<{ expireAt: string }>(`/monitor/platforms/${id}/test`, {});
    alert(`连接成功，凭据有效期至 ${new Date(result.expireAt).toLocaleString('zh-CN')}`);
  });

  const toggleCamera = (item: CameraItem) => run(() => api.patch(`/monitor/cameras/${item.id}`, {
    status: item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
  }));

  const removeCamera = (item: CameraItem) => {
    if (!window.confirm(`确认删除点位「${item.name}」？删除后官网和大屏将不再展示该画面。`)) return;
    void run(() => api.delete(`/monitor/cameras/${item.id}`));
  };

  const removeSite = (item: Site) => {
    if (!window.confirm(`确认删除分组「${item.name}」？`)) return;
    void run(() => api.delete(`/monitor/sites/${item.id}`));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">监控录像</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            维护监控平台凭据与摄像头点位。官网和数字大屏统一读取此处配置，不再各自硬编码。
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => run(() => api.post('/monitor/refresh-status', {}))}>
          <RefreshCw className="mr-2 h-4 w-4" />刷新在线状态
        </Button>
      </div>

      {activePlatform && !activePlatform.appSecretConfigured && (
        <div className="rounded-lg border border-warning-border bg-warning-bg p-4 text-sm text-warning">
          监控平台凭据尚未录入，官网与大屏无法取流。请在「平台账号」中填写 appKey 与 appSecret。
        </div>
      )}

      <div className="flex gap-2 border-b">
        {([['cameras', '点位配置', Camera], ['platform', '平台账号', KeyRound]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition-colors ${
              tab === key ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'cameras' && (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="点位总数" value={visibleCameras.length} />
            <Stat label="在线" value={onlineCount} tone="success" />
            <Stat label="离线" value={visibleCameras.length - onlineCount} tone={visibleCameras.length - onlineCount ? 'danger' : undefined} />
            <Stat label="分组" value={sites.length} />
          </div>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">点位分组</h2>
              <span className="text-xs text-muted-foreground">分组对应官网的监控切换标签</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSiteFilter('')}
                className={`rounded-md border px-3 py-1.5 text-sm ${!siteFilter ? 'border-primary bg-primary/5 text-primary' : ''}`}
              >
                全部 ({cameras.length})
              </button>
              {sites.map((site) => (
                <div key={site.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setSiteFilter(site.id)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${siteFilter === site.id ? 'border-primary bg-primary/5 text-primary' : ''}`}
                  >
                    {site.name} ({site._count.cameras})
                    {site.status !== 'ACTIVE' && <StatusText status={site.status} className="ml-2">已停用</StatusText>}
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => setSiteForm({
                    id: site.id, platformId: site.platformId, code: site.code, name: site.name,
                    warehouseId: site.warehouseId || '', sortOrder: site.sortOrder,
                  })}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => removeSite(site)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-2 border-t pt-4 md:grid-cols-5">
              <Input placeholder="分组标识，如 panorama" value={siteForm.code}
                disabled={!!siteForm.id}
                onChange={(e) => setSiteForm({ ...siteForm, code: e.target.value })} />
              <Input placeholder="分组名称" value={siteForm.name}
                onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} />
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={siteForm.warehouseId}
                onChange={(e) => setSiteForm({ ...siteForm, warehouseId: e.target.value })}>
                <option value="">不关联仓库</option>
                {warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <Input type="number" placeholder="排序" value={siteForm.sortOrder}
                onChange={(e) => setSiteForm({ ...siteForm, sortOrder: Number(e.target.value) })} />
              <div className="flex gap-2">
                <Button disabled={busy || !siteForm.code || !siteForm.name} onClick={saveSite}>
                  <Plus className="mr-1 h-4 w-4" />{siteForm.id ? '保存分组' : '新增分组'}
                </Button>
                {siteForm.id && <Button variant="ghost" onClick={() => setSiteForm(emptySite())}>取消</Button>}
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b p-4 font-medium">摄像头点位</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="p-3">点位</th><th className="p-3">分组</th><th className="p-3">设备序列号</th>
                    <th className="p-3">通道</th><th className="p-3">用途</th><th className="p-3">云台</th>
                    <th className="p-3">验证码</th><th className="p-3">在线</th><th className="p-3">状态</th><th className="p-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {!visibleCameras.length && (
                    <tr><td colSpan={10} className="p-12 text-center text-muted-foreground">暂无监控点位</td></tr>
                  )}
                  {visibleCameras.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="p-3"><div className="font-medium">{item.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{item.code}</div></td>
                      <td className="p-3">{item.site.name}</td>
                      <td className="p-3 font-mono text-xs">{item.deviceSerial}</td>
                      <td className="p-3">{item.channelNo}</td>
                      <td className="p-3">{item.purpose ? PURPOSES[item.purpose] || item.purpose : '-'}</td>
                      <td className="p-3">{item.ptzSupport ? <Badge variant="secondary">支持</Badge> : '-'}</td>
                      <td className="p-3">{item.verifyCodeConfigured ? '已配置' : <span className="text-warning">未配置</span>}</td>
                      <td className="p-3">
                        {item.online
                          ? <span className="flex items-center gap-1 text-success"><Wifi className="h-3.5 w-3.5" />在线</span>
                          : <span className="flex items-center gap-1 text-muted-foreground"><WifiOff className="h-3.5 w-3.5" />离线</span>}
                      </td>
                      <td className="p-3">
                        <StatusText status={item.status}>
                          {item.status === 'ACTIVE' ? '启用' : '停用'}
                        </StatusText>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setPreview(item)}><Video className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => setCameraForm({
                            id: item.id, siteId: item.siteId, code: item.code, name: item.name,
                            deviceSerial: item.deviceSerial, channelNo: item.channelNo, verifyCode: '',
                            streamQuality: item.streamQuality, ptzSupport: item.ptzSupport,
                            purpose: item.purpose || 'WAREHOUSE', sortOrder: item.sortOrder,
                          })}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleCamera(item)}>
                            {item.status === 'ACTIVE' ? '停用' : '启用'}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => removeCamera(item)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-2 border-t p-4 md:grid-cols-4 lg:grid-cols-6">
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={cameraForm.siteId}
                onChange={(e) => setCameraForm({ ...cameraForm, siteId: e.target.value })}>
                <option value="">选择分组</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
              <Input placeholder="点位标识，如 gk-3" value={cameraForm.code} disabled={!!cameraForm.id}
                onChange={(e) => setCameraForm({ ...cameraForm, code: e.target.value })} />
              <Input placeholder="点位名称" value={cameraForm.name}
                onChange={(e) => setCameraForm({ ...cameraForm, name: e.target.value })} />
              <Input placeholder="设备序列号" value={cameraForm.deviceSerial}
                onChange={(e) => setCameraForm({ ...cameraForm, deviceSerial: e.target.value })} />
              <Input type="number" placeholder="通道号" value={cameraForm.channelNo}
                onChange={(e) => setCameraForm({ ...cameraForm, channelNo: Number(e.target.value) })} />
              <Input placeholder={cameraForm.id ? '验证码（留空不改）' : '设备验证码'} value={cameraForm.verifyCode}
                onChange={(e) => setCameraForm({ ...cameraForm, verifyCode: e.target.value })} />
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={cameraForm.purpose}
                onChange={(e) => setCameraForm({ ...cameraForm, purpose: e.target.value })}>
                {Object.entries(PURPOSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={cameraForm.streamQuality}
                onChange={(e) => setCameraForm({ ...cameraForm, streamQuality: e.target.value })}>
                <option value="hd">高清</option><option value="sd">标清</option>
              </select>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" checked={cameraForm.ptzSupport}
                  onChange={(e) => setCameraForm({ ...cameraForm, ptzSupport: e.target.checked })} />
                支持云台
              </label>
              <Input type="number" placeholder="排序" value={cameraForm.sortOrder}
                onChange={(e) => setCameraForm({ ...cameraForm, sortOrder: Number(e.target.value) })} />
              <div className="flex gap-2">
                <Button disabled={busy || !cameraForm.siteId || !cameraForm.name || !cameraForm.deviceSerial} onClick={saveCamera}>
                  <Plus className="mr-1 h-4 w-4" />{cameraForm.id ? '保存点位' : '新增点位'}
                </Button>
                {cameraForm.id && <Button variant="ghost" onClick={() => setCameraForm(emptyCamera())}>取消</Button>}
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === 'platform' && (
        <Card className="p-6">
          <h2 className="font-medium">监控平台账号</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            appSecret 只保存在服务端，用于换取播放凭据；页面与接口一律不回显原值。
          </p>
          <div className="mt-4 space-y-4">
            {platforms.map((item) => {
              const editing = platformForm.id === item.id;
              return (
                <div key={item.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      <Badge variant="outline" className="font-mono">{item.code}</Badge>
                      <StatusText status={item.status}>
                        {item.status === 'ACTIVE' ? '启用' : '停用'}
                      </StatusText>
                      {!item.appSecretConfigured && <Badge variant="destructive">凭据未配置</Badge>}
                      <span className="text-xs text-muted-foreground">{item._count.sites} 个分组</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={busy || !item.appSecretConfigured}
                        onClick={() => testPlatform(item.id)}>连通性测试</Button>
                      <Button variant="ghost" size="sm" onClick={() => setPlatformForm(editing
                        ? { id: '', name: '', appKey: '', appSecret: '', baseUrl: '', status: 'ACTIVE' }
                        : { id: item.id, name: item.name, appKey: item.appKey, appSecret: '', baseUrl: item.baseUrl, status: item.status })}>
                        {editing ? '收起' : '编辑'}
                      </Button>
                    </div>
                  </div>
                  {item.remark && <p className="mt-2 text-xs text-muted-foreground">{item.remark}</p>}
                  {editing && (
                    <div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-2">
                      <Field label="平台名称">
                        <Input value={platformForm.name} onChange={(e) => setPlatformForm({ ...platformForm, name: e.target.value })} />
                      </Field>
                      <Field label="开放平台地址">
                        <Input value={platformForm.baseUrl} onChange={(e) => setPlatformForm({ ...platformForm, baseUrl: e.target.value })} />
                      </Field>
                      <Field label="appKey">
                        <Input value={platformForm.appKey} onChange={(e) => setPlatformForm({ ...platformForm, appKey: e.target.value })} />
                      </Field>
                      <Field label="appSecret（留空表示不修改）">
                        <Input type="password" placeholder="••••••" value={platformForm.appSecret}
                          onChange={(e) => setPlatformForm({ ...platformForm, appSecret: e.target.value })} />
                      </Field>
                      <Field label="状态">
                        <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={platformForm.status}
                          onChange={(e) => setPlatformForm({ ...platformForm, status: e.target.value })}>
                          <option value="ACTIVE">启用</option><option value="INACTIVE">停用</option>
                        </select>
                      </Field>
                      <div className="flex items-end">
                        <Button disabled={busy} onClick={savePlatform}>保存平台配置</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {preview && <MonitorPreview camera={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'danger' }) {
  const color = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-destructive' : '';
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-1 text-xs text-muted-foreground">{label}</div>{children}</div>;
}
