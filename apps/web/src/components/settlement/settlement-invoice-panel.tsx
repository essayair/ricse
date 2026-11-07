'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { promptAction } from '@/lib/system-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusText } from '@/components/status-text';
import { InvoiceRegisterDialog, InvoiceRegisterMode } from './invoice-register-dialog';
import { InvoiceAllocateDialog } from './invoice-allocate-dialog';
import { InvoiceDetailDialog } from './invoice-detail-dialog';
import { AllocationRow, InvoiceDirection, InvoiceSourceType, day, gapText, money, qty, useInvoicePermission } from './invoice-shared';

interface Summary {
  direction: InvoiceDirection; registrable: boolean; state: string; stateLabel: string; matched: boolean; warnings: string[];
  settlementAmount: string; invoiceAmount: string; remainingAmount: string; paidAmount: string; invoicePaymentGap: string;
  settlementQuantity: string | null; invoiceQuantity: string | null;
}
const STATE_TONE: Record<string, string> = { NONE: 'PENDING', PARTIAL: 'PARTIALLY_SETTLED', OVER: 'REJECTED', QUANTITY_MISMATCH: 'REJECTED', MATCHED: 'SETTLED' };

/**
 * 结算依据详情中的发票：本单收到的发票分摊、到票核对与票款差。
 * 可在本单登记新发票，或把已登记（票先到）的发票分摊过来。
 */
function InvoicePanel({ basePath, target, sourceType, label }: {
  basePath: string; target: { settlementId?: string; logisticsSettlementId?: string }; sourceType: InvoiceSourceType; label: string;
}) {
  const [data, setData] = useState<{ allocations: AllocationRow[]; summary: Summary } | null>(null);
  const [registering, setRegistering] = useState(false);
  const [linking, setLinking] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { canCreate, canReverse } = useInvoicePermission();
  const freight = sourceType === 'FREIGHT';

  const load = useCallback(async () => {
    try { setData(await api.get(`${basePath}/invoices`)); }
    catch (error: any) { alert(error.message || '发票记录加载失败'); }
  }, [basePath]);
  useEffect(() => { void load(); }, [load]);

  const reverse = async (row: AllocationRow) => {
    const reason = await promptAction(`撤销发票 ${row.invoice.invoiceNo} 分摊到本单的 ${money(row.amount)}，发票金额将回到待分摊。请填写原因`);
    if (!reason?.trim()) return;
    setBusy(true);
    try { await api.post(`/invoices/allocations/${row.id}/reverse`, { reason: reason.trim() }); await load(); }
    catch (error: any) { alert(error.message || '撤销分摊失败'); }
    finally { setBusy(false); }
  };

  const summary = data?.summary;
  const active = data?.allocations.filter(row => !row.reversedAt) || [];
  const history = data?.allocations.filter(row => row.reversedAt) || [];
  const remaining = Number(summary?.remainingAmount || 0);
  const kindLabel = summary?.direction === 'OUTPUT' ? '销项' : '进项';
  const cashLabel = summary?.direction === 'OUTPUT' ? '已收款' : '已付款';
  const gap = summary ? gapText(summary.invoicePaymentGap) : null;
  const allowAdd = Boolean(summary?.registrable && canCreate(sourceType) && remaining > 0);
  const registerMode: InvoiceRegisterMode | null = summary ? { kind: 'settlement', basePath, sourceType, direction: summary.direction, sourceLabel: label, remainingAmount: summary.remainingAmount } : null;

  return <Card className="space-y-4 p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><h2 className="font-semibold">{freight ? '运费发票' : '发票'}与到票核对</h2><p className="mt-1 text-xs text-muted-foreground">发票总额应与最终的全部结算单对应。一张发票可分摊到多张结算单；{freight ? '运费只核对金额。' : '填写分摊数量时同时核对数量。'}不生成会计凭证或税务申报数据。</p></div>
      {allowAdd && <div className="flex shrink-0 gap-2"><Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setLinking(true)}>关联已登记发票</Button><Button className="flex-1 sm:flex-none" onClick={() => setRegistering(true)}>登记{kindLabel}发票</Button></div>}
    </div>
    {summary && !summary.registrable && <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">{freight ? '物流结算单复核后' : '结算单确认后'}才能接收发票。票先到时请在{kindLabel}发票中登记，之后再分摊到本单。</p>}
    {summary && <>
      <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-5">
        <Amount label="结算金额" value={money(summary.settlementAmount)} />
        <Amount label={cashLabel} value={money(summary.paidAmount)} />
        <Amount label="已到票" value={money(summary.invoiceAmount)} />
        <Amount label="未到票" value={money(summary.remainingAmount)} tone={remaining > 0 ? 'text-warning' : ''} />
        <div className="col-span-2 min-w-0 sm:col-span-1"><div className="text-xs text-muted-foreground">核对状态</div><div className="mt-0.5 flex flex-wrap items-center gap-x-2"><StatusText status={STATE_TONE[summary.state] || 'PENDING'}>{summary.stateLabel}</StatusText><span className={`text-xs ${gap?.tone}`}>{gap?.text}</span></div></div>
      </div>
      {!freight && summary.settlementQuantity && summary.invoiceQuantity && <p className="text-xs text-muted-foreground">结算数量 {qty(summary.settlementQuantity)} 吨 / 已分摊数量 {qty(summary.invoiceQuantity)} 吨</p>}
      {summary.warnings.length > 0 && summary.state !== 'NONE' && <p className="text-xs text-warning">{summary.warnings.join('；')}</p>}

      {!active.length ? <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">本单尚未收到发票分摊</div> : <>
        <div className="space-y-2 md:hidden">{active.map(row => <div key={row.id} className="rounded-md border p-3 text-sm">
          <div className="flex items-start justify-between gap-3"><button type="button" className="min-w-0 text-left" onClick={() => setDetailId(row.invoice.id)}><div className="truncate font-mono font-medium text-primary">{row.invoice.invoiceNo}</div><div className="truncate text-xs text-muted-foreground">{day(row.invoice.issuedAt)} · 发票总额 {money(row.invoice.taxInclusiveAmount)}</div></button><div className="shrink-0 text-right font-semibold tabular-nums">{money(row.amount)}</div></div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span className="truncate">{row.quantity ? `${qty(row.quantity)} 吨 · ` : ''}{row.creator.name} {day(row.createdAt)}</span>{canReverse(sourceType) && <Button variant="outline" size="sm" className="h-7 shrink-0" disabled={busy} onClick={() => void reverse(row)}>撤销分摊</Button>}</div>
        </div>)}</div>
        <div className="hidden overflow-x-auto rounded-md border md:block"><table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-left text-muted-foreground"><tr className="[&>th]:whitespace-nowrap [&>th]:p-3"><th>发票号码</th><th>开票日期</th><th>品名规格</th><th className="text-right">发票总额</th><th className="text-right">分摊到本单</th>{!freight && <th className="text-right">分摊数量</th>}<th>分摊人</th><th>操作</th></tr></thead>
          <tbody>{active.map(row => <tr key={row.id} className="border-t">
            <td className="p-3"><button type="button" className="font-mono text-primary hover:underline" onClick={() => setDetailId(row.invoice.id)}>{row.invoice.invoiceNo}</button>{row.invoice.contract && <div className="text-xs text-muted-foreground">归属 {row.invoice.contract.contractNo}</div>}</td>
            <td className="whitespace-nowrap p-3">{day(row.invoice.issuedAt)}</td>
            <td className="max-w-48 p-3"><div className="truncate" title={row.invoice.materialName}>{row.invoice.materialName}</div></td>
            <td className="whitespace-nowrap p-3 text-right tabular-nums">{money(row.invoice.taxInclusiveAmount)}</td>
            <td className="whitespace-nowrap p-3 text-right font-medium tabular-nums">{money(row.amount)}</td>
            {!freight && <td className="whitespace-nowrap p-3 text-right tabular-nums">{qty(row.quantity)}</td>}
            <td className="whitespace-nowrap p-3">{row.creator.name}<div className="text-xs text-muted-foreground">{day(row.createdAt)}</div></td>
            <td className="p-3">{canReverse(sourceType) && <Button variant="outline" size="sm" disabled={busy} onClick={() => void reverse(row)}>撤销分摊</Button>}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
      {history.length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">已撤销的分摊 {history.length} 条</summary><ul className="mt-1 space-y-1">{history.map(row => <li key={row.id}>{row.invoice.invoiceNo} · {money(row.amount)} · {row.reverser?.name || '—'} {day(row.reversedAt)} 撤销：{row.reversalReason}</li>)}</ul></details>}
    </>}
    <InvoiceRegisterDialog open={registering} onOpenChange={setRegistering} mode={registerMode} onSaved={load} />
    <InvoiceAllocateDialog open={linking} onOpenChange={setLinking}
      source={summary ? { kind: 'target', ...target, label, remainingAmount: summary.remainingAmount, freight } : null} onSaved={load} />
    <InvoiceDetailDialog invoiceId={detailId} onOpenChange={value => { if (!value) setDetailId(null); }} onChanged={load} />
  </Card>;
}

function Amount({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return <div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-0.5 break-all font-medium tabular-nums ${tone}`}>{value}</div></div>;
}

/** 采购/销售结算单：确认后可登记或关联进项/销项发票。 */
export function SettlementInvoicePanel({ settlementId, settlementNo, direction }: {
  settlementId: string; settlementNo?: string; direction?: 'PAYABLE' | 'RECEIVABLE' | string;
  /** 以下为兼容旧调用保留，权限与状态已由组件自行判断。 */
  status?: string; canCreate?: boolean; canVoid?: boolean; materialName?: string;
}) {
  const label = `${direction === 'RECEIVABLE' ? '销售结算单' : direction === 'PAYABLE' ? '采购结算单' : '结算单'}${settlementNo ? ` ${settlementNo}` : ''}`;
  return <InvoicePanel basePath={`/financial-settlements/${settlementId}`} target={{ settlementId }} sourceType="GOODS" label={label} />;
}

/** 物流结算单：复核后可登记或关联承运方开具的运费进项发票。 */
export function FreightInvoicePanel({ logisticsSettlementId, settlementNo }: {
  logisticsSettlementId: string; settlementNo?: string;
  /** 以下为兼容旧调用保留。 */
  status?: string; canCreate?: boolean; canVoid?: boolean;
}) {
  return <InvoicePanel basePath={`/logistics-settlements/${logisticsSettlementId}`} target={{ logisticsSettlementId }} sourceType="FREIGHT" label={`物流结算单${settlementNo ? ` ${settlementNo}` : ''}`} />;
}
