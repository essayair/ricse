'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSearchParams, useRouter } from 'next/navigation';
import { Building2, Users, Layers, Network, Plus, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

type TabKey = 'company' | 'dept' | 'employee' | 'business-group';

interface CompanyItem { id: string; code: string; name: string; shortName?: string; type: string; status: string; partner?: { id: string; code: string; name: string } | null; departments?: { id: string; name: string }[] }
interface DeptItem { id: string; name: string; companyId: string; company?: { code: string; name: string }; parentId?: string }
interface EmployeeItem { id: string; name: string; departmentId: string; companyId: string; position?: string; phone?: string; department?: { name: string }; company?: { code: string; name: string } }
interface BusinessGroupItem { id: string; name: string; description?: string; companies?: { company: { id: string; code: string; name: string } }[] }

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'company', label: '企业维护', icon: Building2 },
  { key: 'dept', label: '部门管理', icon: Layers },
  { key: 'employee', label: '员工管理', icon: Users },
  { key: 'business-group', label: '业务组', icon: Network },
];

function OrgPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabFromUrl = searchParams.get('tab') as TabKey | null;
  const [tab, setTabState] = useState<TabKey>(tabFromUrl || 'company');
  const [loading, setLoading] = useState(false);

  const setTab = (t: TabKey) => {
    setTabState(t);
    if (t === 'company') router.replace('/dashboard/org');
    else router.replace(`/dashboard/org?tab=${t}`);
  };

  useEffect(() => {
    if (tabFromUrl && TABS.some((t) => t.key === tabFromUrl)) setTabState(tabFromUrl);
  }, [tabFromUrl]);

  // ---- Data state ----
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [depts, setDepts] = useState<DeptItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [bgroups, setBgroups] = useState<BusinessGroupItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState('INTERNAL');
  const [newParent, setNewParent] = useState('');
  const [newCompanyId, setNewCompanyId] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'company') {
        const cs = await api.get<CompanyItem[]>('/org/companies');
        setCompanies(Array.isArray(cs) ? cs : []);
      }
      if (tab === 'dept') {
        const ds = await api.get<DeptItem[]>('/org/departments');
        setDepts(Array.isArray(ds) ? ds : []);
        // also load companies for create dropdown
        const cs = await api.get<CompanyItem[]>('/org/companies');
        setCompanies(Array.isArray(cs) ? cs : []);
      }
      if (tab === 'employee') {
        const es = await api.get<EmployeeItem[]>('/org/employees');
        setEmployees(Array.isArray(es) ? es : []);
        const cs = await api.get<CompanyItem[]>('/org/companies');
        setCompanies(Array.isArray(cs) ? cs : []);
      }
      if (tab === 'business-group') {
        const bgs = await api.get<BusinessGroupItem[]>('/org/business-groups');
        setBgroups(Array.isArray(bgs) ? bgs : []);
        const cs = await api.get<CompanyItem[]>('/org/companies');
        setCompanies(Array.isArray(cs) ? cs : []);
      }
    } catch { } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreate = async () => {
    if (!newName) return;
    try {
      if (tab === 'company') await api.post('/org/companies', { code: newCode, name: newName, type: newType, parentId: newParent || undefined });
      if (tab === 'dept') await api.post('/org/departments', { name: newName, companyId: newCompanyId });
      if (tab === 'employee') await api.post('/org/employees', { name: newName, companyId: newCompanyId, departmentId: newParent });
      if (tab === 'business-group') await api.post('/org/business-groups', { name: newName });
      setShowCreate(false); setNewName(''); setNewCode(''); fetchAll();
    } catch (e: any) { alert(e.message || '创建失败'); }
  };

  const typeLabel = (t: string) => t === 'INTERNAL' ? '内部企业' : '外部企业';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">组织数据</h1>
          <p className="text-sm text-muted-foreground mt-1">管理企业、部门、员工和业务组</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />新建</Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {/* Create modal */}
      {showCreate && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">
            {tab === 'company' ? '新建企业' : tab === 'dept' ? '新建部门' : tab === 'employee' ? '新建员工' : '新建业务组'}
          </h3>
          {tab === 'company' && (
            <>
              <Input placeholder="企业编码（6位/8位）" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
              <select value={newType} onChange={(e) => setNewType(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="INTERNAL">内部企业</option><option value="EXTERNAL">外部企业</option>
              </select>
            </>
          )}
          <Input placeholder="名称" value={newName} onChange={(e) => setNewName(e.target.value)} />
          {(tab === 'dept' || tab === 'employee') && (
            <select value={newCompanyId} onChange={(e) => setNewCompanyId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">选择企业</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
            </select>
          )}
          {tab === 'employee' && (
            <select value={newParent} onChange={(e) => setNewParent(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">选择部门</option>
              {depts.filter((d) => d.companyId === newCompanyId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={handleCreate}>确认</Button>
          </div>
        </Card>
      )}

      {/* Content */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />加载中...</div>
        ) : (
          <>
            {/* 企业列表 */}
            {tab === 'company' && (
              <DataTable headers={['编码', '名称', '类型', '简称', '状态']} rows={companies.map((c) => [
                <span key="co" className="font-mono text-xs">{c.code}</span>,
                <span key="nm" className="font-medium">{c.name}</span>,
                <Badge key="tp" variant={c.type === 'INTERNAL' ? 'default' : 'secondary'} className="text-xs">{typeLabel(c.type)}</Badge>,
                <span key="sn" className="text-muted-foreground">{c.shortName || '—'}</span>,
                <Badge key="st" variant="secondary" className={c.status === 'ACTIVE' ? 'bg-success-bg text-success border-0' : ''}>{c.status === 'ACTIVE' ? '启用' : '停用'}</Badge>,
              ])} empty="暂无企业数据" />
            )}

            {/* 部门列表 */}
            {tab === 'dept' && (
              <DataTable headers={['部门名称', '所属企业', '状态']} rows={depts.map((d) => [
                <span key="nm" className="font-medium">{d.name}</span>,
                <span key="co" className="text-muted-foreground text-xs">{d.company?.code} {d.company?.name}</span>,
                <Badge key="st" variant="secondary" className="bg-success-bg text-success border-0">启用</Badge>,
              ])} empty="暂无部门数据" />
            )}

            {/* 员工列表 */}
            {tab === 'employee' && (
              <DataTable headers={['姓名', '所属企业', '部门', '岗位', '电话']} rows={employees.map((e) => [
                <span key="nm" className="font-medium">{e.name}</span>,
                <span key="co" className="text-muted-foreground text-xs">{e.company?.code}</span>,
                <span key="de" className="text-muted-foreground">{e.department?.name || '—'}</span>,
                <span key="po">{e.position || '—'}</span>,
                <span key="ph" className="text-muted-foreground">{e.phone || '—'}</span>,
              ])} empty="暂无员工数据" />
            )}

            {/* 业务组列表 */}
            {tab === 'business-group' && (
              <DataTable headers={['名称', '关联企业', '说明']} rows={bgroups.map((bg) => [
                <span key="nm" className="font-medium">{bg.name}</span>,
                <span key="cs" className="text-xs text-muted-foreground">{bg.companies?.map((c) => c.company.code).join('、') || '—'}</span>,
                <span key="ds" className="text-muted-foreground">{bg.description || '—'}</span>,
              ])} empty="暂无业务组数据" />
            )}
          </>
        )}
      </Card>
    </div>
  );
}

export default function OrgPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...</div>}>
      <OrgPageInner />
    </Suspense>
  );
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <div className="p-12 text-center text-muted-foreground text-sm">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/50">{headers.map((h) => <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} className="border-b hover:bg-muted/50 transition-colors">{row.map((cell, j) => <td key={j} className="px-4 py-3">{cell}</td>)}</tr>)}</tbody>
      </table>
      <div className="px-4 py-2 text-xs text-muted-foreground border-t">共 {rows.length} 条</div>
    </div>
  );
}
