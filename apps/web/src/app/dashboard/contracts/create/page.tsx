'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, TrendingDown, TrendingUp, Zap, Save } from 'lucide-react';
import { api, API_BASE_URL } from '@/lib/api';
import { openLocalAttachment } from '@/lib/attachment-preview';

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

interface DepartmentItem {
  id: string;
  name: string;
  companyId: string;
  company?: { id: string; name: string };
}

interface CurrentUserProfile {
  companyId?: string | null;
  employee?: { departmentId?: string | null } | null;
}

export default function ContractCreatePage() {
  const router = useRouter();
  const [clientRequestId] = useState(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `contract-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });
  const [submitting, setSubmitting] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [internalPartners, setInternalPartners] = useState<any[]>([]);
  const [supplierPartners, setSupplierPartners] = useState<any[]>([]);
  const [customerPartners, setCustomerPartners] = useState<any[]>([]);
  const [allPartners, setAllPartners] = useState<any[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [files, setFiles] = useState<Array<{ file: File; name: string }>>([]);
  const [draftId, setDraftId] = useState<string | null>(null);

  const [form, setForm] = useState({
    type: 'PURCHASE' as string, title: '',
    signingPartnerId: '', departmentId: '', externalNo: '',
    sellerId: '', buyerId: '', contactPerson: '', contactPhone: '',
    materialId: '', materialName: '', quantity: '', unit: 'TON',
    pricingType: 'FIXED', unitPrice: '', saleUnitPrice: '', overfillPct: '5', shortfallPct: '5',
    deliveryMethod: '', deliveryLocation: '',
    signedAt: new Date().toISOString().split('T')[0], effectiveAt: '', expireAt: '',
    settlementMethod: 'DELIVERY', settlementBasis: 'WEIGHT',
    prepayPct: '', paymentDays: '30', paymentMethod: 'T/T',
    moistureRule: '', impurityRule: '', remarks: '',
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    // 并行加载：供应商+客户+内部企业
    Promise.all([
      api.get<{ items: any[] }>('/partners?role=SUPPLIER'),
      api.get<{ items: any[] }>('/partners?role=CUSTOMER'),
      api.get<{ items: any[] }>('/partners'),
    ]).then(([supplierRes, customerRes, allRes]) => {
      const suppliers = supplierRes?.items || [];
      const customers = customerRes?.items || [];
      const all = allRes?.items || [];
      setPartners(all);
      setAllPartners(all);
      setSupplierPartners(suppliers);
      setCustomerPartners(customers);
      setInternalPartners(all.filter((p: any) => p.isInternal));
    }).catch(() => {});
    api.get<{ items: any[] }>('/master-data/materials').then(d => setMaterials(d.items || [])).catch(()=>{});
    Promise.all([
      api.get<DepartmentItem[]>('/org/departments'),
      api.get<CurrentUserProfile>('/auth/profile'),
    ]).then(([departmentItems, profile]) => {
      const visibleDepartments = profile.companyId
        ? departmentItems.filter((item) => item.companyId === profile.companyId)
        : departmentItems;
      setDepartments(visibleDepartments);
      setForm(current => ({
        ...current,
        departmentId: current.departmentId || profile.employee?.departmentId || '',
      }));
    }).catch(() => {});
  }, []);

  const qty = Number(form.quantity || 0);
  const purchaseUnitPrice = Number(form.unitPrice || 0);
  const saleUnitPrice = Number(form.saleUnitPrice || 0);
  const purchaseAmount = qty * purchaseUnitPrice;
  const saleAmount = qty * saleUnitPrice;
  const totalAmount = form.type === 'BILATERAL' ? purchaseAmount : purchaseAmount;
  const profit = saleAmount - purchaseAmount;


  const handleSelectPartner = (id: string, field: string) => {
    set(field, id);
    const p = allPartners.find(x => x.id === id);
    if (p) { set('contactPerson', p.contactPerson || ''); set('contactPhone', p.contactPhone || ''); }
  };

  const handleSelectMaterial = (id: string) => {
    const m = materials.find(x => x.id === id);
    set('materialId', id);
    if (m) { set('materialName', m.name); set('unit', m.unit || 'TON'); }
  };

  const buildPayload = () => ({
    type: form.type, title: form.title || `${form.type==='PURCHASE'?'采购':form.type==='SALES'?'销售':'双边'}合同`,
    sellerId: form.sellerId, totalAmount,
    signingPartnerId: form.signingPartnerId || undefined,
    departmentId: form.departmentId || undefined,
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
    ...(form.type === 'BILATERAL' ? { buyerId: form.buyerId || undefined } : {}),
    lineItems: form.materialId ? [{
      materialId: form.materialId, materialName: form.materialName,
      quantity: Number(form.quantity), unit: form.unit,
      unitPrice: Number(form.unitPrice),
    }] : [],
    // bilateral extra: sale price stored in totalAmount as purchase total (sale info in remarks for now)
    ...(form.type === 'BILATERAL' && form.saleUnitPrice ? {
      remarks: [form.remarks, `销售单价:${form.saleUnitPrice}元/吨 销售金额:${saleAmount} 毛利:${profit}`].filter(Boolean).join(' | ')
    } : {}),
  });

  const uploadAttachments = async (contractId: string) => {
    const pendingFiles = [...files];
    for (const item of pendingFiles) {
      const fd = new FormData();
      fd.append('file', item.file);
      fd.append('category', 'OTHER');
      fd.append('originalName', item.name.trim() || item.file.name);
      const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/attachments`, {
        method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, body: fd,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `附件 ${item.name} 上传失败`);
      }
      // 上传成功后立即从待上传列表移除，后续重试不会重复上传。
      setFiles(current => current.filter(entry => entry !== item));
    }
  };

  const ensureDraft = async () => {
    const payload = buildPayload();
    if (draftId) {
      await api.patch(`/contracts/${draftId}`, payload);
      return draftId;
    }

    const contract = await api.post<{ id: string }>('/contracts', {
      ...payload,
      clientRequestId,
    });
    // 合同一经创建立即记录 ID；后续上传或审批失败时只更新该草稿。
    setDraftId(contract.id);
    return contract.id;
  };

  const handleSaveDraft = async () => {
    setSubmitting(true);
    try {
      const contractId = await ensureDraft();
      if (files.length > 0) await uploadAttachments(contractId);
      router.push(`/dashboard/contracts/${contractId}`);
    } catch (e: any) {
      alert(e.message || '保存失败');
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.signingPartnerId) { alert('请选择我方签约主体'); return; }
    if (!form.departmentId) { alert('请选择业务部门，审批流程将据此匹配业务主管'); return; }
    if (!form.sellerId) { alert('请选择交易对手方'); return; }
    if (!form.materialId || !form.quantity || !form.unitPrice) { alert('请完整填写货物信息（物料/数量/单价）'); return; }
    if (form.type === 'BILATERAL' && !form.buyerId) { alert('双边合同请选择销售对手方'); return; }
    setSubmitting(true);
    let contractId = draftId;
    try {
      contractId = await ensureDraft();
      // 在上传附件前检查审批配置，避免附件上传完成后才发现流程不可用。
      await api.get(`/contracts/${contractId}/approval-readiness`);
      // 附件属于草稿内容，应在进入审批前完成；上传失败时合同仍可继续编辑。
      if (files.length > 0) await uploadAttachments(contractId);
      await api.patch(`/contracts/${contractId}/status`, { status: 'PENDING_APPROVAL' });
      router.push(`/dashboard/contracts/${contractId}`);
    } catch (e: any) {
      alert(contractId
        ? `合同已保存为草稿，不会重复创建。\n提交审批失败：${e.message || '请检查审批流程配置'}`
        : e.message || '提交失败');
      setSubmitting(false);
    }
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
        {/* 合同类型 + 基本信息 */}
        <Card className="p-6">
          <SectionTitle>合同类型</SectionTitle>
          <div className="flex gap-2 mb-6">
            {[
              { key: 'PURCHASE', label: '采购合同' },
              { key: 'SALES', label: '销售合同' },
              { key: 'BILATERAL', label: '双边合同' },
            ].map(t => (
              <button key={t.key} type="button" onClick={() => set('type', t.key)}
                className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                  form.type === t.key ? 'border-primary bg-primary/5 text-primary' : 'border-input text-muted-foreground hover:border-foreground/30'}`}>{t.label}</button>
            ))}
          </div>

          <SectionTitle>合同基本信息</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="col-span-2"><FormField label="合同标题"><Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="如：采购萤石粉CaF₂≥97% 5000吨" /></FormField></div>
            <FormField label="我方签约主体（内部）">
              <select value={form.signingPartnerId} onChange={e => set('signingPartnerId', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">请选择</option>
                {internalPartners
                  .filter(p => form.type === 'BILATERAL' || p.roles?.includes(form.type === 'PURCHASE' ? 'CUSTOMER' : 'SUPPLIER'))
                  .map(p => {
                    const selectedAsCounterparty = p.id === form.sellerId || p.id === form.buyerId;
                    return <option key={p.id} value={p.id} disabled={selectedAsCounterparty}>{p.code} {p.name}{selectedAsCounterparty ? '（已选为对手方）' : ''}</option>;
                  })}
              </select>
            </FormField>
            <FormField label="业务部门" required>
              <select value={form.departmentId} onChange={e => set('departmentId', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">请选择业务部门</option>
                {departments.map(department => (
                  <option key={department.id} value={department.id}>
                    {department.company?.name ? `${department.company.name} / ` : ''}{department.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">默认带入当前发起人员工档案中的所属部门，可按实际业务调整；同时用于匹配按部门配置的审批节点</span>
            </FormField>
            <FormField label="外部合同号"><Input value={form.externalNo} onChange={e => set('externalNo', e.target.value)} placeholder="对手方合同号，方便对账" /></FormField>
          </div>

          <SectionTitle>交易对手方</SectionTitle>
          {form.type === 'BILATERAL' ? (
            <>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3 p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg">
                  <div className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">上游 — 供应商（采购端）</div>
                  <FormField label="供应商" required>
                    <select value={form.sellerId} onChange={e => handleSelectPartner(e.target.value, 'sellerId')} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">请选择</option>
                      {supplierPartners.map(p => <option key={p.id} value={p.id} disabled={p.id === form.signingPartnerId}>{p.code} {p.name}{p.id === form.signingPartnerId ? '（我方）' : ''}</option>)}
                    </select>
                  </FormField>
                </div>
                <div className="space-y-3 p-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">下游 — 客户（销售端）</div>
                  <FormField label="客户" required>
                    <select value={form.buyerId} onChange={e => handleSelectPartner(e.target.value, 'buyerId')} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">请选择</option>
                      {customerPartners.map(p => {
                        const disabled = p.id === form.signingPartnerId || p.id === form.sellerId;
                        const suffix = p.id === form.signingPartnerId ? '（我方）' : p.id === form.sellerId ? '（已选为上游）' : '';
                        return <option key={p.id} value={p.id} disabled={disabled}>{p.code} {p.name}{suffix}</option>;
                      })}
                    </select>
                  </FormField>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-4">
                <FormField label="联系人"><Input value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></FormField>
                <FormField label="联系电话"><Input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} /></FormField>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <FormField label={form.type === 'PURCHASE' ? '供应商' : '客户'} required>
                <select value={form.sellerId} onChange={e => handleSelectPartner(e.target.value, 'sellerId')} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">请选择</option>
                  {(form.type === 'PURCHASE' ? supplierPartners : customerPartners).map(p => (
                    <option key={p.id} value={p.id} disabled={p.id === form.signingPartnerId}>{p.code} {p.name}{p.id === form.signingPartnerId ? '（我方）' : ''}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="联系人"><Input value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></FormField>
              <FormField label="联系电话"><Input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} /></FormField>
            </div>
          )}
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
          {form.type === 'BILATERAL' && (
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
              <FormField label="采购单价（元/吨）"><Input type="number" value={form.unitPrice} onChange={e => set('unitPrice', e.target.value)} step="0.01" /></FormField>
              <FormField label="销售单价（元/吨）"><Input type="number" value={form.saleUnitPrice} onChange={e => set('saleUnitPrice', e.target.value)} step="0.01" /></FormField>
            </div>
          )}
          {(totalAmount > 0 || profit !== 0) && (
            <div className="mt-4 p-3 bg-muted/30 rounded-lg text-sm space-y-1">
              {form.type !== 'BILATERAL' && purchaseAmount > 0 && (
                <div><span className="text-muted-foreground">合同总金额：</span><span className="text-lg font-bold text-primary ml-2">¥{purchaseAmount.toLocaleString()}</span></div>
              )}
              {form.type === 'BILATERAL' && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">采购金额：</span><span className="font-mono">¥{purchaseAmount.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">销售金额：</span><span className="font-mono">¥{saleAmount.toLocaleString()}</span></div>
                  <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">预计毛利：</span><span className={`font-bold ${profit > 0 ? 'text-success' : 'text-destructive'}`}>¥{profit.toLocaleString()}</span></div>
                </>
              )}
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

        {/* Attachments */}
        <Card className="p-6 mt-4">
          <SectionTitle>合同附件</SectionTitle>
          <p className="text-xs text-muted-foreground mb-3">上传合同扫描件、签章文件等。支持 JPG/PNG/PDF。</p>
          <label className="block border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
            <input type="file" multiple accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => {
              const selectedFiles = Array.from(e.currentTarget.files || []);
              setFiles(prev => [...prev, ...selectedFiles.map(file => ({ file, name: file.name }))]);
              e.target.value = '';
            }} className="hidden" />
            <div className="text-2xl mb-2">📎</div>
            <div className="text-sm font-semibold">点击或拖拽上传附件</div>
            <div className="text-xs text-muted-foreground mt-1">纸质合同扫描件、签章文件等</div>
          </label>
          {files.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {files.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded bg-muted/50">
                  <button type="button" onClick={() => {
                    try { openLocalAttachment(item.file); }
                    catch (e: any) { alert(e.message || '附件打开失败'); }
                  }} className="shrink-0 text-primary hover:underline">查看</button>
                  <Input value={item.name} onChange={e => setFiles(current => current.map((entry, index) => index === i ? { ...entry, name: e.target.value } : entry))} placeholder="附件名称" />
                  <span className="shrink-0 text-xs text-muted-foreground">{(item.file.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => {
                    try { openLocalAttachment(item.file); }
                    catch (e: any) { alert(e.message || '附件打开失败'); }
                  }} className="text-primary text-xs">预览</button>
                  <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-destructive text-xs">×</button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Bottom actions */}
        <div className="flex justify-between pb-8 border-t pt-6 mt-6">
          <Button variant="outline" onClick={() => router.push('/dashboard/contracts')}>取消</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSaveDraft} disabled={submitting}><Save className="h-4 w-4 mr-1" />保存草稿</Button>
            <Button onClick={handleSubmit} disabled={submitting} size="lg">{submitting ? '提交中...' : '提交审批'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
