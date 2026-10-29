'use client';

import { useState, useEffect, useContext, createContext, Children, cloneElement, isValidElement } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, TrendingDown, TrendingUp, Zap, Save } from 'lucide-react';
import { api, API_BASE_URL } from '@/lib/api';
import { openLocalAttachment, openStoredAttachment } from '@/lib/attachment-preview';
import { attachmentUploadError, selectValidAttachmentFiles } from '@/lib/attachment-file';
import { useDraftLeaveGuard } from '@/hooks/use-draft-leave-guard';
import { QualityRulesEditor } from '@/components/contracts/quality-rules-editor';
import { GradePriceRulesEditor, GradePriceSnapshot, defaultGradePriceSnapshot } from '@/components/contracts/grade-price-rules-editor';
import { alertValidationErrors, confirmAction } from '@/lib/system-dialog';
import { focusInvalidField, type FieldErrors } from '@/lib/form-validation';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-2 mb-4 mt-6 first:mt-0">{children}</div>;
}

const ContractErrorsContext = createContext<FieldErrors>({});
const fieldKeys: Record<string, string> = {
  '业务单元（事业部）': 'businessUnitId', '业务部门': 'departmentId', '合同标题': 'title', '外部合同号': 'externalNo',
  '我方签约主体（内部）': 'signingPartnerId', '上游供应商': 'sellerId', '下游客户': 'buyerId',
  '物料品种': 'materialId', '合同数量（吨）': 'quantity', '采购单价（元/吨）': 'unitPrice', '销售单价（元/吨）': 'saleUnitPrice',
  '溢装比例(%)': 'overfillPct', '短装比例(%)': 'shortfallPct', '签订日期': 'signedAt', '生效日期': 'effectiveAt',
  '到期日期': 'expireAt', '交货方式': 'deliveryMethod', '交货地点': 'deliveryLocation', '结算数量约定': 'settlementBasis',
  '结算方式': 'settlementMethod', '预付比例(%)': 'prepayPct', '尾款账期（天）': 'paymentDays', '付款方式': 'paymentMethod',
};
function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  const errors = useContext(ContractErrorsContext);
  const key = fieldKeys[label] || (/单价（元\/吨/.test(label) ? 'unitPrice' : /交易对手方/.test(label) ? 'sellerId' : '');
  const error = errors[key];
  return <div data-validation-field={key || undefined} className={`flex flex-col gap-1.5 scroll-mt-28 ${error ? '[&_input]:border-destructive [&_select]:border-destructive [&_input]:bg-destructive/5 [&_select]:bg-destructive/5' : ''}`}>
    <label className="text-sm font-medium">{label}{required && <span className="text-destructive ml-0.5">*</span>}</label>
    {Children.map(children, child => isValidElement<{ 'aria-invalid'?: boolean; 'aria-describedby'?: string }>(child)
      ? cloneElement(child, error ? { 'aria-invalid': true, 'aria-describedby': `contract-error-${key}` } : {}) : child)}
    {error && <span id={`contract-error-${key}`} className="text-xs text-destructive" role="alert">{error}</span>}
  </div>;
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

interface ContractFormOptions {
  defaultDepartmentId?: string | null;
  defaultBusinessUnitId?: string | null;
  departments: DepartmentItem[];
  businessUnits: Array<{ id: string; code: string; name: string; companyId: string; isDefault?: boolean }>;
  partners: Array<{ id: string; code: string; name: string; roles: string[]; isInternal: boolean; contactPerson?: string | null; contactPhone?: string | null }>;
}

export default function ContractCreatePage() {
  const [clientRequestId] = useState(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `contract-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });
  const [submitting, setSubmitting] = useState(false);
  const [materials, setMaterials] = useState<any[]>([]);
  const [internalPartners, setInternalPartners] = useState<any[]>([]);
  const [supplierPartners, setSupplierPartners] = useState<any[]>([]);
  const [customerPartners, setCustomerPartners] = useState<any[]>([]);
  const [allPartners, setAllPartners] = useState<any[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [businessUnits, setBusinessUnits] = useState<ContractFormOptions['businessUnits']>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [files, setFiles] = useState<Array<{ file: File; name: string }>>([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<Array<{ id: string; originalName: string }>>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});

  const [form, setForm] = useState({
    type: 'PURCHASE' as string, title: '',
    signingPartnerId: '', departmentId: '', businessUnitId: '', externalNo: '',
    sellerId: '', buyerId: '', contactPerson: '', contactPhone: '',
    materialId: '', materialName: '', quantity: '', unit: 'TON',
    pricingType: 'FIXED', unitPrice: '', saleUnitPrice: '', overfillPct: '10', shortfallPct: '10',
    deliveryMethod: '', deliveryLocation: '',
    signedAt: '', effectiveAt: '', expireAt: '',
    settlementMethod: '', settlementBasis: '',
    prepayPct: '0', paymentDays: '30', paymentMethod: 'T/T',
    remarks: '',
  });
  const [qualityRulesSnapshot, setQualityRulesSnapshot] = useState<any>(null);
  const [gradePriceSnapshot, setGradePriceSnapshot] = useState<GradePriceSnapshot | null>(null);
  const [gradeSalesPriceSnapshot, setGradeSalesPriceSnapshot] = useState<GradePriceSnapshot | null>(null);

  const set = (k: string, v: string) => {
    setIsDirty(true);
    setForm(f => ({ ...f, [k]: v }));
    if (k === 'type') setFormErrors({});
    else if (String(v).trim()) setFormErrors(current => { const next = { ...current }; delete next[k]; return next; });
  };

  useEffect(() => {
    api.get<{ items: any[] }>('/master-data/materials').then(d => setMaterials(d.items || [])).catch(()=>{});
    api.get<ContractFormOptions>('/contracts/form-options').then((options) => {
      const all = options.partners || [];
      setAllPartners(all);
      setSupplierPartners(all.filter(p => p.roles?.includes('SUPPLIER')));
      setCustomerPartners(all.filter(p => p.roles?.includes('CUSTOMER')));
      setInternalPartners(all.filter(p => p.isInternal));
      setDepartments(options.departments || []);
      setBusinessUnits(options.businessUnits || []);
      setForm(current => ({
        ...current,
        departmentId: current.departmentId || options.defaultDepartmentId || '',
        businessUnitId: current.businessUnitId || options.defaultBusinessUnitId || '',
      }));
      setOptionsError('');
    }).catch((error: Error) => {
      setOptionsError(`合同主体和业务部门加载失败：${error.message || '请刷新页面重试'}`);
    }).finally(() => setDepartmentsLoading(false));
  }, []);

  const qty = Number(form.quantity || 0);
  const purchaseUnitPrice = Number(form.unitPrice || 0);
  const saleUnitPrice = Number(form.saleUnitPrice || 0);
  const purchaseAmount = qty * purchaseUnitPrice;
  const saleAmount = qty * saleUnitPrice;
  // 双边合同以采购金额作为合同审批金额；销售金额和毛利单独展示。
  const totalAmount = purchaseAmount;
  const profit = saleAmount - purchaseAmount;


  const handleSelectPartner = (id: string, field: string) => {
    set(field, id);
    const p = allPartners.find(x => x.id === id);
    if (p) { set('contactPerson', p.contactPerson || ''); set('contactPhone', p.contactPhone || ''); }
  };

  const handleSelectMaterial = (id: string) => {
    const m = materials.find(x => x.id === id);
    set('materialId', id);
    setQualityRulesSnapshot(null);
    setGradePriceSnapshot(null);
    setGradeSalesPriceSnapshot(null);
    if (m) { set('materialName', m.name); set('unit', m.unit || 'TON'); }
  };

  const buildPayload = () => {
    const completeLine = Boolean(
      form.materialId
      && form.quantity
      && form.unitPrice !== ''
      && (form.type !== 'BILATERAL' || form.saleUnitPrice !== ''),
    );
    return ({
    type: form.type, title: form.title,
    sellerId: form.sellerId || null, totalAmount,
    signingPartnerId: form.signingPartnerId || null,
    departmentId: form.departmentId || undefined,
    businessUnitId: form.businessUnitId || undefined,
    externalNo: form.externalNo || undefined,
    contactPerson: form.contactPerson || undefined, contactPhone: form.contactPhone || undefined,
    pricingType: form.pricingType,
    overfillPct: form.overfillPct === '' ? undefined : Number(form.overfillPct),
    shortfallPct: form.shortfallPct === '' ? undefined : Number(form.shortfallPct),
    deliveryMethod: form.deliveryMethod || undefined, deliveryLocation: form.deliveryLocation || undefined,
    signedAt: form.signedAt || undefined, effectiveAt: form.effectiveAt || undefined, expireAt: form.expireAt || undefined,
    settlementMethod: form.settlementMethod.trim() || undefined, settlementBasis: form.settlementBasis || undefined,
    prepayPct: form.prepayPct === '' ? undefined : Number(form.prepayPct), paymentDays: form.paymentDays === '' ? undefined : Number(form.paymentDays),
    paymentMethod: form.paymentMethod || undefined,
    remarks: form.remarks || undefined,
    ...(form.type === 'BILATERAL' ? { buyerId: form.buyerId || null } : { buyerId: null }),
    draftData: {
      form,
      lineItems: [{
        materialId: form.materialId,
        materialName: form.materialName,
        quantity: form.quantity,
        unit: form.unit,
        unitPrice: form.unitPrice,
        salesUnitPrice: form.saleUnitPrice,
        qualityRulesSnapshot,
        priceRulesSnapshot: form.pricingType === 'GRADE_TIER' ? gradePriceSnapshot : null,
        salesPriceRulesSnapshot: form.pricingType === 'GRADE_TIER' && form.type === 'BILATERAL' ? gradeSalesPriceSnapshot : null,
      }],
    },
    lineItems: completeLine ? [{
      materialId: form.materialId, materialName: form.materialName,
      quantity: Number(form.quantity), unit: form.unit,
      unitPrice: Number(form.unitPrice),
      ...(form.type === 'BILATERAL' ? { salesUnitPrice: Number(form.saleUnitPrice) } : {}),
      qualityRulesSnapshot: qualityRulesSnapshot || undefined,
      priceRulesSnapshot: form.pricingType === 'GRADE_TIER' ? gradePriceSnapshot || undefined : undefined,
      salesPriceRulesSnapshot: form.pricingType === 'GRADE_TIER' && form.type === 'BILATERAL' ? gradeSalesPriceSnapshot || undefined : undefined,
    }] : [],
    });
  };

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
        throw new Error(await attachmentUploadError(response, item.name));
      }
      const uploaded = await response.json();
      setUploadedAttachments(current => [...current.filter(entry => entry.id !== uploaded.id), uploaded]);
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

  const persistDraft = async () => {
    setSubmitting(true);
    try {
      const contractId = await ensureDraft();
      if (files.length > 0) await uploadAttachments(contractId);
      setIsDirty(false);
      return contractId;
    } finally {
      setSubmitting(false);
    }
  };

  const { requestLeave, leaveNow, dialog: leaveDialog } = useDraftLeaveGuard({
    dirty: isDirty,
    saving: submitting,
    onSaveDraft: async () => { await persistDraft(); },
    itemName: '合同',
  });

  const handleSaveDraft = async () => {
    try {
      const contractId = await persistDraft();
      leaveNow(`/dashboard/contracts/${contractId}`);
    } catch (e: any) {
      alert(e.message || '保存失败');
    }
  };

  const handleSubmit = async () => {
    const required: Array<[string, string]> = [
      ['title', '合同标题'], ['externalNo', '外部合同号（无编号请填写“无”）'],
      ['signingPartnerId', '我方签约主体'], ['departmentId', '业务部门'], ['businessUnitId', '业务单元（事业部）'],
      ['sellerId', form.type === 'BILATERAL' ? '上游供应商' : '交易对手方'],
      ['materialId', '物料品种'], ['quantity', '合同数量'], ['unitPrice', '采购/销售单价'],
      ['signedAt', '纸质合同签订日期'],
      ['deliveryMethod', '交货方式'], ['deliveryLocation', '交货地点'], ['settlementBasis', '结算数量约定'],
      ['settlementMethod', '结算方式'], ['prepayPct', '预付比例（无预付请填写0）'], ['paymentDays', '尾款账期（无账期请填写0）'],
      ['paymentMethod', '付款方式'],
      ['overfillPct', '溢装比例'], ['shortfallPct', '短装比例'],
    ];
    if (form.type === 'BILATERAL') {
      required.push(['buyerId', '下游客户'], ['saleUnitPrice', '销售单价']);
    }
    const errors: FieldErrors = {};
    for (const [key, label] of required) {
      if (!String(form[key as keyof typeof form] ?? '').trim()) errors[key] = `请填写${label}`;
    }
    for (const key of ['quantity', 'unitPrice', ...(form.type === 'BILATERAL' ? ['saleUnitPrice'] : [])]) {
      if (!errors[key] && Number(form[key as keyof typeof form]) <= 0) errors[key] = `${key === 'quantity' ? '合同数量' : key === 'saleUnitPrice' ? '销售单价' : '合同单价'}必须大于0`;
    }
    for (const key of ['overfillPct', 'shortfallPct', 'prepayPct']) {
      const value = Number(form[key as keyof typeof form]);
      if (!errors[key] && (value < 0 || value > 100)) errors[key] = `${key === 'prepayPct' ? '预付' : key === 'overfillPct' ? '溢装' : '短装'}比例须在0至100之间`;
    }
    if (!errors.paymentDays && Number(form.paymentDays) < 0) errors.paymentDays = '尾款账期不能小于0';
    if (form.expireAt && form.effectiveAt && form.expireAt < form.effectiveAt) errors.expireAt = '到期日期不能早于生效日期';
    if (files.length + uploadedAttachments.length === 0) errors.attachments = '请至少上传一份合同附件';
    setFormErrors(errors);
    const entries = Object.entries(errors);
    if (entries.length > 0) {
      const selected = await alertValidationErrors(entries.map(([key, message]) => ({ key, message })));
      focusInvalidField(typeof selected === 'string' ? selected : entries[0][0]);
      return;
    }
    if (form.pricingType === 'GRADE_TIER' && !gradePriceSnapshot?.formulaConfirmed) { alert('请核对纸质合同并确认元/度计算口径'); return; }
    if (form.pricingType === 'GRADE_TIER' && form.type === 'BILATERAL' && !gradeSalesPriceSnapshot?.formulaConfirmed) { alert('请确认下游销售方向的元/度计算口径'); return; }
    setSubmitting(true);
    let contractId = draftId;
    try {
      contractId = await ensureDraft();
      // 附件为提交审批必备材料；先完成上传，再由服务端确认合同附件与审批流程均有效。
      if (files.length > 0) await uploadAttachments(contractId);
      await api.get(`/contracts/${contractId}/approval-readiness`);
      await api.patch(`/contracts/${contractId}/status`, { status: 'PENDING_APPROVAL' });
      setIsDirty(false);
      leaveNow(`/dashboard/contracts/${contractId}`);
    } catch (e: any) {
      alert(contractId
        ? `合同已保存为草稿，不会重复创建。\n提交审批失败：${e.message || '请检查审批流程配置'}`
        : e.message || '提交失败');
      setSubmitting(false);
    }
  };

  return (
    <ContractErrorsContext.Provider value={formErrors}>
    <div className="space-y-6">
      {leaveDialog}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => requestLeave('/dashboard/contracts')}><ArrowLeft className="h-4 w-4 mr-1" />返回</Button>
          <div><h1 className="text-2xl font-bold">新建合同</h1><p className="text-sm text-muted-foreground mt-0.5">填写合同信息后提交审批</p></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => requestLeave('/dashboard/contracts')}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting}><Save className="h-4 w-4 mr-1" />{submitting ? '提交中...' : '提交审批'}</Button>
        </div>
      </div>
      {optionsError && <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{optionsError}</div>}

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
          <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/30">
            <div className="mb-3 text-xs font-semibold text-muted-foreground">内部管理信息 · 不属于合同正文</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <FormField label="业务单元（事业部）" required>
                <select value={form.businessUnitId} onChange={e => set('businessUnitId', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">请选择业务单元（事业部）</option>
                  {businessUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.code} {unit.name}</option>)}
                </select>
                <span className="text-xs text-muted-foreground">确定经营归属、数据范围及按业务单元（事业部）匹配的审批人员</span>
              </FormField>
              <FormField label="业务部门" required>
                <select value={form.departmentId} onChange={e => set('departmentId', e.target.value)} disabled={departmentsLoading} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60">
                  <option value="">{departmentsLoading ? '正在加载业务部门...' : '请选择业务部门'}</option>
                  {departments.map(department => (
                    <option key={department.id} value={department.id}>
                      {department.company?.name ? `${department.company.name} / ` : ''}{department.name}
                    </option>
                  ))}
                </select>
                <span className={`text-xs ${optionsError ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {optionsError ? '请先恢复表单选项后再选择业务部门' : '默认带入发起人所属部门，可按实际业务调整并用于部门审批节点'}
                </span>
              </FormField>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <FormField label="合同标题" required><Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="如：采购萤石粉CaF₂≥97% 5000吨" /></FormField>
            <FormField label="外部合同号" required>
              <Input value={form.externalNo} onChange={e => set('externalNo', e.target.value)} placeholder="纸质合同或其他系统合同编号" />
              <span className="text-xs text-muted-foreground">没有外部编号时请明确填写“无”</span>
            </FormField>
            <div className="col-span-2">
              <FormField label="我方签约主体（内部）" required>
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
            </div>
          </div>

          <SectionTitle>交易对手方</SectionTitle>
          {form.type === 'BILATERAL' ? (
            <>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/60 p-4 dark:border-red-900/60 dark:bg-red-950/20">
                  <div className="text-xs font-bold tracking-wider text-red-700 dark:text-red-400">上游交易对手方 · 供应商（采购端）</div>
                  <FormField label="上游供应商" required>
                    <select value={form.sellerId} onChange={e => handleSelectPartner(e.target.value, 'sellerId')} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">请选择</option>
                      {supplierPartners.map(p => <option key={p.id} value={p.id} disabled={p.id === form.signingPartnerId}>{p.code} {p.name}{p.id === form.signingPartnerId ? '（我方）' : ''}</option>)}
                    </select>
                  </FormField>
                </div>
                <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/60 dark:bg-blue-950/20">
                  <div className="text-xs font-bold tracking-wider text-blue-700 dark:text-blue-400">下游交易对手方 · 客户（销售端）</div>
                  <FormField label="下游客户" required>
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
              <div className="mt-4 text-xs font-medium text-muted-foreground">本合同主要对接人（可选）</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-4">
                <FormField label="联系人"><Input value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></FormField>
                <FormField label="联系电话"><Input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} /></FormField>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <FormField label={form.type === 'PURCHASE' ? '交易对手方（供应商）' : '交易对手方（客户）'} required>
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
            <FormField label="定价类型" required><select className="h-9 rounded-md border bg-background px-3 text-sm" value={form.pricingType} onChange={e => { set('pricingType', e.target.value); if (e.target.value === 'GRADE_TIER') { if (!gradePriceSnapshot) setGradePriceSnapshot(defaultGradePriceSnapshot); if (!gradeSalesPriceSnapshot) setGradeSalesPriceSnapshot(defaultGradePriceSnapshot); } }}><option value="FIXED">固定价格（一口价）</option><option value="GRADE_TIER">按 CaF₂ 品位分档计价</option></select></FormField>
            {form.type !== 'BILATERAL' && (
              <FormField label={form.pricingType === 'GRADE_TIER' ? '预计单价（元/吨，仅用于合同金额预估）' : `${form.type === 'PURCHASE' ? '采购' : '销售'}单价（元/吨）`} required><Input type="number" value={form.unitPrice} onChange={e => set('unitPrice', e.target.value)} step="0.01" /></FormField>
            )}
            <FormField label="溢装比例(%)" required><Input type="number" min="0" max="100" step="0.01" value={form.overfillPct} onChange={e => set('overfillPct', e.target.value)} /></FormField>
            <FormField label="短装比例(%)" required><Input type="number" min="0" max="100" step="0.01" value={form.shortfallPct} onChange={e => set('shortfallPct', e.target.value)} /></FormField>
          </div>
          {form.type === 'BILATERAL' && (
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
              <FormField label="采购单价（元/吨）" required><Input type="number" min="0" value={form.unitPrice} onChange={e => set('unitPrice', e.target.value)} step="0.01" /></FormField>
              <FormField label="销售单价（元/吨）" required><Input type="number" min="0" value={form.saleUnitPrice} onChange={e => set('saleUnitPrice', e.target.value)} step="0.01" /></FormField>
            </div>
          )}
          {form.pricingType === 'GRADE_TIER' && <><div className="mt-4 text-sm font-semibold">{form.type === 'BILATERAL' ? '采购方向价格条款' : '合同价格条款'}</div><GradePriceRulesEditor value={gradePriceSnapshot} onChange={snapshot => { setIsDirty(true); setGradePriceSnapshot(snapshot); }} />{form.type === 'BILATERAL' && <><div className="mt-5 text-sm font-semibold">销售方向价格条款</div><GradePriceRulesEditor value={gradeSalesPriceSnapshot} onChange={snapshot => { setIsDirty(true); setGradeSalesPriceSnapshot(snapshot); }} /></>}</>}
          <QualityRulesEditor
            materialId={form.materialId}
            scene={form.type === 'SALES' ? 'SALES' : 'PURCHASE'}
            value={qualityRulesSnapshot}
            onChange={(snapshot) => { setIsDirty(true); setQualityRulesSnapshot(snapshot); }}
          />
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
            <FormField label="签订日期" required><Input type="date" value={form.signedAt} onChange={e => set('signedAt', e.target.value)} /></FormField>
            <FormField label="生效日期"><Input type="date" value={form.effectiveAt} onChange={e => set('effectiveAt', e.target.value)} /></FormField>
            <FormField label="到期日期"><Input type="date" value={form.expireAt} onChange={e => set('expireAt', e.target.value)} /></FormField>
            <FormField label="交货方式" required><Input value={form.deliveryMethod} onChange={e => set('deliveryMethod', e.target.value)} placeholder="供应商配送 / 自提 / 库转" /></FormField>
            <FormField label="交货地点" required><Input value={form.deliveryLocation} onChange={e => set('deliveryLocation', e.target.value)} /></FormField>
            <FormField label="备注"><Input value={form.remarks} onChange={e => set('remarks', e.target.value)} /></FormField>
          </div>
        </Card>

        {/* 结算条款 */}
        <Card className="p-6 mt-4">
          <SectionTitle>结算条款</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <FormField label="结算数量约定" required>
              <Input value={form.settlementBasis} onChange={e => set('settlementBasis', e.target.value)} maxLength={200} placeholder="如：按到货实物净重；具体货款数量以入库过账为准" />
            </FormField>
            <FormField label="结算方式" required>
              <Input
                value={form.settlementMethod}
                onChange={e => set('settlementMethod', e.target.value)}
                maxLength={100}
                placeholder="如：现款现货、预付款结算、账期结算"
              />
            </FormField>
            <FormField label="预付比例(%)" required><Input type="number" min="0" max="100" value={form.prepayPct} onChange={e => set('prepayPct', e.target.value)} /><span className="text-xs text-muted-foreground">无预付请填写0</span></FormField>
            <FormField label="尾款账期（天）" required><Input type="number" min="0" value={form.paymentDays} onChange={e => set('paymentDays', e.target.value)} /></FormField>
            <FormField label="付款方式" required>
              <select value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="T/T">电汇 T/T</option><option value="BANK_ACCEPTANCE">银行承兑汇票</option><option value="COMMERCIAL_ACCEPTANCE">商业承兑汇票</option><option value="L/C">信用证 L/C</option>
              </select>
            </FormField>
          </div>
        </Card>

        {/* Attachments */}
        <Card data-validation-field="attachments" className={`p-6 mt-4 scroll-mt-28 ${formErrors.attachments ? 'border-destructive bg-destructive/5' : ''}`}>
          <SectionTitle>合同附件（必填）</SectionTitle>
          {formErrors.attachments && <p role="alert" className="mb-2 text-sm text-destructive">{formErrors.attachments}</p>}
          <p className="text-xs text-muted-foreground mb-3">提交审批前至少上传一份纸质合同扫描件或签章文件。支持 JPG/PNG/WEBP/PDF，单个文件不超过 20 MB；草稿可暂不上传。</p>
          <label className="block border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
            <input aria-label="选择合同附件" type="file" multiple disabled={submitting} accept=".jpg,.jpeg,.png,.webp,.pdf,application/pdf" onChange={(e) => {
              const selectedFiles = selectValidAttachmentFiles(Array.from(e.currentTarget.files || []));
              if (selectedFiles.length > 0) { setIsDirty(true); setFormErrors(current => { const next = { ...current }; delete next.attachments; return next; }); }
              setFiles(prev => [...prev, ...selectedFiles.map(file => ({ file, name: file.name }))]);
              e.target.value = '';
            }} className="hidden" />
            <div className="text-2xl mb-2">📎</div>
            <div className="text-sm font-semibold">选择合同附件</div>
            <div className="text-xs text-muted-foreground mt-1">纸质合同扫描件、签章文件等，保存或提交时自动上传</div>
          </label>
          {uploadedAttachments.length > 0 && <div className="mt-3 space-y-2">{uploadedAttachments.map(item => <div key={item.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{item.originalName}</span><span className="shrink-0 text-xs text-muted-foreground">已上传</span><Button type="button" variant="outline" size="sm" onClick={() => void openStoredAttachment(`/contracts/attachments/${item.id}/view-url`).catch(e => alert(e.message || '附件打开失败'))}>查看附件</Button><Button type="button" variant="ghost" size="sm" disabled={submitting} className="text-destructive" onClick={async () => { if (!await confirmAction('确定删除这份已上传的合同附件吗？')) return; try { await api.delete(`/contracts/attachments/${item.id}`); setUploadedAttachments(current => current.filter(entry => entry.id !== item.id)); } catch (e: any) { alert(e.message || '删除附件失败'); } }}>删除附件</Button></div>)}</div>}
          {files.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {files.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded bg-muted/50">
                  <button type="button" onClick={() => {
                    try { openLocalAttachment(item.file); }
                    catch (e: any) { alert(e.message || '附件打开失败'); }
                  }} className="shrink-0 text-primary hover:underline">查看</button>
                  <Input value={item.name} disabled={submitting} onChange={e => {
                    setIsDirty(true);
                    setFiles(current => current.map((entry, index) => index === i ? { ...entry, name: e.target.value } : entry));
                  }} placeholder="附件名称" />
                  <span className="shrink-0 text-xs text-muted-foreground">待上传 · {(item.file.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => {
                    try { openLocalAttachment(item.file); }
                    catch (e: any) { alert(e.message || '附件打开失败'); }
                  }} className="text-primary text-xs">预览</button>
                  <button type="button" disabled={submitting} onClick={() => {
                    setIsDirty(true);
                    setFiles(prev => prev.filter((_, j) => j !== i));
                  }} className="shrink-0 text-destructive text-xs">移除附件</button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Bottom actions */}
        <div className="flex justify-between pb-8 border-t pt-6 mt-6">
          <Button variant="outline" onClick={() => requestLeave('/dashboard/contracts')}>取消</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSaveDraft} disabled={submitting}><Save className="h-4 w-4 mr-1" />保存草稿</Button>
            <Button onClick={handleSubmit} disabled={submitting} size="lg">{submitting ? '提交中...' : '提交审批'}</Button>
          </div>
        </div>
      </div>
    </div>
    </ContractErrorsContext.Provider>
  );
}
