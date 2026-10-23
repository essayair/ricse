'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ClipboardPaste, FileSearch, Upload, XCircle } from 'lucide-react';
import { SettlementSectionTabs } from '@/components/settlement/settlement-section-tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TemporalInput } from '@/components/ui/temporal-input';
import { api } from '@/lib/api';

interface BankAccount {
  id: string; accountName: string; accountNo: string; bankName: string; bankCode?: string | null;
  currency?: string; isDefault?: boolean;
}

interface PaymentRequest {
  id: string; requestNo: string; status: string; businessType: 'PURCHASE' | 'SALES' | 'LOGISTICS'; paymentStage: string; paymentMethod: string; amount: string;
  purpose?: string | null; ourBankAccount?: string | null; ourBankAccountName?: string | null; ourBankName?: string | null;
  counterpartyBankAccount?: string | null; counterpartyBankAccountName?: string | null; counterpartyBankName?: string | null;
  actualPayeeName?: string | null; logisticsSettlement?: { id: string; settlementNo: string } | null; contract?: { id: string; contractNo: string; title: string } | null;
  order?: { id: string; orderNo: string; name?: string | null } | null; businessUnit?: { name: string } | null;
  legalEntity: { id: string; name: string; bankAccounts: BankAccount[] };
  counterparty: { id: string; name: string; bankAccounts: BankAccount[] };
  fundTransactions?: Array<{ id: string; amount: string; status: string }>;
}

interface RecognitionResult {
  available: boolean; success: boolean; provider: 'BAIDU_OCR' | 'NONE'; rawText: string; message: string;
  fields: {
    receiptNo?: string; payerName?: string; payerAccount?: string; payerBankName?: string;
    payeeName?: string; payeeAccount?: string; payeeBankName?: string; amount?: number;
    currency?: string; occurredAt?: string; purpose?: string;
  };
}

const money = (value: string | number | null | undefined) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const normalizeAccount = (value?: string | null) => (value || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
const now = () => {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const fieldClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';

export default function CreatePaymentPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [recognition, setRecognition] = useState<RecognitionResult | null>(null);
  const [form, setForm] = useState({
    amount: '', occurredAt: now(), bankReference: '', currency: 'CNY',
    actualPayerName: '', ourBankAccount: '', ourBankAccountName: '', ourBankName: '',
    actualPayeeName: '', counterpartyBankAccount: '', counterpartyBankAccountName: '', counterpartyBankName: '',
    purpose: '', bankAccountDifferenceReason: '', remarks: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get<PaymentRequest[]>('/financial-settlements/payment-requests');
      const available = (rows || []).filter(item => ['APPROVED', 'PARTIALLY_PAID'].includes(item.status));
      setRequests(available);
      const requestedId = new URLSearchParams(window.location.search).get('paymentRequestId') || '';
      if (requestedId && available.some(item => item.id === requestedId)) setSelectedId(requestedId);
    } catch (error: any) { alert(error.message || '加载待付款申请失败'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const selected = requests.find(item => item.id === selectedId);
  const paidAmount = selected?.fundTransactions?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
  const remainingAmount = Math.max(0, Number(selected?.amount || 0) - paidAmount);
  const filteredRequests = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return requests.filter(item => !needle || `${item.requestNo} ${item.contract?.contractNo || ''} ${item.contract?.title || ''} ${item.logisticsSettlement?.settlementNo || ''} ${item.legalEntity.name} ${item.counterparty.name}`.toLowerCase().includes(needle));
  }, [requests, search]);

  const resetFromRequest = (requestId: string) => {
    setSelectedId(requestId);
    const request = requests.find(item => item.id === requestId);
    if (!request) return;
    const paid = request.fundTransactions?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
    setForm(old => ({
      ...old,
      amount: String(Math.max(0, Number(request.amount) - paid)),
      actualPayerName: request.ourBankAccountName || request.legalEntity.name,
      ourBankAccount: request.ourBankAccount || '', ourBankAccountName: request.ourBankAccountName || request.legalEntity.name,
      ourBankName: request.ourBankName || '',
      actualPayeeName: request.actualPayeeName || request.counterpartyBankAccountName || request.counterparty.name,
      counterpartyBankAccount: request.counterpartyBankAccount || '',
      counterpartyBankAccountName: request.counterpartyBankAccountName || request.actualPayeeName || request.counterparty.name,
      counterpartyBankName: request.counterpartyBankName || '', purpose: request.purpose || '', bankAccountDifferenceReason: '',
    }));
  };

  useEffect(() => {
    if (selectedId && selected) resetFromRequest(selectedId);
    // Only initialize values when the request selection itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const recognizeFile = async (nextFile: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(nextFile.type)) return alert('仅支持 JPG、PNG、WEBP 或 PDF 付款凭证');
    if (nextFile.size > 20 * 1024 * 1024) return alert('单个付款凭证不能超过 20MB');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile); setPreviewUrl(URL.createObjectURL(nextFile)); setRecognition(null); setRecognizing(true);
    try {
      const data = new FormData(); data.append('file', nextFile);
      const result = await api.upload<RecognitionResult>('/financial-settlements/payment-vouchers/recognize', data);
      setRecognition(result);
      const fields = result.fields || {};
      setForm(old => ({
        ...old,
        amount: fields.amount ? String(fields.amount) : old.amount,
        occurredAt: fields.occurredAt ? fields.occurredAt.slice(0, 16) : old.occurredAt,
        bankReference: fields.receiptNo || old.bankReference,
        currency: fields.currency || old.currency,
        actualPayerName: fields.payerName || old.actualPayerName,
        ourBankAccountName: fields.payerName || old.ourBankAccountName,
        ourBankAccount: fields.payerAccount || old.ourBankAccount,
        ourBankName: fields.payerBankName || old.ourBankName,
        actualPayeeName: fields.payeeName || old.actualPayeeName,
        counterpartyBankAccountName: fields.payeeName || old.counterpartyBankAccountName,
        counterpartyBankAccount: fields.payeeAccount || old.counterpartyBankAccount,
        counterpartyBankName: fields.payeeBankName || old.counterpartyBankName,
        purpose: fields.purpose || old.purpose,
      }));
    } catch (error: any) {
      setRecognition({ available: true, success: false, provider: 'BAIDU_OCR', rawText: '', fields: {}, message: error.message || '凭证识别失败，请手工填写' });
    } finally { setRecognizing(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(value => value.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        await recognizeFile(new File([blob], `付款凭证-${Date.now()}.${type.split('/')[1] || 'png'}`, { type }));
        return;
      }
      alert('剪贴板中没有可用的图片');
    } catch { alert('浏览器未允许读取剪贴板，请使用上传文件或在凭证区域按 Ctrl/Command + V'); }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const pasted = Array.from(event.clipboardData.files).find(item => item.type.startsWith('image/'));
    if (pasted) { event.preventDefault(); void recognizeFile(pasted); }
  };

  const payerMatch = accountMatch(form.ourBankAccount, selected?.ourBankAccount, selected?.legalEntity.bankAccounts || []);
  const payeeMatch = accountMatch(form.counterpartyBankAccount, selected?.counterpartyBankAccount, selected?.counterparty.bankAccounts || []);
  const hasDifference = Boolean(selected && (payerMatch !== 'EXACT' || payeeMatch !== 'EXACT'));

  const submit = async () => {
    if (!selected) return alert('请选择付款申请单');
    if (!file) return alert('请上传或粘贴付款凭证');
    if (!form.bankReference.trim() || !form.actualPayerName.trim() || !form.ourBankAccount.trim() || !form.ourBankName.trim()
      || !form.actualPayeeName.trim() || !form.counterpartyBankAccount.trim() || !form.counterpartyBankName.trim()
      || !form.purpose.trim() || !form.occurredAt || Number(form.amount) <= 0) return alert('请完整填写付款凭证核心信息');
    if (Number(form.amount) > remainingAmount) return alert(`本次付款金额不能超过剩余待付金额 ${money(remainingAmount)}`);
    if (hasDifference && !form.bankAccountDifferenceReason.trim()) return alert('实际账户与付款申请账户存在差异，请填写差异说明');
    setBusy(true);
    try {
      const data = new FormData(); data.append('file', file);
      Object.entries({
        ...form,
        amount: String(Number(form.amount)),
        occurredAt: `${form.occurredAt}:00+08:00`,
        recognitionProvider: recognition?.provider || 'NONE', recognitionRawText: recognition?.rawText || '',
      }).forEach(([key, value]) => data.append(key, value));
      const fund = await api.upload<{ id: string }>(`/financial-settlements/payment-requests/${selected.id}/execute-with-voucher`, data);
      router.push(`/dashboard/funds/${fund.id}?direction=PAYMENT`);
    } catch (error: any) { alert(error.message || '创建付款单失败'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <SettlementSectionTabs section="payable" />
    <div className="flex items-start gap-3"><Button variant="ghost" size="icon" asChild><Link href="/dashboard/payments"><ArrowLeft className="h-4 w-4" /></Link></Button><div><h1 className="text-2xl font-bold">创建付款单</h1><p className="mt-1 text-sm text-muted-foreground">选择已审批付款申请，上传银行付款凭证并核对识别结果</p></div></div>

    <Card className="space-y-4 p-6"><h2 className="font-semibold">一、选择付款申请</h2><div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(360px,2fr)]"><Field label="申请单/合同/企业搜索"><Input placeholder="输入申请单号、合同号或企业名称" value={search} onChange={event => setSearch(event.target.value)} /></Field><Field label="付款申请单 *"><select className={fieldClass} value={selectedId} disabled={loading} onChange={event => resetFromRequest(event.target.value)}><option value="">请选择已审批且尚未付清的付款申请</option>{filteredRequests.map(item => <option key={item.id} value={item.id}>{item.requestNo} · {item.logisticsSettlement?.settlementNo || item.contract?.contractNo || '—'} · {item.legalEntity.name} → {item.counterparty.name}</option>)}</select></Field></div>
      {selected && <><div className="grid gap-4 rounded-md bg-muted/30 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><Info label="付款申请单" value={selected.requestNo}/><Info label={selected.businessType === 'LOGISTICS' ? '物流结算单' : '合同'} value={selected.logisticsSettlement?.settlementNo || `${selected.contract?.contractNo || '—'} · ${selected.contract?.title || ''}`}/><Info label="业务单元（事业部）" value={selected.businessUnit?.name || '—'}/><Info label="执行批次" value={selected.order ? `${selected.order.orderNo} · ${selected.order.name || '未命名批次'}` : selected.businessType === 'LOGISTICS' ? '按物流结算' : '按合同'}/><Info label="我方付款主体" value={selected.legalEntity.name}/><Info label="交易对手方" value={selected.counterparty.name}/><Info label="申请金额" value={money(selected.amount)}/><Info label="剩余待付" value={money(remainingAmount)} emphasis/></div><div className="grid gap-4 rounded-md border p-4 text-sm md:grid-cols-2"><AccountCard title="申请计划付款账户" name={selected.ourBankAccountName || selected.legalEntity.name} bank={selected.ourBankName} account={selected.ourBankAccount}/><AccountCard title="申请计划收款账户" name={selected.counterpartyBankAccountName || selected.actualPayeeName || selected.counterparty.name} bank={selected.counterpartyBankName} account={selected.counterpartyBankAccount}/></div></>}
    </Card>

    <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.9fr)_minmax(560px,1.3fr)]">
      <Card className="space-y-4 p-6"><div><h2 className="font-semibold">二、付款凭证</h2><p className="mt-1 text-xs text-muted-foreground">支持 JPG、PNG、WEBP、PDF；上传或粘贴后自动识别，原件随付款单归档。</p></div><div tabIndex={0} onPaste={onPaste} className="flex min-h-80 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/20 outline-none focus:border-primary">{previewUrl ? (file?.type === 'application/pdf' ? <iframe title="付款凭证预览" src={previewUrl} className="h-[460px] w-full"/> : <div className="relative h-[460px] w-full"><Image unoptimized fill src={previewUrl} alt="付款凭证预览" className="object-contain"/></div>) : <div className="px-8 text-center text-sm text-muted-foreground"><FileSearch className="mx-auto mb-3 h-10 w-10"/><div>上传付款凭证，或点击此处后粘贴截图</div></div>}</div><input ref={inputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => event.target.files?.[0] && void recognizeFile(event.target.files[0])}/><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={recognizing} onClick={() => inputRef.current?.click()}><Upload className="mr-1.5 h-4 w-4"/>{file ? '更换凭证' : '上传凭证'}</Button><Button type="button" variant="outline" disabled={recognizing} onClick={() => void pasteFromClipboard()}><ClipboardPaste className="mr-1.5 h-4 w-4"/>粘贴截图</Button></div>{recognition && <div className={`rounded-md border p-3 text-sm ${recognition.success ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{recognizing ? '正在识别付款凭证…' : recognition.message}</div>}</Card>

      <Card className="space-y-5 p-6"><div><h2 className="font-semibold">三、核对付款凭证核心信息</h2><p className="mt-1 text-xs text-muted-foreground">识别结果仅辅助填充，创建前请逐项与凭证原件核对。</p></div><div className="grid gap-4 sm:grid-cols-2"><Field label="电子回单号/银行流水号 *"><Input value={form.bankReference} onChange={event => setForm(old => ({ ...old, bankReference: event.target.value }))}/></Field><Field label="实际付款时间 *"><TemporalInput type="datetime-local" value={form.occurredAt} onChange={event => setForm(old => ({ ...old, occurredAt: event.target.value }))}/></Field><Field label="实际付款金额 *"><Input type="number" min="0.01" max={remainingAmount || undefined} step="0.01" value={form.amount} onChange={event => setForm(old => ({ ...old, amount: event.target.value }))}/></Field><Field label="币种 *"><select className={fieldClass} value={form.currency} onChange={event => setForm(old => ({ ...old, currency: event.target.value }))}><option value="CNY">人民币 CNY</option><option value="USD">美元 USD</option></select></Field></div>
        <div className="grid gap-4 rounded-md border p-4 sm:grid-cols-2"><div className="sm:col-span-2"><AccountMatch label="实际付款账户" status={payerMatch}/></div><Field label="付款户名 *"><Input value={form.actualPayerName} onChange={event => setForm(old => ({ ...old, actualPayerName: event.target.value, ourBankAccountName: event.target.value }))}/></Field><Field label="付款账号 *"><Input value={form.ourBankAccount} onChange={event => setForm(old => ({ ...old, ourBankAccount: event.target.value }))}/></Field><Field label="付款开户行 *"><Input value={form.ourBankName} onChange={event => setForm(old => ({ ...old, ourBankName: event.target.value }))}/></Field></div>
        <div className="grid gap-4 rounded-md border p-4 sm:grid-cols-2"><div className="sm:col-span-2"><AccountMatch label="实际收款账户" status={payeeMatch}/></div><Field label="收款户名 *"><Input value={form.actualPayeeName} onChange={event => setForm(old => ({ ...old, actualPayeeName: event.target.value, counterpartyBankAccountName: event.target.value }))}/></Field><Field label="收款账号 *"><Input value={form.counterpartyBankAccount} onChange={event => setForm(old => ({ ...old, counterpartyBankAccount: event.target.value }))}/></Field><Field label="收款开户行 *"><Input value={form.counterpartyBankName} onChange={event => setForm(old => ({ ...old, counterpartyBankName: event.target.value }))}/></Field></div>
        {hasDifference && <Field label="账户差异说明 *"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" placeholder="说明为何实际账户与付款申请中的计划账户不同" value={form.bankAccountDifferenceReason} onChange={event => setForm(old => ({ ...old, bankAccountDifferenceReason: event.target.value }))}/></Field>}
        <Field label="付款用途 *"><Input value={form.purpose} onChange={event => setForm(old => ({ ...old, purpose: event.target.value }))}/></Field><Field label="备注"><textarea className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={form.remarks} onChange={event => setForm(old => ({ ...old, remarks: event.target.value }))}/></Field>
      </Card>
    </div>
    <div className="sticky bottom-4 flex justify-end gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur"><Button variant="outline" asChild><Link href="/dashboard/payments">取消</Link></Button><Button disabled={busy || recognizing || !selected} onClick={() => void submit()}>{busy ? '正在创建…' : '确认创建付款单'}</Button></div>
  </div>;
}

function accountMatch(actual: string, planned: string | null | undefined, accounts: BankAccount[]): 'EMPTY' | 'EXACT' | 'SAME_PARTY' | 'UNREGISTERED' {
  const value = normalizeAccount(actual); if (!value) return 'EMPTY';
  if (value === normalizeAccount(planned)) return 'EXACT';
  if (accounts.some(item => normalizeAccount(item.accountNo) === value)) return 'SAME_PARTY';
  return 'UNREGISTERED';
}
function AccountMatch({ label, status }: { label: string; status: 'EMPTY' | 'EXACT' | 'SAME_PARTY' | 'UNREGISTERED' }) {
  const text = status === 'EXACT' ? '与付款申请一致' : status === 'SAME_PARTY' ? '同一企业的其他已维护账户' : status === 'UNREGISTERED' ? '与付款申请不一致，且尚未匹配已维护账户' : '等待填写或识别';
  const ok = status === 'EXACT';
  return <div className={`flex items-center gap-2 text-sm ${ok ? 'text-emerald-700' : status === 'EMPTY' ? 'text-muted-foreground' : 'text-amber-700'}`}>{ok ? <CheckCircle2 className="h-4 w-4"/> : <XCircle className="h-4 w-4"/>}<span className="font-medium">{label}：</span>{text}</div>;
}
function AccountCard({ title, name, bank, account }: { title: string; name?: string | null; bank?: string | null; account?: string | null }) { return <div><div className="mb-2 font-medium">{title}</div><div className="space-y-1 text-muted-foreground"><div>户名：{name || '—'}</div><div>开户行：{bank || '—'}</div><div>账号：{account || '—'}</div></div></div>; }
function Info({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 ${emphasis ? 'text-lg font-semibold text-primary' : 'font-medium'}`}>{value}</div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>; }
