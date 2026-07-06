'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '@/lib/api';

/* ── 枚举配置 ── */

const ROLE_OPTIONS = [
  { key: 'SUPPLIER', label: '供应商', desc: '提供原材料、商品或服务' },
  { key: 'CUSTOMER', label: '客户', desc: '采购本公司产品或商品' },
];

const CATEGORY_OPTIONS = [
  { value: 'CORE', label: '核心合作伙伴' },
  { value: 'NORMAL', label: '普通合作伙伴' },
  { value: 'TEMP', label: '临时合作伙伴' },
];

const ORG_TYPES = ['有限责任公司', '股份有限公司', '国有企业', '外资企业', '个体工商户', '合伙企业'];
const CORP_TYPES = ['生产型企业', '贸易型企业', '生产 + 贸易', '服务型企业'];
const TAX_TYPES = ['一般纳税人', '小规模纳税人', '免税单位'];
const TAX_RATINGS = ['A级', 'B级', 'C级', 'D级'];
const INVOICE_TYPES = ['增值税专用发票（13%）', '增值税专用发票（9%）', '增值税普通发票', '电子普通发票'];
const INDUSTRIES = ['制造业', '批发和零售', '交通运输', '信息技术', '金融', '建筑', '采矿业', '农林牧渔', '其他'];
const REVENUE_SCALES = ['1亿以下', '1亿–5亿', '5亿–20亿', '20亿以上'];
const CURRENCIES = ['人民币', '美元', '欧元'];
const LICENSE_TYPES = ['采矿许可证', '危化品经营许可证', '道路运输许可证', '建筑施工资质', '食品经营许可', '医疗器械许可', '其他', '无'];
const RELATED_PARTY_TYPES = ['否', '是 · 全资子公司', '是 · 参股公司', '是 · 控股股东'];
const LEGAL_PERSON_TYPES = ['自然人', '法人'];
const COUNTRIES = ['中国大陆', '香港', '澳门', '台湾', '其他'];

const CITY_MAP: Record<string, string[]> = {
  '浙江省': ['杭州市', '宁波市', '温州市', '嘉兴市', '湖州市', '绍兴市', '金华市', '衢州市', '舟山市', '台州市', '丽水市'],
  '甘肃省': ['兰州市', '嘉峪关市', '金昌市', '白银市', '天水市', '武威市', '张掖市', '平凉市', '酒泉市', '庆阳市', '定西市', '陇南市'],
  '江苏省': ['南京市', '无锡市', '徐州市', '常州市', '苏州市', '南通市', '连云港市', '淮安市', '盐城市', '扬州市', '镇江市', '泰州市', '宿迁市'],
  '广东省': ['广州市', '深圳市', '珠海市', '汕头市', '佛山市', '东莞市', '中山市', '湛江市', '惠州市'],
  '山东省': ['济南市', '青岛市', '淄博市', '枣庄市', '东营市', '烟台市', '潍坊市', '济宁市', '泰安市', '威海市'],
  '四川省': ['成都市', '自贡市', '攀枝花市', '泸州市', '德阳市', '绵阳市', '广元市', '遂宁市', '内江市', '乐山市'],
  '河南省': ['郑州市', '开封市', '洛阳市', '平顶山市', '安阳市', '鹤壁市', '新乡市', '焦作市', '濮阳市', '许昌市'],
  '湖南省': ['长沙市', '株洲市', '湘潭市', '衡阳市', '邵阳市', '岳阳市', '常德市', '张家界市', '益阳市', '郴州市'],
  '湖北省': ['武汉市', '黄石市', '十堰市', '宜昌市', '襄阳市', '鄂州市', '荆门市', '孝感市', '荆州市', '黄冈市'],
  '福建省': ['福州市', '厦门市', '莆田市', '三明市', '泉州市', '漳州市', '南平市', '龙岩市', '宁德市'],
  '其他': [],
};
const PROVINCES = Object.keys(CITY_MAP);

/* ── 表单数据结构 ── */

const INIT: Record<string, string> = {
  // 基本
  code: '', name: '', shortName: '', shortCode: '', taxId: '', orgType: '', category: '',
  country: '中国大陆',
  // 法人
  legalPerson: '', legalPersonType: '', legalIdCard: '',
  controller: '', controllerTitle: '', controllerPhone: '',
  // 联系
  contactPerson: '', contactPhone: '',
  // 地址
  province: '', city: '', address: '', bizAddress: '',
  // 工商登记
  regNo: '', estDate: '', regCapital: '', regCurrency: '人民币',
  revenueScale: '', corpType: '', groupName: '', industry: '',
  // 税务
  taxType: '', taxRating: '', invoiceType: '', relatedPartyType: '',
  // 资质
  licenseType: '', licenseExpiry: '',
  // 业务
  sourceRegion: '', mainBiz: '', bizScope: '', tradingGoods: '', equityStructure: '', intro: '',
  // 其他
  creditLimit: '', remark: '',
};

/* ── 辅助组件 ── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b pb-2 mb-4 mt-6 first:mt-0">
      {children}
    </div>
  );
}

function FormField({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function SelectField({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void;
  options: string[] | { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">{placeholder || '请选择'}</option>
      {options.map((o) =>
        typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
      )}
    </select>
  );
}

/* ── 页面 ── */

export default function PartnerNewPage() {
  const router = useRouter();
  const [form, setForm] = useState(INIT);
  const [roles, setRoles] = useState<string[]>([]);
  const [isInternal, setIsInternal] = useState(false);
  const [isParent, setIsParent] = useState(false);
  const [codeMode, setCodeMode] = useState<'auto' | 'manual'>('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  // 自动获取外部编码
  useEffect(() => {
    if (!isInternal && codeMode === 'auto') {
      api.get<string>('/partners/next-code')
        .then((code) => set('code', code))
        .catch(() => {});
    }
    if (isInternal) {
      set('code', '');
    }
  }, [isInternal, codeMode]);

  // 省份切换时清空城市
  const handleProvinceChange = (v: string) => {
    setForm((f) => ({ ...f, province: v, city: '' }));
  };

  const citiesForProvince = CITY_MAP[form.province] || [];

  const toggleRole = (role: string) => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleInternalToggle = (val: boolean) => {
    setIsInternal(val);
    setIsParent(false);
    if (val) {
      setCodeMode('manual');
      set('code', '');
    } else {
      setCodeMode('auto');
      api.get<string>('/partners/next-code').then((code) => set('code', code)).catch(() => {});
    }
  };

  const handleSubmit = async () => {
    if (!form.name) { setError('请填写企业名称'); return; }
    if (!roles.length) { setError('请至少选择一个角色（供应商 / 客户）'); return; }
    if (!form.code) { setError('请填写合作伙伴编码'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post('/partners', {
        ...Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')),
        creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined,
        regCapital: form.regCapital ? parseFloat(form.regCapital) : undefined,
        isInternal,
        isParent,
        roles,
      });
      router.push('/dashboard/master-data?tab=partners');
    } catch (e: unknown) {
      setError((e as Error).message || '创建失败');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold">新增合作伙伴</h1>
            <p className="text-sm text-muted-foreground mt-0.5">填写企业档案信息，提交后档案正式生效</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            <Save className="h-4 w-4 mr-1" />
            {loading ? '保存中...' : '保存档案'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm px-4 py-2.5 rounded-md border border-destructive/20">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6 items-start">
        {/* 左主列 */}
        <div className="col-span-2 space-y-4">

          {/* 企业基本信息 */}
          <Card className="p-6">
            <SectionTitle>企业基本信息</SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="col-span-2">
                <FormField label="企业名称" required>
                  <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="请输入企业全称（与营业执照一致）" />
                </FormField>
              </div>

              <FormField label="统一社会信用代码">
                <Input
                  value={form.taxId} onChange={(e) => set('taxId', e.target.value)}
                  placeholder="18位统一社会信用代码" maxLength={18}
                  className="font-mono"
                />
              </FormField>
              <FormField label="国家 / 地区">
                <SelectField value={form.country} onChange={(v) => set('country', v)} options={COUNTRIES} />
              </FormField>

              <FormField label="简称 / 别名">
                <Input value={form.shortName} onChange={(e) => set('shortName', e.target.value)} placeholder="简称或别名（可选）" />
              </FormField>
              <FormField label="搜索简码">
                <Input value={form.shortCode} onChange={(e) => set('shortCode', e.target.value)} placeholder="拼音首字母，如：JHJT" />
              </FormField>

              <FormField label="组织性质">
                <SelectField value={form.orgType} onChange={(v) => set('orgType', v)} options={ORG_TYPES} />
              </FormField>
              <FormField label="合作伙伴类别">
                <div className="flex gap-2 flex-wrap pt-0.5">
                  {CATEGORY_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => set('category', form.category === c.value ? '' : c.value)}
                      className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                        form.category === c.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-input text-muted-foreground hover:border-foreground/30'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </FormField>
            </div>

            <SectionTitle>业务角色</SectionTitle>
            <p className="text-xs text-muted-foreground mb-3">选择该单位与我方的业务关系，可同时具备供应商和客户身份</p>
            <div className="flex gap-3">
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => toggleRole(r.key)}
                  className={`flex flex-col items-start px-4 py-2.5 rounded-lg border-2 text-left transition-colors min-w-[130px] ${
                    roles.includes(r.key)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input text-muted-foreground hover:border-foreground/30'
                  }`}
                >
                  <span className="font-semibold text-sm">{r.label}</span>
                  <span className="text-xs mt-0.5 opacity-70">{r.desc}</span>
                </button>
              ))}
            </div>

            <SectionTitle>单位性质</SectionTitle>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleInternalToggle(false)}
                className={`flex flex-col items-start px-4 py-2.5 rounded-lg border-2 text-left transition-colors min-w-[130px] ${
                  !isInternal
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground hover:border-foreground/30'
                }`}
              >
                <span className="font-semibold text-sm">外部单位</span>
                <span className="text-xs mt-0.5 opacity-70">独立法人，编码 6 位数字</span>
              </button>
              <button
                type="button"
                onClick={() => handleInternalToggle(true)}
                className={`flex flex-col items-start px-4 py-2.5 rounded-lg border-2 text-left transition-colors min-w-[130px] ${
                  isInternal
                    ? 'border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400'
                    : 'border-input text-muted-foreground hover:border-foreground/30'
                }`}
              >
                <span className="font-semibold text-sm">内部企业</span>
                <span className="text-xs mt-0.5 opacity-70">集团子公司，编码 4 位手动</span>
              </button>
            </div>

            <SectionTitle>合作伙伴编码</SectionTitle>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <FormField label={isInternal ? '编码（4位字母数字，手动录入）' : '编码（6位数字，自动递增）'} required>
                  <Input
                    value={form.code}
                    onChange={(e) => set('code', e.target.value)}
                    placeholder={isInternal ? '如：HQ01' : '000001'}
                    maxLength={isInternal ? 4 : 6}
                    disabled={!isInternal && codeMode === 'auto'}
                    className="font-mono"
                  />
                </FormField>
              </div>
              {!isInternal && (
                <Button
                  type="button" variant="outline" size="sm" className="mb-0.5"
                  onClick={() => {
                    const next = codeMode === 'auto' ? 'manual' : 'auto';
                    setCodeMode(next);
                    if (next === 'auto') {
                      api.get<string>('/partners/next-code').then((code) => set('code', code)).catch(() => {});
                    } else {
                      set('code', '');
                    }
                  }}
                >
                  {codeMode === 'auto' ? '手动指定' : '自动生成'}
                </Button>
              )}
            </div>
          </Card>

          {/* 法人 / 实控人 */}
          <Card className="p-6">
            <SectionTitle>法人 / 实际控制人</SectionTitle>
            <div className="grid grid-cols-3 gap-x-6 gap-y-4">
              <FormField label="法定代表人">
                <Input value={form.legalPerson} onChange={(e) => set('legalPerson', e.target.value)} placeholder="法人姓名" />
              </FormField>
              <FormField label="法人类型">
                <SelectField value={form.legalPersonType} onChange={(v) => set('legalPersonType', v)} options={LEGAL_PERSON_TYPES} />
              </FormField>
              <FormField label="法人身份证号">
                <Input value={form.legalIdCard} onChange={(e) => set('legalIdCard', e.target.value)} placeholder="18位身份证号码" maxLength={18} className="font-mono" />
              </FormField>
              <FormField label="实际控制人">
                <Input value={form.controller} onChange={(e) => set('controller', e.target.value)} placeholder="如与法人不同" />
              </FormField>
              <FormField label="实控人职务">
                <Input value={form.controllerTitle} onChange={(e) => set('controllerTitle', e.target.value)} placeholder="如：董事长" />
              </FormField>
              <FormField label="实控人联系方式">
                <Input value={form.controllerPhone} onChange={(e) => set('controllerPhone', e.target.value)} placeholder="手机 / 座机" />
              </FormField>
            </div>
          </Card>

          {/* 工商登记 */}
          <Card className="p-6">
            <SectionTitle>工商登记信息</SectionTitle>
            <div className="grid grid-cols-3 gap-x-6 gap-y-4">
              <FormField label="注册登记号">
                <Input value={form.regNo} onChange={(e) => set('regNo', e.target.value)} placeholder="工商注册登记号" className="font-mono" />
              </FormField>
              <FormField label="成立日期">
                <Input type="date" value={form.estDate} onChange={(e) => set('estDate', e.target.value)} />
              </FormField>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <FormField label="注册资本（万）">
                    <Input type="number" value={form.regCapital} onChange={(e) => set('regCapital', e.target.value)} placeholder="金额" min={0} />
                  </FormField>
                </div>
                <div className="w-24">
                  <SelectField value={form.regCurrency} onChange={(v) => set('regCurrency', v)} options={CURRENCIES} />
                </div>
              </div>
              <FormField label="企业类型">
                <SelectField value={form.corpType} onChange={(v) => set('corpType', v)} options={CORP_TYPES} />
              </FormField>
              <FormField label="营业收入规模">
                <SelectField value={form.revenueScale} onChange={(v) => set('revenueScale', v)} options={REVENUE_SCALES} />
              </FormField>
              <FormField label="行业">
                <SelectField value={form.industry} onChange={(v) => set('industry', v)} options={INDUSTRIES} />
              </FormField>
              <div className="col-span-2">
                <FormField label="所属集团">
                  <Input value={form.groupName} onChange={(e) => set('groupName', e.target.value)} placeholder="集团名称（可选）" />
                </FormField>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox" id="isParent" checked={isParent}
                  onChange={(e) => setIsParent(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <label htmlFor="isParent" className="text-sm text-foreground cursor-pointer">本身为母公司</label>
              </div>
            </div>
          </Card>

          {/* 联系人 / 地址 */}
          <Card className="p-6">
            <SectionTitle>联系人 / 地址信息</SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <FormField label="主联系人">
                <Input value={form.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
              </FormField>
              <FormField label="联系电话">
                <Input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
              </FormField>
              <FormField label="省份">
                <SelectField value={form.province} onChange={handleProvinceChange} options={PROVINCES} placeholder="请选择省份" />
              </FormField>
              <FormField label="城市">
                {citiesForProvince.length > 0 ? (
                  <SelectField value={form.city} onChange={(v) => set('city', v)} options={citiesForProvince} placeholder="请选择城市" />
                ) : (
                  <Input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="请输入城市" />
                )}
              </FormField>
              <div className="col-span-2">
                <FormField label="注册地址">
                  <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="与营业执照一致" />
                </FormField>
              </div>
              <div className="col-span-2">
                <FormField label="办公地址">
                  <Input value={form.bizAddress} onChange={(e) => set('bizAddress', e.target.value)} placeholder="实际办公 / 经营地址" />
                </FormField>
              </div>
            </div>
          </Card>

          {/* 业务信息 */}
          <Card className="p-6">
            <SectionTitle>业务信息</SectionTitle>
            <div className="space-y-4">
              <FormField label="主要货源地" hint="供应商适用，填写原料或商品的主要来源地区">
                <Input value={form.sourceRegion} onChange={(e) => set('sourceRegion', e.target.value)} placeholder="如：华东地区、进口、山东、云南" />
              </FormField>
              <FormField label="主营业务">
                <textarea
                  rows={2} value={form.mainBiz}
                  onChange={(e) => set('mainBiz', e.target.value)}
                  placeholder="描述企业核心业务方向及主要产品或服务"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </FormField>
              <FormField label="拟合作品种 / 业务" hint="与本方预计开展交易的具体商品品类或业务类型">
                <textarea
                  rows={2} value={form.tradingGoods}
                  onChange={(e) => set('tradingGoods', e.target.value)}
                  placeholder="如：原材料采购、产品销售、物流运输、技术服务等"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </FormField>
              <FormField label="经营范围">
                <textarea
                  rows={3} value={form.bizScope}
                  onChange={(e) => set('bizScope', e.target.value)}
                  placeholder="可从营业执照复制"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </FormField>
              <FormField label="股权结构">
                <textarea
                  rows={2} value={form.equityStructure}
                  onChange={(e) => set('equityStructure', e.target.value)}
                  placeholder="主要股东及持股比例（可选）"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </FormField>
              <FormField label="企业介绍">
                <textarea
                  rows={3} value={form.intro}
                  onChange={(e) => set('intro', e.target.value)}
                  placeholder="企业背景、规模、核心能力等简介（可选）"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </FormField>
            </div>
          </Card>

        </div>

        {/* 右侧列 */}
        <div className="space-y-4">

          {/* 税务/发票 */}
          <Card className="p-5">
            <SectionTitle>税务 / 发票</SectionTitle>
            <div className="space-y-3">
              <FormField label="纳税人类型">
                <SelectField value={form.taxType} onChange={(v) => set('taxType', v)} options={TAX_TYPES} />
              </FormField>
              <FormField label="纳税评级">
                <div className="flex gap-2">
                  {TAX_RATINGS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => set('taxRating', form.taxRating === r ? '' : r)}
                      className={`flex-1 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                        form.taxRating === r
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-input text-muted-foreground hover:border-foreground/30'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="发票类型">
                <SelectField value={form.invoiceType} onChange={(v) => set('invoiceType', v)} options={INVOICE_TYPES} />
              </FormField>
              <FormField label="是否为关联方">
                <SelectField value={form.relatedPartyType} onChange={(v) => set('relatedPartyType', v)} options={RELATED_PARTY_TYPES} />
              </FormField>
            </div>
          </Card>

          {/* 特殊资质 */}
          <Card className="p-5">
            <SectionTitle>特殊资质</SectionTitle>
            <div className="space-y-3">
              <FormField label="特殊证照">
                <SelectField value={form.licenseType} onChange={(v) => set('licenseType', v)} options={LICENSE_TYPES} placeholder="请选择" />
              </FormField>
              {form.licenseType && form.licenseType !== '无' && (
                <FormField label="资质到期日">
                  <Input type="date" value={form.licenseExpiry} onChange={(e) => set('licenseExpiry', e.target.value)} />
                </FormField>
              )}
            </div>
          </Card>

          {/* 授信 */}
          <Card className="p-5">
            <SectionTitle>授信 / 结算</SectionTitle>
            <div className="space-y-3">
              <FormField label="授信额度（元）">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span>
                  <Input
                    type="number" className="pl-7"
                    value={form.creditLimit} onChange={(e) => set('creditLimit', e.target.value)}
                    placeholder="0" min={0}
                  />
                </div>
              </FormField>
            </div>
          </Card>

          {/* 备注 */}
          <Card className="p-5">
            <SectionTitle>备注</SectionTitle>
            <textarea
              rows={3} value={form.remark}
              onChange={(e) => set('remark', e.target.value)}
              placeholder="补充说明、注意事项等（可选）"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </Card>

          {/* 预览摘要 */}
          {(form.name || roles.length > 0) && (
            <Card className="p-5 bg-muted/30">
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">档案摘要</div>
              <div className="space-y-2 text-sm">
                {form.code && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16 shrink-0">编码</span>
                    <span className="font-mono font-medium">{form.code}</span>
                  </div>
                )}
                {form.name && (
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground w-16 shrink-0">名称</span>
                    <span className="font-medium">{form.name}</span>
                  </div>
                )}
                {(roles.length > 0 || isInternal) && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16 shrink-0">角色</span>
                    <div className="flex flex-wrap gap-1">
                      {isInternal && (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 font-medium">内部</span>
                      )}
                      {roles.map((r) => (
                        <span key={r} className="px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary font-medium">
                          {ROLE_OPTIONS.find((o) => o.key === r)?.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(form.province || form.city) && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16 shrink-0">地区</span>
                    <span>{form.province} {form.city}</span>
                  </div>
                )}
                {form.category && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16 shrink-0">类别</span>
                    <span>{CATEGORY_OPTIONS.find((c) => c.value === form.category)?.label}</span>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* 底部操作 */}
      <div className="flex justify-end gap-3 pb-8 border-t pt-6">
        <Button variant="outline" onClick={() => router.back()}>取消</Button>
        <Button onClick={handleSubmit} disabled={loading} size="lg">
          <Save className="h-4 w-4 mr-1" />
          {loading ? '保存中...' : '保存合作伙伴档案'}
        </Button>
      </div>
    </div>
  );
}
