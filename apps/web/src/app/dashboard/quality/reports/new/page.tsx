'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { serviceOrganizationName, serviceOrganizationLabel } from '@/lib/service-organization';
import { loadAllOptions } from '@/lib/option-loader';
import { openLocalAttachment } from '@/lib/attachment-preview';
import { toLocalDateTimeInput } from '@/lib/date-time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { QualityReportTextRecognition } from '@/components/quality-report-text-recognition';
import { RecognizedQualityReport } from '@/lib/quality-report-recognition';
import { LocalAttachmentThumbnail } from '@/components/attachment-thumbnail';

type Indicator = { code: string; name: string; operator: string; standardValue: string; measuredValue: string; unit: string; upperValue?: string; fuseValue?: string; indicatorDefinitionId?: string; methodId?: string; methodCode?: string; methodName?: string };
type Material = { id: string; code: string; name: string; status: string };
type Institution = { id: string; partnerId: string; partner: { name: string } };
const fallback: Indicator[] = [
  { code: 'CAF2', name: 'CaF₂', operator: 'GTE', standardValue: '', measuredValue: '', unit: '%' },
  { code: 'MOISTURE', name: '水分', operator: 'LTE', standardValue: '', measuredValue: '', unit: '%' },
];

type ExistingReport = { status: string; materialId: string | null; evidenceStage: string; institutionType: string; institutionPartnerId: string | null; institutionName: string; reportNo: string; samplingGroupNo: string | null; sampleNo: string | null; sampledAt: string; testedAt: string; samplerName: string; samplingMethod: string | null; remarks: string | null; indicators: Array<Indicator & { standardValue: string | null; measuredValue: string | null }> };

export default function NewStandaloneQualityReportPage() {
  const router = useRouter();
  const { id: editId } = useParams<{ id?: string }>();
  const skipTemplateForMaterial = useRef<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [partnerInstitutions, setPartnerInstitutions] = useState<Institution[]>([]);
  const [contracts, setContracts] = useState<Array<{ id: string; contractNo: string; title: string }>>([]);
  const [contextContractId, setContextContractId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [evidenceStage, setEvidenceStage] = useState('');
  const [institutionType, setInstitutionType] = useState('OUR');
  const institutionChoices = institutionType === 'PARTNER' ? partnerInstitutions : institutions;
  const [institutionPartnerId, setInstitutionPartnerId] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [reportNo, setReportNo] = useState('');
  const [samplingGroupNo, setSamplingGroupNo] = useState('');
  const [sampleNo, setSampleNo] = useState('');
  const [sampledAt, setSampledAt] = useState('');
  const [testedAt, setTestedAt] = useState('');
  const [samplerName, setSamplerName] = useState('');
  const [samplingMethod, setSamplingMethod] = useState('多点混合取样');
  const [remarks, setRemarks] = useState('');
  const [indicators, setIndicators] = useState<Indicator[]>(fallback);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [standardsLoading, setStandardsLoading] = useState(false);
  const [loadingReport, setLoadingReport] = useState(!!editId);
  const [existingStatus, setExistingStatus] = useState('');

  useEffect(() => {
    const now = toLocalDateTimeInput(); setSampledAt(now); setTestedAt(now);
    try { setSamplerName(JSON.parse(localStorage.getItem('user') || '{}').name || ''); } catch {}
    api.get<{ items: Material[] }>('/master-data/materials?pageSize=200').then(result => setMaterials(result.items || [])).catch(() => {});
    loadAllOptions<Institution>('/service-organizations?type=QUALITY_INSTITUTION&status=ACTIVE').then(result => setInstitutions(result.items || [])).catch(error => alert(error.message || '质检机构加载失败'));
    if (editId) api.get<ExistingReport>(`/quality-inspections/${editId}`).then(report => {
      skipTemplateForMaterial.current = report.materialId;
      setExistingStatus(report.status); setMaterialId(report.materialId || '');
      setEvidenceStage(report.evidenceStage || 'UNSPECIFIED');
      setInstitutionType(report.institutionType); setInstitutionPartnerId(report.institutionPartnerId || ''); setInstitutionName(report.institutionName);
      setReportNo(report.reportNo); setSamplingGroupNo(report.samplingGroupNo || ''); setSampleNo(report.sampleNo || '');
      setSampledAt(toLocalDateTimeInput(new Date(report.sampledAt))); setTestedAt(toLocalDateTimeInput(new Date(report.testedAt)));
      setSamplerName(report.samplerName); setSamplingMethod(report.samplingMethod || ''); setRemarks(report.remarks || '');
      setIndicators(report.indicators.map(row => ({ ...row, standardValue: String(row.standardValue ?? ''), measuredValue: String(row.measuredValue ?? ''), upperValue: String(row.upperValue ?? ''), fuseValue: String(row.fuseValue ?? '') })));
    }).catch((error: Error) => { alert(error.message || '检测报告加载失败'); router.push('/dashboard/quality/reports'); }).finally(() => setLoadingReport(false));
  }, [editId, router]);

  useEffect(() => {
    if (institutionType !== 'PARTNER') return;
    let active = true;
    loadAllOptions<{ id: string; contractNo: string; title: string }>('/quality-inspections/report-contracts').then(result => { if (active) setContracts(result.items); }).catch(error => alert(error.message));
    return () => { active = false; };
  }, [institutionType]);
  useEffect(() => {
    if (!contextContractId) { setPartnerInstitutions([]); return; }
    let active = true;
    api.get<{ partners: Institution[] }>(`/quality-inspections/institution-options?contractId=${encodeURIComponent(contextContractId)}`).then(result => { if (active) setPartnerInstitutions(result.partners); }).catch(error => alert(error.message));
    return () => { active = false; };
  }, [contextContractId]);

  useEffect(() => {
    if (!materialId) return;
    if (skipTemplateForMaterial.current === materialId) { skipTemplateForMaterial.current = null; return; }
    let active = true;
    setStandardsLoading(true);
    api.get<{ template?: { items: Array<{ operator: string; standardValue: string | number; unit: string; indicator: { code: string; name: string } }> } }>(`/quality-standards/resolve?materialId=${encodeURIComponent(materialId)}&scene=PURCHASE`)
      .then(result => { if (active && result.template?.items?.length) setIndicators(result.template.items.map(item => ({
        code: item.indicator.code, name: item.indicator.name, operator: item.operator,
        standardValue: String(item.standardValue ?? ''), measuredValue: '', unit: item.unit || '%',
      }))); }).catch(() => {}).finally(() => { if (active) setStandardsLoading(false); });
    return () => { active = false; };
  }, [materialId]);

  const update = (index: number, key: keyof Indicator, value: string) => setIndicators(rows => rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  const applyRecognition = (result: RecognizedQualityReport) => {
    if (result.reportNo) setReportNo(result.reportNo);
    if (result.samplingGroupNo) setSamplingGroupNo(result.samplingGroupNo);
    if (result.sampleNo) setSampleNo(result.sampleNo);
    if (result.sampledAt) setSampledAt(result.sampledAt);
    if (result.testedAt) setTestedAt(result.testedAt);
    if (result.samplerName) setSamplerName(result.samplerName);
    if (result.samplingMethod) setSamplingMethod(result.samplingMethod);
    if (result.institutionName) {
      setInstitutionName(result.institutionName);
      if (['PARTNER', 'THIRD_PARTY'].includes(institutionType)) {
        const matched = institutionChoices.find(item => (serviceOrganizationName(item) === result.institutionName?.trim() || item.partner.name.trim() === result.institutionName?.trim()));
        setInstitutionPartnerId(matched?.partnerId || '');
        if (!matched) alert('检测机构名称未匹配已维护机构，请核对并手动选择');
      }
    }
    setIndicators(rows => rows.map(row => {
      const matched = result.measured.find(item => item.code === row.code && item.name === row.name);
      return matched ? { ...row, measuredValue: matched.value } : row;
    }));
  };
  const save = async (submit: boolean) => {
    if (!materialId || !reportNo.trim() || !sampledAt || !testedAt || !samplerName.trim()) return alert('请填写物料、报告编号、取样和检测信息');
    if (!evidenceStage) return alert('请选择取样环节（发货侧或收货侧）');
    if (['PARTNER', 'THIRD_PARTY'].includes(institutionType) ? !institutionPartnerId : !institutionName.trim()) return alert('请选择或填写检测机构');
    if (institutionType === 'PARTNER' && !contextContractId) return alert('合作方检测请先选择合同');
    if (!indicators.length || indicators.some(row => !row.code.trim() || !row.name.trim() || (submit && row.measuredValue === ''))) return alert('请填写至少一项完整检测结果');
    setSaving(true);
    try {
      const payload = {
        materialId, contextContractId: institutionType === 'PARTNER' ? contextContractId : undefined, samplingGroupNo: samplingGroupNo.trim() || undefined, sampleNo: sampleNo.trim() || undefined,
        sampledAt: new Date(sampledAt).toISOString(), testedAt: new Date(testedAt).toISOString(), samplerName: samplerName.trim(), samplingMethod,
        evidenceStage, institutionType, institutionPartnerId: institutionPartnerId || undefined, institutionName: institutionName.trim(), reportNo: reportNo.trim(), submit,
        remarks: remarks.trim() || undefined,
        indicators: indicators.map(row => ({ code: row.code.trim(), name: row.name.trim(), operator: row.operator,
          standardValue: row.standardValue === '' ? undefined : Number(row.standardValue), measuredValue: row.measuredValue === '' ? undefined : Number(row.measuredValue),
          upperValue: row.upperValue === '' ? undefined : Number(row.upperValue), fuseValue: row.fuseValue === '' ? undefined : Number(row.fuseValue),
          indicatorDefinitionId: row.indicatorDefinitionId || undefined, methodId: row.methodId || undefined,
          methodCode: row.methodCode || undefined, methodName: row.methodName || undefined, unit: row.unit })),
      };
      const report = editId
        ? await api.patch<{ id: string }>(`/quality-inspections/${editId}`, payload)
        : await api.post<{ id: string }>('/quality-inspections/standalone', payload);
      for (const file of files) {
        const body = new FormData(); body.append('file', file); body.append('category', 'REPORT');
        await api.upload(`/quality-inspections/${report.id}/attachments`, body);
      }
      router.push(`/dashboard/quality/reports/${report.id}`);
    } catch (error: any) { alert(error.message || '独立检测报告保存失败'); }
    finally { setSaving(false); }
  };

  if (loadingReport) return <div className="p-10 text-center text-muted-foreground">加载中…</div>;
  return <div className="mx-auto max-w-5xl space-y-5">
    <div><h1 className="text-2xl font-bold">{editId ? '编辑检测报告' : '录入独立检测报告'}</h1><p className="mt-1 text-sm text-muted-foreground">{existingStatus === 'VOIDED' ? '保存后恢复为草稿，请核对并重新提交确认。' : '先保存检测事实，之后可从报告或质检任务关联实际参与混样的车辆。'}</p></div>
    <Card className="grid gap-4 p-5 sm:grid-cols-2">
      <label className="text-sm">物料 *<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={materialId} onChange={event => setMaterialId(event.target.value)}><option value="">请选择物料</option>{materials.filter(item => item.status === 'ACTIVE').map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
      <label className="text-sm">报告编号 *<Input className="mt-1" value={reportNo} onChange={event => setReportNo(event.target.value)} /></label>
      <label className="text-sm">混样编号<Input className="mt-1" value={samplingGroupNo} onChange={event => setSamplingGroupNo(event.target.value)} placeholder="几车共同取样时填写" /></label>
      <label className="text-sm">样品编号<Input className="mt-1" value={sampleNo} onChange={event => setSampleNo(event.target.value)} /></label>
      <label className="text-sm">取样环节 *<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={evidenceStage} onChange={event => setEvidenceStage(event.target.value)}><option value="">请选择</option><option value="SHIPPING">发货侧</option><option value="RECEIVING">收货侧</option>{editId && <option value="UNSPECIFIED">历史未标明</option>}</select></label>
      <label className="text-sm">取样时间 *<Input className="mt-1" type="datetime-local" value={sampledAt} onChange={event => setSampledAt(event.target.value)} /></label>
      <label className="text-sm">检测时间 *<Input className="mt-1" type="datetime-local" value={testedAt} onChange={event => setTestedAt(event.target.value)} /></label>
      <label className="text-sm">取样人 *<Input className="mt-1" value={samplerName} onChange={event => setSamplerName(event.target.value)} /></label>
      <label className="text-sm">取样方法<Input className="mt-1" value={samplingMethod} onChange={event => setSamplingMethod(event.target.value)} /></label>
      <label className="text-sm">检测机构类型<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={institutionType} onChange={event => { setInstitutionType(event.target.value); setInstitutionPartnerId(''); }}><option value="OUR">我方</option><option value="PARTNER">合作方</option><option value="THIRD_PARTY">第三方</option><option value="OTHER">其他</option></select></label>
      {institutionType === 'PARTNER' && <label className="text-sm">机构所属合同 *<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={contextContractId} onChange={event => { setContextContractId(event.target.value); setInstitutionPartnerId(''); }}><option value="">请选择合同，仅用于筛选交易方</option>{contracts.map(contract => <option key={contract.id} value={contract.id}>{contract.contractNo} · {contract.title}</option>)}</select></label>}
      {['PARTNER', 'THIRD_PARTY'].includes(institutionType) ? <label className="text-sm">检测机构 *<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={institutionPartnerId} onChange={event => setInstitutionPartnerId(event.target.value)}><option value="">{institutionType === 'PARTNER' ? '请选择合同供应商或客户' : '请选择服务生态质检机构'}</option>{institutionChoices.map(item => <option key={item.partnerId} value={item.partnerId}>{serviceOrganizationLabel(item)}</option>)}</select></label> : <label className="text-sm">检测机构名称 *<Input className="mt-1" value={institutionName} onChange={event => setInstitutionName(event.target.value)} /></label>}
    </Card>
    {materialId && (standardsLoading ? <Card className="p-5 text-sm text-muted-foreground">正在加载物料质检指标…</Card> : <QualityReportTextRecognition indicators={indicators.map(item => ({ code: item.code, name: item.name }))} onApply={applyRecognition} />)}
    <Card className="space-y-3 p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">检测指标</h2><Button variant="outline" size="sm" onClick={() => setIndicators(rows => [...rows, { code: '', name: '', operator: 'GTE', standardValue: '', measuredValue: '', unit: '%' }])}>添加指标</Button></div>
      {indicators.map((row, index) => <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_90px_110px_110px_65px_auto]"><Input aria-label="指标编码" placeholder="编码" value={row.code} onChange={event => update(index, 'code', event.target.value)} /><Input aria-label="指标名称" placeholder="指标名称" value={row.name} onChange={event => update(index, 'name', event.target.value)} /><select className="rounded-md border bg-background px-2" value={row.operator} onChange={event => update(index, 'operator', event.target.value)}><option value="GTE">≥</option><option value="LTE">≤</option><option value="EQ">=</option></select><Input aria-label="标准值" type="number" placeholder="标准值" value={row.standardValue} onChange={event => update(index, 'standardValue', event.target.value)} /><Input aria-label="实测值" type="number" placeholder="实测值 *" value={row.measuredValue} onChange={event => update(index, 'measuredValue', event.target.value)} /><Input aria-label="单位" value={row.unit} onChange={event => update(index, 'unit', event.target.value)} /><Button variant="ghost" size="sm" onClick={() => setIndicators(rows => rows.filter((_, i) => i !== index))}>移除</Button></div>)}
    </Card>
    <Card className="p-5"><label className="text-sm font-medium">补充报告附件（图片或 PDF）<input className="mt-2 block text-sm" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={event => setFiles(Array.from(event.currentTarget.files || []))} /></label>{files.length > 0 && <div className="mt-3 grid min-w-0 grid-cols-1 gap-4">{files.map((file, index) => <div key={`${file.name}-${index}`} className="min-w-0 space-y-2 rounded-md border p-3 text-sm"><LocalAttachmentThumbnail large fitPanel file={file} /><div className="truncate font-medium" title={file.name}>{file.name}</div><div className="flex gap-1"><Button type="button" variant="outline" size="sm" onClick={() => openLocalAttachment(file)}>放大查看</Button><Button type="button" variant="ghost" size="sm" onClick={() => setFiles(current => current.filter((_, i) => i !== index))}>移除</Button></div></div>)}</div>}</Card>
    <Card className="p-5"><label className="text-sm font-medium">备注<Input className="mt-2" value={remarks} onChange={event => setRemarks(event.target.value)} /></label></Card>
    <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => router.push(editId ? `/dashboard/quality/reports/${editId}` : '/dashboard/quality/reports')}>返回</Button><Button variant="outline" disabled={saving} onClick={() => void save(false)}>保存草稿</Button><Button disabled={saving || existingStatus === 'VOIDED'} onClick={() => void save(true)}>{saving ? '保存中…' : '保存并提交报告'}</Button></div>
  </div>;
}
