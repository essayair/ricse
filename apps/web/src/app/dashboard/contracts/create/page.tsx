'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, ArrowRight, Check, FileText, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { api } from '@/lib/api';

type Step = 1 | 2 | 3;

export default function ContractCreatePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);

  const [form, setForm] = useState({
    type: 'PURCHASE' as string,
    title: '', companyId: '', sellerId: '', buyerId: '', externalNo: '',
    contactPerson: '', contactPhone: '',
    materialId: '', materialName: '', quantity: '', unit: 'TON',
    pricingType: 'FIXED', unitPrice: '',
    overfillPct: '5', shortfallPct: '5',
    deliveryMethod: '', deliveryLocation: '',
    signedAt: new Date().toISOString().split('T')[0],
    effectiveAt: '', expireAt: '',
    settlementMethod: 'DELIVERY', settlementBasis: 'WEIGHT',
    prepayPct: '', paymentDays: '30', paymentMethod: 'T/T',
    moistureRule: '', impurityRule: '', remarks: '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get<{ items: any[] }>('/partners').then(d => setPartners(d.items || [])).catch(()=>{});
    api.get<{ items: any[] }>('/master-data/materials').then(d => setMaterials(d.items || [])).catch(()=>{});
    api.get<any[]>('/org/companies').then(d => setCompanies(Array.isArray(d) ? d : [])).catch(()=>{});
  }, []);

  const totalAmount = Number(form.quantity || 0) * Number(form.unitPrice || 0);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload: any = {
        type: form.type, title: form.title || `${form.type==='PURCHASE'?'采购':form.type==='SALES'?'销售':'双边'}合同`,
        sellerId: form.sellerId, totalAmount,
        companyId: form.companyId || undefined,
        externalNo: form.externalNo || undefined,
        contactPerson: form.contactPerson || undefined, contactPhone: form.contactPhone || undefined,
        pricingType: form.pricingType, overfillPct: Number(form.overfillPct) || undefined, shortfallPct: Number(form.shortfallPct) || undefined,
        deliveryMethod: form.deliveryMethod || undefined, deliveryLocation: form.deliveryLocation || undefined,
        signedAt: form.signedAt, effectiveAt: form.effectiveAt || undefined, expireAt: form.expireAt || undefined,
        settlementMethod: form.settlementMethod, settlementBasis: form.settlementBasis,
        prepayPct: Number(form.prepayPct) || undefined, paymentDays: Number(form.paymentDays) || undefined,
        paymentMethod: form.paymentMethod || undefined,
        moistureRule: form.moistureRule || undefined, impurityRule: form.impurityRule || undefined,
        remarks: form.remarks || undefined,
      };
      if (form.type === 'BILATERAL') payload.buyerId = form.buyerId || undefined;
      if (form.materialId) payload.lineItems = [{ materialId: form.materialId, materialName: form.materialName, quantity: Number(form.quantity), unit: form.unit, unitPrice: Number(form.unitPrice) }];
      else payload.lineItems = [];

      const c = await api.post<{ id: string }>('/contracts', payload);
      router.push(`/dashboard/contracts/${c.id}`);
    } catch (e: any) { alert(e.message || '创建失败'); setSubmitting(false); }
  };

  const counterparties = form.type === 'PURCHASE' ? partners.filter(p => p.roles?.includes('SUPPLIER'))
    : form.type === 'SALES' ? partners.filter(p => p.roles?.includes('CUSTOMER')) : partners;

  const handleSelectPartner = (partnerId: string, field: string) => {
    set(field, partnerId);
    const p = partners.find(x => x.id === partnerId);
    if (p) { set('contactPerson', p.contactPerson || ''); set('contactPhone', p.contactPhone || ''); }
  };

  const handleSelectMaterial = (id: string) => {
    const m = materials.find(x => x.id === id);
    set('materialId', id);
    if (m) { set('materialName', m.name); set('unit', m.unit || 'TON'); }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <button onClick={() => router.push('/dashboard/contracts')} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
        <ArrowLeft className="h-3 w-3" /> 返回合同列表
      </button>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1,2,3].map(s => (
          <div key={s} className={`flex items-center gap-2 ${s !== 1 ? 'flex-1' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>{step > s ? <Check className="h-4 w-4" /> : s}</div>
            <span className={`text-sm ${step >= s ? 'font-medium' : 'text-muted-foreground'}`}>
              {s===1?'合同类型':s===2?'基本信息':'结算条款'}
            </span>
            {s < 3 && <div className={`flex-1 h-0.5 ${step > s ? 'bg-primary' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Type selection */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>选择合同类型</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {[
                { key: 'PURCHASE', label: '采购合同', desc: '向上游供应商采购货物', icon: TrendingDown },
                { key: 'SALES', label: '销售合同', desc: '向下游客户销售货物', icon: TrendingUp },
                { key: 'BILATERAL', label: '双边合同', desc: '以销定购，同时确定采销两端', icon: Zap },
              ].map(t => (
                <button key={t.key} type="button" onClick={() => set('type', t.key)}
                  className={`flex flex-col items-center gap-2 p-6 rounded-lg border-2 transition-colors ${
                    form.type === t.key ? 'border-primary bg-primary/5 text-primary' : 'border-input text-muted-foreground hover:border-foreground/30'
                  }`}>
                  <t.icon className="h-8 w-8" />
                  <span className="font-semibold">{t.label}</span>
                  <span className="text-xs text-center">{t.desc}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-6">
              <Button onClick={() => setStep(2)}>下一步 <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Basic info */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>合同基本信息</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input placeholder="合同标题" value={form.title} onChange={e => set('title', e.target.value)} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">我方签约主体</label>
                <select value={form.companyId} onChange={e => set('companyId', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">请选择</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                </select>
              </div>
              <div><label className="text-sm font-medium mb-1 block">外部合同号</label><Input value={form.externalNo} onChange={e => set('externalNo', e.target.value)} placeholder="对手方合同号" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">交易对手方 <span className="text-destructive">*</span></label>
                <select value={form.sellerId} onChange={e => handleSelectPartner(e.target.value, 'sellerId')} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">请选择</option>
                  {counterparties.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                </select>
              </div>
              {form.type === 'BILATERAL' && (
                <div>
                  <label className="text-sm font-medium mb-1 block">销售对手方 <span className="text-destructive">*</span></label>
                  <select value={form.buyerId} onChange={e => handleSelectPartner(e.target.value, 'buyerId')} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">请选择</option>
                    {partners.filter(p => p.roles?.includes('CUSTOMER')).map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} placeholder="联系人" />
              <Input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} placeholder="联系电话" />
            </div>

            <Separator />
            <h4 className="font-semibold text-sm">货物信息</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">物料品种 <span className="text-destructive">*</span></label>
                <select value={form.materialId} onChange={e => handleSelectMaterial(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">请选择</option>
                  {materials.map(m => <option key={m.id} value={m.id}>{m.code} {m.name} ({m.grade})</option>)}
                </select>
              </div>
              <div><label className="text-sm font-medium mb-1 block">合同数量（吨） <span className="text-destructive">*</span></label><Input type="number" value={form.quantity} onChange={e => set('quantity', e.target.value)} step="0.001" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">定价类型</label>
                <select value={form.pricingType} onChange={e => set('pricingType', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="FIXED">一口价</option><option value="BASIS">基差定价</option><option value="FLOATING">不定价</option>
                </select>
              </div>
              <div><label className="text-sm font-medium mb-1 block">单价（元/吨）</label><Input type="number" value={form.unitPrice} onChange={e => set('unitPrice', e.target.value)} step="0.01" /></div>
              <div><label className="text-sm font-medium mb-1 block">金额预览</label><div className="h-9 flex items-center font-mono font-bold text-primary">¥{totalAmount.toLocaleString()}</div></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium mb-1 block">溢装比例(%)</label><Input type="number" value={form.overfillPct} onChange={e => set('overfillPct', e.target.value)} /></div>
              <div><label className="text-sm font-medium mb-1 block">短装比例(%)</label><Input type="number" value={form.shortfallPct} onChange={e => set('shortfallPct', e.target.value)} /></div>
            </div>

            <Separator />
            <h4 className="font-semibold text-sm">履约周期</h4>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="text-sm font-medium mb-1 block">签订日期</label><Input type="date" value={form.signedAt} onChange={e => set('signedAt', e.target.value)} /></div>
              <div><label className="text-sm font-medium mb-1 block">生效日期</label><Input type="date" value={form.effectiveAt} onChange={e => set('effectiveAt', e.target.value)} /></div>
              <div><label className="text-sm font-medium mb-1 block">到期日期</label><Input type="date" value={form.expireAt} onChange={e => set('expireAt', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium mb-1 block">交货方式</label><Input value={form.deliveryMethod} onChange={e => set('deliveryMethod', e.target.value)} placeholder="供应商配送 / 自提 / 库转" /></div>
              <div><label className="text-sm font-medium mb-1 block">交货地点</label><Input value={form.deliveryLocation} onChange={e => set('deliveryLocation', e.target.value)} /></div>
            </div>

            <Separator />
            <div><label className="text-sm font-medium mb-1 block">备注</label><textarea rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" /></div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1" />上一步</Button>
              <Button onClick={() => setStep(3)}>下一步 <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Settlement */}
      {step === 3 && (
        <Card>
          <CardHeader><CardTitle>结算条款</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">结算数量依据</label>
                <select value={form.settlementBasis} onChange={e => set('settlementBasis', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="WEIGHT">地磅净重（推荐）</option><option value="QUALITY">质检干重</option><option value="CONTRACT">合同约定数量</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">结算方式</label>
                <select value={form.settlementMethod} onChange={e => set('settlementMethod', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="DELIVERY">按交货结算</option><option value="PREPAY">预付</option><option value="INSTALLMENT">分期</option><option value="MONTHLY_30">月结30天</option><option value="MONTHLY_60">月结60天</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="text-sm font-medium mb-1 block">预付比例(%)</label><Input type="number" value={form.prepayPct} onChange={e => set('prepayPct', e.target.value)} /></div>
              <div><label className="text-sm font-medium mb-1 block">尾款账期（天）</label><Input type="number" value={form.paymentDays} onChange={e => set('paymentDays', e.target.value)} /></div>
              <div>
                <label className="text-sm font-medium mb-1 block">付款方式</label>
                <select value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="T/T">电汇 T/T</option><option value="BANK_ACCEPTANCE">银行承兑汇票</option><option value="COMMERCIAL_ACCEPTANCE">商业承兑汇票</option><option value="L/C">信用证 L/C</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium mb-1 block">扣水规则</label><Input value={form.moistureRule} onChange={e => set('moistureRule', e.target.value)} placeholder="每超0.1%扣款（元/吨）" /></div>
              <div><label className="text-sm font-medium mb-1 block">扣杂规则</label><Input value={form.impurityRule} onChange={e => set('impurityRule', e.target.value)} placeholder="每超0.1%扣款（元/吨）" /></div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-1" />上一步</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.push('/dashboard/contracts')}>取消</Button>
                <Button onClick={handleSubmit} disabled={submitting}>{submitting ? '提交中...' : '提交审批'}</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Separator() { return <div className="h-px bg-border my-2" />; }
