'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Organization {
  id: string; code: string; organizationType: string; status: string;
  partner: { id: string; code: string; name: string };
}
interface Driver {
  id: string; name: string; phone: string; idCardNo: string | null; licenseNo: string | null;
  licenseClass: string | null; licenseExpiry: string | null; status: string; remark: string | null;
  _count: { waybills: number };
}
const empty = { name: '', phone: '', idCardNo: '', licenseNo: '', licenseClass: '', licenseExpiry: '', status: 'ACTIVE', remark: '' };

export default function CarrierDriversPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ ...empty });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async (keyword = search) => {
    const query = new URLSearchParams({ serviceOrganizationId: id, pageSize: '200' });
    if (keyword.trim()) query.set('search', keyword.trim());
    try {
      const [org, result] = await Promise.all([
        api.get<Organization>(`/service-organizations/${id}`),
        api.get<{ items: Driver[] }>(`/drivers?${query}`),
      ]);
      if (org.organizationType !== 'LOGISTICS_CARRIER') throw new Error('只有物流承运商可以维护司机');
      setOrganization(org);
      setDrivers(result.items || []);
    } catch (error: any) { alert(error.message); router.back(); }
  };
  useEffect(() => { void load(''); }, [id]);

  const set = (key: keyof typeof empty, value: string) => setForm(current => ({ ...current, [key]: value }));
  const reset = () => { setForm({ ...empty }); setEditingId(null); setShowForm(false); };
  const edit = (driver: Driver) => {
    setEditingId(driver.id);
    setForm({
      name: driver.name, phone: driver.phone, idCardNo: driver.idCardNo || '', licenseNo: driver.licenseNo || '',
      licenseClass: driver.licenseClass || '', licenseExpiry: driver.licenseExpiry?.slice(0, 10) || '',
      status: driver.status, remark: driver.remark || '',
    });
    setShowForm(true);
  };
  const save = async () => {
    if (!form.name.trim()) return alert('请输入司机姓名');
    if (!/^1[3-9]\d{9}$/.test(form.phone)) return alert('请输入11位有效手机号');
    setSaving(true);
    const payload = {
      ...form,
      serviceOrganizationId: id,
      idCardNo: form.idCardNo || null,
      licenseNo: form.licenseNo || null,
      licenseClass: form.licenseClass || null,
      licenseExpiry: form.licenseExpiry || null,
      remark: form.remark || null,
    };
    try {
      if (editingId) await api.patch(`/drivers/${editingId}`, payload);
      else await api.post('/drivers', payload);
      reset();
      await load();
    } catch (error: any) { alert(error.message || '司机保存失败'); }
    finally { setSaving(false); }
  };
  const toggle = async (driver: Driver) => {
    try { await api.patch(`/drivers/${driver.id}`, { status: driver.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }); await load(); }
    catch (error: any) { alert(error.message); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/master-data/service-organizations?type=LOGISTICS_CARRIER')}><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-2xl font-bold">司机管理</h1><p className="mt-1 text-sm text-muted-foreground">{organization ? `${organization.code} · ${organization.partner.name}` : '加载中...'}</p></div></div>
      <Button onClick={() => { reset(); setShowForm(true); }}><Plus className="mr-1 h-4 w-4" />新增司机</Button>
    </div>

    {showForm && <Card className="space-y-4 p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">{editingId ? '编辑司机档案' : '新增司机档案'}</h2><Button variant="ghost" size="sm" onClick={reset}>取消</Button></div><div className="grid gap-4 md:grid-cols-3">
      <Field label="司机姓名 *"><Input value={form.name} maxLength={50} onChange={e => set('name', e.target.value)} /></Field>
      <Field label="手机号 *"><Input inputMode="numeric" maxLength={11} value={form.phone} onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 11))} /></Field>
      <Field label="身份证号"><Input maxLength={18} value={form.idCardNo} onChange={e => set('idCardNo', e.target.value)} /></Field>
      <Field label="驾驶证号"><Input maxLength={50} value={form.licenseNo} onChange={e => set('licenseNo', e.target.value)} /></Field>
      <Field label="准驾车型"><Input maxLength={20} value={form.licenseClass} onChange={e => set('licenseClass', e.target.value)} placeholder="如：A2、B2" /></Field>
      <Field label="驾驶证有效期"><Input type="date" value={form.licenseExpiry} onChange={e => set('licenseExpiry', e.target.value)} /></Field>
      <Field label="状态"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.status} onChange={e => set('status', e.target.value)}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></select></Field>
      <div className="md:col-span-2"><Field label="备注"><Input maxLength={500} value={form.remark} onChange={e => set('remark', e.target.value)} /></Field></div>
    </div><div className="flex justify-end"><Button disabled={saving} onClick={() => void save()}>{saving ? '保存中...' : '保存司机'}</Button></div></Card>}

    <div className="flex gap-2"><div className="relative w-80"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && void load()} placeholder="模糊搜索姓名、手机号、证件号" /></div><Button variant="outline" onClick={() => void load()}>查询</Button></div>
    <Card className="overflow-hidden">{!drivers.length ? <div className="p-12 text-center text-muted-foreground">暂无司机档案</div> : <div className="overflow-x-auto"><table className="min-w-[1000px] w-full text-sm"><thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="p-3">司机 / 手机</th><th className="p-3">身份证号</th><th className="p-3">驾驶证 / 准驾车型</th><th className="p-3">有效期</th><th className="p-3">引用运单</th><th className="p-3">状态</th><th className="p-3">操作</th></tr></thead><tbody>{drivers.map(driver => <tr key={driver.id} className="border-b"><td className="p-3"><div className="font-medium">{driver.name}</div><div className="mt-1 text-xs text-muted-foreground">{driver.phone}</div></td><td className="p-3">{driver.idCardNo || '—'}</td><td className="p-3"><div>{driver.licenseNo || '—'}</div><div className="mt-1 text-xs text-muted-foreground">{driver.licenseClass || '未填写'}</div></td><td className="p-3">{driver.licenseExpiry?.slice(0, 10) || '—'}</td><td className="p-3">{driver._count.waybills} 单</td><td className="p-3"><Badge variant={driver.status === 'ACTIVE' ? 'default' : 'secondary'}>{driver.status === 'ACTIVE' ? '启用' : '停用'}</Badge></td><td className="p-3"><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => edit(driver)}>编辑</Button><Button size="sm" variant="ghost" onClick={() => void toggle(driver)}>{driver.status === 'ACTIVE' ? '停用' : '启用'}</Button></div></td></tr>)}</tbody></table></div>}</Card>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium">{label}</span>{children}</label>;
}
