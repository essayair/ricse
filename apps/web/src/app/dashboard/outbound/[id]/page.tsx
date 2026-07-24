'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, FileText, PackageMinus, Trash2, Upload, XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const STATUS: Record<string, string> = {
  DRAFT: '草稿',
  DEPARTURE_CONFIRMED: '已确认离场',
  POSTED: '已扣减库存',
  CANCELLED: '已作废',
};

export default function OutboundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [item, setItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get(`/outbound-receipts/${id}`)
    .then(setItem)
    .catch((error: any) => alert(error.message));

  useEffect(() => { void load(); }, [id]);

  const action = async (type: 'confirm' | 'post' | 'cancel') => {
    const prompts = {
      confirm: '确认货物已完成装车并离场？确认后附件和批次分配将锁定。',
      post: '确认生成销售出库单并扣减各库存批次？',
      cancel: '确认作废该物流出库单？',
    };
    if (!confirm(prompts[type])) return;
    setSaving(true);
    try {
      const result = type === 'post'
        ? await api.post(`/outbound-receipts/${id}/post`, {})
        : await api.patch(`/outbound-receipts/${id}/${type}`, {});
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
      await api.upload(`/outbound-receipts/${id}/attachments`, formData);
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
      await api.delete(`/outbound-receipts/attachments/${attachment.id}`);
      await load();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const viewAttachment = async (attachment: any) => {
    try {
      const result = await api.get<{ url: string }>(`/outbound-receipts/attachments/${attachment.id}/view-url`);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      alert(error.message);
    }
  };

  if (!item) return <div className="py-20 text-center">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/outbound')}>
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
              <Button disabled={saving} onClick={() => void action('confirm')}>
                <CheckCircle2 className="mr-2 h-4 w-4" />确认货物离场
              </Button>
            </>
          )}
          {item.status === 'DEPARTURE_CONFIRMED' && (
            <Button disabled={saving} onClick={() => void action('post')}>
              <PackageMinus className="mr-2 h-4 w-4" />生成销售出库并扣减库存
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <Title>物流出库信息</Title>
          <Grid items={[
            ['物流运单', item.waybill.waybillNo],
            ['销售发货通知', item.waybill.dispatchNotice.noticeNo],
            ['合同', item.waybill.dispatchNotice.order.contract.contractNo],
            ['执行批次', `${item.waybill.dispatchNotice.order.orderNo} · ${item.waybill.dispatchNotice.order.name}`],
            ['车牌', item.plateNo || '-'],
            ['发货仓库', `${item.warehouse.code} · ${item.warehouse.name}`],
            ['离场时间', formatDateTimeToSecond(item.departedAt)],
            ['出库操作人', item.operatorName],
          ]} />
        </Card>
        <Card className="p-5">
          <Title>出库数量依据</Title>
          <Grid items={[
            ['出库磅单', item.weighTicket.ticketNo],
            ['磅单方向', '出库'],
            ['结算口径', basis(item.weighTicket.settlementBasis)],
            ['磅单净重', weight(item.weighTicket.netWeight)],
            ['最终出库数量', weight(item.outboundQuantity)],
            ['物料', item.materialName],
            ['客户', item.customerName || '-'],
            ['备注', item.remarks || '-'],
          ]} />
          <Button className="mt-4" variant="outline" onClick={() => router.push(`/dashboard/weighbridge/${item.weighTicket.id}`)}>
            查看出库磅单
          </Button>
        </Card>
      </div>

      <Card className="p-5">
        <Title>库存批次拣配</Title>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="p-3">库存批次</th>
                <th className="p-3">业务入库单</th>
                <th className="p-3">供应商</th>
                <th className="p-3 text-right">出库前可用</th>
                <th className="p-3 text-right">本次分配</th>
                <th className="p-3 text-right">出库后余额</th>
              </tr>
            </thead>
            <tbody>
              {item.allocations.map((allocation: any) => {
                const postedLine = item.salesOutbound?.lines.find((line: any) => line.inventoryLotId === allocation.inventoryLotId);
                const before = postedLine
                  ? Number(postedLine.balanceAfter) + Number(postedLine.quantity)
                  : Number(allocation.inventoryLot.availableQuantity);
                return (
                  <tr key={allocation.id} className="border-b">
                    <td className="p-3 font-mono text-primary">{allocation.inventoryLot.lotNo}</td>
                    <td className="p-3 font-mono text-xs">{allocation.inventoryLot.businessInbound.inboundNo}</td>
                    <td className="p-3">{allocation.inventoryLot.supplierName || '-'}</td>
                    <td className="p-3 text-right">{weight(before)}</td>
                    <td className="p-3 text-right font-medium">{weight(allocation.quantity)}</td>
                    <td className="p-3 text-right">{postedLine ? weight(postedLine.balanceAfter) : '待扣减'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">出库附件</h2>
            <p className="mt-1 text-xs text-muted-foreground">支持装车照片、门岗放行凭证和 PDF，单个文件不超过 20MB。</p>
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
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">暂无出库附件</div>
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

      {item.salesOutbound ? (
        <Card className="border-primary/30 bg-primary/5 p-5">
          <Title>销售出库与扣减结果</Title>
          <Grid items={[
            ['销售出库单', item.salesOutbound.outboundNo],
            ['出库数量', weight(item.salesOutbound.quantity)],
            ['扣减批次', `${item.salesOutbound.lines.length} 个`],
            ['入账时间', formatDateTimeToSecond(item.salesOutbound.postedAt)],
            ['状态', '已扣减库存'],
          ]} />
        </Card>
      ) : (
        <Card className="p-5 text-sm text-muted-foreground">
          确认货物离场后，可生成销售出库单；系统将在一个事务中扣减所有已选批次并写入出库台账。
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
    <div key={label}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  ))}</div>;
}

function weight(value: any) {
  if (value === null || value === undefined) return '-';
  return `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`;
}

function formatFileSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`;
}

function basis(value: string) {
  return {
    RECEIVING: '本次称重净重',
    SHIPPING: '发货重量',
    CUSTOMER: '客户重量',
    THIRD_PARTY: '第三方重量',
    MANUAL: '人工确认重量',
  }[value] || value;
}
