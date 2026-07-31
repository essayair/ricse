'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Users, Loader2, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Permission {
  id: string;
  code: string;
  name: string;
  module: string;
  action: string;
}

interface Role {
  id: string;
  code: string;
  name: string;
  description?: string;
  type: string;
  status: string;
  isSystem: boolean;
  permissions: Array<{ permission: Permission }>;
  _count?: { assignments: number };
}

interface Company {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface User {
  id: string;
  username: string;
  name: string;
  companyId?: string;
  company?: Company | null;
  roleAssignments?: Array<{
    role: Role;
    scopeType: string;
    scopes: Array<{ targetType: string; targetId: string }>;
  }>;
}

const MODULE_LABELS: Record<string, string> = {
  CONTRACT: '合同管理',
  EXECUTION: '执行管理',
  LOGISTICS: '物流管理',
  QUALITY: '质检影像',
  INVENTORY: '库存管理',
  SETTLEMENT: '结算中心',
  MASTER_DATA: '主数据',
  ORGANIZATION: '组织数据',
  SYSTEM: '系统管理',
};

const SCOPE_LABELS: Record<string, string> = {
  ALL: '全部数据',
  COMPANY: '本企业全部数据',
  SPECIFIED_COMPANIES: '指定企业',
  SELF: '本人创建',
  DEPARTMENT: '本部门',
  DEPARTMENT_AND_CHILDREN: '本部门及下级',
};

export default function AccessControlPage() {
  const [tab, setTab] = useState<'roles' | 'users'>('roles');
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(new Set());
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assignmentDraft, setAssignmentDraft] = useState<Record<string, { scopeType: string; targetCompanyIds: string[] }>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [roleData, permissionData, userData, companyData] = await Promise.all([
        api.get<Role[]>('/access-control/roles'),
        api.get<Permission[]>('/access-control/permissions'),
        api.get<User[]>('/users'),
        api.get<Company[]>('/org/companies'),
      ]);
      setRoles(roleData || []);
      setPermissions(permissionData || []);
      setUsers(userData || []);
      setCompanies(companyData || []);
      setSelectedRoleId((current) => current || roleData?.[0]?.id || '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const role = roles.find((item) => item.id === selectedRoleId);
    setSelectedPermissionIds(new Set(role?.permissions.map((item) => item.permission.id) || []));
  }, [roles, selectedRoleId]);

  useEffect(() => {
    const user = users.find((item) => item.id === selectedUserId);
    const draft: Record<string, { scopeType: string; targetCompanyIds: string[] }> = {};
    for (const assignment of user?.roleAssignments || []) {
      draft[assignment.role.id] = {
        scopeType: assignment.scopeType,
        targetCompanyIds: assignment.scopes
          .filter((scope) => scope.targetType === 'COMPANY')
          .map((scope) => scope.targetId),
      };
    }
    setAssignmentDraft(draft);
  }, [selectedUserId, users]);

  const permissionGroups = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    for (const permission of permissions) {
      if (!groups[permission.module]) groups[permission.module] = [];
      groups[permission.module].push(permission);
    }
    return groups;
  }, [permissions]);

  const filteredUsers = users.filter((user) =>
    !search || `${user.name}${user.username}${user.company?.name || ''}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedUser = users.find((user) => user.id === selectedUserId);
  const isExternal = selectedUser?.company?.type === 'EXTERNAL';
  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const adminRoleLocked = selectedRole?.code === 'ADMIN';
  const allPermissionsSelected = adminRoleLocked || (
    permissions.length > 0
    && permissions.every((permission) => selectedPermissionIds.has(permission.id))
  );
  const selectedPermissionCount = adminRoleLocked
    ? permissions.length
    : permissions.filter((permission) => selectedPermissionIds.has(permission.id)).length;

  const toggleAllPermissions = () => {
    if (adminRoleLocked || permissions.length === 0) return;
    setSelectedPermissionIds(
      allPermissionsSelected
        ? new Set()
        : new Set(permissions.map((permission) => permission.id)),
    );
  };

  const saveRolePermissions = async () => {
    if (!selectedRoleId) return;
    setSaving(true);
    try {
      await api.put(`/access-control/roles/${selectedRoleId}/permissions`, {
        permissionIds: [...selectedPermissionIds],
      });
      await load();
      alert('角色权限已保存');
    } catch (error: any) {
      alert(error.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleUserRole = (roleId: string) => {
    setAssignmentDraft((current) => {
      const next = { ...current };
      if (next[roleId]) {
        delete next[roleId];
      } else {
        next[roleId] = {
          scopeType: isExternal ? 'COMPANY' : 'ALL',
          targetCompanyIds: isExternal && selectedUser?.companyId ? [selectedUser.companyId] : [],
        };
      }
      return next;
    });
  };

  const saveUserAssignments = async () => {
    if (!selectedUserId) return;
    const assignments = Object.entries(assignmentDraft).map(([roleId, value]) => ({
      roleId,
      scopeType: isExternal ? 'COMPANY' : value.scopeType,
      targetCompanyIds: isExternal && selectedUser?.companyId
        ? [selectedUser.companyId]
        : value.targetCompanyIds,
    }));
    if (!assignments.length) {
      alert('用户至少需要一个角色');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/access-control/users/${selectedUserId}/assignments`, { assignments });
      await load();
      alert('用户授权已保存');
    } catch (error: any) {
      alert(error.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载权限数据...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">用户与权限</h1>
        <p className="mt-1 text-sm text-muted-foreground">角色决定可以做什么，数据范围决定可以管理哪些企业的数据</p>
      </div>

      <div className="flex gap-2 border-b">
        <button onClick={() => setTab('roles')} className={`flex items-center gap-2 px-4 py-2 text-sm ${tab === 'roles' ? 'border-b-2 border-primary font-medium text-primary' : 'text-muted-foreground'}`}>
          <ShieldCheck className="h-4 w-4" />角色权限
        </button>
        <button onClick={() => setTab('users')} className={`flex items-center gap-2 px-4 py-2 text-sm ${tab === 'users' ? 'border-b-2 border-primary font-medium text-primary' : 'text-muted-foreground'}`}>
          <Users className="h-4 w-4" />用户授权
        </button>
      </div>

      {tab === 'roles' ? (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <Card className="p-3">
            <div className="space-y-1">
              {roles.map((role) => (
                <button key={role.id} onClick={() => setSelectedRoleId(role.id)}
                  className={`w-full rounded-md px-3 py-3 text-left ${selectedRoleId === role.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{role.name}</span>
                    {role.isSystem && <Badge variant="outline">预置</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{role.code} · {role._count?.assignments || 0} 人</div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{selectedRole?.name || '角色'}权限</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedRole?.description || '勾选该角色允许执行的功能操作'}
                </p>
              </div>
              <Button onClick={saveRolePermissions} disabled={saving || adminRoleLocked}><Save className="mr-2 h-4 w-4" />保存权限</Button>
            </div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3">
              <label className={`flex items-center gap-2 text-sm font-medium ${adminRoleLocked ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={allPermissionsSelected}
                  disabled={adminRoleLocked || permissions.length === 0}
                  onChange={toggleAllPermissions}
                />
                {allPermissionsSelected ? '取消全选' : '全选全部权限'}
              </label>
              <span className="text-sm text-muted-foreground">
                已选择 {selectedPermissionCount} / {permissions.length} 项
                {adminRoleLocked ? ' · 系统管理员固定拥有全部权限' : ''}
              </span>
            </div>
            <div className="space-y-5">
              {Object.entries(permissionGroups).map(([module, items]) => (
                <div key={module}>
                  <div className="mb-2 text-sm font-medium">{MODULE_LABELS[module] || module}</div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((permission) => (
                      <label key={permission.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted/50">
                        <input type="checkbox" checked={adminRoleLocked || selectedPermissionIds.has(permission.id)} disabled={adminRoleLocked}
                          onChange={(event) => setSelectedPermissionIds((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(permission.id); else next.delete(permission.id);
                            return next;
                          })} />
                        <span>{permission.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{permission.action}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <Card className="p-3">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索姓名、账号或企业" className="mb-3" />
            <div className="max-h-[620px] space-y-1 overflow-y-auto">
              {filteredUsers.map((user) => (
                <button key={user.id} onClick={() => setSelectedUserId(user.id)}
                  className={`w-full rounded-md px-3 py-3 text-left ${selectedUserId === user.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
                  <div className="font-medium">{user.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{user.username} · {user.company?.name || '未关联企业'}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            {!selectedUser ? (
              <div className="py-24 text-center text-muted-foreground">请选择需要授权的用户</div>
            ) : (
              <>
                <div className="mb-5 flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold">{selectedUser.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{selectedUser.company?.code} {selectedUser.company?.name}</p>
                    {isExternal && (
                      <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                        外部企业账号的数据范围固定为“本企业全部关联数据”，包括本企业作为买方、卖方或签约方的业务单据。
                      </div>
                    )}
                  </div>
                  <Button onClick={saveUserAssignments} disabled={saving}><Save className="mr-2 h-4 w-4" />保存授权</Button>
                </div>

                <div className="space-y-3">
                  {roles.filter((role) => role.status === 'ACTIVE').map((role) => {
                    const assignment = assignmentDraft[role.id];
                    const unavailableForExternal = isExternal && role.code === 'ADMIN';
                    return (
                      <div key={role.id} className="rounded-lg border p-4">
                        <label className="flex items-center gap-3">
                          <input type="checkbox" checked={Boolean(assignment)} disabled={unavailableForExternal} onChange={() => toggleUserRole(role.id)} />
                          <div>
                            <div className="font-medium">{role.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {role.code}{unavailableForExternal ? ' · 外部账号不可授予' : ''}
                            </div>
                          </div>
                        </label>
                        {assignment && (
                          <div className="mt-3 border-t pt-3">
                            {isExternal ? (
                              <Badge variant="secondary">本企业全部关联数据</Badge>
                            ) : (
                              <div className="space-y-3">
                                <select value={assignment.scopeType}
                                  onChange={(event) => setAssignmentDraft((current) => ({
                                    ...current,
                                    [role.id]: { ...current[role.id], scopeType: event.target.value, targetCompanyIds: [] },
                                  }))}
                                  className="h-9 rounded-md border bg-background px-3 text-sm">
                                  {['ALL', 'COMPANY', 'SPECIFIED_COMPANIES', 'SELF', 'DEPARTMENT', 'DEPARTMENT_AND_CHILDREN'].map((scope) => (
                                    <option key={scope} value={scope}>{SCOPE_LABELS[scope]}</option>
                                  ))}
                                </select>
                                {assignment.scopeType === 'SPECIFIED_COMPANIES' && (
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {companies.filter((company) => company.type === 'INTERNAL').map((company) => (
                                      <label key={company.id} className="flex items-center gap-2 text-sm">
                                        <input type="checkbox" checked={assignment.targetCompanyIds.includes(company.id)}
                                          onChange={(event) => setAssignmentDraft((current) => {
                                            const existing = current[role.id].targetCompanyIds;
                                            return {
                                              ...current,
                                              [role.id]: {
                                                ...current[role.id],
                                                targetCompanyIds: event.target.checked
                                                  ? [...existing, company.id]
                                                  : existing.filter((id) => id !== company.id),
                                              },
                                            };
                                          })} />
                                        {company.code} {company.name}
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
