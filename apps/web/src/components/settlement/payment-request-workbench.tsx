'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusText } from '@/components/status-text';
import { confirmAction } from '@/lib/system-dialog';
import { paymentMoney } from './purchase-payment-context';

interface PaymentRequest {
  id: string; requestNo: string; status: string; amount: string; createdBy: string; paymentStage: string;
  stageName?: string; conditionText?: string; requestedPayDate?: string; actualPayeeName?: string;
  businessType?: string; logisticsSettlement?: { id: string; settlementNo: string } | null;
  contract?: { id: string; contractNo: string; title: string } | null;
  order?: { orderNo: string; name: string } | null; legalEntity: { name: string }; counterparty: { name: string };
  businessUnit?: { name: string }; fundTransactions?: Array<{ amount: string; status: string }>;
}
const STATUS: Record<string, string> = { DRAFT: '业务草稿', BUSINESS_CONFIRMED: '待财务提交', PENDING_APPROVAL: '审批中', APPROVED: '已批准待登记付款', PARTIALLY_PAID: '部分登记付款', PAID: '已全部登记付款', REJECTED: '已驳回', VOIDED: '已作废' };
const STAGE: Record<string, string> = { ADVANCE: '预付款', PROGRESS: '阶段款', SETTLEMENT: '结算款', FINAL: '尾款', GUARANTEE: '履约保证金', REFUND: '客户退款', GUARANTEE_RETURN: '退还客户保证金', OTHER: '其他付款' };
export function PaymentRequestWorkbench({ showTitle = true }: { showTitle?: boolean }) {
  const [items, setItems] = useState<PaymentRequest[]>([]), [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [businessUnit, setBusinessUnit] = useState('');
  const [user, setUser] = useState<{ id?: string; role?: string; permissions?: string[] }>({});
  const can = (code: string) => user.role === 'ADMIN' || user.permissions?.includes(code) || user.permissions?.includes('settlement.manage');
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await api.get<PaymentRequest[]>('/financial-settlements/payment-requests')); }
    catch (e: any) { alert(e.message || '加载付款申请失败'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { try { setUser(JSON.parse(localStorage.getItem('user') || '{}')); } catch {} void load(); }, [load]);
  const visible = useMemo(() => items.filter(item => (!status || item.status === status) && (!businessUnit || item.businessUnit?.name === businessUnit) && (!search.trim() || `${item.requestNo} ${item.contract?.contractNo || ''} ${item.contract?.title || ''} ${item.logisticsSettlement?.settlementNo || ''} ${item.legalEntity.name} ${item.counterparty.name} ${item.businessUnit?.name || ''}`.toLowerCase().includes(search.trim().toLowerCase()))), [items, search, status, businessUnit]);
  const unpaid = (item: PaymentRequest) => Math.max(0, Number(item.amount) - (item.fundTransactions || []).filter(f => f.status !== 'VOIDED').reduce((sum, f) => sum + Number(f.amount), 0));
  const remove = async (item: PaymentRequest) => {
    if (!await confirmAction(`确定删除草稿 ${item.requestNo} 吗？`, { title: '删除付款申请草稿' })) return;
    try { await api.delete(`/financial-settlements/payment-requests/${item.id}`); await load(); } catch (e: any) { alert(e.message); }
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div>{showTitle && <h1 className="text-2xl font-bold">付款申请单</h1>}<p className="mt-1 text-sm text-muted-foreground">业务准备付款依据，财务核对结算、质量及预付款后提交审批</p></div><div className="flex gap-2"><Button variant="outline" asChild><Link href="/dashboard/payable-settlements">采购结算单</Link></Button>{can('settlement.payment.apply') && <Button asChild><Link href="/dashboard/payment-requests/new"><Plus className="mr-1 h-4 w-4"/>新建付款申请</Link></Button>}</div></div>
    <div className="grid gap-3 sm:grid-cols-3">{[['有效申请金额', items.filter(i => !['DRAFT', 'REJECTED', 'VOIDED'].includes(i.status)).reduce((n, i) => n + Number(i.amount), 0)], ['审批中金额', items.filter(i => i.status === 'PENDING_APPROVAL').reduce((n, i) => n + Number(i.amount), 0)], ['已批准待登记金额', items.filter(i => ['APPROVED', 'PARTIALLY_PAID'].includes(i.status)).reduce((n, i) => n + unpaid(i), 0)]].map(([label, amount]) => <Card key={label} className="p-4"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-2 text-xl font-semibold">{paymentMoney(amount)}</div></Card>)}</div>
    <div className="flex flex-wrap justify-end gap-2"><select aria-label="业务单元" className="h-10 rounded-md border bg-background px-3 text-sm" value={businessUnit} onChange={e => setBusinessUnit(e.target.value)}><option value="">全部业务单元</option>{[...new Set(items.map(i => i.businessUnit?.name).filter(Boolean))].map(name => <option key={name} value={name}>{name}</option>)}</select><select aria-label="申请状态" className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option>{Object.entries(STATUS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select><div className="flex"><Input className="w-80 rounded-r-none" placeholder="申请单、合同、物流结算、企业关键词" value={search} onChange={e => setSearch(e.target.value)}/><Button variant="outline" className="rounded-l-none px-3" aria-label="搜索"><Search className="h-4 w-4"/></Button></div></div>
    <Card className="overflow-hidden">{loading ? <div className="p-12 text-center text-sm text-muted-foreground">正在加载…</div> : !visible.length ? <div className="p-12 text-center text-sm text-muted-foreground">暂无付款申请</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-sm"><thead className="border-b bg-muted/40 text-left text-muted-foreground"><tr>{['申请单号', '业务类型／关联依据', '我方付款主体', '状态', '供应商／实际收款方', '付款阶段', '申请金额', '计划付款日', '操作'].map(label => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead><tbody>{visible.map(item => <tr key={item.id} className="border-b hover:bg-muted/20"><td className="p-3 font-mono">{item.requestNo}</td><td className="p-3"><div>{item.logisticsSettlement?.settlementNo || item.contract?.contractNo || '—'}</div><div className="max-w-52 truncate text-xs text-muted-foreground">{item.order ? `${item.order.orderNo} · ${item.order.name}` : item.businessType === 'LOGISTICS' ? '物流付款' : item.contract?.title}</div><div className="mt-1 text-xs text-muted-foreground">{item.businessUnit?.name}</div></td><td className="p-3">{item.legalEntity.name}</td><td className="whitespace-nowrap p-3"><StatusText status={item.status}>{STATUS[item.status] || item.status}</StatusText></td><td className="p-3">{item.counterparty.name}{item.actualPayeeName && item.actualPayeeName !== item.counterparty.name && <p className="mt-1 text-xs text-muted-foreground">实际收款：{item.actualPayeeName}</p>}</td><td className="p-3">{STAGE[item.paymentStage] || '其他'}{item.stageName && <p className="mt-1 text-xs text-muted-foreground">{item.stageName}</p>}</td><td className="whitespace-nowrap p-3 tabular-nums">{paymentMoney(item.amount)}</td><td className="whitespace-nowrap p-3">{item.requestedPayDate?.slice(0, 10) || '—'}</td><td className="p-3"><div className="flex gap-1"><Button size="sm" variant="ghost" asChild><Link href={`/dashboard/payment-requests/${item.id}`}>详情</Link></Button>{['DRAFT', 'REJECTED'].includes(item.status) && can('settlement.payment.apply') && (user.role === 'ADMIN' || user.id === item.createdBy) && <><Button size="icon" variant="ghost" title="编辑草稿" asChild><Link href={`/dashboard/payment-requests/${item.id}/edit`}><Pencil className="h-4 w-4"/></Link></Button>{item.status === 'DRAFT' && <Button size="icon" variant="ghost" title="删除草稿" onClick={() => void remove(item)}><Trash2 className="h-4 w-4 text-destructive"/></Button>}</>}</div></td></tr>)}</tbody></table></div>}</Card>
  </div>;
}
