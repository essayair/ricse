'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, Loader2, Lock, Upload, X } from 'lucide-react';
import { api } from '@/lib/api';

/* ── Constants ── */

const ORG_TYPES = ['有限责任公司','股份有限公司','国有企业','外资企业','个体工商户','合伙企业'];
const CORP_TYPES = ['生产型企业','贸易型企业','生产 + 贸易','服务型企业'];
const TAX_TYPES = ['一般纳税人','小规模纳税人','免税单位'];
const TAX_RATINGS = ['A级','B级','C级','D级'];
const INVOICE_TYPES = ['增值税专用发票（13%）','增值税专用发票（9%）','增值税普通发票','电子普通发票'];
const INDUSTRIES = ['制造业','批发和零售','交通运输','信息技术','金融','建筑','采矿业','农林牧渔','其他'];
const REVENUE_SCALES = ['1亿以下','1亿–5亿','5亿–20亿','20亿以上'];
const CURRENCIES = ['人民币','美元','欧元'];
const LICENSE_TYPES = ['采矿许可证','危化品经营许可证','道路运输许可证','建筑施工资质','食品经营许可','医疗器械许可','其他','无'];
const RELATED_PARTY_TYPES = ['否','是 · 全资子公司','是 · 参股公司','是 · 控股股东'];
const LEGAL_PERSON_TYPES = ['自然人','法人'];
const COUNTRIES = ['中国大陆','香港','澳门','台湾','其他'];

const CITY_MAP: Record<string, string[]> = {
  '浙江省': ['杭州市','宁波市','温州市','嘉兴市','湖州市','绍兴市','金华市','衢州市','舟山市','台州市','丽水市'],
  '甘肃省': ['兰州市','嘉峪关市','金昌市','白银市','天水市','武威市','张掖市','平凉市','酒泉市','庆阳市','定西市','陇南市'],
  '江苏省': ['南京市','无锡市','徐州市','常州市','苏州市','南通市','连云港市','淮安市','盐城市','扬州市','镇江市','泰州市','宿迁市'],
  '广东省': ['广州市','深圳市','珠海市','汕头市','佛山市','东莞市','中山市','湛江市','惠州市'],
  '山东省': ['济南市','青岛市','淄博市','枣庄市','东营市','烟台市','潍坊市','济宁市','泰安市','威海市'],
};
const PROVINCES = Object.keys(CITY_MAP);

const CATEGORY_OPTIONS = [
  { value: 'CORE', label: '核心合作伙伴' },
  { value: 'NORMAL', label: '普通合作伙伴' },
  { value: 'TEMP', label: '临时合作伙伴' },
];

/* ── Helpers ── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-2 mb-4 mt-6 first:mt-0">{children}</div>;
}

function FormField({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}{required && <span className="text-destructive ml-0.5">*</span>}</label>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function SelectField({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[] | { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring">
      <option value="">{placeholder || '请选择'}</option>
      {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/* ── Page ── */

interface AttItem { id: string; fileName: string; originalName: string; mimeType: string; size: number; category: string; createdAt: string; }

export default function PartnerEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<string[]>([]);
  const [isInternal, setIsInternal] = useState(false);
  const [originalRoles, setOriginalRoles] = useState<string[]>([]);
  const [partnerCode, setPartnerCode] = useState('');
  const [partnerTaxId, setPartnerTaxId] = useState('');
  const [attachments, setAttachments] = useState<AttItem[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Array<{id: string; accountName: string; accountNo: string; bankName: string; bankCode: string; accountType: string; isDefault: boolean; _new?: boolean}>>([]);

  const addBankAccount = () => {
    const isFirst = bankAccounts.length === 0;
    setBankAccounts((prev) => [...prev, { id: `new-${Date.now()}`, accountName: '', accountNo: '', bankName: '', bankCode: '', accountType: 'GENERAL', isDefault: isFirst, _new: true }]);
  };
  const removeBankAccount = (idx: number) => {
    const acct = bankAccounts[idx];
    if (!acct._new && !confirm('确定删除此银行账户？')) return;
    // For existing accounts, delete via API
    if (!acct._new) {
      api.delete(`/partners/bank-accounts/${acct.id}`).catch(() => {});
    }
    setBankAccounts((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateBankAccount = (idx: number, field: string, value: any) => {
    setBankAccounts((prev) => prev.map((a, i) => {
      if (i !== idx) return field === 'isDefault' && value ? { ...a, isDefault: false } : a;
      return { ...a, [field]: value };
    }));
  };

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    api.get<any>(`/partners/${id}`).then((p) => {
      setPartnerCode(p.code);
      setPartnerTaxId(p.taxId);
      setIsInternal(p.isInternal);
      setRoles(p.roles || []);
      setOriginalRoles(p.roles || []);
      setAttachments(p.attachments || []);
      setBankAccounts((p.bankAccounts || []).map((a: any) => ({ ...a, _new: false })));
      setForm({
        name: p.name || '', shortName: p.shortName || '', shortCode: p.shortCode || '',
        orgType: p.orgType || '', category: p.category || '',
        legalPerson: p.legalPerson || '', legalPersonType: p.legalPersonType || '', legalIdCard: p.legalIdCard || '',
        controller: p.controller || '', controllerTitle: p.controllerTitle || '', controllerPhone: p.controllerPhone || '',
        contactPerson: p.contactPerson || '', contactPhone: p.contactPhone || '',
        country: p.country || '', province: p.province || '', city: p.city || '',
        address: p.address || '', bizAddress: p.bizAddress || '',
        regNo: p.regNo || '', estDate: p.estDate ? p.estDate.slice(0,10) : '', regCapital: p.regCapital || '', regCurrency: p.regCurrency || '',
        revenueScale: p.revenueScale || '', corpType: p.corpType || '', groupName: p.groupName || '', industry: p.industry || '',
        taxType: p.taxType || '', taxRating: p.taxRating || '', invoiceType: p.invoiceType || '', relatedPartyType: p.relatedPartyType || '',
        licenseType: p.licenseType || '', licenseExpiry: p.licenseExpiry ? p.licenseExpiry.slice(0,10) : '',
        sourceRegion: p.sourceRegion || '', mainBiz: p.mainBiz || '', bizScope: p.bizScope || '',
        tradingGoods: p.tradingGoods || '', equityStructure: p.equityStructure || '', intro: p.intro || '',
        creditLimit: p.creditLimit || '', remark: p.remark || '',
      });
      setLoading(false);
    }).catch((e) => { setError(e.message || '加载失败'); setLoading(false); });
  }, [id]);

  const toggleRole = (role: string) => {
    setRoles((prev) => {
      if (prev.includes(role)) {
        if (originalRoles.includes(role)) { alert('不允许移除已有合作伙伴角色。合作伙伴角色仅支持追加。'); return prev; }
        return prev.filter((r) => r !== role);
      }
      return [...prev, role];
    });
  };

  const deleteAttachment = async (attId: string) => {
    if (!confirm('确定删除此附件？')) return;
    try {
      await api.delete(`/partners/attachments/${attId}`);
      setAttachments((prev) => prev.filter((a) => a.id !== attId));
    } catch (e: any) { alert(e.message || '删除失败'); }
  };

  const uploadNewFiles = async () => {
    for (const file of newFiles) {
      const fd = new FormData();
      fd.append('file', file);
      const cat = file.name.match(/营业执照|license|biz/i) ? 'BUSINESS_LICENSE' : 'OTHER';
      fd.append('category', cat);
      await api.upload(`/partners/${id}/attachments`, fd);
    }
  };

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      const patch: Record<string, any> = { name: form.name, roles };
      for (const [k, v] of Object.entries(form)) {
        if (k === 'name') continue;
        if (v === '' || v == null) continue;
        if (k === 'creditLimit' || k === 'regCapital') patch[k] = parseFloat(v) || 0;
        else if (k === 'isParent') patch[k] = v === 'true';
        else patch[k] = v;
      }
      await api.patch(`/partners/${id}`, patch);
      if (newFiles.length > 0) await uploadNewFiles();
      // Create new bank accounts
      for (const acct of bankAccounts.filter((a) => a._new)) {
        if (!acct.accountName || !acct.accountNo || !acct.bankName) continue;
        await api.post(`/partners/${id}/bank-accounts`, {
          accountName: acct.accountName, accountNo: acct.accountNo,
          bankName: acct.bankName, bankCode: acct.bankCode || undefined,
          accountType: acct.accountType, isDefault: acct.isDefault,
        });
      }
      router.push(`/dashboard/master-data/partners/${id}`);
    } catch (e: any) {
      setError(e.message || '保存失败');
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...</div>;
  if (error && !form.name) return <div className="p-12 text-center text-destructive">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1" />返回</Button>
          <div>
            <h1 className="text-2xl font-bold">编辑合作伙伴</h1>
            <p className="text-sm text-muted-foreground mt-0.5">修改运营数据，编码和信用代码不可修改</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/master-data/partners/${id}`}><Button variant="outline">取消</Button></Link>
          <Button onClick={handleSubmit} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? '保存中...' : '保存修改'}</Button>
        </div>
      </div>

      {error && <div className="bg-destructive/10 text-destructive text-sm px-4 py-2.5 rounded-md border border-destructive/20">{error}</div>}

      <div className="grid grid-cols-3 gap-6 items-start">
        {/* Left main column */}
        <div className="col-span-2 space-y-4">

          {/* Locked fields */}
          <Card className="p-6">
            <SectionTitle>不可修改字段</SectionTitle>
            <div className="grid grid-cols-3 gap-4 p-3 bg-muted/30 rounded-lg">
              <LockedField label="编码" value={partnerCode} />
              <LockedField label="统一社会信用代码" value={partnerTaxId || '—'} />
              <LockedField label="单位性质" value={isInternal ? '内部企业' : '外部单位'} />
            </div>

            <SectionTitle>企业基本信息</SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="col-span-2"><FormField label="企业名称" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></FormField></div>
              <FormField label="国家 / 地区"><SelectField value={form.country} onChange={(v) => set('country', v)} options={COUNTRIES} /></FormField>
              <FormField label="简称"><Input value={form.shortName} onChange={(e) => set('shortName', e.target.value)} /></FormField>
              <FormField label="搜索简码"><Input value={form.shortCode} onChange={(e) => set('shortCode', e.target.value)} /></FormField>
              <FormField label="组织性质"><SelectField value={form.orgType} onChange={(v) => set('orgType', v)} options={ORG_TYPES} /></FormField>
              <FormField label="企业类型"><SelectField value={form.corpType} onChange={(v) => set('corpType', v)} options={CORP_TYPES} /></FormField>
              <FormField label="合作伙伴类别">
                <div className="flex gap-2 pt-0.5">
                  {CATEGORY_OPTIONS.map((c) => (
                    <button key={c.value} type="button" onClick={() => set('category', form.category === c.value ? '' : c.value)}
                      className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${form.category === c.value ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:border-foreground/30'}`}>{c.label}</button>
                  ))}
                </div>
              </FormField>
            </div>

            <SectionTitle>合作伙伴角色 <span className="text-xs font-normal text-muted-foreground">（仅允许追加，原有角色标记🔒）</span></SectionTitle>
            <div className="flex gap-3">
              {[{ key: 'SUPPLIER', label: '供应商', desc: '提供原材料、商品或服务' }, { key: 'CUSTOMER', label: '客户', desc: '采购本公司产品或商品' }].map((r) => (
                <button key={r.key} type="button" onClick={() => toggleRole(r.key)}
                  className={`flex flex-col items-start px-4 py-2.5 rounded-lg border-2 text-left transition-colors min-w-[130px] ${roles.includes(r.key) ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:border-foreground/30'}`}>
                  <span className="font-semibold text-sm">{r.label} {originalRoles.includes(r.key) && <Lock className="h-3 w-3 inline ml-1 opacity-50" />}</span>
                  <span className="text-xs mt-0.5 opacity-70">{r.desc}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* 法人/实控人 */}
          <Card className="p-6">
            <SectionTitle>法人 / 实际控制人</SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <FormField label="法定代表人"><Input value={form.legalPerson} onChange={(e) => set('legalPerson', e.target.value)} /></FormField>
              <FormField label="法人类型"><SelectField value={form.legalPersonType} onChange={(v) => set('legalPersonType', v)} options={LEGAL_PERSON_TYPES} /></FormField>
              <FormField label="法人身份证号"><Input value={form.legalIdCard} onChange={(e) => set('legalIdCard', e.target.value)} className="font-mono" /></FormField>
              <FormField label="实际控制人"><Input value={form.controller} onChange={(e) => set('controller', e.target.value)} /></FormField>
              <FormField label="实控人职务"><Input value={form.controllerTitle} onChange={(e) => set('controllerTitle', e.target.value)} /></FormField>
              <FormField label="实控人联系方式"><Input value={form.controllerPhone} onChange={(e) => set('controllerPhone', e.target.value)} /></FormField>
            </div>
          </Card>

          {/* 工商登记信息 */}
          <Card className="p-6">
            <SectionTitle>工商登记信息</SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <FormField label="注册登记号"><Input value={form.regNo} onChange={(e) => set('regNo', e.target.value)} className="font-mono" /></FormField>
              <FormField label="成立日期"><Input type="date" value={form.estDate} onChange={(e) => set('estDate', e.target.value)} /></FormField>
              <div>
                <FormField label="注册资本（万）">
                  <div className="flex gap-2"><Input type="number" value={form.regCapital} onChange={(e) => set('regCapital', e.target.value)} className="flex-1" /><SelectField value={form.regCurrency} onChange={(v) => set('regCurrency', v)} options={CURRENCIES} placeholder="币种" /></div>
                </FormField>
              </div>
              <FormField label="营业收入规模"><SelectField value={form.revenueScale} onChange={(v) => set('revenueScale', v)} options={REVENUE_SCALES} /></FormField>
              <FormField label="所属集团"><Input value={form.groupName} onChange={(e) => set('groupName', e.target.value)} placeholder="集团名称（可选）" /></FormField>
              <FormField label="行业"><SelectField value={form.industry} onChange={(v) => set('industry', v)} options={INDUSTRIES} /></FormField>
            </div>
          </Card>

          {/* 联系人/地址 */}
          <Card className="p-6">
            <SectionTitle>联系人 / 地址信息</SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <FormField label="主联系人"><Input value={form.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} /></FormField>
              <FormField label="联系电话"><Input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} /></FormField>
              <FormField label="省份"><SelectField value={form.province} onChange={(v) => { set('province', v); set('city', ''); }} options={PROVINCES} /></FormField>
              <FormField label="城市">
                {(CITY_MAP[form.province]?.length || 0) > 0
                  ? <SelectField value={form.city} onChange={(v) => set('city', v)} options={CITY_MAP[form.province] || []} />
                  : <Input value={form.city} onChange={(e) => set('city', e.target.value)} />}
              </FormField>
              <div className="col-span-2"><FormField label="注册地址"><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></FormField></div>
              <div className="col-span-2"><FormField label="办公地址"><Input value={form.bizAddress} onChange={(e) => set('bizAddress', e.target.value)} /></FormField></div>
            </div>
          </Card>

          {/* 业务信息 */}
          <Card className="p-6">
            <SectionTitle>业务信息</SectionTitle>
            <div className="space-y-4">
              <FormField label="主要货源地" hint="供应商适用，填写原料或商品的主要来源地区"><Input value={form.sourceRegion} onChange={(e) => set('sourceRegion', e.target.value)} /></FormField>
              <FormField label="主营业务"><textarea rows={2} value={form.mainBiz} onChange={(e) => set('mainBiz', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" /></FormField>
              <FormField label="拟合作品种 / 业务"><textarea rows={2} value={form.tradingGoods} onChange={(e) => set('tradingGoods', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" /></FormField>
              <FormField label="经营范围"><textarea rows={3} value={form.bizScope} onChange={(e) => set('bizScope', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" /></FormField>
              <FormField label="股权结构"><textarea rows={2} value={form.equityStructure} onChange={(e) => set('equityStructure', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" /></FormField>
              <FormField label="企业介绍"><textarea rows={3} value={form.intro} onChange={(e) => set('intro', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" /></FormField>
            </div>
          </Card>

          {/* 银行账户 */}
          <Card className="p-6">
            <SectionTitle>银行账户</SectionTitle>
            <p className="text-xs text-muted-foreground mb-3">支持多个银行账户，须指定一个为默认结算账户</p>
            {bankAccounts.map((a, i) => (
              <div key={a.id} className="grid grid-cols-6 gap-2 mb-3 p-3 bg-muted/30 rounded-lg">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">开户名称*</label>
                  <Input value={a.accountName} onChange={(e) => updateBankAccount(i, 'accountName', e.target.value)} placeholder="与合同/发票一致" className="h-8 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">银行账号*</label>
                  <Input value={a.accountNo} onChange={(e) => updateBankAccount(i, 'accountNo', e.target.value)} placeholder="账号" className="h-8 text-sm font-mono" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">开户行*</label>
                  <Input value={a.bankName} onChange={(e) => updateBankAccount(i, 'bankName', e.target.value)} placeholder="全称" className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">联行号</label>
                  <Input value={a.bankCode} onChange={(e) => updateBankAccount(i, 'bankCode', e.target.value)} placeholder="可选" className="h-8 text-sm font-mono" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">类型</label>
                  <select value={a.accountType} onChange={(e) => updateBankAccount(i, 'accountType', e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs">
                    <option value="GENERAL">一般户</option><option value="BASIC">基本户</option>
                  </select>
                </div>
                <div className="flex items-end gap-1">
                  <label className="flex items-center gap-1 text-xs cursor-pointer mb-1">
                    <input type="checkbox" checked={a.isDefault} onChange={(e) => updateBankAccount(i, 'isDefault', e.target.checked)} /> 默认
                  </label>
                  <button onClick={() => removeBankAccount(i)} className="text-destructive text-xs hover:underline ml-auto mb-1">删除</button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addBankAccount}>+ 添加银行账户</Button>
          </Card>

          {/* 影像附件 */}
          <Card className="p-6">
            <SectionTitle>影像附件</SectionTitle>
            <div className="bg-muted/50 rounded-lg p-3 mb-3 text-xs text-muted-foreground leading-relaxed">
              支持 JPG、PNG、WEBP、PDF 格式。已有附件可删除，也可追加新文件。
            </div>
            {/* Existing attachments */}
            {attachments.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {attachments.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded bg-muted/50">
                    <span>{a.mimeType.startsWith('image/') ? '🖼' : '📄'}</span>
                    <span className="flex-1 truncate">{a.originalName}</span>
                    <span className="text-xs text-muted-foreground">{a.category === 'BUSINESS_LICENSE' ? '营业执照' : ''} · {(a.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => deleteAttachment(a.id)} className="text-destructive hover:bg-destructive/10 rounded px-1"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            {/* New file upload */}
            <label className="block border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
              <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => setNewFiles((prev) => [...prev, ...Array.from(e.target.files || [])])} className="hidden" />
              <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <div className="text-sm">追加附件</div>
            </label>
            {newFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {newFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1 px-2 rounded bg-primary/5">
                    <span>{f.name}</span>
                    <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))} className="ml-auto text-destructive"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle>税务 / 发票</SectionTitle>
            <div className="space-y-3">
              <FormField label="纳税人类型"><SelectField value={form.taxType} onChange={(v) => set('taxType', v)} options={TAX_TYPES} /></FormField>
              <FormField label="纳税评级">
                <div className="flex gap-2">{TAX_RATINGS.map((r) => <button key={r} type="button" onClick={() => set('taxRating', form.taxRating === r ? '' : r)} className={`flex-1 py-1.5 rounded-md border text-sm font-medium ${form.taxRating === r ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground'}`}>{r}</button>)}</div>
              </FormField>
              <FormField label="发票类型"><SelectField value={form.invoiceType} onChange={(v) => set('invoiceType', v)} options={INVOICE_TYPES} /></FormField>
              <FormField label="关联方"><SelectField value={form.relatedPartyType} onChange={(v) => set('relatedPartyType', v)} options={RELATED_PARTY_TYPES} /></FormField>
            </div>

            <SectionTitle>特殊资质</SectionTitle>
            <div className="space-y-3">
              <FormField label="特殊证照"><SelectField value={form.licenseType} onChange={(v) => set('licenseType', v)} options={LICENSE_TYPES} /></FormField>
              <FormField label="资质到期日"><Input type="date" value={form.licenseExpiry} onChange={(e) => set('licenseExpiry', e.target.value)} /></FormField>
            </div>
          </Card>

          <Card className="p-5"><SectionTitle>授信 / 结算</SectionTitle>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span><Input type="number" className="pl-7" value={form.creditLimit} onChange={(e) => set('creditLimit', e.target.value)} placeholder="0" /></div>
          </Card>
          <Card className="p-5"><SectionTitle>备注</SectionTitle>
            <textarea rows={5} value={form.remark} onChange={(e) => set('remark', e.target.value)} placeholder="补充说明（可选）" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
          </Card>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="flex justify-end gap-3 pb-8 border-t pt-6">
        <Link href={`/dashboard/master-data/partners/${id}`}><Button variant="outline">取消</Button></Link>
        <Button onClick={handleSubmit} disabled={saving} size="lg"><Save className="h-4 w-4 mr-1" />{saving ? '保存中...' : '保存修改'}</Button>
      </div>
    </div>
  );
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><Lock className="h-3 w-3" />{label}</div>
      <div className="text-sm font-mono text-muted-foreground">{value}</div>
    </div>
  );
}
