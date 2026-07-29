'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, FileText, PackageCheck, Trash2, Upload, XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { openStoredAttachment } from '@/lib/attachment-preview';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const STATUS: Record<string, string> = {
  DRAFT: '草稿', RECEIVED: '已收货', POSTED: '已入账', CANCELLED: '已作废',
};

export default function InboundDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [item, setItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () => api.get(`/inbound-receipts/${id}`).then(setItem).catch((error: any) => alert(error.message)),
    [id],
  );
  useEffect(() => { void load(); }, [load]);

  const action = async (type: 'confirm' | 'post' | 'cancel') => {
    const prompts = {
      confirm: '确认现场已经完成收货？确认后不能再增删附件。',
      post: '确认生成业务入库单、库存批次并增加库存？',
      cancel: '确认作废该物流入库单？',
    };
    if (!confirm(prompts[type])) return;
    setSaving(true);
    try {
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

  if (!item) return <div className="py-20 text-center">加载中...</div>;
  const qualityQualified = item.acceptanceConclusion === 'PASS'
    && item.qualityInspection?.status === 'CONFIRMED'
    && item.qualityInspection?.conclusion === 'PASS';

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
              <Badge>{STATUS[item.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.materialName} · {item.plateNo || '-'} · {item.warehouse.name}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {item.status === 'DRAFT' && (
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

      {!qualityQualified && item.status !== 'POSTED' && item.status !== 'CANCELLED' && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          当前验收依据不是已确认的合格质检单，不能确认入库或生成库存。请作废本单，完成复检并取得合格结论后重新创建入库单。
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <Title>物流收货信息</Title>
          <Grid items={[
            ['物流运单', item.waybill.waybillNo],
            ['磅单', item.weighTicket.ticketNo],
            ['车牌', item.plateNo || '-'],
            ['收货仓库', `${item.warehouse.code} · ${item.warehouse.name}`],
            ['收货时间', formatDateTimeToSecond(item.receivedAt)],
            ['收货人', item.receiverName],
            ['物料', `${item.materialName}${item.materialSpec ? ` / ${item.materialSpec}` : ''}`],
            ['供应商', item.supplierName || '-'],
          ]} />
        </Card>
        <Card className="p-5">
          <Title>质量验收依据</Title>
          <Grid items={[
            ['质检单', item.qualityInspection.inspectionNo],
            ['检测机构', item.qualityInspection.institutionName],
            ['报告编号', item.qualityInspection.reportNo || '-'],
            ['验收结论', item.acceptanceConclusion === 'PASS' ? '合格' : '超标扣款（不可入库）'],
            ['扣水', weight(item.moistureDeductionWeight)],
            ['扣杂', weight(item.impurityDeductionWeight)],
            ['预计扣款', `¥${Number(item.deductionAmount).toLocaleString()}`],
            ['最终入库数量', weight(item.receivedQuantity)],
          ]} />
          <Button className="mt-4" variant="outline" onClick={() => router.push(`/dashboard/quality/${item.qualityInspection.id}`)}>
            查看质检单
          </Button>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">收货附件</h2>
            <p className="mt-1 text-xs text-muted-foreground">支持现场照片、签收凭证和 PDF，单个文件不超过 20MB。</p>
          </div>
          {item.status === 'DRAFT' && (
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
                  {item.status === 'DRAFT' && (
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

function weight(value: any) {
  return `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`;
}

function formatFileSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`;
}
