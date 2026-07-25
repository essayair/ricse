'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, Plus, Trash2, Paperclip, Loader2, Pencil, X } from 'lucide-react';
import { api, API_BASE_URL } from '@/lib/api';
import { openLocalAttachment, openStoredAttachment } from '@/lib/attachment-preview';
import { unitLabel } from '@/lib/unit';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-2 mb-4 mt-6 first:mt-0">{children}</div>;
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">{label}{required && <span className="text-destructive ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}

const SELECT_CLS = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring';

interface LineItem {
  materialId: string;
  materialName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  deliveryDate: string;
  remarks: string;
}

export default function ContractEditPage() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [internalPartners, setInternalPartners] = useState<any[]>([]);
  const [supplierPartners, setSupplierPartners] = useState<any[]>([]);
  const [customerPartners, setCustomerPartners] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ file: File; name: string }>>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);

  const [form, setForm] = useState({
    type: 'PURCHASE', title: '',
    signingPartnerId: '', externalNo: '',
    sellerId: '', buyerId: '', contactPerson: '', contactPhone: '',
    pricingType: 'FIXED', overfillPct: '5', shortfallPct: '5',
    deliveryMethod: '', deliveryLocation: '',
    signedAt: '', effectiveAt: '', expireAt: '',
    settlementMethod: 'DELIVERY', settlementBasis: 'WEIGHT',
    prepayPct: '', paymentDays: '30', paymentMethod: 'T/T',
    moistureRule: '', impurityRule: '', remarks: '',
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([{
    materialId: '', materialName: '', quantity: '', unit: 'TON',
    unitPrice: '', deliveryDate: '', remarks: '',
  }]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    Promise.all([
      api.get<any>(`/contracts/${contractId}`),
      api.get<{ items: any[] }>('/partners?role=SUPPLIER'),
      api.get<{ items: any[] }>('/partners?role=CUSTOMER'),
      api.get<{ items: any[] }>('/partners'),
      api.get<{ items: any[] }>('/master-data/materials'),
    ]).then(([contract, supplierData, customerData, allData, materialData]) => {
      const suppliers = supplierData.items || [];
      const customers = customerData.items || [];
      const all = allData.items || [];
      setPartners(all);
      setSupplierPartners(suppliers);
      setCustomerPartners(customers);
      setInternalPartners(all.filter((p: any) => p.isInternal));
      setMaterials(materialData.items || []);
      setAttachments(contract.attachments || []);

      setForm({
        type: contract.type || 'PURCHASE',
        title: contract.title || '',
        signingPartnerId: contract.signingPartnerId || '',
        externalNo: contract.externalNo || '',
        sellerId: contract.sellerId || '',
        buyerId: contract.buyerId || '',
        contactPerson: contract.contactPerson || '',
        contactPhone: contract.contactPhone || '',
        pricingType: contract.pricingType || 'FIXED',
        overfillPct: contract.overfillPct || '5',
        shortfallPct: contract.shortfallPct || '5',
        deliveryMethod: contract.deliveryMethod || '',
        deliveryLocation: contract.deliveryLocation || '',
        signedAt: contract.signedAt ? contract.signedAt.split('T')[0] : '',
        effectiveAt: contract.effectiveAt ? contract.effectiveAt.split('T')[0] : '',
        expireAt: contract.expireAt ? contract.expireAt.split('T')[0] : '',
        settlementMethod: contract.settlementMethod || 'DELIVERY',
        settlementBasis: contract.settlementBasis || 'WEIGHT',
        prepayPct: contract.prepayPct || '',
        paymentDays: contract.paymentDays || '30',
        paymentMethod: contract.paymentMethod || 'T/T',
        moistureRule: contract.moistureRule || '',
        impurityRule: contract.impurityRule || '',
        remarks: contract.remarks || '',
      });

      if (contract.lineItems?.length > 0) {
        setLineItems(contract.lineItems.map((item: any) => ({
          materialId: item.materialId || '',
          materialName: item.materialName || '',
          quantity: String(item.quantity || ''),
          unit: item.unit || 'TON',
          unitPrice: String(item.unitPrice || ''),
          deliveryDate: item.deliveryDate ? item.deliveryDate.split('T')[0] : '',
          remarks: item.remarks || '',
        })));
      }
    }).catch(e => {
      alert('加载失败：' + e.message);
      router.push(`/dashboard/contracts/${contractId}`);
    }).finally(() => setLoading(false));
  }, [contractId]);

  const updateLineItem = (idx: number, key: keyof LineItem, value: string) => {
    setLineItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      if (key === 'materialId') {
        const m = materials.find((x: any) => x.id === value);
        if (m) { next[idx].materialName = m.name; next[idx].unit = m.unit || 'TON'; }
      }
      return next;
    });
  };

  const addLineItem = () => setLineItems(prev => [
    ...prev,
    { materialId: '', materialName: '', quantity: '', unit: 'TON', unitPrice: '', deliveryDate: '', remarks: '' },
  ]);

  const removeLineItem = (idx: number) => {
    if (lineItems.length === 1) return;
    setLineItems(prev => prev.filter((_, i) => i !== idx));
  };

  const totalAmount = lineItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  }, 0);

  const handleSave = async () => {
    if (!form.signingPartnerId) { alert('请选择我方签约主体'); return; }
    if (!form.sellerId) { alert('请选择交易对手方'); return; }
    const validItems = lineItems.filter(i => i.materialId && i.quantity && i.unitPrice);
    if (validItems.length === 0) { alert('请至少填写一条货物信息（物料/数量/单价）'); return; }

    setSubmitting(true);
    try {
      await api.patch(`/contracts/${contractId}`, {
        ...form,
        totalAmount,
        overfillPct: Number(form.overfillPct) || undefined,
        shortfallPct: Number(form.shortfallPct) || undefined,
        prepayPct: Number(form.prepayPct) || undefined,
        paymentDays: Number(form.paymentDays) || undefined,
        signedAt: form.signedAt || undefined,
        effectiveAt: form.effectiveAt || undefined,
        expireAt: form.expireAt || undefined,
        buyerId: form.buyerId || undefined,
        signingPartnerId: form.signingPartnerId || undefined,
        lineItems: validItems.map(item => ({
          materialId: item.materialId,
          materialName: item.materialName,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice),
          deliveryDate: item.deliveryDate || undefined,
          remarks: item.remarks || undefined,
        })),
      });
      router.push(`/dashboard/contracts/${contractId}`);
    } catch (e: any) {
      alert(e.message || '保存失败');
      setSubmitting(false);
    }
  };

  const uploadAttachments = async () => {
    if (pendingAttachments.length === 0) return;
    setUploadingAttachments(true);
    try {
      for (const item of pendingAttachments) {
        const body = new FormData();
        body.append('file', item.file);
        body.append('category', 'OTHER');
        body.append('originalName', item.name.trim() || item.file.name);
        const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/attachments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          body,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || `附件 ${item.name} 上传失败`);
        setAttachments(current => [result, ...current]);
      }
      setPendingAttachments([]);
    } catch (e: any) {
      alert(e.message || '上传附件失败');
    } finally {
      setUploadingAttachments(false);
    }
  };

  const viewPendingAttachment = (file: File) => {
    try {
      openLocalAttachment(file);
    } catch (e: any) {
      alert(e.message || '附件打开失败');
    }
  };

  const deleteAttachment = async (id: string) => {
    if (!confirm('确定删除这个附件吗？')) return;
    try {
      await api.delete(`/contracts/attachments/${id}`);
      setAttachments(current => current.filter(item => item.id !== id));
    } catch (e: any) {
      alert(e.message || '删除附件失败');
    }
  };

  const renameAttachment = async (attachment: any) => {
    const originalName = prompt('请输入新的附件名称', attachment.originalName)?.trim();
    if (!originalName || originalName === attachment.originalName) return;
    try {
      const updated = await api.patch<any>(`/contracts/attachments/${attachment.id}/name`, { originalName });
      setAttachments(current => current.map(item => item.id === attachment.id ? updated : item));
    } catch (e: any) {
      alert(e.message || '修改附件名称失败');
    }
  };

  const viewStoredAttachment = async (id: string) => {
    try {
      await openStoredAttachment(`/contracts/attachments/${id}/view-url`);
    } catch (e: any) {
      alert(e.message || '附件打开失败');
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/contracts/${contractId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" />返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold">编辑合同</h1>
            <p className="text-sm text-muted-foreground mt-0.5">修改后可重新提交审批</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/dashboard/contracts/${contractId}`)}>取消</Button>
          <Button onClick={handleSave} disabled={submitting}>
            <Save className="h-4 w-4 mr-1" />{submitting ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      <div className="max-w-4xl space-y-4">
        {/* 基本信息 */}
        <Card className="p-6">
          <SectionTitle>合同基本信息</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="col-span-2">
              <FormField label="合同标题" required>
                <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="如：采购萤石粉CaF₂≥97% 5000吨" />
              </FormField>
            </div>
            <FormField label="合同类型">
              <div className="flex gap-2">
                {[{ key: 'PURCHASE', label: '采购' }, { key: 'SALES', label: '销售' }, { key: 'BILATERAL', label: '双边' }].map(t => (
                  <button key={t.key} type="button" onClick={() => set('type', t.key)}
                    className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${form.type === t.key ? 'border-primary bg-primary/5 text-primary' : 'border-input text-muted-foreground'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="外部合同号">
              <Input value={form.externalNo} onChange={e => set('externalNo', e.target.value)} placeholder="对手方合同号" />
            </FormField>
            <FormField label="我方签约主体（内部）">
              <select value={form.signingPartnerId} onChange={e => set('signingPartnerId', e.target.value)} className={SELECT_CLS}>
                <option value="">请选择</option>
                {internalPartners
                  .filter(p => form.type === 'BILATERAL' || p.roles?.includes(form.type === 'PURCHASE' ? 'CUSTOMER' : 'SUPPLIER'))
                  .map(p => {
                    const selectedAsCounterparty = p.id === form.sellerId || p.id === form.buyerId;
                    return <option key={p.id} value={p.id} disabled={selectedAsCounterparty}>{p.code} {p.name}{selectedAsCounterparty ? '（已选为对手方）' : ''}</option>;
                  })}
              </select>
            </FormField>
          </div>

          <SectionTitle>交易对手方</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <FormField label={form.type === 'PURCHASE' ? '供应商' : form.type === 'SALES' ? '客户' : '上游供应商'} required>
              <select value={form.sellerId} onChange={e => set('sellerId', e.target.value)} className={SELECT_CLS}>
                <option value="">请选择</option>
                {(form.type === 'PURCHASE' || form.type === 'BILATERAL' ? supplierPartners : customerPartners).map(p => <option key={p.id} value={p.id} disabled={p.id === form.signingPartnerId}>{p.code} {p.name}{p.id === form.signingPartnerId ? '（我方）' : ''}</option>)}
              </select>
            </FormField>
            {form.type === 'BILATERAL' && (
              <FormField label="下游客户" required>
                <select value={form.buyerId} onChange={e => set('buyerId', e.target.value)} className={SELECT_CLS}>
                  <option value="">请选择</option>
                  {customerPartners.map(p => {
                    const disabled = p.id === form.signingPartnerId || p.id === form.sellerId;
                    const suffix = p.id === form.signingPartnerId ? '（我方）' : p.id === form.sellerId ? '（已选为上游）' : '';
                    return <option key={p.id} value={p.id} disabled={disabled}>{p.code} {p.name}{suffix}</option>;
                  })}
                </select>
              </FormField>
            )}
            <FormField label="联系人">
              <Input value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} />
            </FormField>
            <FormField label="联系电话">
              <Input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} />
            </FormField>
          </div>
        </Card>

        {/* 货物行项 */}
        <Card className="p-6">
          <SectionTitle>货物与价格</SectionTitle>
          <div className="space-y-3">
            {lineItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 border rounded-lg bg-muted/20">
                <div className="col-span-3">
                  <label className="text-xs text-muted-foreground">物料{idx === 0 && <span className="text-destructive">*</span>}</label>
                  <select value={item.materialId} onChange={e => updateLineItem(idx, 'materialId', e.target.value)} className={SELECT_CLS + ' mt-1'}>
                    <option value="">请选择</option>
                    {materials.map((m: any) => <option key={m.id} value={m.id}>{m.code} {m.name}{m.grade ? ` (${m.grade})` : ''}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">数量{idx === 0 && <span className="text-destructive">*</span>}</label>
                  <Input className="mt-1" type="number" step="0.001" value={item.quantity} onChange={e => updateLineItem(idx, 'quantity', e.target.value)} />
                </div>
                <div className="col-span-1">
                  <label className="text-xs text-muted-foreground">单位</label>
                  <Input className="mt-1" value={unitLabel(item.unit)} onChange={e => updateLineItem(idx, 'unit', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">单价(元/吨){idx === 0 && <span className="text-destructive">*</span>}</label>
                  <Input className="mt-1" type="number" step="0.01" value={item.unitPrice} onChange={e => updateLineItem(idx, 'unitPrice', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">交货日期</label>
                  <Input className="mt-1" type="date" value={item.deliveryDate} onChange={e => updateLineItem(idx, 'deliveryDate', e.target.value)} />
                </div>
                <div className="col-span-1 flex items-end justify-center">
                  {(Number(item.quantity) * Number(item.unitPrice)) > 0 && (
                    <div className="text-xs text-center text-primary font-mono">
                      ¥{(Number(item.quantity) * Number(item.unitPrice)).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="col-span-1 flex items-end justify-center">
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeLineItem(idx)} disabled={lineItems.length === 1}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="col-span-12">
                  <label className="text-xs text-muted-foreground">行项备注</label>
                  <Input className="mt-1" value={item.remarks} onChange={e => updateLineItem(idx, 'remarks', e.target.value)} placeholder="该行物料的交付、质量或价格备注" />
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
              <Plus className="h-4 w-4 mr-1" />添加行项
            </Button>
          </div>

          {/* 定价参数 */}
          <div className="grid grid-cols-3 gap-x-6 gap-y-4 mt-4">
            <FormField label="定价类型">
              <select value={form.pricingType} onChange={e => set('pricingType', e.target.value)} className={SELECT_CLS}>
                <option value="FIXED">一口价</option>
                <option value="BASIS">基差定价</option>
                <option value="FLOATING">不定价</option>
              </select>
            </FormField>
            <FormField label="溢装比例(%)">
              <Input type="number" value={form.overfillPct} onChange={e => set('overfillPct', e.target.value)} />
            </FormField>
            <FormField label="短装比例(%)">
              <Input type="number" value={form.shortfallPct} onChange={e => set('shortfallPct', e.target.value)} />
            </FormField>
          </div>

          {totalAmount > 0 && (
            <div className="mt-4 p-3 bg-muted/30 rounded-lg text-sm">
              <span className="text-muted-foreground">合同总金额：</span>
              <span className="text-lg font-bold text-primary ml-2">¥{totalAmount.toLocaleString()}</span>
            </div>
          )}
        </Card>

        {/* 履约与交货 */}
        <Card className="p-6">
          <SectionTitle>履约与交货</SectionTitle>
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <FormField label="签订日期">
              <Input type="date" value={form.signedAt} onChange={e => set('signedAt', e.target.value)} />
            </FormField>
            <FormField label="生效日期">
              <Input type="date" value={form.effectiveAt} onChange={e => set('effectiveAt', e.target.value)} />
            </FormField>
            <FormField label="到期日期">
              <Input type="date" value={form.expireAt} onChange={e => set('expireAt', e.target.value)} />
            </FormField>
            <FormField label="交货方式">
              <Input value={form.deliveryMethod} onChange={e => set('deliveryMethod', e.target.value)} placeholder="供应商配送 / 自提 / 库转" />
            </FormField>
            <FormField label="交货地点">
              <Input value={form.deliveryLocation} onChange={e => set('deliveryLocation', e.target.value)} />
            </FormField>
            <FormField label="备注">
              <Input value={form.remarks} onChange={e => set('remarks', e.target.value)} />
            </FormField>
          </div>
        </Card>

        {/* 结算条款 */}
        <Card className="p-6">
          <SectionTitle>结算条款</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <FormField label="结算数量依据">
              <select value={form.settlementBasis} onChange={e => set('settlementBasis', e.target.value)} className={SELECT_CLS}>
                <option value="WEIGHT">地磅净重</option>
                <option value="QUALITY">质检干重</option>
                <option value="CONTRACT">合同约定数量</option>
              </select>
            </FormField>
            <FormField label="结算方式">
              <select value={form.settlementMethod} onChange={e => set('settlementMethod', e.target.value)} className={SELECT_CLS}>
                <option value="DELIVERY">按交货结算</option>
                <option value="PREPAY">预付</option>
                <option value="INSTALLMENT">分期</option>
                <option value="MONTHLY_30">月结30天</option>
                <option value="MONTHLY_60">月结60天</option>
              </select>
            </FormField>
            <FormField label="预付比例(%)">
              <Input type="number" value={form.prepayPct} onChange={e => set('prepayPct', e.target.value)} />
            </FormField>
            <FormField label="尾款账期（天）">
              <Input type="number" value={form.paymentDays} onChange={e => set('paymentDays', e.target.value)} />
            </FormField>
            <FormField label="付款方式">
              <select value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)} className={SELECT_CLS}>
                <option value="T/T">电汇 T/T</option>
                <option value="BANK_ACCEPTANCE">银行承兑汇票</option>
                <option value="COMMERCIAL_ACCEPTANCE">商业承兑汇票</option>
                <option value="L/C">信用证 L/C</option>
              </select>
            </FormField>
            <FormField label="扣水规则">
              <Input value={form.moistureRule} onChange={e => set('moistureRule', e.target.value)} placeholder="每超0.1%扣款（元/吨）" />
            </FormField>
            <FormField label="扣杂规则">
              <Input value={form.impurityRule} onChange={e => set('impurityRule', e.target.value)} placeholder="每超0.1%扣款（元/吨）" />
            </FormField>
          </div>
        </Card>

        <Card className="p-6">
          <SectionTitle>合同附件</SectionTitle>
          <div className="space-y-2">
            {attachments.map(att => (
              <div key={att.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <button type="button" onClick={() => viewStoredAttachment(att.id)} className="flex-1 text-left text-primary hover:underline">{att.originalName}</button>
                <span className="text-xs text-muted-foreground">{(att.size / 1024).toFixed(0)} KB</span>
                <Button type="button" variant="outline" size="sm" onClick={() => viewStoredAttachment(att.id)}>查看</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => renameAttachment(att)}>
                  <Pencil className="mr-1 h-4 w-4" />修改名称
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => deleteAttachment(att.id)} aria-label={`删除 ${att.originalName}`} className="text-destructive hover:text-destructive">
                  <Trash2 className="mr-1 h-4 w-4" />删除
                </Button>
              </div>
            ))}
            {pendingAttachments.map((item, index) => (
              <div key={`${item.file.name}-${index}`} className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input value={item.name} onChange={e => setPendingAttachments(current => current.map((entry, i) => i === index ? { ...entry, name: e.target.value } : entry))} placeholder="附件名称" />
                <span className="shrink-0 text-xs text-muted-foreground">{(item.file.size / 1024).toFixed(0)} KB</span>
                <Button type="button" variant="outline" size="sm" onClick={() => viewPendingAttachment(item.file)}>预览</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPendingAttachments(current => current.filter((_, i) => i !== index))} aria-label={`移除 ${item.name}`}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <label className={`inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-muted ${uploadingAttachments ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
              <Paperclip className="mr-2 h-4 w-4" />选择附件
              <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={e => {
                const selectedFiles = Array.from(e.currentTarget.files || []);
                setPendingAttachments(current => [...current, ...selectedFiles.map(file => ({ file, name: file.name }))]);
                e.target.value = '';
              }} disabled={uploadingAttachments} />
            </label>
            {pendingAttachments.length > 0 && (
              <Button type="button" onClick={() => void uploadAttachments()} disabled={uploadingAttachments}>
                {uploadingAttachments ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}
                {uploadingAttachments ? '上传中...' : '上传附件'}
              </Button>
            )}
          </div>
        </Card>

        <div className="flex justify-between pb-8 border-t pt-6">
          <Button variant="outline" onClick={() => router.push(`/dashboard/contracts/${contractId}`)}>取消</Button>
          <Button onClick={handleSave} disabled={submitting} size="lg">
            <Save className="h-4 w-4 mr-1" />{submitting ? '保存中...' : '保存修改'}
          </Button>
        </div>
      </div>
    </div>
  );
}
