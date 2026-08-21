'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Building2, Link2, Loader2, RefreshCw, Search, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '@/lib/api';

interface BackendAccount {
  id: string;
  username: string;
  name: string;
  status: string;
  company?: { id: string; code: string; name: string; type: string } | null;
  employee?: { id: string; name: string; phone?: string; department?: { id: string; name: string } | null } | null;
  roleAssignments?: Array<{ role: { code: string; name: string } }>;
}

interface PlatformUser {
  id: string;
  nickName?: string;
  avatarUrl?: string;
  phone?: string;
  phoneVerifiedAt?: string;
  source: string;
  status: string;
  lastLogin: string;
  linkedAt?: string;
  createdAt: string;
  openIdMasked: string;
  linkedUser?: BackendAccount | null;
  bindingLogs?: Array<{
    id: string;
    action: string;
    note?: string;
    createdAt: string;
    user: { username: string; name: string; company?: { code: string; name: string } | null };
    operatedBy?: { username: string; name: string } | null;
  }>;
  _count?: { bindingLogs: number };
}

interface PageResult {
  total: number;
  pageNo: number;
  pageSize: number;
  list: PlatformUser[];
}

const actionLabel: Record<string, string> = { BIND: '关联', REBIND: '重新关联', UNBIND: '解除关联' };

export default function UserManagementPage() {
  const [data, setData] = useState<PageResult>({ total: 0, pageNo: 1, pageSize: 20, list: [] });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [bindingStatus, setBindingStatus] = useState('');
  const [pageNo, setPageNo] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<PlatformUser | null>(null);
  const [bindingUser, setBindingUser] = useState<PlatformUser | null>(null);
  const [accounts, setAccounts] = useState<BackendAccount[]>([]);
  const [accountSearch, setAccountSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [bindingNote, setBindingNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageNo: String(pageNo), pageSize: '20' });
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);
      if (bindingStatus) params.set('bindingStatus', bindingStatus);
      setData(await api.get<PageResult>(`/platform-users?${params.toString()}`));
    } catch (error: any) {
      alert(error.message || '加载个人用户失败');
    } finally {
      setLoading(false);
    }
  }, [bindingStatus, pageNo, search, status]);

  useEffect(() => { void load(); }, [load]);

  const loadAccounts = async (identity: PlatformUser, keyword = '') => {
    const params = new URLSearchParams({ currentIdentityId: identity.id });
    if (keyword.trim()) params.set('search', keyword.trim());
    try {
      setAccounts(await api.get<BackendAccount[]>(`/platform-users/linkable-accounts?${params.toString()}`));
    } catch (error: any) {
      alert(error.message || '加载后台账号失败');
    }
  };

  const openBinding = async (user: PlatformUser) => {
    setBindingUser(user);
    setSelectedAccountId(user.linkedUser?.id || '');
    setAccountSearch('');
    setBindingNote('');
    await loadAccounts(user);
  };

  const saveBinding = async () => {
    if (!bindingUser || !selectedAccountId) return alert('请选择后台账号');
    setSaving(true);
    try {
      await api.put(`/platform-users/${bindingUser.id}/backend-account`, {
        userId: selectedAccountId,
        note: bindingNote.trim() || undefined,
      });
      setBindingUser(null);
      await load();
    } catch (error: any) {
      alert(error.message || '关联失败');
    } finally {
      setSaving(false);
    }
  };

  const unbind = async (user: PlatformUser) => {
    if (!user.linkedUser || !confirm(`确认解除与后台账号“${user.linkedUser.username}”的关联吗？解除后小程序将不能访问企业工作台。`)) return;
    const note = window.prompt('解除原因（可选）', '') ?? undefined;
    if (note === undefined) return;
    try {
      await api.delete(`/platform-users/${user.id}/backend-account`, { note: note.trim() || undefined });
      await load();
      if (detail?.id === user.id) setDetail(null);
    } catch (error: any) {
      alert(error.message || '解除关联失败');
    }
  };

  const toggleStatus = async (user: PlatformUser) => {
    const next = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    if (next === 'DISABLED' && !confirm('禁用后，该用户不能使用需要登录的小程序功能，确认继续吗？')) return;
    try {
      await api.patch(`/platform-users/${user.id}`, { status: next });
      await load();
    } catch (error: any) {
      alert(error.message || '操作失败');
    }
  };

  const openDetail = async (id: string) => {
    try { setDetail(await api.get<PlatformUser>(`/platform-users/${id}`)); }
    catch (error: any) { alert(error.message || '加载详情失败'); }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">用户管理中心</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理小程序个人用户，并与现有企业后台账号建立一对一关联</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">个人用户 {data.total}</Badge>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { setPageNo(1); void load(); } }}
              placeholder="搜索昵称、手机号、OpenID、企业、员工或后台用户名" />
          </div>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={bindingStatus}
            onChange={(event) => { setBindingStatus(event.target.value); setPageNo(1); }}>
            <option value="">全部关联状态</option><option value="BOUND">已关联</option><option value="UNBOUND">未关联</option>
          </select>
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status}
            onChange={(event) => { setStatus(event.target.value); setPageNo(1); }}>
            <option value="">全部用户状态</option><option value="ACTIVE">正常</option><option value="DISABLED">禁用</option>
          </select>
          <Button onClick={() => { setPageNo(1); void load(); }}><Search className="mr-1 h-4 w-4" />查询</Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-sm">
            <thead><tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3">个人用户</th><th className="px-4 py-3">手机号</th><th className="px-4 py-3">微信标识</th>
              <th className="px-4 py-3">关联企业/员工</th><th className="px-4 py-3">后台账号/角色</th><th className="px-4 py-3">最近登录</th>
              <th className="px-4 py-3">状态</th><th className="px-4 py-3">操作</th>
            </tr></thead>
            <tbody>
              {loading && data.list.length === 0 ? <tr><td colSpan={8} className="p-10 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中</td></tr>
                : data.list.length === 0 ? <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">暂无小程序个人用户；用户完成微信登录后会自动进入本列表。</td></tr>
                  : data.list.map((user) => (
                    <tr key={user.id} className="border-b align-top hover:bg-muted/20">
                      <td className="px-4 py-3"><button className="text-left font-medium hover:text-primary hover:underline" onClick={() => void openDetail(user.id)}>{user.nickName || '未授权昵称'}</button><div className="mt-1 text-xs text-muted-foreground">注册 {formatDate(user.createdAt)}</div></td>
                      <td className="px-4 py-3">{user.phone || '—'}{user.phoneVerifiedAt && <div className="mt-1 text-xs text-green-600">微信已验证</div>}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{user.openIdMasked}</td>
                      <td className="px-4 py-3">{user.linkedUser?.company ? <><div>{user.linkedUser.company.code} {user.linkedUser.company.name}</div><div className="mt-1 text-xs text-muted-foreground">{user.linkedUser.employee?.name || '—'} · {user.linkedUser.employee?.department?.name || '未分部门'}</div></> : '—'}</td>
                      <td className="px-4 py-3">{user.linkedUser ? <><div className="font-mono">{user.linkedUser.username}</div><div className="mt-1 flex flex-wrap gap-1">{user.linkedUser.roleAssignments?.map((item) => <Badge key={item.role.code} variant="outline" className="text-[10px]">{item.role.name}</Badge>)}</div></> : <Badge variant="secondary">未关联</Badge>}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(user.lastLogin)}</td>
                      <td className="px-4 py-3"><Badge className={user.status === 'ACTIVE' ? 'border-0 bg-success-bg text-success' : ''} variant="secondary">{user.status === 'ACTIVE' ? '正常' : '禁用'}</Badge></td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-x-3 gap-y-2">
                        <button className="text-xs text-primary hover:underline" onClick={() => void openBinding(user)}>{user.linkedUser ? '重新关联' : '关联账号'}</button>
                        {user.linkedUser && <button className="text-xs text-destructive hover:underline" onClick={() => void unbind(user)}>解除关联</button>}
                        <button className="text-xs text-muted-foreground hover:underline" onClick={() => void toggleStatus(user)}>{user.status === 'ACTIVE' ? '禁用' : '启用'}</button>
                      </div></td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>共 {data.total} 条，第 {data.pageNo}/{totalPages} 页</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={pageNo <= 1} onClick={() => setPageNo((value) => value - 1)}>上一页</Button><Button size="sm" variant="outline" disabled={pageNo >= totalPages} onClick={() => setPageNo((value) => value + 1)}>下一页</Button></div>
        </div>
      </Card>

      {bindingUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
        <Card className="max-h-[88vh] w-full max-w-3xl overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{bindingUser.linkedUser ? '重新关联后台账号' : '关联后台账号'}</h2><p className="mt-1 text-sm text-muted-foreground">个人用户：{bindingUser.nickName || bindingUser.openIdMasked}。绑定仅建立登录身份映射，不会新增权限。</p></div><Button variant="ghost" size="sm" onClick={() => setBindingUser(null)}>关闭</Button></div>
          <div className="mt-4 flex gap-2"><Input value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadAccounts(bindingUser, accountSearch); }} placeholder="搜索用户名、姓名、手机号或企业" /><Button variant="outline" onClick={() => void loadAccounts(bindingUser, accountSearch)}><Search className="mr-1 h-4 w-4" />搜索</Button></div>
          <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
            {accounts.length === 0 ? <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">没有可关联账号。账号必须已关联有效企业和员工，且未被其他微信用户占用。</div> : accounts.map((account) => (
              <label key={account.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${selectedAccountId === account.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'}`}>
                <input type="radio" className="mt-1" checked={selectedAccountId === account.id} onChange={() => setSelectedAccountId(account.id)} />
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono font-medium">{account.username}</span><span>{account.employee?.name || account.name}</span>{account.company && <Badge variant="outline">{account.company.type === 'EXTERNAL' ? '外部企业' : '内部企业'}</Badge>}</div><div className="mt-1 text-xs text-muted-foreground">{account.company ? `${account.company.code} ${account.company.name}` : '未关联企业'} · {account.employee?.department?.name || '未分部门'} · {account.employee?.phone || '无手机号'}</div><div className="mt-1 flex flex-wrap gap-1">{account.roleAssignments?.map((item) => <Badge key={item.role.code} variant="secondary" className="text-[10px]">{item.role.name}</Badge>)}</div></div>
              </label>
            ))}
          </div>
          <div className="mt-4"><label className="mb-1 block text-xs font-medium text-muted-foreground">关联备注（可选）</label><Input value={bindingNote} onChange={(event) => setBindingNote(event.target.value)} maxLength={500} placeholder="例如：运营人员根据已核验手机号完成关联" /></div>
          <div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setBindingUser(null)}>取消</Button><Button onClick={() => void saveBinding()} disabled={!selectedAccountId || saving}><Link2 className="mr-1 h-4 w-4" />{saving ? '保存中...' : '确认关联'}</Button></div>
        </Card>
      </div>}

      {detail && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
        <Card className="max-h-[88vh] w-full max-w-2xl overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">个人用户详情</h2><p className="mt-1 text-sm text-muted-foreground">{detail.nickName || '未授权昵称'} · {detail.openIdMasked}</p></div><Button variant="ghost" size="sm" onClick={() => setDetail(null)}>关闭</Button></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Info icon={UserRound} label="个人用户" value={detail.nickName || '未授权昵称'} />
            <Info icon={ShieldCheck} label="验证手机号" value={detail.phone ? `${detail.phone}${detail.phoneVerifiedAt ? '（微信已验证）' : ''}` : '未授权'} />
            <Info icon={Building2} label="关联企业" value={detail.linkedUser?.company ? `${detail.linkedUser.company.code} ${detail.linkedUser.company.name}` : '未关联'} />
            <Info icon={Link2} label="后台账号" value={detail.linkedUser ? `${detail.linkedUser.username} · ${detail.linkedUser.employee?.name || detail.linkedUser.name}` : '未关联'} />
          </div>
          <h3 className="mt-6 font-semibold">关联记录</h3>
          <div className="mt-2 space-y-2">{detail.bindingLogs?.length ? detail.bindingLogs.map((log) => <div key={log.id} className="rounded-md border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span><Badge variant="outline" className="mr-2">{actionLabel[log.action] || log.action}</Badge>{log.user.username} · {log.user.name}</span><span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span></div><div className="mt-1 text-xs text-muted-foreground">企业：{log.user.company?.name || '—'} · 操作人：{log.operatedBy?.name || '系统'}{log.note ? ` · 备注：${log.note}` : ''}</div></div>) : <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">暂无关联记录</div>}</div>
        </Card>
      </div>}
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <div className="rounded-md bg-muted/30 p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" />{label}</div><div className="mt-2 text-sm">{value}</div></div>;
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
}
