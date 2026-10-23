'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { confirmAction } from '@/lib/system-dialog';
import { SettlementAttachments } from './settlement-attachments';
import { GoodsEvidence, PaymentBalancePanel, PaymentContext, paymentMoney } from './purchase-payment-context';

const field = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
const stages: Record<string, string> = { ADVANCE: '预付款', PROGRESS: '阶段款', SETTLEMENT: '结算款', FINAL: '尾款（含质保金）', GUARANTEE: '履约保证金', OTHER: '其他付款' };
const conditions: Record<string, string> = { SIGNED: '合同生效', DISPATCHED: '装车／已发货', ARRIVED: '已到货', SIGNED_RECEIPT: '已签收', QUALITY: '已完成质量验收', INBOUND: '已入库过账', INVOICE: '已收到发票', DATE: '约定日期', OTHER: '其他约定' };
const orderStates: Record<string, string> = { DRAFT: '草稿', CONFIRMED: '已确认', DISPATCHED: '执行中', COMPLETED: '已完成' };
const defaults = () => ({ businessType: 'PURCHASE', contractId: '', logisticsSettlementId: '', basisType: 'CONTRACT', orderId: '', settlementId: '', paymentStage: 'ADVANCE', stageName: '', conditionText: '', conditionTypes: [] as string[], sourceLineIds: [] as string[], paymentMethod: 'BANK_TRANSFER', amount: '', requestedPayDate: '', purpose: '', remarks: '', relatedTransactionId: '', isThirdParty: false, thirdPartyReason: '', actualPayeeName: '', ourBankAccount: '', ourBankAccountName: '', ourBankName: '', ourBankCode: '', counterpartyBankAccount: '', counterpartyBankAccountName: '', counterpartyBankName: '', counterpartyBankCode: '' });

export function PaymentRequestEditor({ id }: { id?: string }) {
  const router = useRouter(), query = useSearchParams();
  const [form, setForm] = useState(defaults);
  const [ourFilter, setOurFilter] = useState(''), [partnerFilter, setPartnerFilter] = useState('');
  const [logisticsSettlements, setLogisticsSettlements] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]), [originalFunds, setOriginalFunds] = useState<any[]>([]);
  const [context, setContext] = useState<PaymentContext | null>(null), [saved, setSaved] = useState<any>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [loading, setLoading] = useState(true), [dirty, setDirty] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]), [admin, setAdmin] = useState(false);
  const clientRequestId = useRef(''), seq = useRef(0);
  const can = (code: string) => admin || permissions.includes(code) || permissions.includes('settlement.manage');
  const put = (key: keyof ReturnType<typeof defaults>, value: any) => { setForm(f => ({ ...f, [key]: value })); setDirty(true); };
  useEffect(() => { clientRequestId.current = crypto.randomUUID(); try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setPermissions(user.permissions || []); setAdmin(user.role === 'ADMIN'); } catch {} }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [purchase, sales, draft, logistics] = await Promise.all([
          api.get<any[]>('/financial-settlements/options/contracts?direction=PAYABLE'),
          api.get<any[]>('/financial-settlements/options/contracts?direction=RECEIVABLE'),
          id ? api.get<any>(`/financial-settlements/payment-requests/${id}`) : Promise.resolve(null),
          api.get<any[]>(`/financial-settlements/options/logistics-settlements${id ? `?excludeRequestId=${id}` : ''}`),
        ]);
        if (!active) return;
        setLogisticsSettlements(logistics);
        setContracts([...purchase.map(c => ({ ...c, businessType: 'PURCHASE' })), ...sales.map(c => ({ ...c, businessType: 'SALES' }))]);
        if (draft) {
          if (!['DRAFT', 'REJECTED'].includes(draft.status)) throw new Error('当前单据状态不能修改，请返回详情处理');
          const next = defaults(); Object.keys(next).forEach(key => { if (draft[key] != null) (next as any)[key] = draft[key]; });
          next.amount = String(draft.amount); next.requestedPayDate = draft.requestedPayDate?.slice(0, 10) || '';
          next.basisType = draft.basisType === 'LEGACY' ? (draft.settlementId ? 'SETTLEMENT' : draft.orderId ? 'BATCH' : 'CONTRACT') : draft.basisType;
          setForm(next); setSaved(draft);
        } else {
          setForm(f => ({ ...f, contractId: query.get('contractId') || '', orderId: query.get('orderId') || '', settlementId: query.get('settlementId') || '',
            basisType: query.get('settlementId') ? 'SETTLEMENT' : query.get('orderId') ? 'BATCH' : 'CONTRACT', paymentStage: query.get('settlementId') ? 'SETTLEMENT' : 'ADVANCE' }));
        }
      } catch (e: any) { if (active) setError(e.message); } finally { if (active) setLoading(false); }
    })(); return () => { active = false; };
  }, [id, query]);

  const refreshContext = useCallback(async () => {
    if (!form.contractId || form.businessType !== 'PURCHASE') return;
    const current = ++seq.current;
    const result = await api.get<PaymentContext>(`/financial-settlements/options/payment-context?contractId=${form.contractId}${saved?.id ? `&excludeRequestId=${saved.id}` : ''}`);
    if (current === seq.current) setContext(result);
  }, [form.contractId, form.businessType, saved?.id]);
  useEffect(() => { setContext(null); void refreshContext().catch(e => setError(e.message)); }, [refreshContext]);
  useEffect(() => { if (form.businessType === 'SALES' && form.contractId) void api.get<any[]>(`/financial-settlements/funds?businessType=SALES&direction=RECEIPT&contractId=${form.contractId}`).then(setOriginalFunds).catch(e => setError(e.message)); }, [form.businessType, form.contractId]);
  useEffect(() => { const handler = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [dirty]);

  const isLogistics = form.businessType === 'LOGISTICS';
  const eligibleLogistics = logisticsSettlements.filter(s => !s.unavailableReason);
  const partyOptions = isLogistics ? eligibleLogistics.map(s => ({ signingPartner: s.legalEntity, counterparty: s.counterparty })) : contracts.filter(c => c.businessType === form.businessType);
  const ourNames = [...new Set(partyOptions.map(c => c.signingPartner?.name).filter(Boolean))];
  const partnerNames = [...new Set(partyOptions.filter(c => !ourFilter || c.signingPartner?.name === ourFilter).map(c => c.counterparty?.name).filter(Boolean))];
  const logistics = eligibleLogistics.find(s => s.id === form.logisticsSettlementId);
  const selectedContract = isLogistics ? (logistics ? { signingPartner: logistics.legalEntity, counterparty: logistics.counterparty, businessUnit: logistics.businessUnit } : null) : contracts.find(c => c.id === form.contractId && c.businessType === form.businessType);
  const changeLogistics = (id: string) => {
    const s = eligibleLogistics.find(row => row.id === id);
    const own = s?.legalEntity.bankAccounts?.[0], payee = s?.counterparty.bankAccounts?.[0];
    setForm(f => ({ ...f, logisticsSettlementId: id, amount: s ? String(s.availableAmount) : '',
      ourBankAccount: own?.accountNo || '', ourBankAccountName: own?.accountName || s?.legalEntity.name || '', ourBankName: own?.bankName || '', ourBankCode: own?.bankCode || '',
      counterpartyBankAccount: payee?.accountNo || '', counterpartyBankAccountName: payee?.accountName || s?.counterparty.name || '', counterpartyBankName: payee?.bankName || '', counterpartyBankCode: payee?.bankCode || '', actualPayeeName: s?.counterparty.name || '' })); setDirty(true);
  };
  const changeContract = (contractId: string) => {
    const c = contracts.find(item => item.id === contractId && item.businessType === form.businessType);
    const own = c?.signingPartner?.bankAccounts?.find((a: any) => a.isDefault) || c?.signingPartner?.bankAccounts?.[0];
    const partner = c?.counterparty?.bankAccounts?.find((a: any) => a.isDefault) || c?.counterparty?.bankAccounts?.[0];
    setForm(f => ({ ...f, contractId, orderId: '', settlementId: '', sourceLineIds: [], amount: '', actualPayeeName: c?.counterparty?.name || '',
      ourBankAccount: own?.accountNo || '', ourBankAccountName: own?.accountName || c?.signingPartner?.name || '', ourBankName: own?.bankName || '', ourBankCode: own?.bankCode || '',
      counterpartyBankAccount: partner?.accountNo || '', counterpartyBankAccountName: partner?.accountName || c?.counterparty?.name || '', counterpartyBankName: partner?.bankName || '', counterpartyBankCode: partner?.bankCode || '' })); setDirty(true);
  };
  const setAccount = (own: boolean, accountNo: string) => {
    const accounts = own ? selectedContract?.signingPartner?.bankAccounts : selectedContract?.counterparty?.bankAccounts;
    const a = accounts?.find((v: any) => v.accountNo === accountNo);
    if (!a) return;
    setForm(f => own ? { ...f, ourBankAccount: a.accountNo, ourBankAccountName: a.accountName, ourBankName: a.bankName, ourBankCode: a.bankCode || '' } : { ...f, counterpartyBankAccount: a.accountNo, counterpartyBankAccountName: a.accountName, counterpartyBankName: a.bankName, counterpartyBankCode: a.bankCode || '' }); setDirty(true);
  };
  const save = async (confirm: boolean) => {
    if (busy) return;
    if (!(isLogistics ? form.logisticsSettlementId : form.contractId) || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) { setError('请选择合同或物流结算单，并填写大于零的本次申请金额，其余资料可保存草稿后继续补充。'); return; }
    setBusy(true); setError('');
    try {
      const payload = { ...form, contractId: form.contractId || undefined, logisticsSettlementId: form.logisticsSettlementId || undefined, amount: Number(form.amount), orderId: form.orderId || undefined, settlementId: form.settlementId || undefined, relatedTransactionId: form.relatedTransactionId || undefined,
        requestedPayDate: form.requestedPayDate ? `${form.requestedPayDate}T12:00:00+08:00` : undefined, clientRequestId: clientRequestId.current };
      const result = saved?.id ? await api.patch<any>(`/financial-settlements/payment-requests/${saved.id}`, payload) : await api.post<any>('/financial-settlements/payment-requests', payload);
      setSaved(result);
      for (const file of pendingFiles) { const data = new FormData(); data.append('file', file); await api.upload(`/financial-settlements/payment-requests/${result.id}/attachments`, data); setPendingFiles(files => files.filter(f => f !== file)); }
      if (confirm) await api.post(`/financial-settlements/payment-requests/${result.id}/business-confirm`);
      setDirty(false); router.push(`/dashboard/payment-requests/${result.id}`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const back = async () => {
    if (dirty && await confirmAction('是否先保存当前付款申请草稿再离开？选择取消将放弃尚未保存的填写。', { title: '付款申请尚未保存', confirmText: '保存草稿', cancelText: '放弃填写' })) return save(false);
    router.push(saved?.id ? `/dashboard/payment-requests/${saved.id}` : '/dashboard/payment-requests');
  };
  const selectedSettlement = context?.settlements.find(s => s.id === form.settlementId);
  const sources = form.basisType === 'SETTLEMENT' ? selectedSettlement?.lines.map(l => l.sourceSnapshot).filter(Boolean) as any[] || [] : context?.sources.filter(s => !form.orderId || s.orderId === form.orderId) || [];
  if (loading) return <div className="p-10 text-center text-sm text-muted-foreground">正在加载付款申请…</div>;
  return <div className="space-y-5 pb-10"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => void back()}><ArrowLeft className="h-5 w-5"/></Button><h1 className="text-xl font-semibold">{saved ? '编辑付款申请' : '新建付款申请'}</h1></div><Button variant="outline" asChild><Link href={isLogistics ? '/dashboard/logistics-settlements' : '/dashboard/payable-settlements'}>{isLogistics ? '物流结算单' : '采购结算单'}</Link></Button></div>
    {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <Card className="space-y-4 p-5"><h2 className="font-semibold">申请归属</h2><div className="grid gap-4 md:grid-cols-2"><Field label="业务类型"><select className={field} disabled={!!saved} value={form.businessType} onChange={e => { const businessType = e.target.value; setForm({ ...defaults(), businessType, paymentStage: businessType === 'SALES' ? 'REFUND' : businessType === 'LOGISTICS' ? 'SETTLEMENT' : 'ADVANCE', basisType: businessType === 'LOGISTICS' ? 'LOGISTICS_SETTLEMENT' : 'CONTRACT' }); setContext(null); setOurFilter(''); setPartnerFilter(''); setDirty(true); }}><option value="PURCHASE">采购付款</option><option value="LOGISTICS">物流付款</option><option value="SALES">销售客户退款／保证金退回</option></select></Field><Field label="按我方主体筛选"><select className={field} value={ourFilter} onChange={e => { setOurFilter(e.target.value); setPartnerFilter(''); }}><option value="">全部我方主体</option>{ourNames.map(name => <option key={name} value={name}>{name}</option>)}</select></Field><Field label="按交易对手筛选"><select className={field} value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}><option value="">全部交易对手</option>{partnerNames.map(name => <option key={name} value={name}>{name}</option>)}</select></Field>{!isLogistics && <Field label="关联合同 *"><select className={field} value={form.contractId} disabled={!!saved} onChange={e => changeContract(e.target.value)}><option value="">请选择已生效合同</option>{contracts.filter(c => c.businessType === form.businessType && (c.id === form.contractId || ((!ourFilter || c.signingPartner?.name === ourFilter) && (!partnerFilter || c.counterparty?.name === partnerFilter)))).map(c => <option key={c.id} value={c.id}>{c.contractNo} · {c.title} · {c.counterparty?.name}</option>)}</select></Field>}<div className="space-y-1 pt-2 text-sm"><p>我方付款主体：{selectedContract?.signingPartner?.name || '—'}</p><p>{isLogistics ? '物流承运方' : '合同交易对手'}：{selectedContract?.counterparty?.name || '—'}</p><p className="text-muted-foreground">业务单元（事业部）：{selectedContract?.businessUnit?.name || '—'}</p></div></div></Card>
    <Card className="space-y-4 p-5"><h2 className="font-semibold">本次付款依据</h2>{context && <div className="rounded-md bg-muted/40 p-3 text-sm">合同结算方式：{context.contract.settlementMethod || '—'}；付款方式：{context.contract.paymentMethod || '—'}{context.contract.prepayPct != null ? `；预付比例：${context.contract.prepayPct}%` : ''}</div>}<div className="grid gap-4 md:grid-cols-2"><Field label="款项类型 *"><select className={field} value={form.paymentStage} onChange={e => { const stage = e.target.value; setForm(f => ({ ...f, paymentStage: stage, basisType: form.businessType === 'LOGISTICS' ? 'LOGISTICS_SETTLEMENT' : form.businessType === 'SALES' ? 'CONTRACT' : ['FINAL', 'SETTLEMENT'].includes(stage) ? 'SETTLEMENT' : stage === 'PROGRESS' ? 'BATCH' : 'CONTRACT', settlementId: '', sourceLineIds: [] })); setDirty(true); }}>{Object.entries(form.businessType === 'PURCHASE' ? stages : isLogistics ? { SETTLEMENT: '结算款', FINAL: '尾款' } : { REFUND: '客户退款', GUARANTEE_RETURN: '退还客户保证金' }).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Field><Field label="阶段名称"><Input value={form.stageName} onChange={e => put('stageName', e.target.value)} placeholder="例如首批装车款、验收款、质保金尾款"/></Field>
    {isLogistics ? <>
      <Field label="付款依据"><select className={field} value="LOGISTICS_SETTLEMENT" disabled><option value="LOGISTICS_SETTLEMENT">已复核物流结算单</option></select></Field>
      <Field label="物流结算单 *"><select className={field} disabled={!!saved} value={form.logisticsSettlementId} onChange={e => changeLogistics(e.target.value)}><option value="">请选择已复核物流结算单</option>{eligibleLogistics.filter(s => s.id === form.logisticsSettlementId || ((!ourFilter || s.legalEntity.name === ourFilter) && (!partnerFilter || s.counterparty.name === partnerFilter) && s.availableAmount > 0)).map(s => <option key={s.id} value={s.id}>{s.settlementNo} · {s.counterparty.name} · 可申请 {paymentMoney(s.availableAmount)}</option>)}</select></Field>
      {logistics && <div className="rounded-md bg-muted/40 p-3 text-sm md:col-span-2">结算金额 {paymentMoney(logistics.totalAmount)} · 已登记付款 {paymentMoney(logistics.paidAmount)} · 其他申请占用 {paymentMoney(logistics.reservedAmount)} · 可申请 {paymentMoney(logistics.availableAmount)}</div>}
      {!eligibleLogistics.length && <p className="text-sm text-muted-foreground md:col-span-2">暂无可申请的已复核物流结算单，请先完成物流结算复核；每张付款依据须归属同一承运方及事业部。</p>}
      {logisticsSettlements.filter(s => s.unavailableReason).map(s => <p key={s.id} className="text-sm text-amber-700 md:col-span-2">{s.settlementNo || s.id}：{s.unavailableReason}</p>)}
    </> : form.businessType === 'PURCHASE' ? <><Field label="付款依据"><select className={field} value={form.basisType} onChange={e => { put('basisType', e.target.value); put('settlementId', ''); put('orderId', ''); put('sourceLineIds', []); }}><option value="CONTRACT">合同约定</option><option value="BATCH">执行批次履约依据</option><option value="SETTLEMENT">已确认采购结算单</option></select></Field>{form.basisType === 'SETTLEMENT' ? <Field label="采购结算单 *"><select className={field} value={form.settlementId} onChange={e => { put('settlementId', e.target.value); put('amount', String(context?.settlements.find(s => s.id === e.target.value)?.availableAmount || '')); }}><option value="">请选择</option>{context?.settlements.filter(s => s.status !== 'SETTLED').map(s => <option key={s.id} value={s.id}>{s.settlementNo} · 可申请 {paymentMoney(s.availableAmount)}</option>)}</select></Field> : <Field label={`执行批次${form.basisType === 'BATCH' ? ' *' : '（可选）'}`}><select className={field} value={form.orderId} onChange={e => { put('orderId', e.target.value); put('sourceLineIds', []); }}><option value="">按合同申请</option>{context?.orders.map(o => <option key={o.id} value={o.id}>{o.orderNo} · {o.name} · {orderStates[o.status] || '待确认'}</option>)}</select></Field>}</> : <Field label="原收款单 *"><select className={field} value={form.relatedTransactionId} onChange={e => put('relatedTransactionId', e.target.value)}><option value="">请选择原收款单</option>{originalFunds.filter(f => ['CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED'].includes(f.status)).map(f => <option key={f.id} value={f.id}>{f.transactionNo} · {paymentMoney(f.amount)}</option>)}</select></Field>}</div>
      <Field label="本次付款条件说明 *"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={form.conditionText} onChange={e => put('conditionText', e.target.value)} placeholder="说明本次付款条件，例如按物流结算支付运费，或装车后支付该批货款的70%。"/></Field>
      {(form.businessType === 'PURCHASE' || isLogistics) && <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm">{Object.entries(conditions).filter(([key]) => !isLogistics || ['INVOICE', 'DATE', 'OTHER'].includes(key)).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={form.conditionTypes.includes(key)} onChange={e => put('conditionTypes', e.target.checked ? [...form.conditionTypes, key] : form.conditionTypes.filter(v => v !== key))}/>{label}</label>)}</div>}
    </Card>
    {context && <><Card className="p-5"><h2 className="mb-3 font-semibold">业务进度与质量依据</h2><GoodsEvidence sources={sources} selected={form.sourceLineIds} onSelect={form.basisType !== 'SETTLEMENT' ? (sourceId, checked) => put('sourceLineIds', checked ? [...form.sourceLineIds, sourceId] : form.sourceLineIds.filter(v => v !== sourceId)) : undefined} reload={refreshContext} canAccept={can('settlement.quality.accept')}/></Card><PaymentBalancePanel context={context} settlementId={form.settlementId} reload={refreshContext} canAllocate={can('settlement.allocate')}/></>}
    <Card className="space-y-4 p-5"><h2 className="font-semibold">金额与付款信息</h2><div className="grid gap-4 md:grid-cols-2"><Field label="本次申请金额（元） *"><Input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => put('amount', e.target.value)}/></Field><Field label="计划付款日期"><Input type="date" value={form.requestedPayDate} onChange={e => put('requestedPayDate', e.target.value)}/></Field><Field label="支付方式"><select className={field} value={form.paymentMethod} onChange={e => put('paymentMethod', e.target.value)}>{Object.entries({ BANK_TRANSFER: '银行转账', BANK_ACCEPTANCE: '银行承兑', COMMERCIAL_ACCEPTANCE: '商业承兑', LETTER_OF_CREDIT: '信用证', FUNDING_PAYMENT: '融资支付', CASH: '现金', OTHER: '其他' }).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field><Field label="付款用途 *"><Input value={form.purpose} onChange={e => put('purpose', e.target.value)} placeholder="实际付款用途，质保金请注明"/></Field></div>
      {[true, false].map(own => <div className="grid gap-3 border-t pt-4 md:grid-cols-2" key={String(own)}><Field label={own ? '我方付款账户' : '对方收款账户'}><select className={field} value={own ? form.ourBankAccount : form.counterpartyBankAccount} onChange={e => setAccount(own, e.target.value)}><option value="">选择主数据有效银行账户</option>{(own ? selectedContract?.signingPartner?.bankAccounts : selectedContract?.counterparty?.bankAccounts)?.map((a: any) => <option key={a.id} value={a.accountNo}>{a.accountName} · {a.bankName} · {a.accountNo}</option>)}</select></Field><Field label="户名"><Input value={own ? form.ourBankAccountName : form.counterpartyBankAccountName} onChange={e => put(own ? 'ourBankAccountName' : 'counterpartyBankAccountName', e.target.value)}/></Field><Field label="银行账号"><Input value={own ? form.ourBankAccount : form.counterpartyBankAccount} onChange={e => put(own ? 'ourBankAccount' : 'counterpartyBankAccount', e.target.value)}/></Field><Field label="开户行"><Input value={own ? form.ourBankName : form.counterpartyBankName} onChange={e => put(own ? 'ourBankName' : 'counterpartyBankName', e.target.value)}/></Field></div>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isThirdParty} onChange={e => put('isThirdParty', e.target.checked)}/>第三方收款</label>{form.isThirdParty && <div className="grid gap-3 md:grid-cols-2"><Field label="实际收款方"><Input value={form.actualPayeeName} onChange={e => put('actualPayeeName', e.target.value)}/></Field><Field label="第三方收款原因"><Input value={form.thirdPartyReason} onChange={e => put('thirdPartyReason', e.target.value)}/></Field></div>}<Field label="备注"><Input value={form.remarks} onChange={e => put('remarks', e.target.value)}/></Field>
    </Card>
    <Card className="space-y-3 p-5"><h2 className="font-semibold">业务依据附件</h2>{saved?.id && <SettlementAttachments attachments={saved.attachments} uploadPath={`/financial-settlements/payment-requests/${saved.id}/attachments`} editable onChanged={async () => setSaved(await api.get(`/financial-settlements/payment-requests/${saved.id}`))}/>}<input aria-label="添加付款依据附件" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => { setPendingFiles(files => [...files, ...Array.from(e.target.files || [])]); setDirty(true); e.target.value = ''; }}/>{pendingFiles.map((file, index) => <div className="flex items-center justify-between text-sm" key={`${file.name}-${index}`}><span>{file.name}</span><Button size="sm" variant="ghost" onClick={() => setPendingFiles(files => files.filter((_, i) => i !== index))}>移除</Button></div>)}</Card>
    <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-background/95 p-4"><Button variant="outline" disabled={busy} onClick={() => void back()}>返回</Button><Button variant="outline" disabled={busy || !can('settlement.payment.apply')} onClick={() => void save(false)}><Save className="mr-2 h-4 w-4"/>保存草稿</Button><Button disabled={busy || !can('settlement.payment.apply')} onClick={() => void save(true)}>{busy ? '保存中…' : '确认资料并交财务'}</Button></div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-2 text-sm"><span>{label}</span>{children}</label>; }
