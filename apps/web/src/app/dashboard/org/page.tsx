'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Building2, Users, Layers, Network, Plus, Loader2, ChevronDown, ChevronRight, Trash2, Check, X, Pencil, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { api } from '@/lib/api';

type TabKey = 'company' | 'dept' | 'employee' | 'business-group' | 'users';

interface CompanyItem { id: string; code: string; name: string; shortName?: string; type: string; status: string; partner?: { id: string; code: string; name: string } | null; departments?: { id: string; name: string }[]; _count?: { departments: number; employees: number; users: number } }
interface DeptItem { id: string; name: string; companyId: string; sort: number; company?: { code: string; name: string }; parentId?: string }
interface EmployeeItem { id: string; name: string; departmentId: string; companyId: string; position?: string; phone?: string; email?: string; status: string; department?: { name: string }; company?: { code: string; name: string }; user?: { id: string; username: string; status: string } | null }
interface BusinessGroupItem { id: string; name: string; description?: string; companies?: { company: { id: string; code: string; name: string } }[] }
interface UserItem {
  id: string; username: string; name: string; role: string; status: string;
  employeeId?: string; companyId?: string; businessGroupId?: string;
  employee?: { name: string; department?: { name: string } } | null;
  company?: { code: string; name: string; type?: string } | null;
  roleAssignments?: Array<{
    scopeType: string;
    role: { id: string; code: string; name: string };
    scopes: Array<{ targetType: string; targetId: string }>;
  }>;
}

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'company', label: '企业维护', icon: Building2 },
  { key: 'dept', label: '部门管理', icon: Layers },
  { key: 'employee', label: '员工管理', icon: Users },
  { key: 'business-group', label: '业务组', icon: Network },
  { key: 'users', label: '用户账号', icon: Users },
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

  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [depts, setDepts] = useState<DeptItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [bgroups, setBgroups] = useState<BusinessGroupItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);

  // Company create
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [partnerList, setPartnerList] = useState<Array<{id:string;code:string;name:string;isInternal:boolean;taxId?:string;contactPerson?:string}>>([]);
  const [selectedPartner, setSelectedPartner] = useState<{id:string;code:string;name:string;isInternal:boolean;taxId?:string;contactPerson?:string}|null>(null);

  // Dept management
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [deptCompanyMap, setDeptCompanyMap] = useState<Record<string, DeptItem[]>>({});
  const [newDeptName, setNewDeptName] = useState<Record<string, string>>({});
  const [editingDept, setEditingDept] = useState<{id: string; name: string} | null>(null);

  // Employee management (by company)
  const [expandedEmpCompanies, setExpandedEmpCompanies] = useState<Set<string>>(new Set());
  const [empCompanyMap, setEmpCompanyMap] = useState<Record<string, EmployeeItem[]>>({});

  // User management (by company)
  const [expandedUserCompanies, setExpandedUserCompanies] = useState<Set<string>>(new Set());
  const [userCompanyMap, setUserCompanyMap] = useState<Record<string, UserItem[]>>({});

  // Generic create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newParent, setNewParent] = useState('');
  const [newCompanyId, setNewCompanyId] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newBgroupId, setNewBgroupId] = useState('');
  const [partnerLoading, setPartnerLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'dept') {
        // Load companies with departments
        const cs = await api.get<CompanyItem[]>('/org/companies');
        const companyList = Array.isArray(cs) ? cs : [];
        setCompanies(companyList);
        // Load all departments grouped by company
        const ds = await api.get<DeptItem[]>('/org/departments');
        const allDepts = Array.isArray(ds) ? ds : [];
        setDepts(allDepts);
        const map: Record<string, DeptItem[]> = {};
        for (const d of allDepts) {
          if (!map[d.companyId]) map[d.companyId] = [];
          map[d.companyId].push(d);
        }
        setDeptCompanyMap(map);
      }
      if (tab === 'company') {
        const cs = await api.get<CompanyItem[]>('/org/companies');
        setCompanies(Array.isArray(cs) ? cs : []);
      }
      if (tab === 'employee') {
        const es = await api.get<EmployeeItem[]>('/org/employees');
        const empList = Array.isArray(es) ? es : [];
        setEmployees(empList);
        const cs = await api.get<CompanyItem[]>('/org/companies');
        setCompanies(Array.isArray(cs) ? cs : []);
        const ds = await api.get<DeptItem[]>('/org/departments');
        setDepts(Array.isArray(ds) ? ds : []);
        // Build employee-company map
        const empMap: Record<string, EmployeeItem[]> = {};
        for (const e of empList) {
          if (!empMap[e.companyId]) empMap[e.companyId] = [];
          empMap[e.companyId].push(e);
        }
        setEmpCompanyMap(empMap);
      }
      if (tab === 'business-group') {
        const bgs = await api.get<BusinessGroupItem[]>('/org/business-groups');
        setBgroups(Array.isArray(bgs) ? bgs : []);
        const cs = await api.get<CompanyItem[]>('/org/companies');
        setCompanies(Array.isArray(cs) ? cs : []);
      }
      if (tab === 'users') {
        const us = await api.get<UserItem[]>('/users');
        const userList = Array.isArray(us) ? us : [];
        setUsers(userList);
        const cs = await api.get<CompanyItem[]>('/org/companies');
        const companyList = Array.isArray(cs) ? cs : [];
        setCompanies(companyList);
        const bgs = await api.get<BusinessGroupItem[]>('/org/business-groups');
        setBgroups(Array.isArray(bgs) ? bgs : []);
        const es = await api.get<EmployeeItem[]>('/org/employees');
        setEmployees(Array.isArray(es) ? es : []);
        // Build user-company map
        const uMap: Record<string, UserItem[]> = {};
        for (const u of userList) {
          if (!uMap[u.companyId || '_none']) uMap[u.companyId || '_none'] = [];
          uMap[u.companyId || '_none'].push(u);
        }
        setUserCompanyMap(uMap);
        // Default expand 和光云链 (code 300001)
        const hgyl = companyList.find((c) => c.code === '300001');
        if (hgyl) setExpandedUserCompanies(new Set([hgyl.id]));
      }
    } catch { } finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ----- Company create -----
  const handleCreateCompany = async () => {
    if (!selectedPartner) { alert('请先选择一个合作伙伴'); return; }
    try {
      await api.post('/org/companies', { partnerId: selectedPartner.id });
      setShowCreateCompany(false);
      setSelectedPartner(null);
      fetchAll();
    } catch (e: any) { alert(e.message || '创建失败'); }
  };

  // ----- Department management -----
  const toggleCompany = (companyId: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

  const toggleEmpCompany = (companyId: string) => {
    setExpandedEmpCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

  const toggleUserCompany = (companyId: string) => {
    setExpandedUserCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

  const handleCreateDept = async (companyId: string) => {
    const name = newDeptName[companyId]?.trim();
    if (!name) return;
    const existing = deptCompanyMap[companyId] || [];
    const nextSort = existing.length > 0 ? Math.max(...existing.map((d) => d.sort)) + 1 : 0;
    try {
      await api.post('/org/departments', { name, companyId, sort: nextSort });
      setNewDeptName((prev) => ({ ...prev, [companyId]: '' }));
      fetchAll();
    } catch (e: any) { alert(e.message || '创建失败'); }
  };

  const moveDept = async (companyId: string, deptId: string, direction: 'up' | 'down') => {
    const depts = [...(deptCompanyMap[companyId] || [])].sort((a, b) => a.sort - b.sort);
    const idx = depts.findIndex((d) => d.id === deptId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= depts.length) return;
    // Swap sort values
    const temp = depts[idx].sort;
    depts[idx] = { ...depts[idx], sort: depts[swapIdx].sort };
    depts[swapIdx] = { ...depts[swapIdx], sort: temp };
    const orderedIds = depts.sort((a, b) => a.sort - b.sort).map((d) => d.id);
    try {
      await api.patch('/org/departments/reorder', { companyId, orderedIds });
      fetchAll();
    } catch (e: any) { alert(e.message || '排序失败'); }
  };

  const handleDeleteDept = async (deptId: string) => {
    if (!confirm('确定删除该部门？')) return;
    try {
      await api.delete(`/org/departments/${deptId}`);
      fetchAll();
    } catch (e: any) { alert(e.message || '删除失败'); }
  };

  const handleRenameDept = async () => {
    if (!editingDept || !editingDept.name.trim()) return;
    try {
      await api.patch(`/org/departments/${editingDept.id}`, { name: editingDept.name.trim() });
      setEditingDept(null);
      fetchAll();
    } catch (e: any) { alert(e.message || '修改失败'); }
  };

  const handleCreate = async () => {
    try {
      if (tab === 'company') {
        if (!selectedPartner) { alert('请先选择一个合作伙伴'); return; }
        await api.post('/org/companies', { partnerId: selectedPartner.id, parentId: newParent || undefined });
      }
      if (tab === 'dept') {
        if (!newName || !newCompanyId) { alert('请选择企业并填写部门名称'); return; }
        await api.post('/org/departments', { name: newName, companyId: newCompanyId });
      }
      if (tab === 'employee') {
        if (!newName || !newParent) { alert('请选择部门和填写员工姓名'); return; }
        await api.post('/org/employees', { name: newName, companyId: newCompanyId, departmentId: newParent });
      }
      if (tab === 'business-group') {
        if (!newName) { alert('请填写业务组名称'); return; }
        await api.post('/org/business-groups', { name: newName });
      }
      if (tab === 'users') {
        if (!newCompanyId || !newParent) { alert('请选择企业和员工'); return; }
        if (!newUsername || !/^[a-zA-Z0-9]{3,}$/.test(newUsername)) { alert('用户名只能包含字母和数字，至少3位'); return; }
        if (!newPassword || newPassword.length < 6) { alert('密码至少6位'); return; }
        const emp = employees.find((e) => e.id === newParent);
        await api.post('/users', {
          username: newUsername, password: newPassword,
          name: newName || emp?.name || newUsername,
          role: 'USER',
          employeeId: newParent,
          companyId: newCompanyId,
          businessGroupId: newBgroupId || undefined,
        });
      }
      setShowCreate(false); setNewName(''); setNewCode(''); setNewParent(''); setNewCompanyId(''); setNewUsername(''); setNewPassword(''); setNewBgroupId(''); fetchAll();
    } catch (e: any) { alert(e.message || '创建失败'); }
  };

  // User row renderer (used in company-grouped view)
  const renderUserRow = (u: UserItem) => (
    <tr key={u.id} className="border-b hover:bg-muted/50 transition-colors">
      <td className="px-4 py-2.5 font-mono text-sm">{u.username}</td>
      <td className="px-4 py-2.5 font-medium">
        <div>{u.name}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {(u.roleAssignments?.length
            ? u.roleAssignments.map((assignment) => assignment.role.name)
            : [u.role === 'ADMIN' ? '系统管理员' : u.role === 'MANAGER' ? '管理人员' : '普通用户']
          ).map((name) => <Badge key={name} variant="outline" className="text-[10px] font-normal">{name}</Badge>)}
        </div>
        {u.company?.type === 'EXTERNAL' && (
          <div className="mt-1 text-[10px] font-normal text-blue-600">本企业全部关联数据</div>
        )}
      </td>
      <td className="px-4 py-2.5 text-muted-foreground text-xs">
        {u.employee ? <Link href={`/dashboard/org/employees/${u.employeeId}`} className="hover:text-primary hover:underline">{u.employee.name}</Link> : '—'}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">{u.employee?.department?.name || '—'}</td>
      <td className="px-4 py-2.5">
        <Badge variant="secondary" className={u.status === 'ACTIVE' ? 'bg-success-bg text-success border-0' : ''}>{u.status === 'ACTIVE' ? '正常' : '禁用'}</Badge>
      </td>
      <td className="px-4 py-2.5">
        <button onClick={async () => {
          const newStatus = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
          try { await api.patch(`/users/${u.id}`, { status: newStatus }); fetchAll(); }
          catch (err: any) { alert(err.message || '操作失败'); }
        }} className="text-xs text-primary hover:underline whitespace-nowrap">
          {u.status === 'ACTIVE' ? '禁用' : '启用'}
        </button>
      </td>
    </tr>
  );

  const renderUserCompany = (company: CompanyItem) => {
    const isExpanded = expandedUserCompanies.has(company.id);
    const companyUsers = userCompanyMap[company.id] || [];
    return (
      <div key={company.id} className="bg-background">
        <button
          onClick={() => toggleUserCompany(company.id)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">{company.code}</span>
          <span className="font-medium text-sm flex-1">{company.name}</span>
          <span className="text-xs text-muted-foreground shrink-0">{companyUsers.length} 个账号</span>
        </button>
        {isExpanded && (
          <div className="bg-muted/20 border-t">
            {companyUsers.length === 0 ? (
              <div className="px-8 py-4 text-sm text-muted-foreground">暂无账号</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">用户名</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">姓名</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">关联员工</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">部门</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">状态</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {companyUsers.map((u) => renderUserRow(u))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    );
  };

  const typeLabel = (t: string) => t === 'INTERNAL' ? '内部企业' : '外部企业';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">组织数据</h1>
          <p className="text-sm text-muted-foreground mt-1">管理企业、部门、员工和业务组</p>
        </div>
        {tab === 'dept' ? (
          <Button onClick={async () => {
            setPartnerLoading(true);
            try {
              const ps = await api.get<{ items: any[] }>('/partners');
              setPartnerList(Array.isArray(ps?.items) ? ps.items : (Array.isArray(ps) ? ps : []));
              setShowCreateCompany(true); setSelectedPartner(null);
            } catch (e: any) { alert('加载合作伙伴失败: ' + (e.message || '未知错误')); }
            finally { setPartnerLoading(false); }
          }}><Plus className="h-4 w-4 mr-1" />创建公司</Button>
        ) : (
          <Button onClick={async () => {
            if (tab === 'company') {
              setPartnerLoading(true);
              try {
                const ps = await api.get<{ items: any[] }>('/partners');
                setPartnerList(Array.isArray(ps?.items) ? ps.items : (Array.isArray(ps) ? ps : []));
              } catch (e: any) { alert('加载合作伙伴失败: ' + (e.message || '未知错误')); return; }
              finally { setPartnerLoading(false); }
            }
            setNewName(''); setNewParent(''); setNewCompanyId(''); setNewUsername(''); setNewPassword(''); setNewBgroupId('');
            setShowCreate(true); setSelectedPartner(null);
          }}><Plus className="h-4 w-4 mr-1" />新建</Button>
        )}
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

      {/* ---- Company create modal (dept tab) ---- */}
      {showCreateCompany && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">新建企业 — 从合作伙伴导入</h3>
          {partnerLoading ? (
            <div className="py-4 text-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />加载合作伙伴列表...</div>
          ) : partnerList.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground text-sm">暂无可用的合作伙伴，请先在“主数据管理”中创建合作伙伴</div>
          ) : (
            <select
              value={selectedPartner?.id || ''}
              onChange={(e) => {
                const p = partnerList.find((p) => p.id === e.target.value);
                setSelectedPartner(p || null);
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">选择合作伙伴...</option>
              {partnerList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name} ({p.isInternal ? '内部' : '外部'})
                </option>
              ))}
            </select>
          )}
          {selectedPartner && (
            <div className="grid grid-cols-2 gap-2 p-3 bg-muted/30 rounded-lg text-sm">
              <div><span className="text-muted-foreground">编码：</span><span className="font-mono">{selectedPartner.code}</span></div>
              <div><span className="text-muted-foreground">性质：</span>{selectedPartner.isInternal ? '内部企业' : '外部单位'}</div>
              <div className="col-span-2"><span className="text-muted-foreground">名称：</span>{selectedPartner.name}</div>
              {selectedPartner.taxId && <div className="col-span-2"><span className="text-muted-foreground">信用代码：</span><span className="font-mono text-xs">{selectedPartner.taxId}</span></div>}
              {selectedPartner.contactPerson && <div><span className="text-muted-foreground">联系人：</span>{selectedPartner.contactPerson}</div>}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setShowCreateCompany(false); setSelectedPartner(null); }}>取消</Button>
            <Button onClick={handleCreateCompany} disabled={!selectedPartner}>确认创建</Button>
          </div>
        </Card>
      )}

      {/* ---- Generic create modal ---- */}
      {showCreate && tab !== 'company' && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">
            {tab === 'dept' ? '新建部门' : tab === 'employee' ? '新建员工' : tab === 'users' ? '开通账号' : '新建业务组'}
          </h3>

          {/* dept: company selector first, then name */}
          {tab === 'dept' && (
            <>
              <select value={newCompanyId} onChange={(e) => { setNewCompanyId(e.target.value); setNewName(''); }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">1. 选择所属企业</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
              </select>
              {newCompanyId && (
                <Input placeholder="2. 输入部门名称" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              )}
            </>
          )}

          {/* employee: company first, then dept, then name */}
          {tab === 'employee' && (
            <>
              <select value={newCompanyId} onChange={(e) => { setNewCompanyId(e.target.value); setNewParent(''); setNewName(''); }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">1. 选择所属企业</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
              </select>
              {newCompanyId && (
                <select value={newParent} onChange={(e) => setNewParent(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">2. 选择所属部门</option>
                  {depts.filter((d) => d.companyId === newCompanyId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
              {newParent && (
                <Input placeholder="3. 输入员工姓名" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              )}
            </>
          )}

          {/* users: company → employee → username + password */}
          {tab === 'users' && (
            <>
              <select value={newCompanyId} onChange={(e) => { setNewCompanyId(e.target.value); setNewParent(''); }}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">1. 选择所属企业</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
              </select>
              {newCompanyId && (
                <select value={newParent} onChange={(e) => setNewParent(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">2. 选择关联员工（必选）</option>
                  {employees.filter((e) => e.companyId === newCompanyId && !users.some((u) => u.employeeId === e.id)).map((e) => (
                    <option key={e.id} value={e.id}>{e.name} {e.department?.name ? `· ${e.department.name}` : ''}</option>
                  ))}
                </select>
              )}
              {newParent && (
                <>
                  <div className="text-xs text-muted-foreground -mb-1 mt-1">仅限字母和数字，至少3位</div>
                  <Input placeholder="3. 设置用户名（字母+数字）" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoFocus />
                  <div className="text-xs text-muted-foreground -mb-1 mt-1">密码至少6位</div>
                  <Input placeholder="4. 设置密码" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  <Input placeholder="5. 显示名称（可选，默认取员工姓名）" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <select value={newBgroupId} onChange={(e) => setNewBgroupId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">选择业务组（可选）</option>
                    {bgroups.map((bg) => <option key={bg.id} value={bg.id}>{bg.name}</option>)}
                  </select>
                </>
              )}
            </>
          )}

          {/* business-group: just name */}
          {tab === 'business-group' && (
            <Input placeholder="业务组名称" value={newName} onChange={(e) => setNewName(e.target.value)} />
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setShowCreate(false); setNewParent(''); setNewCompanyId(''); }}>取消</Button>
            <Button
              onClick={handleCreate}
              disabled={
                (tab === 'dept' && (!newCompanyId || !newName)) ||
                (tab === 'employee' && (!newParent || !newName)) ||
                (tab === 'users' && (!newCompanyId || !newParent || !newUsername || !newPassword)) ||
                (tab === 'business-group' && !newName)
              }
            >确认</Button>
          </div>
        </Card>
      )}

      {/* ---- Company tab create modal ---- */}
      {showCreate && tab === 'company' && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">新建企业 — 从合作伙伴导入</h3>
          {partnerLoading ? (
            <div className="py-4 text-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />加载合作伙伴列表...</div>
          ) : partnerList.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground text-sm">暂无可用的合作伙伴，请先在“主数据管理”中创建合作伙伴</div>
          ) : (
            <select
              value={selectedPartner?.id || ''}
              onChange={(e) => {
                const p = partnerList.find((p) => p.id === e.target.value);
                setSelectedPartner(p || null);
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">选择合作伙伴...</option>
              {partnerList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name} ({p.isInternal ? '内部' : '外部'})
                </option>
              ))}
            </select>
          )}
          {selectedPartner && (
            <div className="grid grid-cols-2 gap-2 p-3 bg-muted/30 rounded-lg text-sm">
              <div><span className="text-muted-foreground">编码：</span><span className="font-mono">{selectedPartner.code}</span></div>
              <div><span className="text-muted-foreground">性质：</span>{selectedPartner.isInternal ? '内部企业' : '外部单位'}</div>
              <div className="col-span-2"><span className="text-muted-foreground">名称：</span>{selectedPartner.name}</div>
              {selectedPartner.taxId && <div className="col-span-2"><span className="text-muted-foreground">信用代码：</span><span className="font-mono text-xs">{selectedPartner.taxId}</span></div>}
              {selectedPartner.contactPerson && <div><span className="text-muted-foreground">联系人：</span>{selectedPartner.contactPerson}</div>}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={!selectedPartner}>确认</Button>
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
              <DataTable headers={['编码', '名称 / 合作伙伴', '类型', '组织规模', '状态', '操作']} rows={companies.map((c) => [
                <span key="co" className="font-mono text-xs">{c.code}</span>,
                <div key="nm"><div className="font-medium">{c.name}</div><div className="mt-1 text-xs text-muted-foreground">{c.shortName || c.partner?.name || '—'}</div></div>,
                <Badge key="tp" variant={c.type === 'INTERNAL' ? 'default' : 'secondary'} className="text-xs">{typeLabel(c.type)}</Badge>,
                <div key="sz" className="text-xs"><div>{c._count?.departments ?? c.departments?.length ?? 0} 个部门 · {c._count?.employees ?? 0} 名员工</div><div className="mt-1 text-muted-foreground">{c._count?.users ?? 0} 个账号</div></div>,
                <Badge key="st" variant="secondary" className={c.status === 'ACTIVE' ? 'bg-success-bg text-success border-0' : ''}>{c.status === 'ACTIVE' ? '启用' : '停用'}</Badge>,
                <button key="op" onClick={async () => {
                  const newStatus = c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
                  try {
                    await api.patch(`/org/companies/${c.id}`, { status: newStatus });
                    fetchAll();
                  } catch (e: any) { alert(e.message || '操作失败'); }
                }} className="text-xs text-primary hover:underline">
                  {c.status === 'ACTIVE' ? '停用' : '启用'}
                </button>,
              ])} empty="暂无企业数据" />
            )}

            {/* ===== 部门管理（新设计：公司可展开）===== */}
            {tab === 'dept' && (
              <div className="divide-y">
                {companies.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground text-sm">暂未创建企业，点击右上角“创建公司”开始</div>
                ) : (
                  companies.map((company) => {
                    const isExpanded = expandedCompanies.has(company.id);
                    const companyDepts = deptCompanyMap[company.id] || [];
                    return (
                      <div key={company.id} className="bg-background">
                        {/* Company header */}
                        <button
                          onClick={() => toggleCompany(company.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">{company.code}</span>
                          <span className="font-medium text-sm flex-1">{company.name}</span>
                          <Badge variant={company.type === 'INTERNAL' ? 'default' : 'secondary'} className="text-xs shrink-0">{typeLabel(company.type)}</Badge>
                          <span className="text-xs text-muted-foreground shrink-0">{companyDepts.length} 个部门</span>
                        </button>

                        {/* Expanded: departments */}
                        {isExpanded && (
                          <div className="bg-muted/20 border-t">
                            {/* Existing departments */}
                            {companyDepts.length > 0 && (
                              <div className="px-8 py-2 space-y-1">
                                {[...companyDepts].sort((a, b) => a.sort - b.sort).map((dept, idx, sorted) => (
                                  <div key={dept.id} className="flex items-center gap-2 py-1.5 group">
                                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                                    <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    {editingDept?.id === dept.id ? (
                                      <>
                                        <Input
                                          value={editingDept.name}
                                          onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })}
                                          className="h-7 flex-1 text-sm"
                                          autoFocus
                                          onKeyDown={(e) => { if (e.key === 'Enter') handleRenameDept(); if (e.key === 'Escape') setEditingDept(null); }}
                                        />
                                        <button onClick={handleRenameDept} className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600"><Check className="h-3.5 w-3.5" /></button>
                                        <button onClick={() => setEditingDept(null)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-sm flex-1">{dept.name}</span>
                                        {/* Move up/down */}
                                        <button
                                          onClick={() => moveDept(dept.companyId, dept.id, 'up')}
                                          disabled={idx === 0}
                                          className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-20 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <ArrowUp className="h-3 w-3" />
                                        </button>
                                        <button
                                          onClick={() => moveDept(dept.companyId, dept.id, 'down')}
                                          disabled={idx === sorted.length - 1}
                                          className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-20 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <ArrowDown className="h-3 w-3" />
                                        </button>
                                        <button
                                          onClick={() => setEditingDept({ id: dept.id, name: dept.name })}
                                          className="p-1 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteDept(dept.id)}
                                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Add new department */}
                            <div className="px-8 py-2 flex items-center gap-2">
                              <Input
                                value={newDeptName[company.id] || ''}
                                onChange={(e) => setNewDeptName((prev) => ({ ...prev, [company.id]: e.target.value }))}
                                placeholder="输入新部门名称"
                                className="h-8 text-sm flex-1"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateDept(company.id); }}
                              />
                              <Button
                                size="sm" variant="outline"
                                onClick={() => handleCreateDept(company.id)}
                                className="h-8"
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />添加
                              </Button>
                            </div>
                            <div className="h-3" />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div className="px-4 py-2 text-xs text-muted-foreground">共 {companies.length} 家企业</div>
              </div>
            )}

            {/* ===== 员工管理（按企业展开）===== */}
            {tab === 'employee' && (
              <div className="divide-y">
                {companies.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground text-sm">暂未创建企业</div>
                ) : (
                  companies.map((company) => {
                    const isExpanded = expandedEmpCompanies.has(company.id);
                    const companyEmps = empCompanyMap[company.id] || [];
                    return (
                      <div key={company.id} className="bg-background">
                        <button
                          onClick={() => toggleEmpCompany(company.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">{company.code}</span>
                          <span className="font-medium text-sm flex-1">{company.name}</span>
                          <Badge variant={company.type === 'INTERNAL' ? 'default' : 'secondary'} className="text-xs shrink-0">{typeLabel(company.type)}</Badge>
                          <span className="text-xs text-muted-foreground shrink-0">{companyEmps.length} 人</span>
                        </button>
                        {isExpanded && (
                          <div className="bg-muted/20 border-t">
                            {companyEmps.length === 0 ? (
                              <div className="px-8 py-4 text-sm text-muted-foreground">暂无员工</div>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b bg-muted/30">
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">姓名</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">部门</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">岗位</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">联系方式</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">账号 / 状态</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">操作</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {companyEmps.map((e) => (
                                    <tr key={e.id} className="border-b hover:bg-muted/50 transition-colors">
                                      <td className="px-4 py-2 font-medium">{e.name}</td>
                                      <td className="px-4 py-2 text-muted-foreground text-xs">{e.department?.name || '—'}</td>
                                      <td className="px-4 py-2">{e.position || '—'}</td>
                                      <td className="px-4 py-2 text-muted-foreground text-xs"><div>{e.phone || '—'}</div><div className="mt-1">{e.email || '无邮箱'}</div></td>
                                      <td className="px-4 py-2 text-xs"><div>{e.user?.username || '未开通'}</div><div className="mt-1 text-muted-foreground">{e.status === 'ACTIVE' ? '在职' : '停用'}{e.user ? ` · ${e.user.status === 'ACTIVE' ? '账号正常' : '账号禁用'}` : ''}</div></td>
                                      <td className="px-4 py-2">
                                        <div className="flex items-center gap-2">
                                          <Link href={`/dashboard/org/employees/${e.id}`} className="text-xs text-primary hover:underline">详情</Link>
                                          <button
                                            onClick={async () => {
                                              if (!confirm(`确定删除员工 ${e.name}？`)) return;
                                              try { await api.delete(`/org/employees/${e.id}`); fetchAll(); }
                                              catch (err: any) { alert(err.message || '删除失败'); }
                                            }}
                                            className="text-xs text-destructive hover:underline"
                                          >删除</button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div className="px-4 py-2 text-xs text-muted-foreground">共 {companies.length} 家企业，{employees.length} 名员工</div>
              </div>
            )}

            {/* ===== 用户账号（按企业划分）===== */}
            {tab === 'users' && (
              <div className="divide-y">
                {companies.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground text-sm">暂未创建企业</div>
                ) : (
                  <>
                    {/* 内部企业 */}
                    {companies.filter((c) => c.type === 'INTERNAL').length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          内部企业
                        </div>
                        {companies.filter((c) => c.type === 'INTERNAL').map((company) => renderUserCompany(company))}
                      </>
                    )}
                    {/* 外部企业 */}
                    {companies.filter((c) => c.type === 'EXTERNAL').length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          外部企业
                        </div>
                        {companies.filter((c) => c.type === 'EXTERNAL').map((company) => renderUserCompany(company))}
                      </>
                    )}
                  </>
                )}
                {/* 未归属企业的用户 */}
                {userCompanyMap['_none'] && userCompanyMap['_none'].length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      未归属
                    </div>
                    <div className="bg-muted/20">
                      <table className="w-full text-sm">
                        <tbody>
                          {userCompanyMap['_none'].map((u) => renderUserRow(u))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <div className="px-4 py-2 text-xs text-muted-foreground">共 {companies.length} 家企业，{users.length} 个账号</div>
              </div>
            )}

            {/* 业务组 */}
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
