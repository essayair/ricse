'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, User, Building2, Layers, Phone, Mail, Briefcase, Key, Eye, EyeOff, Save, Check, X, Pencil } from 'lucide-react';
import { api } from '@/lib/api';

interface EmployeeDetail {
  id: string; name: string; position?: string; phone?: string; email?: string;
  company?: { id: string; code: string; name: string };
  department?: { id: string; name: string };
  user?: { id: string; username: string; status: string; role: string; createdAt: string } | null;
}

export default function EmployeeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [emp, setEmp] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Password
  const [showPwdInput, setShowPwdInput] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  // Username edit
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameMsg, setUsernameMsg] = useState('');

  useEffect(() => {
    api.get<EmployeeDetail>(`/org/employees/${id}`)
      .then(setEmp)
      .catch(() => setError('加载员工信息失败'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleUpdateUsername = async () => {
    if (!/^[a-zA-Z0-9]{3,}$/.test(newUsername)) { setUsernameMsg('仅限字母和数字，至少3位'); return; }
    try {
      await api.patch(`/users/${emp!.user!.id}`, { username: newUsername });
      setEditingUsername(false);
      setUsernameMsg('');
      api.get<EmployeeDetail>(`/org/employees/${id}`).then(setEmp).catch(() => {});
    } catch (e: any) { setUsernameMsg(e.message || '修改失败'); }
  };

  const handleSetPassword = async () => {
    if (newPassword.length < 6) { setPwdMsg('密码至少6位'); return; }
    setPwdLoading(true);
    setPwdMsg('');
    try {
      if (emp?.user?.id) {
        await api.patch(`/users/${emp.user.id}/password`, { password: newPassword });
      } else {
        // No account yet — create one
        await api.post('/users', {
          username: emp?.phone || `emp_${id.slice(0, 8)}`,
          password: newPassword,
          name: emp?.name || '',
          role: 'USER',
          employeeId: id,
          companyId: emp?.company?.id,
        });
      }
      setNewPassword('');
      setShowPwdInput(false);
      setPwdMsg('密码设置成功');
      // Reload
      api.get<EmployeeDetail>(`/org/employees/${id}`).then(setEmp).catch(() => {});
    } catch (e: any) { setPwdMsg(e.message || '操作失败'); }
    finally { setPwdLoading(false); }
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

      <div className="grid grid-cols-2 gap-6">
        {/* Employee Info */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <User className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">员工信息</h2>
          </div>
          <div className="space-y-4">
            <InfoRow icon={Building2} label="所属企业" value={`${emp.company?.code || ''} ${emp.company?.name || '—'}`} />
            <InfoRow icon={Layers} label="所属部门" value={emp.department?.name || '—'} />
            <InfoRow icon={Briefcase} label="岗位" value={emp.position || '—'} />
            <InfoRow icon={Phone} label="电话" value={emp.phone || '—'} />
            <InfoRow icon={Mail} label="邮箱" value={emp.email || '—'} />
          </div>
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
                      placeholder="字母+数字，≥3位"
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
                  <span className="font-mono text-sm">
                    {newPassword || '••••••••'}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">账号状态</span>
                <div className="mt-1">
                  <Badge variant="secondary" className={emp.user.status === 'ACTIVE' ? 'bg-success-bg text-success border-0' : ''}>
                    {emp.user.status === 'ACTIVE' ? '正常' : '禁用'}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">创建时间</span>
                <p className="text-sm mt-1">{new Date(emp.user.createdAt).toLocaleString('zh-CN')}</p>
              </div>

              <div className="pt-2 border-t">
                {!showPwdInput ? (
                  <Button variant="outline" size="sm" onClick={() => { setShowPwdInput(true); setPwdMsg(''); }}>
                    <Key className="h-3.5 w-3.5 mr-1" />重置密码
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="输入新密码（≥6位）"
                        className="h-8 text-sm"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSetPassword(); }}
                      />
                      <Button size="sm" onClick={handleSetPassword} disabled={pwdLoading}>
                        <Save className="h-3.5 w-3.5 mr-1" />{pwdLoading ? '...' : '确认'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowPwdInput(false); setNewPassword(''); setPwdMsg(''); }}>
                        取消
                      </Button>
                    </div>
                    {pwdMsg && <p className={`text-xs ${pwdMsg.includes('成功') ? 'text-green-600' : 'text-destructive'}`}>{pwdMsg}</p>}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-warning-bg text-warning rounded-md text-sm">
                该员工尚未开通账号
              </div>
              {!showPwdInput ? (
                <Button variant="outline" size="sm" onClick={() => { setShowPwdInput(true); setPwdMsg(''); }}>
                  <Key className="h-3.5 w-3.5 mr-1" />开通账号
                </Button>
              ) : (
                <div className="space-y-2">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="设置登录密码（≥6位）"
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSetPassword(); }}
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleSetPassword} disabled={pwdLoading}>
                      <Save className="h-3.5 w-3.5 mr-1" />{pwdLoading ? '...' : '开通账号'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowPwdInput(false); setNewPassword(''); setPwdMsg(''); }}>
                      取消
                    </Button>
                  </div>
                  {pwdMsg && <p className={`text-xs ${pwdMsg.includes('成功') ? 'text-green-600' : 'text-destructive'}`}>{pwdMsg}</p>}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
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
