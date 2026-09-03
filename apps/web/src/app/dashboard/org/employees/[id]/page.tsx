'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, User, Building2, Layers, Phone, Mail, Briefcase, Key, Eye, EyeOff, Save, Check, X, Pencil } from 'lucide-react';
import { api } from '@/lib/api';

const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,49}$/;
const EMPLOYEE_PHONE_PATTERN = /^1[3-9][0-9]{9}$/;
const EMPLOYEE_STATUS_LABEL: Record<string, string> = { ACTIVE: '在职', DISABLED: '停用', RESIGNED: '离职' };

interface EmployeeDetail {
  id: string; name: string; position?: string; phone?: string; email?: string; status: string;
  company?: { id: string; code: string; name: string };
  department?: { id: string; name: string };
  user?: { id: string; username: string; status: string; role: string; createdAt: string } | null;
}

interface CompanyOption { id: string; code: string; name: string; status: string; type: string }
interface DepartmentOption { id: string; name: string; companyId: string }
interface RoleOption { id: string; code: string; name: string; status: string }
interface OperationLog { id: string; actionLabel: string; createdAt: string; operator?: { name: string; username: string }; details?: { changedFields?: string[] } }

export default function EmployeeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [emp, setEmp] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [selectedRole, setSelectedRole] = useState('USER');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileForm, setProfileForm] = useState({
    name: '', companyId: '', departmentId: '', position: '', phone: '', email: '', status: 'ACTIVE',
  });

  // Password
  const [showPwdInput, setShowPwdInput] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  // Username edit
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameMsg, setUsernameMsg] = useState('');
  // Employee phone edit
  const [editingPhone, setEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phoneMsg, setPhoneMsg] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<EmployeeDetail>(`/org/employees/${id}`),
      api.get<OperationLog[]>(`/org/employees/${id}/operation-logs`).catch(() => []),
    ])
      .then(([employee, logs]) => { setEmp(employee); setOperationLogs(Array.isArray(logs) ? logs : []); })
      .catch(() => setError('加载员工信息失败'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    Promise.all([
      api.get<CompanyOption[]>('/org/companies'),
      api.get<DepartmentOption[]>('/org/departments'),
      api.get<RoleOption[]>('/access-control/roles').catch(() => []),
    ]).then(([companyList, departmentList, roleList]) => {
      setCompanies(Array.isArray(companyList) ? companyList : []);
      setDepartments(Array.isArray(departmentList) ? departmentList : []);
      setRoles(Array.isArray(roleList) ? roleList.filter((role) => role.status === 'ACTIVE') : []);
    }).catch(() => {});
  }, []);

  const startEditingProfile = () => {
    setProfileForm({
      name: emp?.name || '',
      companyId: emp?.company?.id || '',
      departmentId: emp?.department?.id || '',
      position: emp?.position || '',
      phone: emp?.phone || '',
      email: emp?.email || '',
      status: emp?.status || 'ACTIVE',
    });
    setProfileMsg('');
    setEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    if (!profileForm.name.trim()) return setProfileMsg('请填写员工姓名');
    if (!profileForm.companyId || !profileForm.departmentId) return setProfileMsg('请选择所属企业和部门');
    if (!EMPLOYEE_PHONE_PATTERN.test(profileForm.phone)) return setProfileMsg('员工手机号必须为11位中国大陆手机号');
    if (profileForm.status !== emp?.status) {
      const warning = profileForm.status === 'RESIGNED'
        ? `确定办理员工离职？${emp?.user ? '\n关联账号将同步禁用并立即退出登录，历史记录仍会保留。' : ''}`
        : profileForm.status === 'DISABLED'
          ? `确定临时停用员工？${emp?.user ? '\n关联账号将同步禁用并立即退出登录。' : ''}`
          : emp?.status === 'RESIGNED'
            ? `确定设置为重新入职？${emp?.user ? '\n原账号仍保持禁用，需要确认后单独启用。' : ''}`
            : '确定恢复该员工？';
      if (!confirm(warning)) return;
    }
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const updated = await api.patch<EmployeeDetail>(`/org/employees/${id}`, {
        ...profileForm,
        name: profileForm.name.trim(),
        position: profileForm.position.trim(),
        email: profileForm.email.trim(),
      });
      setEmp(updated);
      api.get<OperationLog[]>(`/org/employees/${id}/operation-logs`).then(setOperationLogs).catch(() => {});
      setEditingProfile(false);
      setProfileMsg('员工信息已保存');
    } catch (e: any) {
      setProfileMsg(e.message || '保存失败');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAccountStatus = async () => {
    if (!emp?.user) return;
    const status = emp.user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    if (!confirm(status === 'DISABLED' ? '禁用后该账号现有登录将立即失效，确定继续？' : '确定启用该账号？')) return;
    try {
      await api.patch(`/users/${emp.user.id}`, { status });
      setEmp({ ...emp, user: { ...emp.user, status } });
      api.get<OperationLog[]>(`/org/employees/${id}/operation-logs`).then(setOperationLogs).catch(() => {});
    } catch (e: any) {
      setPwdMsg(e.message || '账号状态修改失败');
    }
  };

  const handleUpdateUsername = async () => {
    if (!USERNAME_PATTERN.test(newUsername.trim())) {
      setUsernameMsg('须以字母或数字开头，支持点、下划线和短横线，长度3-50位');
      return;
    }
    try {
      await api.patch(`/users/${emp!.user!.id}`, { username: newUsername.trim() });
      setEditingUsername(false);
      setUsernameMsg('');
      api.get<EmployeeDetail>(`/org/employees/${id}`).then(setEmp).catch(() => {});
      api.get<OperationLog[]>(`/org/employees/${id}/operation-logs`).then(setOperationLogs).catch(() => {});
    } catch (e: any) { setUsernameMsg(e.message || '修改失败'); }
  };

  const handleSetPassword = async () => {
    if (!emp?.user?.id && !USERNAME_PATTERN.test(newUsername.trim())) {
      setPwdMsg('请填写有效用户名：以字母或数字开头，长度3-50位');
      return;
    }
    if (newPassword.length < 6) { setPwdMsg('密码至少6位'); return; }
    if (newPassword !== confirmPassword) { setPwdMsg('两次输入的密码不一致'); return; }
    setPwdLoading(true);
    setPwdMsg('');
    try {
      if (emp?.user?.id) {
        await api.patch(`/users/${emp.user.id}/password`, { password: newPassword });
      } else {
        await api.post('/users', {
          username: newUsername.trim(),
          password: newPassword,
          name: emp?.name || '',
          role: selectedRole || 'USER',
          employeeId: id,
          companyId: emp?.company?.id,
        });
      }
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowPwdInput(false);
      setPwdMsg(emp?.user?.id ? '密码重置成功' : '账号开通成功');
      // Reload
      api.get<EmployeeDetail>(`/org/employees/${id}`).then(setEmp).catch(() => {});
      api.get<OperationLog[]>(`/org/employees/${id}/operation-logs`).then(setOperationLogs).catch(() => {});
    } catch (e: any) { setPwdMsg(e.message || '操作失败'); }
    finally { setPwdLoading(false); }
  };

  const handleUpdatePhone = async () => {
    if (!EMPLOYEE_PHONE_PATTERN.test(newPhone)) {
      setPhoneMsg('员工手机号必须为11位中国大陆手机号');
      return;
    }
    try {
      const updated = await api.patch<EmployeeDetail>(`/org/employees/${id}`, { phone: newPhone.trim() });
      setEmp(updated);
      setEditingPhone(false);
      setPhoneMsg('');
    } catch (e: any) {
      setPhoneMsg(e.message || '手机号修改失败');
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>;
  if (error || !emp) return <div className="p-8 text-center text-muted-foreground">{error || '员工不存在'}</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{emp.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {emp.company?.code} {emp.company?.name}
              {emp.department && <span> · {emp.department.name}</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Employee Info */}
        <Card className="p-6">
          <div className="flex items-center justify-between gap-2 mb-6">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">员工信息</h2>
            </div>
            {!editingProfile && <Button variant="outline" size="sm" onClick={startEditingProfile}><Pencil className="mr-1 h-3.5 w-3.5" />编辑</Button>}
          </div>
          {editingProfile ? (
            <div className="space-y-3">
              <FormField label="员工姓名 *"><Input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} /></FormField>
              <FormField label="所属企业 *">
                <select value={profileForm.companyId} onChange={(e) => setProfileForm({ ...profileForm, companyId: e.target.value, departmentId: '' })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">选择企业</option>
                  {companies.filter((company) => company.status === 'ACTIVE').map((company) => <option key={company.id} value={company.id}>{company.code} {company.name}</option>)}
                </select>
              </FormField>
              <FormField label="所属部门 *">
                <select value={profileForm.departmentId} onChange={(e) => setProfileForm({ ...profileForm, departmentId: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">选择部门</option>
                  {departments.filter((department) => department.companyId === profileForm.companyId).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </FormField>
              <FormField label="岗位"><Input value={profileForm.position} onChange={(e) => setProfileForm({ ...profileForm, position: e.target.value })} /></FormField>
              <FormField label="手机号 *"><Input type="tel" inputMode="numeric" maxLength={11} value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value.replace(/\D/g, '').slice(0, 11) })} /></FormField>
              <FormField label="邮箱"><Input type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} /></FormField>
              <FormField label="员工状态">
                <select value={profileForm.status} onChange={(e) => setProfileForm({ ...profileForm, status: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="ACTIVE">在职</option><option value="DISABLED">停用</option><option value="RESIGNED">离职</option>
                </select>
              </FormField>
              <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">调整所属企业时，关联账号将同步迁移，非管理员角色的数据范围将重置为新企业。</div>
              {profileMsg && <p className="text-xs text-destructive">{profileMsg}</p>}
              <div className="flex gap-2"><Button size="sm" onClick={handleSaveProfile} disabled={profileSaving}><Save className="mr-1 h-3.5 w-3.5" />{profileSaving ? '保存中...' : '保存'}</Button><Button size="sm" variant="ghost" onClick={() => setEditingProfile(false)}>取消</Button></div>
            </div>
          ) : <div className="space-y-4">
            <InfoRow icon={Building2} label="所属企业" value={`${emp.company?.code || ''} ${emp.company?.name || '—'}`} />
            <InfoRow icon={Layers} label="所属部门" value={emp.department?.name || '—'} />
            <InfoRow icon={Briefcase} label="岗位" value={emp.position || '—'} />
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">手机号</span>
              {editingPhone ? (
                <div className="mt-1">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      type="tel"
                      inputMode="numeric"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      placeholder="输入11位中国大陆手机号"
                      maxLength={11}
                      className="h-8 w-56 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdatePhone();
                        if (e.key === 'Escape') setEditingPhone(false);
                      }}
                    />
                    <button onClick={handleUpdatePhone} className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setEditingPhone(false)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {phoneMsg && <p className="ml-6 mt-1 text-xs text-destructive">{phoneMsg}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{emp.phone || '—'}</span>
                  <button
                    onClick={() => {
                      setNewPhone(emp.phone || '');
                      setPhoneMsg('');
                      setEditingPhone(true);
                    }}
                    className="text-muted-foreground hover:text-foreground ml-1"
                    aria-label="修改手机号"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
            <InfoRow icon={Mail} label="邮箱" value={emp.email || '—'} />
            <div><span className="text-xs text-muted-foreground uppercase tracking-wider">员工状态</span><div className="mt-1"><Badge variant="secondary" className={emp.status === 'ACTIVE' ? 'border-0 bg-success-bg text-success' : emp.status === 'RESIGNED' ? 'border-0 bg-muted text-muted-foreground' : ''}>{EMPLOYEE_STATUS_LABEL[emp.status] || emp.status}</Badge></div></div>
            {profileMsg && <p className="text-xs text-green-600">{profileMsg}</p>}
          </div>}
        </Card>

        {/* Account + Password */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Key className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">账号与密码</h2>
          </div>

          {emp.user ? (
            <div className="space-y-4">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">用户名</span>
                {editingUsername ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="字母或数字开头，3-50位"
                      className="h-8 text-sm w-48"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateUsername(); if (e.key === 'Escape') setEditingUsername(false); }}
                    />
                    <button onClick={handleUpdateUsername} className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600"><Check className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setEditingUsername(false)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-sm">{emp.user.username}</span>
                    <button onClick={() => { setNewUsername(emp.user!.username); setEditingUsername(true); setUsernameMsg(''); }}
                      className="text-muted-foreground hover:text-foreground ml-1">
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {usernameMsg && <p className="text-xs text-destructive mt-1">{usernameMsg}</p>}
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">密码</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-sm">••••••••</span>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">账号状态</span>
                <div className="mt-1">
                  <Badge variant="secondary" className={emp.user.status === 'ACTIVE' ? 'bg-success-bg text-success border-0' : ''}>
                    {emp.user.status === 'ACTIVE' ? '正常' : '禁用'}
                  </Badge>
                  <Button className="ml-3" variant="outline" size="sm" onClick={handleAccountStatus} disabled={emp.user.status !== 'ACTIVE' && emp.status !== 'ACTIVE'}>{emp.user.status === 'ACTIVE' ? '禁用账号' : emp.status === 'ACTIVE' ? '启用账号' : '员工非在职，不能启用'}</Button>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">创建时间</span>
                <p className="text-sm mt-1">{new Date(emp.user.createdAt).toLocaleString('zh-CN')}</p>
              </div>

              <div className="pt-2 border-t">
                {!showPwdInput ? (
                  <Button variant="outline" size="sm" onClick={() => {
                    setShowPwdInput(true);
                    setNewPassword('');
                    setConfirmPassword('');
                    setShowPassword(false);
                    setPwdMsg('');
                  }}>
                    <Key className="h-3.5 w-3.5 mr-1" />重置密码
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="输入新密码（≥6位）"
                        className="h-8 pr-10 text-sm"
                        autoComplete="new-password"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSetPassword(); }}
                      />
                      <button type="button" onClick={() => setShowPassword((current) => !current)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? '隐藏密码' : '显示密码'}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="再次输入新密码"
                      className="h-8 text-sm"
                      autoComplete="new-password"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSetPassword(); }}
                    />
                    {confirmPassword && newPassword !== confirmPassword && (
                      <p className="text-xs text-destructive">两次输入的密码不一致</p>
                    )}
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={handleSetPassword} disabled={pwdLoading || !newPassword || !confirmPassword || newPassword !== confirmPassword}>
                        <Save className="h-3.5 w-3.5 mr-1" />{pwdLoading ? '...' : '确认重置'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowPwdInput(false); setNewPassword(''); setConfirmPassword(''); setShowPassword(false); setPwdMsg(''); }}>
                        取消
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-warning-bg text-warning rounded-md text-sm">
                该员工尚未开通账号
              </div>
              {emp.status !== 'ACTIVE' ? (
                <p className="text-sm text-muted-foreground">员工处于{EMPLOYEE_STATUS_LABEL[emp.status] || emp.status}状态，不能开通账号。</p>
              ) : !showPwdInput ? (
                <Button variant="outline" size="sm" onClick={() => {
                  const phoneSuggestion = (emp.phone || '').replace(/[^a-zA-Z0-9._-]/g, '');
                  setNewUsername(phoneSuggestion.length >= 3 ? phoneSuggestion.slice(0, 50) : '');
                  setNewPassword('');
                  setConfirmPassword('');
                  setShowPassword(false);
                  setSelectedRole('USER');
                  setShowPwdInput(true);
                  setPwdMsg('');
                }}>
                  <Key className="h-3.5 w-3.5 mr-1" />开通账号
                </Button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium">登录用户名</label>
                    <Input
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="字母或数字开头，3-50位"
                      maxLength={50}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <p className="mt-1 text-xs text-muted-foreground">已默认带入员工手机号，可修改；支持字母、数字、点、下划线和短横线</p>
                  </div>
                  {roles.length > 0 && (
                    <div>
                      <label className="mb-1 block text-xs font-medium">初始角色</label>
                      <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm">
                        {roles.filter((role) => role.code !== 'ADMIN' || companies.find((company) => company.id === emp.company?.id)?.type === 'INTERNAL').map((role) => <option key={role.id} value={role.code}>{role.name} · {role.code}</option>)}
                      </select>
                      <p className="mt-1 text-xs text-muted-foreground">初始数据范围为所属企业，后续可在角色权限中调整。</p>
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-xs font-medium">登录密码</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="设置登录密码（≥6位）"
                        className="h-8 pr-10 text-sm"
                        autoComplete="new-password"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSetPassword(); }}
                      />
                      <button type="button" onClick={() => setShowPassword((current) => !current)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? '隐藏密码' : '显示密码'}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">确认密码</label>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="再次输入登录密码"
                      className="h-8 text-sm"
                      autoComplete="new-password"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSetPassword(); }}
                    />
                    {confirmPassword && newPassword !== confirmPassword && (
                      <p className="mt-1 text-xs text-destructive">两次输入的密码不一致</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleSetPassword}
                      disabled={pwdLoading || !newUsername || !newPassword || !confirmPassword || newPassword !== confirmPassword}>
                      <Save className="h-3.5 w-3.5 mr-1" />{pwdLoading ? '...' : '开通账号'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowPwdInput(false); setNewUsername(''); setNewPassword(''); setConfirmPassword(''); setShowPassword(false); setPwdMsg(''); }}>
                      取消
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {pwdMsg && (
            <p className={`mt-3 text-xs ${pwdMsg.includes('成功') ? 'text-green-600' : 'text-destructive'}`}>
              {pwdMsg}
            </p>
          )}
        </Card>
      </div>
      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">档案操作记录</h2>
        {operationLogs.length === 0 ? <p className="text-sm text-muted-foreground">暂无操作记录</p> : (
          <div className="divide-y">
            {operationLogs.map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                <div><span className="font-medium">{log.actionLabel}</span><span className="ml-2 text-muted-foreground">{log.operator?.name || log.operator?.username || '系统管理员'}</span></div>
                <span className="shrink-0 text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString('zh-CN')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-2 mt-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm">{value}</span>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return <div><label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>{children}</div>;
}
