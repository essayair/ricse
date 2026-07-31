'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, FileText, FlaskConical, Link2, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { openStoredAttachment } from '@/lib/attachment-preview';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Indicator { id: string; name: string; operator: string; standardValue: string | null; upperValue: string | null; fuseValue: string | null; unit: string; measuredValue: string | null; result: string }
interface Attachment { id: string; originalName: string; mimeType: string; size: number; category: string; createdAt: string }
interface RelatedInspection { id: string; inspectionNo: string; institutionType: string; institutionName: string; reportNo: string; testedAt: string; status: string; conclusion: string }
interface Inspection {
  id: string; inspectionNo: string; status: string; conclusion: string; dataSource: string;
  institutionType: string; institutionName: string; reportNo: string; testedAt: string;
  sampledAt: string; samplerName: string; samplingMethod: string | null; sampleNo1: string | null; sampleNo2: string | null; sampleNo3: string | null;
  materialName: string; materialSpec: string | null; supplierName: string | null; plateNo: string | null; baseWeight: string | null;
  moistureDeductionWeight: string; impurityDeductionWeight: string; settlementWeight: string | null; deductionAmount: string;
  fuseReason: string | null; resolution: string | null; resolvedAt: string | null; remarks: string | null;
  confirmedAt: string | null; creator: { name: string }; confirmer: { name: string } | null; indicators: Indicator[]; attachments: Attachment[];
  inboundReceipts: Array<{ id: string; receiptNo: string; status: string }>;
  relatedInspections: RelatedInspection[];
  weighTicket: { id: string; ticketNo: string; netWeight: string | null; settlementWeight: string | null; waybill: { id: string; waybillNo: string; dispatchNotice: { noticeNo: string; order: { id: string; name: string; orderNo: string; contract: { contractNo: string; title: string } } } } };
}

const STATUS: Record<string, string> = { DRAFT: '草稿', TESTING: '化验中', REPORTED: '已出报告', CONFIRMED: '已确认', VOIDED: '已作废' };
const CONCLUSION: Record<string, string> = { PENDING: '待判定', PASS: '质检合格', DEDUCTION: '不合格（超标扣款）', FUSE: '质检熔断' };
const SOURCE: Record<string, string> = { MANUAL: '人工录入', DEVICE: '设备采集', OCR: '附件识别' };
const INSTITUTION: Record<string, string> = { OUR: '我方检测机构', PARTNER: '合作方检测机构', THIRD_PARTY: '第三方检测机构', OTHER: '其他检测机构' };
const CATEGORY: Record<string, string> = { REPORT: '检测报告', OUR_REPORT: '检测报告', PARTNER_REPORT: '检测报告', THIRD_REPORT: '检测报告', SAMPLE_PHOTO: '取样照片', OTHER: '其他附件' };
const UPLOAD_CATEGORY = { REPORT: '检测报告', SAMPLE_PHOTO: '取样照片', OTHER: '其他附件' };
const OPERATOR: Record<string, string> = { GTE: '≥', LTE: '≤', EQ: '=', RANGE: '范围' };

export default function QualityInspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Inspection | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('REPORT');

  const load = useCallback(async () => {
    try { setItem(await api.get(`/quality-inspections/${id}`)); }
    catch (error: any) { alert(error.message || '质检单加载失败'); router.push('/dashboard/quality'); }
  }, [id, router]);
  useEffect(() => { void load(); }, [load]);

  const transition = async (status: string) => {
    let resolution: string | undefined;
    if (status === 'CONFIRMED' && item?.conclusion === 'FUSE') {
      resolution = prompt('请输入熔断处理方案（折价、退货或第三方复检等）')?.trim();
      if (!resolution) return;
    }
    if (!confirm(`确定将质检单更新为“${STATUS[status]}”？`)) return;
    setSaving(true);
    try { setItem(await api.patch(`/quality-inspections/${id}/status`, { status, resolution })); }
    catch (error: any) { alert(error.message || '状态更新失败'); }
    finally { setSaving(false); }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    const invalid = selected.find(file => {
      const extension = file.name.toLowerCase().split('.').pop() || '';
      return !['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(extension) || !file.size || file.size > 20 * 1024 * 1024;
    });
    if (invalid) return alert(`${invalid.name} 无法上传：仅支持 JPG/PNG/WEBP/PDF，单个文件不超过 20 MB`);
    setSaving(true);
    try {
      for (const file of selected) {
        const body = new FormData(); body.append('file', file); body.append('category', uploadCategory);
        await api.upload(`/quality-inspections/${id}/attachments`, body);
      }
      await load();
    } catch (error: any) { alert(error.message || '附件上传失败'); }
    finally { setSaving(false); }
  };
  const viewAttachment = async (attachmentId: string) => {
    try { await openStoredAttachment(`/quality-inspections/attachments/${attachmentId}/view-url`); }
    catch (error: any) { alert(error.message || '附件打开失败'); }
  };
  const removeAttachment = async (attachmentId: string) => {
    if (!confirm('确定删除此附件？')) return;
    try { await api.delete(`/quality-inspections/attachments/${attachmentId}`); await load(); }
    catch (error: any) { alert(error.message || '附件删除失败'); }
  };

  if (!item) return <div className="py-20 text-center text-muted-foreground">加载中...</div>;
  const editable = !['CONFIRMED', 'VOIDED'].includes(item.status);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/quality')}><ArrowLeft className="h-4 w-4" /></Button><div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{item.inspectionNo}</h1><Badge variant="outline">{STATUS[item.status]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{item.materialName} · {item.plateNo || '无车牌'} · 创建人 {item.creator.name}</p></div></div><div className="flex gap-2">{item.status === 'REPORTED' && <Button disabled={saving} onClick={() => void transition('CONFIRMED')}>确认质检结论</Button>}{editable && <Button variant="destructive" disabled={saving} onClick={() => void transition('VOIDED')}>作废</Button>}</div></div>

    <Card className={`flex items-start gap-4 border-l-4 p-5 ${item.conclusion === 'FUSE' ? 'border-l-destructive bg-destructive/5' : item.conclusion === 'PASS' ? 'border-l-primary bg-primary/5' : 'border-l-amber-500 bg-amber-50/50'}`}>
      {item.conclusion === 'PASS' ? <CheckCircle2 className="mt-1 h-7 w-7 text-primary" /> : <AlertTriangle className="mt-1 h-7 w-7 text-destructive" />}
      <div><div className="text-lg font-semibold">{CONCLUSION[item.conclusion]}</div><div className="mt-1 text-sm text-muted-foreground">{item.conclusion === 'PASS' ? '本检测机构报告的全部指标符合质量标准，可以作为入库依据。' : item.conclusion === 'DEDUCTION' ? '本检测机构报告存在超标指标，可记录扣款依据，但不能直接入库。' : item.conclusion === 'FUSE' ? item.fuseReason || '本检测机构报告达到拒收红线，后续业务已暂停。' : '等待补充检测数据，暂不能入库。'}</div></div>
    </Card>

    {item.inboundReceipts?.length > 0 && (
      <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/30 bg-primary/5 p-4">
        <div>
          <div className="font-semibold">已关联入库作业单</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {item.inboundReceipts[0].receiptNo} · {item.inboundReceipts[0].status === 'PENDING' ? '作业中' : item.inboundReceipts[0].status}
          </div>
        </div>
        <Button variant="outline" onClick={() => router.push(`/dashboard/inbound/${item.inboundReceipts[0].id}`)}>查看入库单</Button>
      </Card>
    )}

    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5"><Title>基本与关联信息</Title><div className="grid gap-4 sm:grid-cols-2"><Info label="取样时间" value={formatDateTimeToSecond(item.sampledAt)} /><Info label="取样人" value={item.samplerName} /><Info label="取样方法" value={item.samplingMethod || '-'} /><Info label="数据来源" value={SOURCE[item.dataSource] || item.dataSource} /><Info label="物料/规格" value={`${item.materialName}${item.materialSpec ? ` / ${item.materialSpec}` : ''}`} /><Info label="供应商" value={item.supplierName || '-'} /><Info label="车牌号" value={item.plateNo || '-'} /><Info label="留样编号" value={[item.sampleNo1, item.sampleNo2, item.sampleNo3].filter(Boolean).join(' / ') || '-'} /></div><div className="mt-5 grid gap-2 border-t pt-4 sm:grid-cols-2"><BusinessLink label="合同" value={`${item.weighTicket.waybill.dispatchNotice.order.contract.contractNo} · ${item.weighTicket.waybill.dispatchNotice.order.contract.title}`} /><BusinessLink label="执行批次" value={`${item.weighTicket.waybill.dispatchNotice.order.name} · ${item.weighTicket.waybill.dispatchNotice.order.orderNo}`} href={`/dashboard/orders/${item.weighTicket.waybill.dispatchNotice.order.id}`} /><BusinessLink label="物流运单" value={item.weighTicket.waybill.waybillNo} href={`/dashboard/waybills/${item.weighTicket.waybill.id}`} /><BusinessLink label="磅单" value={item.weighTicket.ticketNo} href={`/dashboard/weighbridge/${item.weighTicket.id}`} /></div></Card>
      <Card className="p-5"><Title>检测机构与报告</Title><div className="grid gap-4 sm:grid-cols-2"><Info label="机构类型" value={INSTITUTION[item.institutionType] || item.institutionType} /><Info label="检测机构" value={item.institutionName} /><Info label="报告编号" value={item.reportNo} /><Info label="检测时间" value={formatDateTimeToSecond(item.testedAt)} /></div><div className="mt-4 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">本质检单仅对应上述一个检测机构。同车其他机构报告在下方独立列示。</div></Card>
    </div>

    <Card className="overflow-hidden"><div className="p-5 pb-3"><Title>检测指标</Title></div><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead className="border-y bg-muted/50 text-left text-muted-foreground"><tr><th className="px-4 py-3">指标</th><th className="px-4 py-3">质量标准</th><th className="px-4 py-3">熔断线</th><th className="px-4 py-3">检测结果</th><th className="px-4 py-3">判定</th></tr></thead><tbody>{item.indicators.map(indicator => <tr key={indicator.id} className="border-b"><td className="px-4 py-3 font-medium">{indicator.name}</td><td className="px-4 py-3">{standard(indicator)}</td><td className="px-4 py-3">{indicator.fuseValue === null ? '-' : `${OPERATOR[indicator.operator]} ${number(indicator.fuseValue)} ${indicator.unit}`}</td><td className="px-4 py-3 font-medium text-primary">{measure(indicator.measuredValue, indicator.unit)}</td><td className="px-4 py-3"><Badge variant={indicator.result === 'FUSE' ? 'destructive' : indicator.result === 'PASS' ? 'default' : 'secondary'}>{indicator.result === 'PASS' ? '合格' : indicator.result === 'FAIL' ? '超标' : indicator.result === 'FUSE' ? '熔断' : '待判定'}</Badge></td></tr>)}</tbody></table></div></Card>

    <Card className="overflow-hidden"><div className="flex items-center justify-between p-5 pb-3"><Title>同车其他质检单</Title><Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/quality/create?weighTicketId=${item.weighTicket.id}`)}>新增机构质检单</Button></div>{item.relatedInspections.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-y bg-muted/50 text-left text-muted-foreground"><tr><th className="px-4 py-3">质检单号</th><th className="px-4 py-3">机构类型</th><th className="px-4 py-3">检测机构</th><th className="px-4 py-3">报告编号</th><th className="px-4 py-3">检测时间</th><th className="px-4 py-3">结论 / 状态</th></tr></thead><tbody>{item.relatedInspections.map(related => <tr key={related.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => router.push(`/dashboard/quality/${related.id}`)}><td className="px-4 py-3 font-mono text-primary">{related.inspectionNo}</td><td className="px-4 py-3">{INSTITUTION[related.institutionType] || related.institutionType}</td><td className="px-4 py-3">{related.institutionName}</td><td className="px-4 py-3 font-mono text-xs">{related.reportNo}</td><td className="px-4 py-3">{formatDateTimeToSecond(related.testedAt)}</td><td className="px-4 py-3"><Badge variant={related.conclusion === 'FUSE' ? 'destructive' : 'secondary'}>{CONCLUSION[related.conclusion] || related.conclusion}</Badge><span className="ml-2 text-xs text-muted-foreground">{STATUS[related.status] || related.status}</span></td></tr>)}</tbody></table></div> : <div className="border-t p-8 text-center text-sm text-muted-foreground">该车辆暂无其他检测机构的质检单</div>}</Card>

    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <Card className="p-5"><Title>扣水扣杂与结算</Title><div className="space-y-3"><AmountRow label="磅单结算重量" value={weight(item.baseWeight)} /><AmountRow label="扣水数量" value={`-${weight(item.moistureDeductionWeight)}`} danger /><AmountRow label="扣杂数量" value={`-${weight(item.impurityDeductionWeight)}`} danger /><AmountRow label="质检后结算重量" value={weight(item.settlementWeight)} primary /><AmountRow label="预计扣款" value={`¥${Number(item.deductionAmount).toLocaleString()}`} danger /></div></Card>
      <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><Title>质检附件</Title>{editable && <div className="flex gap-2"><select className="h-9 rounded-md border bg-background px-2 text-sm" value={uploadCategory} onChange={event => setUploadCategory(event.target.value)}>{Object.entries(UPLOAD_CATEGORY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-3 text-sm text-primary-foreground"><input type="file" multiple className="hidden" accept=".jpg,.jpeg,.png,.webp,.pdf" disabled={saving} onChange={event => { void upload(event.currentTarget.files); event.currentTarget.value = ''; }} /><FileText className="mr-1 h-4 w-4" />上传</label></div>}</div>{item.attachments.length ? <div className="mt-3 space-y-2">{item.attachments.map(attachment => <div key={attachment.id} className="flex items-center gap-3 rounded-md border p-3"><Badge variant="outline">{CATEGORY[attachment.category] || attachment.category}</Badge><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{attachment.originalName}</div><div className="text-xs text-muted-foreground">{Math.max(1, Math.round(attachment.size / 1024))} KB · {formatDateTimeToSecond(attachment.createdAt)}</div></div><Button variant="ghost" size="sm" onClick={() => void viewAttachment(attachment.id)}><Eye className="mr-1 h-4 w-4" />查看</Button>{editable && <Button variant="ghost" size="icon" onClick={() => void removeAttachment(attachment.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div>)}</div> : <div className="mt-4 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">暂无附件</div>}</Card>
    </div>

    {(item.remarks || item.resolution || item.confirmedAt) && <Card className="p-5"><Title>备注与处理记录</Title><div className="grid gap-4 sm:grid-cols-3"><Info label="备注" value={item.remarks || '-'} /><Info label="熔断处理方案" value={item.resolution || '-'} /><Info label="确认信息" value={item.confirmedAt ? `${item.confirmer?.name || '-'} · ${formatDateTimeToSecond(item.confirmedAt)}` : '-'} /></div></Card>}
  </div>;
}

function Title({ children }: { children: React.ReactNode }) { return <h2 className="mb-4 flex items-center gap-2 font-semibold"><FlaskConical className="h-4 w-4 text-primary" />{children}</h2>; }
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 break-words text-sm font-medium">{value}</div></div>; }
function BusinessLink({ label, value, href }: { label: string; value: string; href?: string }) { const content = <><Link2 className="h-3.5 w-3.5" /><span className="truncate">{value}</span></>; return <div><div className="text-xs text-muted-foreground">{label}</div>{href ? <a className="mt-1 flex items-center gap-1 text-sm text-primary hover:underline" href={href}>{content}</a> : <div className="mt-1 flex items-center gap-1 text-sm">{content}</div>}</div>; }
function AmountRow({ label, value, danger, primary }: { label: string; value: string; danger?: boolean; primary?: boolean }) { return <div className="flex items-center justify-between border-b pb-3 last:border-0"><span className="text-sm text-muted-foreground">{label}</span><span className={`font-semibold ${danger ? 'text-destructive' : primary ? 'text-primary' : ''}`}>{value}</span></div>; }
function standard(item: Indicator) { if (item.standardValue === null) return '-'; return item.operator === 'RANGE' ? `${number(item.standardValue)}—${number(item.upperValue)} ${item.unit}` : `${OPERATOR[item.operator]} ${number(item.standardValue)} ${item.unit}`; }
function measure(value: string | null, unit: string) { return value === null ? '-' : `${number(value)} ${unit}`; }
function number(value: string | number | null) { return value === null ? '-' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 4 }); }
function weight(value: string | null) { return value === null ? '-' : `${number(value)} 吨`; }
