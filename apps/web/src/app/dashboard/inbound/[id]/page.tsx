'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Circle, FileText, PackageCheck, Save, Trash2, Upload, XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { openStoredAttachment } from '@/lib/attachment-preview';
import { formatDateTimeToSecond, toLocalDateTimeInput } from '@/lib/date-time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BusinessOperationHistory } from '@/components/business-operation-history';
import { StatusText } from '@/components/status-text';
import { confirmAction } from '@/lib/system-dialog';

const STATUS: Record<string, string> = {
  PENDING: '作业中', RECEIVED: '已收货', POSTED: '已入账', CANCELLED: '已作废',
};

export default function InboundDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const receiptDirtyRef = useRef(false);
  const [item, setItem] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [receiptForm, setReceiptForm] = useState({
    warehouseId: '', receivedAt: '', remarks: '',
  });
  const [qualityExceptionReason, setQualityExceptionReason] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result: any = await api.get(`/inbound-receipts/${id}`);
      setItem(result);
      if (!receiptDirtyRef.current) {
        const defaults = result.receiptDefaults || result;
        setReceiptForm({
          warehouseId: defaults.warehouseId || '',
          receivedAt: defaults.receivedAt ? toLocalDateTimeInput(new Date(defaults.receivedAt)) : '',
          remarks: result.remarks || '',
        });
      }
    } catch (error: any) {
      alert(error.message);
    }
  }, [id]);
  useEffect(() => { receiptDirtyRef.current = false; void load(); }, [load]);
  useEffect(() => {
    api.get<any[]>('/master-data/warehouses')
      .then(result => setWarehouses(result.filter(warehouse => warehouse.status === 'ACTIVE')))
      .catch((error: any) => alert(error.message));
  }, []);

  const pendingPayload = () => ({
    warehouseId: receiptForm.warehouseId || undefined,
    receivedAt: receiptForm.receivedAt || undefined,
    remarks: receiptForm.remarks,
  });

  const editReceipt = (field: keyof typeof receiptForm, value: string) => {
    receiptDirtyRef.current = true;
    setReceiptForm(current => ({ ...current, [field]: value }));
  };

  const savePending = async () => {
    setSaving(true);
    try {
      const result = await api.patch(`/inbound-receipts/${id}`, pendingPayload());
      setItem(result);
      receiptDirtyRef.current = false;
      await load();
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
    if (type === 'confirm') {
      if (item?.workflow?.stage !== 'READY_TO_RECEIVE') {
        const message = `暂不能确认收货：${item?.workflow?.blocker || '请先完成到货、过磅和质检作业'}`;
        setReceiptError(message);
        alert(message);
        return;
      }
      const missing = [
        !receiptForm.warehouseId ? '入库仓库' : '',
        !receiptForm.receivedAt ? '实际收货时间' : '',
        item?.qualityException && !qualityExceptionReason.trim() ? '质检异常人工接收原因' : '',
      ].filter(Boolean);
      if (missing.length) {
        const message = `确认收货前请补齐：${missing.join('、')}`;
        setReceiptError(message);
        alert(message);
        return;
      }
      setReceiptError('');
    }
    if (!await confirmAction(type === 'confirm' && item?.qualityException
      ? '质检报告存在异常指标。确认已核对报告及合同要求，并按填写的原因由人工决定接收入库？'
      : prompts[type], { title: type === 'confirm' ? '入库确认' : '入库操作确认' })) return;
    setSaving(true);
    try {
      if (type === 'confirm') await api.patch(`/inbound-receipts/${id}`, pendingPayload());
      const result = type === 'post'
        ? await api.post(`/inbound-receipts/${id}/post`, {})
        : await api.patch(`/inbound-receipts/${id}/${type}`, type === 'confirm' ? { qualityExceptionReason: qualityExceptionReason.trim() } : {});
      setItem(result);
      await load();
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
    if (!await confirmAction(`确认删除附件“${attachment.originalName}”？`)) return;
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
    if (!await confirmAction('确认同步到货质检任务选定的最终报告？报告结论、实测指标与扣减数据将更新；入库数量仍以已复核磅单为准。', { title: '同步最终质检报告' })) return;
    setSaving(true);
    try {
      const result = await api.patch(`/inbound-receipts/${id}/acceptance-quality`, { qualityInspectionId });
      setItem(result);
      setQualityExceptionReason('');
      await load();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!item) return <div className="py-20 text-center">加载中...</div>;
  const qualityReady = item.qualityInspection?.status === 'CONFIRMED'
    && item.waybill?.qualityTask?.status === 'COMPLETED'
    && item.waybill.qualityTask.basisInspectionId === item.qualityInspectionId;
  const finalReport = (item.waybill?.weighTickets || [])
    .flatMap((ticket: any) => ticket.qualityInspections || [])
    .find((inspection: any) => inspection.id === item.waybill?.qualityTask?.basisInspectionId);
  const canSyncFinalReport = item.status === 'PENDING' && item.waybill?.qualityTask?.status === 'COMPLETED'
    && finalReport?.status === 'CONFIRMED' && !qualityReady;
  const qualityRules: any[] = item.qualityInspection?.qualityTask?.contractQualityEvaluation?.items || [];
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
              <StatusText status={item.status} className={stageClass(workflow.tone)}>{workflow.stageLabel || STATUS[item.status]}</StatusText>
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
              <Button disabled={saving} onClick={() => void action('confirm')}>
                <CheckCircle2 className="mr-2 h-4 w-4" />确认收货
              </Button>
            </>
          )}
          {item.status === 'RECEIVED' && qualityReady && (
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
      {item.quantitySource === 'LEGACY_UNVERIFIED' && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          这张历史入库单的数量尚未与选定磅单及最终质检报告核对。原记录已保留；核对完成前不能过账，请联系管理员执行历史数量核对。
        </Card>
      )}
      {item.quantitySource === 'HISTORICAL_RECONCILED' && (
        <Card className="border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          历史数量已依据选定磅单和最终质检报告自动核对。原数量：{item.legacyReceivedQuantity == null ? '未记录' : weight(item.legacyReceivedQuantity)}；当前实物数量：{weight(item.receivedQuantity)}。
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
                入库仓库默认取物流目的地关联仓库；收货人以当前确认操作人为准。请核对实际收货时间和仓库后确认。
              </div>
              <div className="text-sm text-muted-foreground">物流目的地：{item.waybill?.destinationLocation || item.waybill?.dispatchNotice?.destinationLocation || '未填写'}{item.waybill?.dispatchNotice?.destinationWarehouse?.address ? ` · ${item.waybill.dispatchNotice.destinationWarehouse.address}` : ''}</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="入库仓库 *">
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={receiptForm.warehouseId} onChange={event => editReceipt('warehouseId', event.target.value)}>
                    <option value="">请选择仓库</option>
                    {warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
                  </select>
                </Field>
                <Field label="实际收货时间 *"><Input type="datetime-local" step="1" value={receiptForm.receivedAt} onChange={event => editReceipt('receivedAt', event.target.value)} /></Field>
                <Field label="收货人（当前操作人）"><Input value={item.currentOperatorName || '当前账号'} readOnly className="bg-muted" /></Field>
                <Field label="备注"><Input value={receiptForm.remarks} onChange={event => editReceipt('remarks', event.target.value)} /></Field>
              </div>
              {item.qualityException && <Field label="质检异常人工接收原因 *"><textarea className="min-h-24 w-full rounded-md border border-amber-400 bg-background p-3 text-sm" value={qualityExceptionReason} onChange={event => setQualityExceptionReason(event.target.value)} placeholder="请核对异常指标，并说明仍接收入库的业务依据" /></Field>}
              {receiptError && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{receiptError}</div>}
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
          {canSyncFinalReport && <div className="mb-4 rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-900">
            质检任务已形成最终结论，但本单尚未同步最终报告。
            <Button className="ml-3" size="sm" variant="outline" disabled={saving} onClick={() => void selectAcceptanceQuality(finalReport.id)}>同步最终质检报告</Button>
          </div>}
          {item.qualityInspection ? (
            <>
              <Grid items={[
                ['执行口径报告', item.qualityInspection.inspectionNo],
                ['检测机构', item.qualityInspection.institutionName],
                ['报告编号', item.qualityInspection.reportNo || '-'],
                ['质检报告结论', qualityConclusionLabel(item.qualityInspection.conclusion)],
                ['入库验收处理', qualityDispositionLabel(item.acceptanceConclusion)],
                ['质量规则扣水参考', weight(item.moistureDeductionWeight)],
                ['质量规则扣杂参考', weight(item.impurityDeductionWeight)],
                ['质量价格扣款', `¥${Number(item.deductionAmount).toLocaleString()}`],
                ['入库实物数量（磅单净重）', weight(item.receivedQuantity ?? item.weighTicket?.netWeight)],
                ['计价数量口径', (item.pricingQuantityBasis || item.pricingPreview?.pricingQuantityBasis) === 'DRY_MATTER' ? '按实测水分折干' : (item.pricingQuantityBasis || item.pricingPreview?.pricingQuantityBasis) === 'PHYSICAL' ? '按实物数量' : '待确定'],
                ['检测报告实测水分', item.reportMeasuredMoisturePct == null ? '—' : `${Number(item.reportMeasuredMoisturePct)}%`],
                ['入库计价数量', item.pricingQuantity == null ? item.pricingPreview ? `${weight(item.pricingPreview.pricingQuantity)}（待确认）` : item.pricingPreviewError || '待确认质检及磅单' : weight(item.pricingQuantity)],
              ]} />
              {item.qualityInspection.indicators?.length > 0 && <div className="mt-5 border-t pt-4"><div className="mb-2 text-sm font-medium">检测指标与实测值</div><div className="grid gap-2 sm:grid-cols-2">{item.qualityInspection.indicators.map((indicator: any) => {
                const rule = qualityRules.find((entry: any) => entry.code === indicator.code || entry.name === indicator.name);
                const abnormal = ['FAIL', 'FUSE'].includes(indicator.result) || (rule && rule.result !== 'PASS');
                const standard = rule?.standardValue != null ? `${rule.standardOperator || ''}${rule.standardValue}${rule.upperValue != null ? `–${rule.upperValue}` : ''}${rule.unit || indicator.unit || ''}` : indicator.standardValue == null ? '' : `${indicator.operator || ''}${indicator.standardValue}${indicator.unit || ''}`;
                return <div key={indicator.code} className={`rounded-md border px-3 py-2 text-sm ${abnormal ? 'border-destructive/40 bg-destructive/5 text-destructive' : ''}`}><span>{indicator.name}：</span><strong>{indicator.measuredValue == null ? '未录入' : `${indicator.measuredValue}${indicator.unit || ''}`}</strong>{standard && <span className="ml-2 text-xs">标准 {standard}</span>}<span className="ml-2 text-xs">{abnormal ? '异常' : '正常'}</span>{rule?.reason && abnormal && <div className="mt-1 text-xs">{rule.reason}</div>}</div>;
              })}</div></div>}
              {qualityRules.filter((rule: any) => rule.result !== 'PASS' && !item.qualityInspection.indicators?.some((indicator: any) => indicator.code === rule.code || indicator.name === rule.name)).map((rule: any, index: number) => <div key={`${rule.code || rule.name}-${index}`} className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{rule.name}异常：实测 {rule.measuredValue == null ? '缺失' : `${rule.measuredValue}${rule.unit || ''}`} · {rule.reason || '请核对合同质量规则'}</div>)}
              {item.qualityInspection.resolution && <p className="mt-3 text-sm text-amber-800">报告处理方案：{item.qualityInspection.resolution}</p>}
              {item.qualityException && item.qualityExceptionReason && <p className="mt-3 text-sm text-amber-800">人工接收原因：{item.qualityExceptionReason}</p>}
              <Button className="mt-4" variant="outline" onClick={() => router.push(`/dashboard/quality/${item.waybill.qualityTask?.id}`)}>
                查看到货质检任务
              </Button>
            </>
          ) : (
            <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
              质检任务尚未形成最终结论，或最终报告尚未同步到入库单。
            </div>
          )}
        </Card>
      </div>

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
            ['入账实物数量', weight(item.businessInbound.quantity)],
            ['入账计价数量', weight(item.businessInbound.pricingQuantity)],
            ['入账时间', formatDateTimeToSecond(item.businessInbound.postedAt)],
            ['可用实物库存', weight(item.businessInbound.inventoryLot?.availableQuantity || 0)],
            ['可用计价库存', weight(item.businessInbound.inventoryLot?.pricingAvailableQuantity || 0)],
            ['库存状态', item.businessInbound.inventoryLot?.status || '-'],
          ]} />
        </Card>
      ) : (
        <Card className="p-5 text-sm text-muted-foreground">
          {qualityReady
            ? '确认物流收货后，可生成业务入库单；系统将同时创建库存批次和第一条入库台账。'
            : '选定最终质检报告并确认收货后，可生成业务入库单；异常指标须由入库人核对并说明接收原因。'}
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
  if (tone === 'success') return 'text-success';
  if (tone === 'danger') return 'text-destructive';
  if (tone === 'warning') return 'text-warning';
  if (tone === 'info') return 'text-primary';
  return 'text-muted-foreground';
}

function qualityConclusionLabel(value?: string) {
  return ({ PASS: '合格', DEDUCTION: '超标扣款', FUSE: '不合格（拒收）' } as Record<string, string>)[value || ''] || '待判定';
}

function qualityDispositionLabel(value?: string) {
  return ({ PASS: '合格', LEGACY: '合格（旧规则）', DEDUCTION_PENDING: '扣款待确认', ACCEPT_WITH_DEDUCTION: '扣款后接收', REJECT: '不合格，待人工确认', REVIEW_REQUIRED: '待人工判定' } as Record<string, string>)[value || ''] || '待确定';
}

function weight(value: any) {
  if (value === null || value === undefined) return '待确认';
  return `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`;
}

function formatFileSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`;
}
