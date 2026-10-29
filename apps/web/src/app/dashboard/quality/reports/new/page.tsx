'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { toLocalDateTimeInput } from '@/lib/date-time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Indicator = { code: string; name: string; operator: string; standardValue: string; measuredValue: string; unit: string };
type Material = { id: string; code: string; name: string; status: string };
type Institution = { partnerId: string; partner: { name: string } };
const fallback: Indicator[] = [
  { code: 'CAF2', name: 'CaF₂', operator: 'GTE', standardValue: '', measuredValue: '', unit: '%' },
  { code: 'MOISTURE', name: '水分', operator: 'LTE', standardValue: '', measuredValue: '', unit: '%' },
];

export default function NewStandaloneQualityReportPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [materialId, setMaterialId] = useState('');
  const [institutionType, setInstitutionType] = useState('OUR');
  const [institutionPartnerId, setInstitutionPartnerId] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [reportNo, setReportNo] = useState('');
  const [samplingGroupNo, setSamplingGroupNo] = useState('');
  const [sampleNo, setSampleNo] = useState('');
  const [sampledAt, setSampledAt] = useState('');
  const [testedAt, setTestedAt] = useState('');
  const [samplerName, setSamplerName] = useState('');
  const [samplingMethod, setSamplingMethod] = useState('多点混合取样');
  const [indicators, setIndicators] = useState<Indicator[]>(fallback);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const now = toLocalDateTimeInput(); setSampledAt(now); setTestedAt(now);
    try { setSamplerName(JSON.parse(localStorage.getItem('user') || '{}').name || ''); } catch {}
    api.get<{ items: Material[] }>('/master-data/materials?pageSize=200').then(result => setMaterials(result.items || [])).catch(() => {});
    api.get<{ items: Institution[] }>('/service-organizations?type=QUALITY_INSTITUTION&status=ACTIVE&pageSize=200').then(result => setInstitutions(result.items || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!materialId) return;
    api.get<{ template?: { items: Array<{ operator: string; standardValue: string | number; unit: string; indicator: { code: string; name: string } }> } }>(`/quality-standards/resolve?materialId=${encodeURIComponent(materialId)}&scene=PURCHASE`)
      .then(result => { if (result.template?.items?.length) setIndicators(result.template.items.map(item => ({
        code: item.indicator.code, name: item.indicator.name, operator: item.operator,
        standardValue: String(item.standardValue ?? ''), measuredValue: '', unit: item.unit || '%',
      }))); }).catch(() => {});
  }, [materialId]);

  const update = (index: number, key: keyof Indicator, value: string) => setIndicators(rows => rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  const save = async () => {
    if (!materialId || !reportNo.trim() || !sampledAt || !testedAt || !samplerName.trim()) return alert('请填写物料、报告编号、取样和检测信息');
    if (['PARTNER', 'THIRD_PARTY'].includes(institutionType) ? !institutionPartnerId : !institutionName.trim()) return alert('请选择或填写检测机构');
    if (!indicators.length || indicators.some(row => !row.code.trim() || !row.name.trim() || row.measuredValue === '')) return alert('请填写至少一项完整检测结果');
    setSaving(true);
    try {
      const report = await api.post<{ id: string }>('/quality-inspections/standalone', {
        materialId, samplingGroupNo: samplingGroupNo.trim() || undefined, sampleNo: sampleNo.trim() || undefined,
        sampledAt: new Date(sampledAt).toISOString(), testedAt: new Date(testedAt).toISOString(), samplerName: samplerName.trim(), samplingMethod,
        institutionType, institutionPartnerId: institutionPartnerId || undefined, institutionName: institutionName.trim(), reportNo: reportNo.trim(), submit: true,
        indicators: indicators.map(row => ({ code: row.code.trim(), name: row.name.trim(), operator: row.operator,
          standardValue: row.standardValue === '' ? undefined : Number(row.standardValue), measuredValue: Number(row.measuredValue), unit: row.unit })),
      });
      for (const file of files) {
        const body = new FormData(); body.append('file', file); body.append('category', 'REPORT');
        await api.upload(`/quality-inspections/${report.id}/attachments`, body);
      }
      router.push(`/dashboard/quality/reports/${report.id}`);
    } catch (error: any) { alert(error.message || '独立检测报告保存失败'); }
    finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-5xl space-y-5">
    <div><h1 className="text-2xl font-bold">录入独立检测报告</h1><p className="mt-1 text-sm text-muted-foreground">先保存检测事实，之后可从报告或质检任务关联实际参与混样的车辆。</p></div>
    <Card className="grid gap-4 p-5 sm:grid-cols-2">
      <label className="text-sm">物料 *<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={materialId} onChange={event => setMaterialId(event.target.value)}><option value="">请选择物料</option>{materials.filter(item => item.status === 'ACTIVE').map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
      <label className="text-sm">报告编号 *<Input className="mt-1" value={reportNo} onChange={event => setReportNo(event.target.value)} /></label>
      <label className="text-sm">混样编号<Input className="mt-1" value={samplingGroupNo} onChange={event => setSamplingGroupNo(event.target.value)} placeholder="几车共同取样时填写" /></label>
      <label className="text-sm">样品编号<Input className="mt-1" value={sampleNo} onChange={event => setSampleNo(event.target.value)} /></label>
      <label className="text-sm">取样时间 *<Input className="mt-1" type="datetime-local" value={sampledAt} onChange={event => setSampledAt(event.target.value)} /></label>
      <label className="text-sm">检测时间 *<Input className="mt-1" type="datetime-local" value={testedAt} onChange={event => setTestedAt(event.target.value)} /></label>
      <label className="text-sm">取样人 *<Input className="mt-1" value={samplerName} onChange={event => setSamplerName(event.target.value)} /></label>
      <label className="text-sm">取样方法<Input className="mt-1" value={samplingMethod} onChange={event => setSamplingMethod(event.target.value)} /></label>
      <label className="text-sm">检测机构类型<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={institutionType} onChange={event => { setInstitutionType(event.target.value); setInstitutionPartnerId(''); }}><option value="OUR">我方</option><option value="PARTNER">合作方</option><option value="THIRD_PARTY">第三方</option><option value="OTHER">其他</option></select></label>
      {['PARTNER', 'THIRD_PARTY'].includes(institutionType) ? <label className="text-sm">检测机构 *<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={institutionPartnerId} onChange={event => setInstitutionPartnerId(event.target.value)}><option value="">请选择已维护机构</option>{institutions.map(item => <option key={item.partnerId} value={item.partnerId}>{item.partner.name}</option>)}</select></label> : <label className="text-sm">检测机构名称 *<Input className="mt-1" value={institutionName} onChange={event => setInstitutionName(event.target.value)} /></label>}
    </Card>
    <Card className="space-y-3 p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">检测指标</h2><Button variant="outline" size="sm" onClick={() => setIndicators(rows => [...rows, { code: '', name: '', operator: 'GTE', standardValue: '', measuredValue: '', unit: '%' }])}>添加指标</Button></div>
      {indicators.map((row, index) => <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_90px_110px_110px_65px_auto]"><Input aria-label="指标编码" placeholder="编码" value={row.code} onChange={event => update(index, 'code', event.target.value)} /><Input aria-label="指标名称" placeholder="指标名称" value={row.name} onChange={event => update(index, 'name', event.target.value)} /><select className="rounded-md border bg-background px-2" value={row.operator} onChange={event => update(index, 'operator', event.target.value)}><option value="GTE">≥</option><option value="LTE">≤</option><option value="EQ">=</option></select><Input aria-label="标准值" type="number" placeholder="标准值" value={row.standardValue} onChange={event => update(index, 'standardValue', event.target.value)} /><Input aria-label="实测值" type="number" placeholder="实测值 *" value={row.measuredValue} onChange={event => update(index, 'measuredValue', event.target.value)} /><Input aria-label="单位" value={row.unit} onChange={event => update(index, 'unit', event.target.value)} /><Button variant="ghost" size="sm" onClick={() => setIndicators(rows => rows.filter((_, i) => i !== index))}>移除</Button></div>)}
    </Card>
    <Card className="p-5"><label className="text-sm font-medium">报告附件（图片或 PDF）<input className="mt-2 block text-sm" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={event => setFiles(Array.from(event.currentTarget.files || []))} /></label>{files.length > 0 && <p className="mt-2 text-xs text-muted-foreground">已选 {files.length} 份文件</p>}</Card>
    <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => router.push('/dashboard/quality/reports')}>返回</Button><Button disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存检测报告'}</Button></div>
  </div>;
}
