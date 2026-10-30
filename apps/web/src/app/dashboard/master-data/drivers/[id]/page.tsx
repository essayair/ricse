'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AttachmentPanel, BusinessAttachment } from '@/components/attachment-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusText } from '@/components/status-text';

interface DriverDetail {
  id: string; name: string; phone: string; idCardNo: string | null; licenseNo: string | null; licenseClass: string | null; licenseExpiry: string | null; status: string; remark: string | null;
  serviceOrganization: { partner: { name: string } } | null;
  attachments: BusinessAttachment[];
  vehicleLinks: Array<{ id: string; role: string; vehicle: { id: string; plateNo: string; status: string; deletedAt: string | null } }>;
}
export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>(), router = useRouter();
  const [driver, setDriver] = useState<DriverDetail | null>(null), [error, setError] = useState('');
  const [canManage, setCanManage] = useState(false);
  useEffect(() => { try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setCanManage(user.role === 'ADMIN' || user.roles?.includes('ADMIN') || user.permissions?.includes('transport_resource.manage')); } catch {} }, []);
  const load = useCallback(async () => { try { setDriver(await api.get('/drivers/' + id)); setError(''); } catch (e: any) { setError(e.message || '司机加载失败'); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <div role="alert" className="p-8 text-destructive">{error}</div>;
  if (!driver) return <div className="p-10 text-center text-muted-foreground">加载中…</div>;
  return <div className="mx-auto max-w-6xl space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><h1 className="text-xl font-semibold">{driver.name}</h1><StatusText status={driver.status}>{driver.status === 'ACTIVE' ? '启用' : '停用'}</StatusText></div><div className="flex gap-2"><Button variant="outline" onClick={() => router.push('/dashboard/transport-resources?resource=driver')}>返回司机列表</Button>{canManage && <Link href={'/dashboard/master-data/transport-resources/new?driverId=' + id}><Button>关联或新建车辆</Button></Link>}</div></div>
    <Card className="space-y-4 p-5"><h2 className="font-semibold">司机基本信息</h2><div className="grid gap-4 text-sm md:grid-cols-3">{[['司机姓名', driver.name], ['手机号', driver.phone], ['所属承运商', driver.serviceOrganization?.partner.name || '暂未绑定 / 社会运力'], ['身份证号', driver.idCardNo], ['驾驶证号', driver.licenseNo], ['准驾车型', driver.licenseClass], ['驾驶证有效期', driver.licenseExpiry?.slice(0, 10)], ['备注', driver.remark]].map(([label, value]) => <div key={label}><div className="text-xs text-muted-foreground">{label}</div><p className="mt-1">{value || '—'}</p></div>)}</div></Card>
    <AttachmentPanel title="司机证件资料" description="驾驶证、身份证等资料暂为选填；可选择或粘贴附件，并在当前页查看、删除。" attachments={driver.attachments || []} uploadPath={`/transport-resources/drivers/${id}/attachments`} attachmentPath={`/transport-resources/drivers/${id}/attachments`} canUpload={canManage} canDelete={canManage} onChanged={load}/>
    <Card className="space-y-4 p-5"><h2 className="font-semibold">关联车辆</h2>{driver.vehicleLinks.filter(link => !link.vehicle.deletedAt).length ? <div className="grid gap-3 md:grid-cols-3">{driver.vehicleLinks.filter(link => !link.vehicle.deletedAt).map(link => <Link key={link.id} href={'/dashboard/master-data/vehicles/' + link.vehicle.id} className="rounded-md border p-4 text-sm hover:bg-muted"><div className="font-medium text-primary">{link.vehicle.plateNo}</div><p className="mt-1 text-xs text-muted-foreground">{link.role === 'PRIMARY' ? '主驾' : '副驾'}</p></Link>)}</div> : <p className="text-sm text-muted-foreground">暂未关联车辆，司机档案可独立维护。</p>}</Card>
  </div>;
}
