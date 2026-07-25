'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, FileText, RotateCcw, Send, Trash2, Upload, XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { openStoredAttachment } from '@/lib/attachment-preview';
import { formatDateTimeToSecond } from '@/lib/date-time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const STATUS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_APPROVAL: '待审批',
  APPROVED: '审批通过',
  REJECTED: '已驳回',
  POSTED: '已过账',
  CANCELLED: '已取消',
};

export default function InventoryReversalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [item, setItem] = useState<any>(null);
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api.get(`/inventory-reversals/${id}`)
    .then(setItem)
    .catch((error: any) => alert(error.message));

  useEffect(() => {
    void load();
    const user = localStorage.getItem('user');
    if (user) {
      try { setRole(JSON.parse(user).role || ''); } catch {}
    }
  }, [id]);

  const simpleAction = async (type: 'submit' | 'cancel' | 'post') => {
    const prompts = {
      submit: '确认提交库存冲销审批？提交后冲销数量将被预留。',
      cancel: '确认取消该库存冲销单？',
      post: '确认冲销过账并生成反向库存台账？该操作不能直接撤回。',
    };
    if (!confirm(prompts[type])) return;
    setSaving(true);
    try {
      const result = type === 'post'
        ? await api.post(`/inventory-reversals/${id}/post`, {})
        : await api.patch(`/inventory-reversals/${id}/${type}`, {});
      setItem(result);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const review = async (action: 'APPROVE' | 'REJECT') => {
    const comment = prompt(action === 'APPROVE' ? '请输入审批意见（可选）' : '请输入驳回原因（必填）');
    if (comment === null || (action === 'REJECT' && !comment.trim())) return;
    setSaving(true);
    try {
      setItem(await api.patch(`/inventory-reversals/${id}/review`, { action, comment }));
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
      await api.upload(`/inventory-reversals/${id}/attachments`, formData);
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
      await api.delete(`/inventory-reversals/attachments/${attachment.id}`);
      await load();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const viewAttachment = async (attachment: any) => {
    try {
      await openStoredAttachment(`/inventory-reversals/attachments/${attachment.id}/view-url`);
    } catch (error: any) {
      alert(error.message);
    }
  };

  if (!item) return <div className="py-20 text-center">加载中...</div>;
  const source = item.type === 'INBOUND' ? item.businessInbound : item.salesOutbound;
  const canReview = ['ADMIN', 'APPROVER'].includes(role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/inventory-reversals')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{item.reversalNo}</h1>
              <Badge>{item.type === 'INBOUND' ? '入库冲销' : '出库冲销'}</Badge>
              <Badge variant="secondary">{STATUS[item.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              原业务单：{item.type === 'INBOUND' ? source?.inboundNo : source?.outboundNo}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.status === 'DRAFT' && (
            <>
              <Button variant="outline" disabled={saving} onClick={() => void simpleAction('cancel')}>
                <XCircle className="mr-2 h-4 w-4" />取消
              </Button>
              <Button disabled={saving} onClick={() => void simpleAction('submit')}>
                <Send className="mr-2 h-4 w-4" />提交审批
              </Button>
            </>
          )}
          {item.status === 'PENDING_APPROVAL' && canReview && (
            <>
              <Button variant="outline" disabled={saving} onClick={() => void review('REJECT')}>
                <XCircle className="mr-2 h-4 w-4" />驳回
              </Button>
              <Button disabled={saving} onClick={() => void review('APPROVE')}>
                <CheckCircle2 className="mr-2 h-4 w-4" />审批通过
              </Button>
            </>
          )}
          {item.status === 'APPROVED' && (
            <Button disabled={saving} onClick={() => void simpleAction('post')}>
              <RotateCcw className="mr-2 h-4 w-4" />冲销过账
            </Button>
          )}
        </div>
      </div>

      {item.status === 'REJECTED' && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <div className="font-medium text-destructive">审批已驳回</div>
          <div className="mt-1">{item.rejectedReason}</div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <Title>冲销申请</Title>
          <Grid items={[
            ['冲销类型', item.type === 'INBOUND' ? '入库冲销' : '出库冲销'],
            ['冲销状态', STATUS[item.status]],
            ['申请人', item.creator.name],
            ['创建时间', formatDateTimeToSecond(item.createdAt)],
            ['冲销原因', item.reason],
            ['备注', item.remarks || '-'],
          ]} />
        </Card>
        <Card className="p-5">
          <Title>原业务单据</Title>
          <Grid items={[
            ['原业务单', item.type === 'INBOUND' ? source?.inboundNo : source?.outboundNo],
            ['关联物流单', source?.receipt?.receiptNo],
            ['物料', source?.materialName],
            ['仓库', `${source?.warehouse?.code} · ${source?.warehouse?.name}`],
            ['原业务数量', weight(source?.quantity)],
            ['供应商 / 客户', item.type === 'INBOUND' ? source?.supplierName || '-' : source?.customerName || '-'],
            ['原单状态', sourceStatus(source?.status)],
            ['原单入账时间', formatDateTimeToSecond(source?.postedAt)],
          ]} />
        </Card>
      </div>

      <Card className="p-5">
        <Title>原批次反向冲销明细</Title>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="p-3">库存批次</th>
                <th className="p-3">物料</th>
                <th className="p-3">仓库</th>
                <th className="p-3 text-right">原业务数量</th>
                <th className="p-3 text-right">本次冲销</th>
                <th className="p-3">库存方向</th>
                <th className="p-3 text-right">过账后余额</th>
              </tr>
            </thead>
            <tbody>
              {item.lines.map((line: any) => (
                <tr key={line.id} className="border-b">
                  <td className="p-3 font-mono text-primary">{line.inventoryLot.lotNo}</td>
                  <td className="p-3">{line.inventoryLot.material.name}</td>
                  <td className="p-3">{line.inventoryLot.warehouse.name}</td>
                  <td className="p-3 text-right">{weight(line.sourceQuantity)}</td>
                  <td className="p-3 text-right font-medium">{weight(line.quantity)}</td>
                  <td className={`p-3 ${item.type === 'INBOUND' ? 'text-destructive' : 'text-primary'}`}>
                    {item.type === 'INBOUND' ? '减少库存' : '恢复库存'}
                  </td>
                  <td className="p-3 text-right">{line.balanceAfter === null ? '待过账' : weight(line.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">冲销依据附件</h2>
            <p className="mt-1 text-xs text-muted-foreground">支持业务撤销说明、纠错凭证、照片和 PDF，提交审批后锁定。</p>
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
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">暂无冲销附件</div>
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

      <Card className="p-5">
        <Title>审批与过账记录</Title>
        <Grid items={[
          ['提交时间', formatDateTimeToSecond(item.submittedAt, '-')],
          ['审批人', item.approver?.name || '-'],
          ['审批时间', formatDateTimeToSecond(item.approvedAt, '-')],
          ['审批意见', item.approvalComment || item.rejectedReason || '-'],
          ['过账人', item.poster?.name || '-'],
          ['过账时间', formatDateTimeToSecond(item.postedAt, '-')],
        ]} />
      </Card>
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
  return `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 吨`;
}

function sourceStatus(value: string) {
  return {
    POSTED: '已入账',
    PARTIALLY_REVERSED: '部分冲销',
    REVERSED: '已冲销',
    CANCELLED: '已取消',
  }[value] || value || '-';
}

function formatFileSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`;
}
