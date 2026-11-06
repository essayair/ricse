'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { promptAction } from '@/lib/system-dialog';
import { InvoiceRegisterDialog } from './invoice-register-dialog';

interface InvoiceRecord {
  id: string; invoiceNo: string; invoiceCode?: string | null; issuedAt: string; materialName: string;
  quantity?: string | null; unitPrice?: string | null; taxRate?: string | null; taxAmount?: string | null;
  taxInclusiveAmount: string; status: string; creator: { name: string }; voidReason?: string | null;
}
interface InvoiceSummary {
  direction: 'INPUT' | 'OUTPUT'; settlementQuantity?: string | null; invoiceQuantity: string;
  quantityDifference?: string | null; settlementAmount: string; invoiceAmount: string;
  amountDifference: string; warnings: string[]; matched: boolean;
}

const money = (value?: string | null) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 结算依据详情中的发票登记与核对；货款按数量和金额核对，运费只核对金额。 */
function InvoicePanel({ basePath, registrable, canCreate, canVoid, freight = false, defaults }: {
  basePath: string; registrable: boolean; canCreate: boolean; canVoid: boolean; freight?: boolean;
  defaults?: { materialName?: string; taxRate?: string };
}) {
  const [data, setData] = useState<{ records: InvoiceRecord[]; summary: InvoiceSummary } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setData(await api.get(`${basePath}/invoices`)); }
    catch (error: any) { alert(error.message || '发票记录加载失败'); }
  }, [basePath]);
  useEffect(() => { void load(); }, [load]);

  const voidRecord = async (record: InvoiceRecord) => {
    const reason = await promptAction(`请输入发票 ${record.invoiceNo} 的作废原因`);
    if (!reason?.trim()) return;
    setBusy(true);
    try { await api.post(`${basePath}/invoices/${record.id}/void`, { reason: reason.trim() }); await load(); }
    catch (error: any) { alert(error.message || '发票作废失败'); }
    finally { setBusy(false); }
  };

  const kindLabel = data?.summary.direction === 'OUTPUT' ? '销项' : '进项';
  const hint = freight
    ? '登记承运方开具的运费发票并核对含税金额；不自动生成会计凭证或税务申报数据。'
    : '仅登记进销项发票并核对数量、含税金额；不自动生成会计凭证或税务申报数据。';
  return <Card className="space-y-4 p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{freight ? '运费发票登记与核对' : '发票登记与结算核对'}</h2><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>{canCreate && registrable && <Button onClick={() => setOpen(true)}>登记{kindLabel}发票</Button>}</div>
    {data && <>
      <div className="grid gap-3 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-3">
        {freight ? <div>有效发票：{data.records.filter(record => record.status === 'ACTIVE').length} 张</div> : <div>结算数量 / 发票数量：{data.summary.settlementQuantity ?? '—'} / {data.summary.invoiceQuantity} 吨</div>}
        <div>结算金额 / 发票含税金额：{money(data.summary.settlementAmount)} / {money(data.summary.invoiceAmount)}</div>
        <div className={data.summary.matched ? 'text-success' : 'text-warning'}>{data.summary.matched ? (freight ? '金额已匹配' : '数量金额已匹配') : data.summary.warnings.join('；')}</div>
      </div>
      <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[900px] text-sm">
        <thead className="bg-muted/40 text-left"><tr><th className="p-3">发票号码 / 代码</th><th className="p-3">开票日期</th><th className="p-3">品名规格</th><th className="p-3 text-right">数量</th><th className="p-3 text-right">税率</th><th className="p-3 text-right">含税金额</th><th className="p-3">状态 / 经办人</th><th className="p-3">操作</th></tr></thead>
        <tbody>{data.records.length ? data.records.map(record => <tr key={record.id} className="border-t">
          <td className="p-3">{record.invoiceNo}<div className="text-xs text-muted-foreground">{record.invoiceCode || '—'}</div></td>
          <td className="p-3">{record.issuedAt.slice(0, 10)}</td>
          <td className="p-3">{record.materialName}</td>
          <td className="p-3 text-right">{record.quantity ?? '—'}</td>
          <td className="p-3 text-right">{record.taxRate != null ? `${Number(record.taxRate)}%` : '—'}</td>
          <td className="p-3 text-right">{money(record.taxInclusiveAmount)}</td>
          <td className="p-3">{record.status === 'VOIDED' ? `已作废：${record.voidReason || ''}` : '有效'}<div className="text-xs text-muted-foreground">{record.creator.name}</div></td>
          <td className="p-3">{record.status === 'ACTIVE' && canVoid && <Button variant="outline" size="sm" disabled={busy} onClick={() => void voidRecord(record)}>作废</Button>}</td>
        </tr>) : <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">暂无发票记录</td></tr>}</tbody>
      </table></div>
    </>}
    <InvoiceRegisterDialog open={open} onOpenChange={setOpen} basePath={basePath} kindLabel={kindLabel} defaults={defaults} quantityLabel={freight ? '数量' : '数量（吨）'} onSaved={load} />
  </Card>;
}

/** 采购/销售结算单：确认后可登记进项/销项发票。 */
export function SettlementInvoicePanel({ settlementId, status, canCreate, canVoid, materialName }: {
  settlementId: string; status: string; canCreate: boolean; canVoid: boolean; materialName?: string;
}) {
  return <InvoicePanel basePath={`/financial-settlements/${settlementId}`} registrable={['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'].includes(status)} canCreate={canCreate} canVoid={canVoid} defaults={{ materialName }} />;
}

/** 物流结算单：复核后可登记承运方开具的运费进项发票。 */
export function FreightInvoicePanel({ logisticsSettlementId, status, canCreate, canVoid }: {
  logisticsSettlementId: string; status: string; canCreate: boolean; canVoid: boolean;
}) {
  return <InvoicePanel basePath={`/logistics-settlements/${logisticsSettlementId}`} registrable={status === 'REVIEWED'} canCreate={canCreate} canVoid={canVoid} freight defaults={{ materialName: '运输服务*运输费', taxRate: '9' }} />;
}
