'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ExternalLink, FileText, FlaskConical, Plus, Scale, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond, toLocalDateTimeInput } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface MaterialSpec { id?: number; name: string; operator: string; value: string | number; unit: string }
interface EligibleTicket {
  id: string; ticketNo: string; status: string; plateNo: string | null; materialName: string | null; materialSpec: string | null;
  ticketDate: string; settlementWeight: string | null; netWeight: string | null; shipperName: string | null; receiverName: string | null;
  waybill: { waybillNo: string; plateNo: string | null; lineItems: Array<{ materialId: string; materialName: string | null }>; dispatchNotice: { type: string; order: { name: string; orderNo: string; contract: { contractNo: string } } } };
  materials: Array<{ materialId: string; materialName: string | null; name?: string; spec?: string | null; grade?: string | null; specs?: MaterialSpec[] | null; qcTemplate?: string | null }>;
}
interface Indicator {
  key: string; code: string; name: string; operator: string; standardValue: string; upperValue: string;
  fuseValue: string; unit: string; measuredValue: string;
}
interface PendingFile { file: File; category: string }
interface InstitutionProfile { id: string; partnerId: string; partner: { id: string; code: string; name: string } }

const CATEGORY = { REPORT: '检测报告', SAMPLE_PHOTO: '取样照片', OTHER: '其他附件' };
const INSTITUTION_TYPE = { OUR: '我方检测机构', PARTNER: '合作方检测机构', THIRD_PARTY: '第三方检测机构', OTHER: '其他检测机构' };
const DEFAULT_INDICATORS: Indicator[] = [
  indicator('grade', 'CaF₂ 品位', 'GTE', '97', '95'),
  indicator('moisture', '水分', 'LTE', '0.5', '1.5'),
  indicator('impurity', '杂质', 'LTE', '0.2', '1.0'),
];

export default function CreateQualityInspectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<EligibleTicket[]>([]);
  const [weighTicketId, setWeighTicketId] = useState('');
  const [sampledAt, setSampledAt] = useState('');
  const [samplerName, setSamplerName] = useState('');
  const [samplingMethod, setSamplingMethod] = useState('多点混合取样');
  const [sampleNos, setSampleNos] = useState(['', '', '']);
  const [dataSource, setDataSource] = useState('MANUAL');
  const [institutionType, setInstitutionType] = useState('OUR');
  const [institutionPartnerId, setInstitutionPartnerId] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [institutions, setInstitutions] = useState<InstitutionProfile[]>([]);
  const [reportNo, setReportNo] = useState('');
  const [testedAt, setTestedAt] = useState('');
  const [indicators, setIndicators] = useState<Indicator[]>(DEFAULT_INDICATORS);
  const [remarks, setRemarks] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [fileCategory, setFileCategory] = useState('REPORT');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const now = toLocalDateTimeInput();
    setSampledAt(now); setTestedAt(now);
    const stored = localStorage.getItem('user');
    if (stored) { try { setSamplerName(JSON.parse(stored).name || ''); } catch {} }
    api.get<EligibleTicket[]>('/quality-inspections/eligible-weigh-tickets').then(items => {
      setTickets(items);
      const requested = searchParams.get('weighTicketId');
      if (requested && items.some(item => item.id === requested)) setWeighTicketId(requested);
    }).catch(error => alert(error.message || '可质检磅单加载失败'));
    api.get<{ items: InstitutionProfile[] }>('/service-organizations?type=QUALITY_INSTITUTION&status=ACTIVE&pageSize=200')
      .then(result => setInstitutions(result.items || []))
      .catch(error => alert(error.message || '质检机构主数据加载失败'));
  }, [searchParams]);

  const ticket = tickets.find(item => item.id === weighTicketId);
  useEffect(() => {
    if (!ticket) return;
    const specs = ticket.materials.flatMap(material => Array.isArray(material.specs) ? material.specs : []);
    if (specs.length) setIndicators(specs.map((spec, index) => indicator(`spec-${index + 1}`, spec.name, operatorCode(spec.operator), String(spec.value ?? ''), defaultFuse(spec.name, spec.operator, Number(spec.value)))));
    else setIndicators(DEFAULT_INDICATORS.map(item => ({ ...item, key: `${item.key}-${ticket.id}` })));
  }, [ticket]);

  const conclusion = useMemo(() => calculateConclusion(indicators), [indicators]);
  const deductions = useMemo(() => calculateDeductions(Number(ticket?.settlementWeight || ticket?.netWeight || 0), indicators), [ticket, indicators]);

  const updateIndicator = (key: string, field: keyof Indicator, value: string) => setIndicators(current => current.map(item => item.key === key ? { ...item, [field]: value } : item));
  const addIndicator = () => setIndicators(current => [...current, indicator(`custom-${Date.now()}`, '', 'LTE', '', '')]);
  const addFiles = (selected: FileList | null) => {
    const accepted = Array.from(selected || []).filter(file => {
      const extension = file.name.toLowerCase().split('.').pop() || '';
      if (!['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(extension) || !file.size || file.size > 20 * 1024 * 1024) {
        alert(`${file.name} 无法上传：仅支持 JPG/PNG/WEBP/PDF，单个文件不超过 20 MB`); return false;
      }
      return true;
    });
    setFiles(current => [...current, ...accepted.map(file => ({ file, category: fileCategory }))]);
  };

  const submit = async () => {
    if (!ticket) return alert('请选择关联磅单');
    if (!sampledAt || !samplerName.trim()) return alert('请填写取样时间和取样人');
    if (['PARTNER', 'THIRD_PARTY'].includes(institutionType) && !institutionPartnerId) return alert('请选择已维护的质检机构');
    if (!institutionName.trim() || !reportNo.trim() || !testedAt) return alert('请填写检测机构、报告编号和检测时间');
    if (!indicators.length || indicators.some(item => !item.name.trim() || item.measuredValue === '' || item.standardValue === '')) return alert('请完整填写指标名称、标准值和检测结果');
    setSaving(true);
    try {
      const created = await api.post<{ id: string }>('/quality-inspections', {
        weighTicketId, sampledAt, samplerName: samplerName.trim(), samplingMethod,
        sampleNo1: sampleNos[0] || undefined, sampleNo2: sampleNos[1] || undefined, sampleNo3: sampleNos[2] || undefined,
        dataSource, institutionType, institutionPartnerId: institutionPartnerId || undefined, institutionName: institutionName.trim(), reportNo: reportNo.trim(), testedAt,
        deductionAmount: deductions.amount, remarks: remarks || undefined, submit: true,
        indicators: indicators.map(item => ({
          code: item.code || item.key, name: item.name, operator: item.operator,
          standardValue: numberOrUndefined(item.standardValue), upperValue: numberOrUndefined(item.upperValue), fuseValue: numberOrUndefined(item.fuseValue),
          unit: item.unit, measuredValue: numberOrUndefined(item.measuredValue),
        })),
      });
      for (const item of files) {
        const body = new FormData(); body.append('file', item.file); body.append('category', item.category);
        await api.upload(`/quality-inspections/${created.id}/attachments`, body);
      }
      router.push(`/dashboard/quality/${created.id}`);
    } catch (error: any) { alert(error.message || '质检单创建失败'); }
    finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/quality')}><ArrowLeft className="h-4 w-4" /></Button><div><h1 className="text-2xl font-bold">新建质检单</h1><p className="mt-1 text-sm text-muted-foreground">关联已完成磅单，为一个检测机构录入一份独立报告并自动判定结论</p></div></div>

    <Card className="overflow-hidden">
      <div className="border-b p-6 pb-4"><SectionTitle title="选择关联磅单" noMargin /><p className="mt-2 text-sm text-muted-foreground">仅显示已完成称重或已复核的磅单；同一磅单可以创建多个检测机构的质检单。点击整行即可选中。</p></div>
      {!tickets.length ? <div className="p-12 text-center text-muted-foreground"><Scale className="mx-auto mb-2 h-8 w-8 opacity-40" /><div>暂无可质检的磅单</div><div className="mt-1 text-xs">请先完成磅单称重或复核，再创建质检单。</div></div> : <div className="overflow-x-auto"><table className="min-w-[1350px] w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th className="w-14 px-4 py-3">选择</th><th className="px-4 py-3">磅单日期</th><th className="px-4 py-3">磅单编号 / 状态</th><th className="px-4 py-3">物流运单</th><th className="px-4 py-3">物料 / 规格</th><th className="px-4 py-3">发货 / 收货单位</th><th className="px-4 py-3">车牌号</th><th className="px-4 py-3 text-right">净重 / 结算重量</th><th className="px-4 py-3">操作</th></tr></thead>
        <tbody>{tickets.map(item => { const selected = item.id === weighTicketId; return <tr key={item.id} className={`cursor-pointer border-b transition-colors ${selected ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : 'hover:bg-muted/50'}`} onClick={() => setWeighTicketId(item.id)}>
          <td className="px-4 py-3"><input type="radio" aria-label={`选择磅单 ${item.ticketNo}`} checked={selected} onChange={() => setWeighTicketId(item.id)} /></td>
          <td className="whitespace-nowrap px-4 py-3">{formatDateTimeToSecond(item.ticketDate)}</td>
          <td className="px-4 py-3"><div className="font-mono font-medium text-primary">{item.ticketNo}</div><Badge className="mt-1" variant="secondary">{item.status === 'REVIEWED' ? '已复核' : '已完成'}</Badge></td>
          <td className="px-4 py-3"><div className="font-mono text-xs">{item.waybill.waybillNo}</div><div className="mt-1 text-xs text-muted-foreground">{item.waybill.dispatchNotice.order.name}</div></td>
          <td className="max-w-56 px-4 py-3"><div className="truncate font-medium" title={item.materialName || ''}>{item.materialName || '-'}</div><div className="mt-1 truncate text-xs text-muted-foreground" title={item.materialSpec || ''}>{item.materialSpec || '-'}</div></td>
          <td className="max-w-64 px-4 py-3"><div className="truncate" title={item.shipperName || ''}>{item.shipperName || '-'}</div><div className="mt-1 truncate text-xs text-muted-foreground" title={item.receiverName || ''}>{item.receiverName || '-'}</div></td>
          <td className="whitespace-nowrap px-4 py-3">{item.plateNo || item.waybill.plateNo || '-'}</td>
          <td className="whitespace-nowrap px-4 py-3 text-right"><div>{qualityWeight(item.netWeight)}</div><div className="mt-1 font-medium text-primary">{qualityWeight(item.settlementWeight)}</div></td>
          <td className="px-4 py-3"><Button variant="outline" size="sm" onClick={event => { event.stopPropagation(); window.open(`/dashboard/weighbridge/${item.id}`, '_blank', 'noopener,noreferrer'); }}><ExternalLink className="mr-1 h-3.5 w-3.5" />查看详情</Button></td>
        </tr>; })}</tbody>
      </table></div>}
    </Card>

    <Card className="space-y-5 p-6">
      <SectionTitle title="取样基本信息" />
      {!ticket && <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">请先在上方磅单列表中选择一张磅单。</div>}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="取样时间（到秒）*"><Input type="datetime-local" step="1" value={sampledAt} onChange={event => setSampledAt(event.target.value)} /></Field>
        <Field label="取样人 *"><Input value={samplerName} onChange={event => setSamplerName(event.target.value)} /></Field>
        <Field label="取样方法"><Input value={samplingMethod} onChange={event => setSamplingMethod(event.target.value)} /></Field>
        <Field label="数据来源"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={dataSource} onChange={event => setDataSource(event.target.value)}><option value="MANUAL">人工录入</option><option value="DEVICE">设备采集</option><option value="OCR">附件识别</option></select></Field>
      </div>
      {ticket && <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-6"><Info label="执行批次" value={ticket.waybill.dispatchNotice.order.name} /><Info label="物流运单" value={ticket.waybill.waybillNo} /><Info label="磅单" value={ticket.ticketNo} /><Info label="物料" value={ticket.materialName || '-'} /><Info label="供应商" value={ticket.shipperName || '-'} /><Info label="结算重量" value={`${Number(ticket.settlementWeight || ticket.netWeight || 0).toLocaleString()} 吨`} /></div>}
      <div className="grid gap-4 md:grid-cols-3">{sampleNos.map((value, index) => <Field key={index} label={`留样编号 #${index + 1}${index === 0 ? '（我方）' : index === 1 ? '（供方）' : '（第三方备用）'}`}><Input value={value} onChange={event => setSampleNos(current => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></Field>)}</div>
    </Card>

    <Card className="space-y-5 p-6"><SectionTitle title="检测机构与报告" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Field label="机构类型 *"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={institutionType} onChange={event => { setInstitutionType(event.target.value); setInstitutionPartnerId(''); setInstitutionName(''); }}>{Object.entries(INSTITUTION_TYPE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="检测机构 *">{['PARTNER', 'THIRD_PARTY'].includes(institutionType) ? <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={institutionPartnerId} onChange={event => { const id = event.target.value; const item = institutions.find(value => value.partnerId === id); setInstitutionPartnerId(id); setInstitutionName(item?.partner.name || ''); }}><option value="">请选择已维护的质检机构</option>{institutions.map(item => <option key={item.id} value={item.partnerId}>{item.partner.code} · {item.partner.name}</option>)}</select> : <Input value={institutionName} onChange={event => setInstitutionName(event.target.value)} placeholder="填写实际出具报告的机构" />}</Field>
        <Field label="报告编号 *"><Input value={reportNo} onChange={event => setReportNo(event.target.value)} /></Field>
        <Field label="检测时间 *"><Input type="datetime-local" step="1" value={testedAt} onChange={event => setTestedAt(event.target.value)} /></Field>
      </div>
      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">一张质检单仅记录一个检测机构。同一车辆需要录入其他机构报告时，请再次新建质检单并选择同一磅单。</div>
    </Card>

    <Card className="space-y-4 p-6"><div className="flex items-center justify-between"><SectionTitle title="检测指标" noMargin /><Button variant="outline" size="sm" onClick={addIndicator}><Plus className="mr-1 h-4 w-4" />增加指标</Button></div>
      <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-sm"><thead className="border-b bg-muted/40 text-left text-muted-foreground"><tr><th className="p-3">指标</th><th className="p-3">判定</th><th className="p-3">标准值</th><th className="p-3">上限值</th><th className="p-3">熔断线</th><th className="p-3">单位</th><th className="p-3">检测结果 *</th><th className="p-3"></th></tr></thead><tbody>{indicators.map(item => <tr key={item.key} className="border-b"><td className="p-2"><Input value={item.name} onChange={event => updateIndicator(item.key, 'name', event.target.value)} /></td><td className="p-2"><select className="h-10 rounded-md border bg-background px-2" value={item.operator} onChange={event => updateIndicator(item.key, 'operator', event.target.value)}><option value="GTE">≥</option><option value="LTE">≤</option><option value="EQ">=</option><option value="RANGE">范围</option></select></td>{(['standardValue', 'upperValue', 'fuseValue', 'unit', 'measuredValue'] as Array<keyof Indicator>).map(field => <td key={field} className="p-2"><Input className="min-w-24" type={field === 'unit' ? 'text' : 'number'} step="0.0001" value={item[field]} onChange={event => updateIndicator(item.key, field, event.target.value)} /></td>)}<td className="p-2"><Button variant="ghost" size="icon" disabled={indicators.length === 1} onClick={() => setIndicators(current => current.filter(value => value.key !== item.key))}><Trash2 className="h-4 w-4 text-destructive" /></Button></td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"><div><div className="text-xs text-muted-foreground">系统预判结论</div><Conclusion value={conclusion} /></div><div className="grid grid-cols-4 gap-6 text-right"><Info label="扣水" value={`${deductions.moistureWeight} 吨`} /><Info label="扣杂" value={`${deductions.impurityWeight} 吨`} /><Info label="结算重量" value={`${deductions.settlementWeight} 吨`} /><Info label="预计扣款" value={`¥${deductions.amount.toLocaleString()}`} /></div></div>
    </Card>

    <Card className="space-y-4 p-6"><SectionTitle title="附件与备注" />
      <div className="flex flex-wrap gap-3"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={fileCategory} onChange={event => setFileCategory(event.target.value)}>{Object.entries(CATEGORY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="inline-flex h-10 cursor-pointer items-center rounded-md border px-4 text-sm text-primary hover:bg-muted"><input type="file" multiple className="hidden" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={event => { addFiles(event.currentTarget.files); event.currentTarget.value = ''; }} /><FileText className="mr-2 h-4 w-4" />选择附件</label></div>
      {files.length > 0 && <div className="space-y-2">{files.map((item, index) => <div key={`${item.file.name}-${index}`} className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm"><span className="truncate"><Badge variant="outline" className="mr-2">{CATEGORY[item.category as keyof typeof CATEGORY]}</Badge>{item.file.name}</span><button onClick={() => setFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4 text-destructive" /></button></div>)}</div>}
      <textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="化验特殊情况、复检说明、留样位置等" />
    </Card>

    <div className="flex justify-end gap-3 pb-8"><Button variant="outline" onClick={() => router.push('/dashboard/quality')}>取消</Button><Button disabled={saving || !weighTicketId} onClick={() => void submit()}><FlaskConical className="mr-2 h-4 w-4" />{saving ? '提交中...' : '提交并出具结论'}</Button></div>
  </div>;
}

function indicator(key: string, name: string, operator: string, standardValue: string, fuseValue: string): Indicator { return { key, code: key, name, operator, standardValue, upperValue: '', fuseValue, unit: '%', measuredValue: '' }; }
function operatorCode(value: string) { return ({ '≥': 'GTE', '≤': 'LTE', '=': 'EQ', '范围': 'RANGE' } as Record<string, string>)[value] || value || 'LTE'; }
function defaultFuse(name: string, operator: string, value: number) { if (name.includes('水分')) return '1.5'; if (name.includes('杂质')) return '1.0'; if (name.toLowerCase().includes('caf') || name.includes('品位')) return String(value - 2); return ''; }
function numberOrUndefined(value: string) { return value === '' ? undefined : Number(value); }
function calculateConclusion(items: Indicator[]) { if (items.some(item => result(item) === 'FUSE')) return 'FUSE'; if (items.some(item => result(item) === 'FAIL')) return 'DEDUCTION'; return items.length && items.every(item => result(item) === 'PASS') ? 'PASS' : 'PENDING'; }
function result(item: Indicator) { const value = Number(item.measuredValue), standard = Number(item.standardValue), fuse = item.fuseValue === '' ? null : Number(item.fuseValue); if (item.measuredValue === '' || item.standardValue === '') return 'PENDING'; if (fuse !== null && ((item.operator === 'GTE' && value < fuse) || (item.operator === 'LTE' && value > fuse))) return 'FUSE'; if (item.operator === 'GTE') return value >= standard ? 'PASS' : 'FAIL'; if (item.operator === 'LTE') return value <= standard ? 'PASS' : 'FAIL'; if (item.operator === 'EQ') return value === standard ? 'PASS' : 'FAIL'; return value >= standard && (item.upperValue === '' || value <= Number(item.upperValue)) ? 'PASS' : 'FAIL'; }
function calculateDeductions(base: number, items: Indicator[]) { const get = (name: string) => items.find(item => item.code.includes(name) || item.name.includes(name === 'moisture' ? '水分' : '杂质')); const excess = (item?: Indicator) => item && item.operator === 'LTE' && item.measuredValue !== '' && item.standardValue !== '' ? Math.max(0, Number(item.measuredValue) - Number(item.standardValue)) : 0; const moistureExcess = excess(get('moisture')), impurityExcess = excess(get('impurity')); const moistureWeight = round(base * moistureExcess / 100, 3), impurityWeight = round(base * impurityExcess / 100, 3); return { moistureWeight, impurityWeight, settlementWeight: round(Math.max(0, base - moistureWeight - impurityWeight), 3), amount: round(base * moistureExcess / 0.1 * 10 + base * impurityExcess / 0.1 * 8, 2) }; }
function round(value: number, digits: number) { const factor = 10 ** digits; return Math.round((value + Number.EPSILON) * factor) / factor; }
function qualityWeight(value: string | null) { return value === null ? '-' : `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`; }
function SectionTitle({ title, noMargin = false }: { title: string; noMargin?: boolean }) { return <h2 className={`font-semibold ${noMargin ? '' : 'border-b pb-2'}`}>{title}</h2>; }
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) { return <div className={wide ? 'md:col-span-3' : ''}><label className="mb-1 block text-sm font-medium">{label}</label>{children}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>; }
function Conclusion({ value }: { value: string }) { const labels: Record<string, string> = { PENDING: '待补充数据', PASS: '合格', DEDUCTION: '不合格（超标扣款）', FUSE: '熔断' }; return <div className={`mt-1 font-semibold ${value === 'FUSE' ? 'text-destructive' : value === 'PASS' ? 'text-primary' : value === 'DEDUCTION' ? 'text-amber-600' : ''}`}>{labels[value]}</div>; }
