'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, TrendingDown, TrendingUp, Zap, Save } from 'lucide-react';
import { api } from '@/lib/api';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-2 mb-4 mt-6 first:mt-0">{children}</div>;
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5"><label className="text-sm font-medium">{label}{required && <span className="text-destructive ml-0.5">*</span>}</label>{children}</div>;
}

function SelectField({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[] | { id: string; label: string }[]; placeholder?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
      <option value="">{placeholder || '请选择'}</option>
      {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

export default function ContractCreatePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);

  const [form, setForm] = useState({
    type: 'PURCHASE' as string, title: '',
    companyId: '', externalNo: '',
    sellerId: '', buyerId: '', contactPerson: '', contactPhone: '',
    materialId: '', materialName: '', quantity: '', unit: 'TON',
    pricingType: 'FIXED', unitPrice: '', overfillPct: '5', shortfallPct: '5',
    deliveryMethod: '', deliveryLocation: '',
    signedAt: new Date().toISOString().split('T')[0], effectiveAt: '', expireAt: '',
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

  // Filter partners by contract type
  const counterparties = form.type === 'PURCHASE' ? partners.filter(p => p.roles?.includes('SUPPLIER'))
    : form.type === 'SALES' ? partners.filter(p => p.roles?.includes('CUSTOMER')) : partners;

  const handleSelectPartner = (id: string, field: string) => {
    set(field, id);
    const p = partners.find(x => x.id === id);
    if (p) { set('contactPerson', p.contactPerson || ''); set('contactPhone', p.contactPhone || ''); }
  };

  const handleSelectMaterial = (id: string) => {
    const m = materials.find(x => x.id === id);
    set('materialId', id);
    if (m) { set('materialName', m.name); set('unit', m.unit || 'TON'); }
  };

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/contracts')}><ArrowLeft className="h-4 w-4 mr-1" />返回</Button>
          <div><h1 className="text-2xl font-bold">新建合同</h1><p className="text-sm text-muted-foreground mt-0.5">填写合同信息后提交审批</p></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/dashboard/contracts')}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting}><Save className="h-4 w-4 mr-1" />{submitting ? '提交中...' : '提交审批'}</Button>
        </div>
      </div>

      <div className="max-w-4xl">
        {/* 合同类型 */}
        <Card className="p-6">
          <SectionTitle>合同类型</SectionTitle>
          <div className="grid grid-cols-3 gap-4">
            {[
              { key: 'PURCHASE', label: '采购合同', desc: '向上游供应商采购货物', icon: TrendingDown },
              { key: 'SALES', label: '销售合同', desc: '向下游客户销售货物', icon: TrendingUp },
              { key: 'BILATERAL', label: '双边合同', desc: '以销定购，同时确定采销两端', icon: Zap },
            ].map(t => (
              <button key={t.key} type="button" onClick={() => set('type', t.key)}
                className={`flex flex-col items-center gap-2 p-6 rounded-lg border-2 transition-colors ${
                  form.type === t.key ? 'border-primary bg-primary/5 text-primary' : 'border-input text-muted-foreground hover:border-foreground/30'}`}>
                <t.icon className="h-8 w-8" /><span className="font-semibold">{t.label}</span><span className="text-xs text-center">{t.desc}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* 基本信息 */}
        <Card className="p-6 mt-4">
          <SectionTitle>合同基本信息</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="col-span-2"><FormField label="合同标题"><Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="如：采购萤石粉CaF₂≥97% 5000吨" /></FormField></div>
            <FormField label="我方签约主体">
              <select value={form.companyId} onChange={e => set('companyId', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">请选择</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
              </select>
            </FormField>
            <FormField label="外部合同号"><Input value={form.externalNo} onChange={e => set('externalNo', e.target.value)} placeholder="对手方合同号，方便对账" /></FormField>
          </div>

          <SectionTitle>交易对手方</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <FormField label={form.type === 'PURCHASE' ? '供应商' : form.type === 'SALES' ? '客户' : '采购对手方'} required>
              <select value={form.sellerId} onChange={e => handleSelectPartner(e.target.value, 'sellerId')} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">请选择</option>
                {counterparties.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
              </select>
            </FormField>
            {form.type === 'BILATERAL' && (
              <FormField label="销售对手方" required>
                <select value={form.buyerId} onChange={e => handleSelectPartner(e.target.value, 'buyerId')} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">请选择</option>
                  {partners.filter(p => p.roles?.includes('CUSTOMER')).map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                </select>
              </FormField>
            )}
            <FormField label="联系人"><Input value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></FormField>
            <FormField label="联系电话"><Input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} /></FormField>
          </div>
        </Card>

        {/* 货物与价格 */}
        <Card className="p-6 mt-4">
          <SectionTitle>货物与价格</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <FormField label="物料品种" required>
              <select value={form.materialId} onChange={e => handleSelectMaterial(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">请选择</option>
                {materials.map(m => <option key={m.id} value={m.id}>{m.code} {m.name} {m.grade ? `(${m.grade})` : ''}</option>)}
              </select>
            </FormField>
            <FormField label="合同数量（吨）" required><Input type="number" value={form.quantity} onChange={e => set('quantity', e.target.value)} step="0.001" /></FormField>
            <FormField label="定价类型">
              <select value={form.pricingType} onChange={e => set('pricingType', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="FIXED">一口价</option><option value="BASIS">基差定价</option><option value="FLOATING">不定价</option>
              </select>
            </FormField>
            <FormField label="单价（元/吨）"><Input type="number" value={form.unitPrice} onChange={e => set('unitPrice', e.target.value)} step="0.01" /></FormField>
            <FormField label="溢装比例(%)"><Input type="number" value={form.overfillPct} onChange={e => set('overfillPct', e.target.value)} /></FormField>
            <FormField label="短装比例(%)"><Input type="number" value={form.shortfallPct} onChange={e => set('shortfallPct', e.target.value)} /></FormField>
          </div>
          {totalAmount > 0 && (
            <div className="mt-4 p-3 bg-muted/30 rounded-lg text-sm">
              <span className="text-muted-foreground">合同总金额：</span>
              <span className="text-lg font-bold text-primary ml-2">¥{totalAmount.toLocaleString()}</span>
            </div>
          )}
        </Card>

        {/* 履约与交货 */}
        <Card className="p-6 mt-4">
          <SectionTitle>履约与交货</SectionTitle>
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <FormField label="签订日期"><Input type="date" value={form.signedAt} onChange={e => set('signedAt', e.target.value)} /></FormField>
            <FormField label="生效日期"><Input type="date" value={form.effectiveAt} onChange={e => set('effectiveAt', e.target.value)} /></FormField>
            <FormField label="到期日期"><Input type="date" value={form.expireAt} onChange={e => set('expireAt', e.target.value)} /></FormField>
            <FormField label="交货方式"><Input value={form.deliveryMethod} onChange={e => set('deliveryMethod', e.target.value)} placeholder="供应商配送 / 自提 / 库转" /></FormField>
            <FormField label="交货地点"><Input value={form.deliveryLocation} onChange={e => set('deliveryLocation', e.target.value)} /></FormField>
            <FormField label="备注"><Input value={form.remarks} onChange={e => set('remarks', e.target.value)} /></FormField>
          </div>
        </Card>

        {/* 结算条款 */}
        <Card className="p-6 mt-4">
          <SectionTitle>结算条款</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <FormField label="结算数量依据">
              <select value={form.settlementBasis} onChange={e => set('settlementBasis', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="WEIGHT">地磅净重（推荐）</option><option value="QUALITY">质检干重</option><option value="CONTRACT">合同约定数量</option>
              </select>
            </FormField>
            <FormField label="结算方式">
              <select value={form.settlementMethod} onChange={e => set('settlementMethod', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="DELIVERY">按交货结算</option><option value="PREPAY">预付</option><option value="INSTALLMENT">分期</option><option value="MONTHLY_30">月结30天</option><option value="MONTHLY_60">月结60天</option>
              </select>
            </FormField>
            <FormField label="预付比例(%)"><Input type="number" value={form.prepayPct} onChange={e => set('prepayPct', e.target.value)} /></FormField>
            <FormField label="尾款账期（天）"><Input type="number" value={form.paymentDays} onChange={e => set('paymentDays', e.target.value)} /></FormField>
            <FormField label="付款方式">
              <select value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="T/T">电汇 T/T</option><option value="BANK_ACCEPTANCE">银行承兑汇票</option><option value="COMMERCIAL_ACCEPTANCE">商业承兑汇票</option><option value="L/C">信用证 L/C</option>
              </select>
            </FormField>
            <FormField label="扣水规则"><Input value={form.moistureRule} onChange={e => set('moistureRule', e.target.value)} placeholder="每超0.1%扣款（元/吨）" /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-4">
            <FormField label="扣杂规则"><Input value={form.impurityRule} onChange={e => set('impurityRule', e.target.value)} placeholder="每超0.1%扣款（元/吨）" /></FormField>
          </div>
        </Card>

        {/* Bottom actions */}
        <div className="flex justify-end gap-3 pb-8 border-t pt-6 mt-6">
          <Button variant="outline" onClick={() => router.push('/dashboard/contracts')}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting} size="lg"><Save className="h-4 w-4 mr-1" />{submitting ? '提交中...' : '提交审批'}</Button>
        </div>
      </div>
    </div>
  );
}
