'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Circle, FileText, PackageCheck, Save, Trash2, Upload, XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { openStoredAttachment } from '@/lib/attachment-preview';
import { formatDateTimeToSecond, toLocalDateTimeInput } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BusinessOperationHistory } from '@/components/business-operation-history';

const STATUS: Record<string, string> = {
  PENDING: '作业中', RECEIVED: '已收货', POSTED: '已入账', CANCELLED: '已作废',
};

export default function InboundDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [item, setItem] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [receiptForm, setReceiptForm] = useState({
    warehouseId: '', receivedAt: '', receiverName: '', remarks: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result: any = await api.get(`/inbound-receipts/${id}`);
      setItem(result);
      setReceiptForm({
        warehouseId: result.warehouseId || '',
        receivedAt: result.receivedAt ? toLocalDateTimeInput(new Date(result.receivedAt)) : '',
        receiverName: result.receiverName || '',
        remarks: result.remarks || '',
      });
    } catch (error: any) {
      alert(error.message);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api.get<any[]>('/master-data/warehouses')
      .then(result => setWarehouses(result.filter(warehouse => warehouse.status === 'ACTIVE')))
      .catch((error: any) => alert(error.message));
  }, []);

  const pendingPayload = () => ({
    warehouseId: receiptForm.warehouseId || undefined,
    receivedAt: receiptForm.receivedAt || undefined,
    receiverName: receiptForm.receiverName,
    remarks: receiptForm.remarks,
  });

  const savePending = async () => {
    setSaving(true);
    try {
      const result = await api.patch(`/inbound-receipts/${id}`, pendingPayload());
      setItem(result);
      return result;
    } catch (error: any) {
      alert(error.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const action = async (type: 'confirm' | 'post' | 'cancel') => {
    const prompts = {
      confirm: '确认现场已经完成收货？确认后不能再增删附件。',
      post: '确认生成业务入库单、库存批次并增加库存？',
      cancel: '确认作废该物流入库单？',
    };
    if (type === 'confirm' && (!receiptForm.warehouseId || !receiptForm.receivedAt || !receiptForm.receiverName.trim())) {
      alert('请先选择入库仓库，并填写实际收货时间和收货人');
      return;
    }
    if (!confirm(prompts[type])) return;
    setSaving(true);
    try {
      if (type === 'confirm') await api.patch(`/inbound-receipts/${id}`, pendingPayload());
      const result = type === 'post'
        ? await api.post(`/inbound-receipts/${id}/post`, {})
        : await api.patch(`/inbound-receipts/${id}/${type}`, {});
      setItem(result);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.upload(`/inbound-receipts/${id}/attachments`, formData);
      await load();
    } catch (error: any) {
      alert(error.message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
      setSaving(false);
    }
  };

  const removeAttachment = async (attachment: any) => {
    if (!confirm(`确认删除附件“${attachment.originalName}”？`)) return;
    try {
      await api.delete(`/inbound-receipts/attachments/${attachment.id}`);
      await load();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const viewAttachment = async (attachment: any) => {
    try {
      await openStoredAttachment(`/inbound-receipts/attachments/${attachment.id}/view-url`);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const selectAcceptanceQuality = async (qualityInspectionId: string) => {
    if (!confirm('确认采用到货质检任务已经确定的执行口径报告？最终入库数量和扣减数据将同步更新。')) return;
    setSaving(true);
    try {
      const result = await api.patch(`/inbound-receipts/${id}/acceptance-quality`, { qualityInspectionId });
      setItem(result);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!item) return <div className="py-20 text-center">加载中...</div>;
  const qualityQualified = item.acceptanceConclusion === 'PASS'
    && item.qualityInspection?.status === 'CONFIRMED'
    && item.qualityInspection?.conclusion === 'PASS';
  const inspections = (item.waybill?.weighTickets || [])
    .flatMap((ticket: any) => (ticket.qualityInspections || []).map((inspection: any) => ({ ...inspection, ticket })));
  const workflow = item.workflow || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/inbound')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{item.receiptNo}</h1>
              <Badge variant="outline" className={stageClass(workflow.tone)}>{workflow.stageLabel || STATUS[item.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.materialName} · {item.plateNo || '-'} · {item.warehouse?.name || '待选择仓库'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {item.status === 'PENDING' && (
            <>
              <Button variant="outline" disabled={saving} onClick={() => void action('cancel')}>
                <XCircle className="mr-2 h-4 w-4" />作废
              </Button>
              {qualityQualified && (
                <Button disabled={saving} onClick={() => void action('confirm')}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />确认收货
                </Button>
              )}
            </>
          )}
          {item.status === 'RECEIVED' && qualityQualified && (
            <Button disabled={saving} onClick={() => void action('post')}>
              <PackageCheck className="mr-2 h-4 w-4" />生成业务入库并入账
            </Button>
          )}
        </div>
      </div>

      {item.status !== 'POSTED' && item.status !== 'CANCELLED' && (
        <Card className={`p-4 text-sm ${workflow.tone === 'danger' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-primary/20 bg-primary/5'}`}>
          <div className="font-medium">当前阶段：{workflow.stageLabel || STATUS[item.status]}</div>
          <div className="mt-1 text-muted-foreground">{workflow.blocker || '等待后续作业处理'}</div>
        </Card>
      )}

      <Card className="p-5">
        <Title>入库作业进度</Title>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <ProgressStep title="运输到达" milestone={workflow.milestones?.transport} />
          <ProgressStep title="物流签收" milestone={workflow.milestones?.signed} />
          <ProgressStep title="过磅复核" milestone={workflow.milestones?.weigh} />
          <ProgressStep title="质量验收" milestone={workflow.milestones?.quality} />
          <ProgressStep title="收货入账" milestone={workflow.milestones?.inbound} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <Title>物流收货信息</Title>
          {item.status === 'PENDING' ? (
            <div className="space-y-4">
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                本单由采购运单确认发运后自动生成。可以提前核对目标仓库；车辆到达并完成过磅、质检后，再补齐实际收货信息。
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="入库仓库 *">
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={receiptForm.warehouseId} onChange={event => setReceiptForm(current => ({ ...current, warehouseId: event.target.value }))}>
                    <option value="">请选择仓库</option>
                    {warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
                  </select>
                </Field>
                <Field label="实际收货时间 *"><Input type="datetime-local" step="1" value={receiptForm.receivedAt} onChange={event => setReceiptForm(current => ({ ...current, receivedAt: event.target.value }))} /></Field>
                <Field label="收货人 *"><Input value={receiptForm.receiverName} onChange={event => setReceiptForm(current => ({ ...current, receiverName: event.target.value }))} /></Field>
                <Field label="备注"><Input value={receiptForm.remarks} onChange={event => setReceiptForm(current => ({ ...current, remarks: event.target.value }))} /></Field>
              </div>
              <Button variant="outline" disabled={saving} onClick={() => void savePending()}><Save className="mr-2 h-4 w-4" />保存收货信息</Button>
            </div>
          ) : (
            <Grid items={[
              ['物流运单', item.waybill?.waybillNo || '-'],
              ['磅单', item.weighTicket?.ticketNo || '待过磅'],
              ['车牌', item.plateNo || '-'],
              ['收货仓库', item.warehouse ? `${item.warehouse.code} · ${item.warehouse.name}` : '-'],
              ['收货时间', formatDateTimeToSecond(item.receivedAt)],
              ['收货人', item.receiverName || '-'],
              ['物料', `${item.materialName}${item.materialSpec ? ` / ${item.materialSpec}` : ''}`],
              ['供应商', item.supplierName || '-'],
            ]} />
          )}
        </Card>
        <Card className="p-5">
          <Title>质量验收依据</Title>
          {item.qualityInspection ? (
            <>
              <Grid items={[
                ['执行口径报告', item.qualityInspection.inspectionNo],
                ['检测机构', item.qualityInspection.institutionName],
                ['报告编号', item.qualityInspection.reportNo || '-'],
                ['验收结论', item.acceptanceConclusion === 'PASS' ? '合格' : '待确认'],
                ['扣水', weight(item.moistureDeductionWeight)],
                ['扣杂', weight(item.impurityDeductionWeight)],
                ['预计扣款', `¥${Number(item.deductionAmount).toLocaleString()}`],
                ['最终入库数量', weight(item.receivedQuantity)],
              ]} />
              <Button className="mt-4" variant="outline" onClick={() => router.push(`/dashboard/quality/${item.waybill.qualityTask?.id}`)}>
                查看到货质检任务
              </Button>
            </>
          ) : (
            <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
              到货质检任务尚未形成最终合格结论。请先完成机构报告录入、确认和任务级最终判定。
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4">
          <h2 className="font-semibold">关联机构检测报告</h2>
          <p className="mt-1 text-xs text-muted-foreground">同一到货质检任务可归集多份机构报告，任务最终选择一份作为入库与结算执行口径。</p>
        </div>
        {!inspections.length ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">暂无质检记录</div>
        ) : (
          <div className="space-y-2">
            {inspections.map((inspection: any) => {
              const selected = item.qualityInspectionId === inspection.id;
              const selectable = item.status === 'PENDING' && inspection.id === item.waybill.qualityTask?.basisInspectionId && inspection.status === 'CONFIRMED' && inspection.conclusion === 'PASS';
              return (
                <div key={inspection.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 ${selected ? 'border-success/40 bg-success-bg' : ''}`}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="font-mono text-sm font-medium text-primary hover:underline" onClick={() => router.push(`/dashboard/quality/${inspection.qualityTaskId}`)}>
                        {inspection.inspectionNo}
                      </button>
                      {selected && <Badge className="bg-success text-success-foreground">执行口径报告</Badge>}
                      <Badge variant="outline">{qualityStatus(inspection)}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {inspection.institutionName} · 磅单 {inspection.ticket.ticketNo}
                    </div>
                  </div>
                  {selectable && !selected && (
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => void selectAcceptanceQuality(inspection.id)}>
                      采用任务执行口径
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">收货附件</h2>
            <p className="mt-1 text-xs text-muted-foreground">支持现场照片、签收凭证和 PDF，单个文件不超过 20MB。</p>
          </div>
          {item.status === 'PENDING' && (
            <>
              <input
                ref={fileRef}
                className="hidden"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(event) => void upload(event.target.files?.[0])}
              />
              <Button variant="outline" disabled={saving} onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />上传附件
              </Button>
            </>
          )}
        </div>
        {!item.attachments?.length ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">暂无收货附件</div>
        ) : (
          <div className="divide-y rounded-md border">
            {item.attachments.map((attachment: any) => (
              <div key={attachment.id} className="flex items-center justify-between gap-3 p-3">
                <button className="flex min-w-0 items-center gap-2 text-left hover:text-primary" onClick={() => void viewAttachment(attachment)}>
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate text-sm">{attachment.originalName}</span>
                </button>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</span>
                  {item.status === 'PENDING' && (
                    <Button variant="ghost" size="icon" onClick={() => void removeAttachment(attachment)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {item.businessInbound ? (
        <Card className="border-primary/30 bg-primary/5 p-5">
          <Title>业务入库与库存批次</Title>
          <Grid items={[
            ['业务入库单', item.businessInbound.inboundNo],
            ['库存批次', item.businessInbound.lotNo],
            ['入账数量', weight(item.businessInbound.quantity)],
            ['入账时间', formatDateTimeToSecond(item.businessInbound.postedAt)],
            ['可用库存', weight(item.businessInbound.inventoryLot?.availableQuantity || 0)],
            ['库存状态', item.businessInbound.inventoryLot?.status || '-'],
          ]} />
        </Card>
      ) : (
        <Card className="p-5 text-sm text-muted-foreground">
          {qualityQualified
            ? '确认物流收货后，可生成业务入库单；系统将同时创建库存批次和第一条入库台账。'
            : '只有已确认且质检合格的货物才能生成业务入库单、库存批次和库存台账。'}
        </Card>
      )}
      <BusinessOperationHistory logs={item.operationLogs} />
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 font-semibold">{children}</h2>;
}

function Grid({ items }: { items: string[][] }) {
  return <div className="grid gap-4 sm:grid-cols-2">{items.map(([label, value]) => (
    <div key={label}><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>
  ))}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-1 block text-xs text-muted-foreground">{label}</span>{children}</label>;
}

function ProgressStep({ title, milestone }: { title: string; milestone?: { label: string; complete: boolean } }) {
  return (
    <div className={`rounded-md border p-3 ${milestone?.complete ? 'border-success/30 bg-success-bg' : 'bg-muted/20'}`}>
      <div className="flex items-center gap-2">
        {milestone?.complete
          ? <CheckCircle2 className="h-4 w-4 text-success" />
          : <Circle className="h-4 w-4 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">{title}</span>
      </div>
      <div className={`mt-2 text-sm font-medium ${milestone?.complete ? 'text-success' : ''}`}>{milestone?.label || '待处理'}</div>
    </div>
  );
}

function stageClass(tone?: string) {
  if (tone === 'success') return 'border-success/30 bg-success-bg text-success';
  if (tone === 'danger') return 'border-destructive/30 bg-destructive/5 text-destructive';
  if (tone === 'warning') return 'border-warning/30 bg-warning-bg text-warning';
  if (tone === 'info') return 'border-info/30 bg-info-bg text-info';
  return 'text-muted-foreground';
}

function qualityStatus(inspection: any) {
  if (inspection.status !== 'CONFIRMED') {
    return inspection.status === 'DRAFT' ? '草稿'
      : inspection.status === 'TESTING' ? '检测中'
        : inspection.status === 'REPORTED' ? '待确认'
          : inspection.status === 'VOIDED' ? '已作废' : inspection.status;
  }
  return inspection.conclusion === 'PASS' ? '已确认·合格'
    : inspection.conclusion === 'DEDUCTION' ? '已确认·超标扣款'
      : inspection.conclusion === 'FUSE' ? '已确认·熔断' : '已确认·待判定';
}

function weight(value: any) {
  if (value === null || value === undefined) return '待确认';
  return `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`;
}

function formatFileSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`;
}
