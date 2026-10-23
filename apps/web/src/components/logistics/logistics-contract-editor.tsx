'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Save, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmAction } from '@/lib/system-dialog';
import { selectValidAttachmentFiles } from '@/lib/attachment-file';
import { AttachmentPanel, BusinessAttachment } from '@/components/attachment-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LogisticsField as Field, logisticsField, LogisticsPartner, LogisticsUnit, day, useLogisticsError } from './logistics-shared';

const emptyRate = () => ({ originLocation: '', destinationLocation: '', unitPrice: '', effectiveAt: '', expiresAt: '' });
const defaults = { title: '', externalContractNo: '', signingPartnerId: '', carrierPartnerId: '', allBusinessUnits: true, businessUnitIds: [] as string[], settlementBasis: 'NET_WEIGHT', defaultWeightBasis: 'SETTLEMENT', signedAt: '', effectiveAt: '', expireAt: '', paymentTerms: '', remarks: '' };
export function LogisticsContractEditor({ id }: { id?: string }) {
  const router = useRouter();
  const [form, setForm] = useState(defaults), [rates, setRates] = useState([emptyRate()]);
  const [options, setOptions] = useState<{ signingPartners: LogisticsPartner[]; carriers: LogisticsPartner[]; businessUnits: LogisticsUnit[] }>({ signingPartners: [], carriers: [], businessUnits: [] });
  const [savedId, setSavedId] = useState(id || ''), [attachments, setAttachments] = useState<BusinessAttachment[]>([]), [pending, setPending] = useState<File[]>([]);
  const [error, setError] = useLogisticsError('请检查物流合同信息'), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const remainingFiles = useRef<File[]>([]);
  useEffect(() => { void (async () => { try {
    setOptions(await api.get('/logistics-contracts/options'));
    if (id) { const c = await api.get<any>(`/logistics-contracts/${id}`); if (c.status !== 'DRAFT') throw new Error('生效合同已锁定，不能编辑原合同或运价');
      setForm({ ...defaults, ...Object.fromEntries(Object.keys(defaults).map(k => [k, c[k] ?? defaults[k as keyof typeof defaults]])), businessUnitIds: c.businessUnits.map((u: any) => u.businessUnitId), signedAt: day(c.signedAt), effectiveAt: day(c.effectiveAt), expireAt: day(c.expireAt) });
      setRates(c.priceTerms.map((t: any) => ({ ...t, unitPrice: String(t.unitPrice), effectiveAt: day(t.effectiveAt), expiresAt: day(t.expiresAt) }))); setAttachments(c.attachments);
    }
  } catch (e: any) { setError(e.message); } finally { setLoading(false); } })(); }, [id, setError]);
  useEffect(() => { const leave = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave); }, [dirty]);
  const put = (key: keyof typeof defaults, value: unknown) => { setForm(f => ({ ...f, [key]: value })); setDirty(true); };
  const ratePut = (index: number, key: string, value: string) => { setRates(rows => rows.map((r, i) => i === index ? { ...r, [key]: value } : r)); setDirty(true); };
  const refreshAttachments = async (target = savedId) => setAttachments((await api.get<any>(`/logistics-contracts/${target}`)).attachments);
  const save = async () => { setBusy(true); setError(''); try {
    if (!form.title.trim() || !form.signingPartnerId || !form.carrierPartnerId) throw new Error('请填写合同名称、我方签约主体和承运方');
    if (!form.allBusinessUnits && !form.businessUnitIds.length) throw new Error('请选择适用业务单元（事业部）');
    const priceTerms = rates.filter(r => r.unitPrice || r.originLocation || r.destinationLocation || r.effectiveAt || r.expiresAt).map(r => {
      if (!r.unitPrice || Number(r.unitPrice) <= 0 || !r.effectiveAt) throw new Error('运价条款请填写有效单价和生效日期；无路线限制时两端均留空');
      return { originLocation: r.originLocation.trim(), destinationLocation: r.destinationLocation.trim(), unitPrice: Number(r.unitPrice), effectiveAt: r.effectiveAt, expiresAt: r.expiresAt || undefined };
    });
    const payload = { ...form, signedAt: form.signedAt || undefined, effectiveAt: form.effectiveAt || undefined, expireAt: form.expireAt || undefined, priceTerms };
    const created = savedId ? await api.patch<any>(`/logistics-contracts/${savedId}`, payload) : await api.post<any>('/logistics-contracts', payload);
    setSavedId(created.id);
    remainingFiles.current = [...pending];
    while (remainingFiles.current.length) { const file = remainingFiles.current[0], body = new FormData(); body.append('file', file); await api.upload(`/logistics-contracts/${created.id}/attachments`, body); remainingFiles.current.shift(); setPending([...remainingFiles.current]); }
    setDirty(false); router.push(`/dashboard/logistics-contracts/${created.id}`);
  } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const back = async () => { if (dirty && !await confirmAction('尚有未保存的修改，确认离开？', { title: '离开合同编辑' })) return; router.push(savedId ? `/dashboard/logistics-contracts/${savedId}` : '/dashboard/logistics-contracts'); };
  if (loading) return <div className="p-12 text-center text-muted-foreground">加载中...</div>;
  return <div className="space-y-5 pb-8"><div className="flex items-center justify-between gap-3"><h1 className="text-xl font-semibold">{id ? '编辑物流合同' : '新建物流合同'}</h1><Button variant="outline" onClick={() => void back()}><ArrowLeft className="mr-2 h-4 w-4"/>返回</Button></div>
    {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}{savedId && '。草稿已保存，附件上传失败可继续重试，不会重复创建合同。'}</div>}
    <Card className="space-y-4 p-5"><h2 className="font-semibold">内部管理信息</h2><div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={form.allBusinessUnits} onChange={() => put('allBusinessUnits', true)}/>全部事业部适用</label><label className="flex items-center gap-2"><input type="radio" checked={!form.allBusinessUnits} onChange={() => put('allBusinessUnits', false)}/>指定事业部</label></div>{!form.allBusinessUnits && <div className="flex flex-wrap gap-5 text-sm">{options.businessUnits.map(u => <label key={u.id} className="flex items-center gap-2"><input type="checkbox" checked={form.businessUnitIds.includes(u.id)} onChange={e => put('businessUnitIds', e.target.checked ? [...form.businessUnitIds, u.id] : form.businessUnitIds.filter(v => v !== u.id))}/>{u.name}</label>)}</div>}<p className="text-xs text-muted-foreground">适用范围仅用于合同引用，不扩大各事业部的业务数据访问权限。系统编号、创建人和创建时间在保存后生成。</p></Card>
    <Card className="space-y-4 p-5"><h2 className="font-semibold">合同基本信息</h2><Field label="合同名称 *"><Input value={form.title} onChange={e => put('title', e.target.value)} placeholder="请输入物流合同名称"/></Field><Field label="我方签约主体（内部） *"><select className={logisticsField} value={form.signingPartnerId} onChange={e => put('signingPartnerId', e.target.value)}><option value="">请选择贸易货主签约公司</option>{options.signingPartners.map(p => <option key={p.id} value={p.id} disabled={p.id === form.carrierPartnerId}>{p.name}（{p.code}）</option>)}</select></Field><div className="grid gap-4 md:grid-cols-2"><Field label="承运方 *"><select className={logisticsField} value={form.carrierPartnerId} onChange={e => put('carrierPartnerId', e.target.value)}><option value="">请选择有效物流承运商</option>{options.carriers.map(p => <option key={p.id} value={p.id} disabled={p.id === form.signingPartnerId}>{p.name}（{p.code}）</option>)}</select></Field><Field label="外部合同号"><Input value={form.externalContractNo} onChange={e => put('externalContractNo', e.target.value)} placeholder="纸质合同或其他系统合同编号"/></Field></div><div className="grid gap-4 md:grid-cols-3">{[['signedAt', '签订日期'], ['effectiveAt', '生效日期'], ['expireAt', '到期日期']].map(([key, label]) => <Field key={key} label={label}><Input type="date" value={form[key as 'signedAt']} onChange={e => put(key as 'signedAt', e.target.value)}/></Field>)}</div></Card>
    <Card className="space-y-4 p-5"><h2 className="font-semibold">运价约定</h2><div className="grid gap-4 md:grid-cols-2"><Field label="计价方式"><select className={logisticsField} value={form.settlementBasis} onChange={e => put('settlementBasis', e.target.value)}><option value="NET_WEIGHT">按净重（元/吨，含税）</option><option value="TRIP">按车次（元/车次，含税）</option>{form.settlementBasis === 'GROSS_WEIGHT' && <option value="GROSS_WEIGHT">按毛重（历史口径，请核对）</option>}</select></Field><Field label="默认计量依据"><select className={logisticsField} value={form.defaultWeightBasis} onChange={e => put('defaultWeightBasis', e.target.value)}><option value="SETTLEMENT">结算磅单（采购入库 / 销售货款依据）</option><option value="SHIPPING">发货磅单</option><option value="RECEIVING">收货磅单</option></select></Field></div><p className="text-xs text-muted-foreground">路线可不填，表示不限路线。生效后合同运价锁定，本次结算如需调整，应在物流结算单填写原因。</p>
      {rates.map((r, i) => <div key={i} className="grid items-end gap-3 rounded-md border p-4 md:grid-cols-3 xl:grid-cols-6"><Field label="起运地"><Input value={r.originLocation} placeholder="不限路线可留空" onChange={e => ratePut(i, 'originLocation', e.target.value)}/></Field><Field label="目的地"><Input value={r.destinationLocation} placeholder="不限路线可留空" onChange={e => ratePut(i, 'destinationLocation', e.target.value)}/></Field><Field label={`含税单价（${form.settlementBasis === 'TRIP' ? '元/车次' : '元/吨'}）`}><Input type="number" min="0.01" step="0.01" value={r.unitPrice} onChange={e => ratePut(i, 'unitPrice', e.target.value)}/></Field><Field label="运价生效日期"><Input type="date" value={r.effectiveAt} onChange={e => ratePut(i, 'effectiveAt', e.target.value)}/></Field><Field label="运价失效日期"><Input type="date" value={r.expiresAt} onChange={e => ratePut(i, 'expiresAt', e.target.value)}/></Field><Button variant="ghost" className="justify-start text-destructive" onClick={() => { setRates(rows => rows.filter((_, index) => index !== i)); setDirty(true); }}><Trash2 className="mr-1 h-4 w-4"/>移除</Button></div>)}<Button variant="outline" onClick={() => { setRates(rows => [...rows, emptyRate()]); setDirty(true); }}><Plus className="mr-1 h-4 w-4"/>增加运价</Button></Card>
    <Card className="space-y-4 p-5"><h2 className="font-semibold">付款与其他约定</h2><Field label="付款条件"><Input value={form.paymentTerms} onChange={e => put('paymentTerms', e.target.value)} placeholder="例如：签收并收到发票后付款、月结"/></Field><Field label="其他约定及备注"><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={form.remarks} onChange={e => put('remarks', e.target.value)} placeholder="货损、保险、装卸费、等待费等按合同填写"/></Field></Card>
    {savedId && <AttachmentPanel title="已上传合同附件" description="草稿可增删附件，启用后保留原附件并允许追加。" attachments={attachments} uploadPath={`/logistics-contracts/${savedId}/attachments`} attachmentPath={`/logistics-contracts/${savedId}/attachments`} onChanged={() => refreshAttachments()}/>}
    <Card className="space-y-3 p-5"><h2 className="font-semibold">{savedId ? '待上传附件' : '合同附件'}</h2><p className="text-xs text-muted-foreground">支持图片或PDF文件，单个不超过20MB。草稿允许暂缺，启用合同前必须上传。</p>
      <div className="flex flex-wrap items-center gap-3"><label className={`inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-muted ${busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}><Upload className="mr-2 h-4 w-4"/>选择合同附件<input className="hidden" aria-label="选择物流合同附件" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" disabled={busy} onChange={e => { const files = selectValidAttachmentFiles(Array.from(e.currentTarget.files || [])); if (files.length) { setPending(rows => [...rows, ...files]); setDirty(true); } e.target.value = ''; }}/></label><span className="text-sm text-muted-foreground">{pending.length ? `已选择 ${pending.length} 份附件，保存草稿时上传` : '尚未选择待上传附件'}</span></div>
      {pending.map((file, i) => <div key={i} className="flex items-center justify-between gap-3 border-t pt-2 text-sm"><span className="truncate">{file.name}</span><div className="flex shrink-0 items-center gap-2"><span className="text-xs text-muted-foreground">待上传</span><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setPending(rows => rows.filter((_, n) => n !== i)); setDirty(true); }}>移除附件</Button></div></div>)}
    </Card>
    <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-background/95 p-4"><Button variant="outline" disabled={busy} onClick={() => void back()}>取消</Button><Button disabled={busy} onClick={() => void save()}><Save className="mr-2 h-4 w-4"/>{busy ? '保存中…' : '保存草稿'}</Button></div>
  </div>;
}
