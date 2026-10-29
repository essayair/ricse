'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { unitLabel } from '@/lib/unit';
import { Button } from '@/components/ui/button';

interface SettlementLine {
  id: string;
  orderNo?: string | null;
  orderName?: string | null;
  quantity?: string | null;
  unit?: string | null;
  unitPrice?: string | null;
  grossAmount: string;
  qualityDeductionAmount?: string;
  adjustmentAmount: string;
  totalAmount: string;
  remarks?: string | null;
  sourceSnapshot?: {
    waybillNo?: string; plateNo?: string; materialName?: string; ticketNo?: string; reportNo?: string;
    inboundDate?: string | null; grossWeight?: number | null; tareWeight?: number | null; netWeight?: number | null;
    measuredMoisturePct?: number | null; dryQuantity?: number | null; pricingQuantityBasis?: string;
  } | null;
}

interface Settlement {
  id: string;
  settlementNo: string;
  direction: 'RECEIVABLE' | 'PAYABLE';
  settlementScope: string;
  status: string;
  sourceNo?: string | null;
  grossAmount: string;
  qualityDeductionAmount?: string;
  adjustmentAmount: string;
  totalAmount: string;
  quantity?: string | null;
  remarks?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
  contract: { contractNo: string; title: string };
  legalEntity: { name: string };
  counterparty: { name: string };
  lines: SettlementLine[];
}

const number = (value: string | number | null | undefined, digits = 2) => value == null || value === ''
  ? '—' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const amount = (value: string | number | null | undefined) => number(value, 2);
const tons = (value: string | number | null | undefined) => value == null || value === ''
  ? '—' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const date = (value?: string | null) => value
  ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';
const signedAmount = (value: number) => `${value > 0 ? '+' : ''}${amount(value)}`;
const totalKnown = (lines: SettlementLine[], key: 'grossWeight' | 'tareWeight' | 'dryQuantity' | 'netWeight') => {
  if (!lines.length || lines.some(line => line.sourceSnapshot?.[key] == null)) return null;
  return lines.reduce((sum, line) => sum + Number(line.sourceSnapshot?.[key] || 0), 0);
};

export default function SettlementPrintPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Settlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Settlement>(`/financial-settlements/${id}`)
      .then(setItem)
      .catch((reason: Error) => setError(reason.message || '结算单加载失败'))
      .finally(() => setLoading(false));
  }, [id]);

  const printable = !!item && ['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'].includes(item.status);
  const printDocument = async () => {
    if (!item || !printable) return;
    setPrinting(true);
    try {
      await api.post(`/financial-settlements/${item.id}/print`);
      window.setTimeout(() => window.print(), 80);
    } catch (reason: any) {
      alert(reason.message || '打印准备失败');
    } finally {
      setPrinting(false);
    }
  };

  if (loading) return <div className="rounded-lg border bg-background p-10 text-center text-muted-foreground">正在生成结算单打印页面…</div>;
  if (error || !item) return <div className="space-y-4 rounded-lg border bg-background p-10 text-center"><p className="text-destructive">{error || '结算单不存在'}</p><Button variant="outline" onClick={() => router.back()}>返回</Button></div>;

  const supplier = item.direction === 'PAYABLE' ? item.counterparty : item.legalEntity;
  const purchaser = item.direction === 'PAYABLE' ? item.legalEntity : item.counterparty;
  const goodsPurchase = item.direction === 'PAYABLE' && item.settlementScope === 'GOODS' && item.lines.length > 0;
  const dryTotal = goodsPurchase ? totalKnown(item.lines, 'dryQuantity') : null;
  const grossTotal = goodsPurchase ? totalKnown(item.lines, 'grossWeight') : null;
  const tareTotal = goodsPurchase ? totalKnown(item.lines, 'tareWeight') : null;
  const netTotal = goodsPurchase ? totalKnown(item.lines, 'netWeight') : null;
  const settledTons = goodsPurchase && item.lines.every(line => line.quantity != null)
    ? item.lines.reduce((sum, line) => sum + Number(line.quantity), 0) : null;
  const dryBasis = goodsPurchase && item.lines.every(line => line.sourceSnapshot?.pricingQuantityBasis === 'DRY_MATTER');
  const dryDifference = dryBasis && dryTotal != null && settledTons != null
    ? Math.round((dryTotal - settledTons) * 1000) / 1000 : null;
  const uniquePrices = [...new Set(item.lines.map(line => line.unitPrice).filter(Boolean))];

  return <div className="settlement-print-page -m-6 min-h-screen bg-slate-100 p-6">
    <div className="settlement-print-actions mx-auto mb-4 flex max-w-[1120px] items-center justify-between gap-3 rounded-lg border bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3"><Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-1.5 h-4 w-4" />返回</Button><span className="text-sm text-muted-foreground">打印前请核对数量、价格及备注，交供需双方签字盖章</span></div>
      <Button disabled={!printable || printing} onClick={() => void printDocument()}><Printer className="mr-1.5 h-4 w-4" />{printing ? '正在准备…' : '打印结算单'}</Button>
    </div>
    {!printable && <div className="settlement-print-actions mx-auto mb-4 max-w-[1120px] rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{item.status === 'DRAFT' ? '草稿尚未确认，不能作为正式结算单打印。' : '该结算单已作废，不能打印。'}</div>}

    <article className="settlement-print-paper mx-auto bg-white text-black shadow-lg">
      <header className="text-center"><h1 className="text-[22px] font-bold tracking-[0.1em]">{item.direction === 'PAYABLE' ? `${purchaser.name}采购结算单` : `${supplier.name}销售结算单`}</h1></header>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]"><div>供方：{supplier.name}</div><div>需方：{purchaser.name}</div><div>合同编号：{item.contract.contractNo}</div><div>结算单号：{item.settlementNo}</div><div>结算日期：{date(item.confirmedAt || item.createdAt)}</div><div>合同名称：{item.contract.title}</div></div>

      {goodsPurchase ? <section className="mt-4">
        <table className="w-full border-collapse text-[10px] leading-tight">
          <colgroup>{[2.5, 7, 8, 14, 5, 6.5, 6.5, 6.5, 6.5, 7.5, 10, 8, 12].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
          <thead><tr><Th>序号</Th><Th>入库日期</Th><Th>车牌</Th><Th>货物</Th><Th>水分<br/>（%）</Th><Th>毛重<br/>（吨）</Th><Th>皮重<br/>（吨）</Th><Th>净重<br/>（吨）</Th><Th>干基<br/>（吨）</Th><Th>结算数量<br/>（吨）</Th><Th>含税单价<br/>（元/吨）</Th><Th>扣款/调整<br/>净额（元）</Th><Th>含税金额<br/>（元）</Th></tr></thead>
          <tbody>{item.lines.map((line, index) => {
            const source = line.sourceSnapshot;
            const adjustment = Number(line.adjustmentAmount || 0) - Number(line.qualityDeductionAmount || 0);
            return <tr key={line.id}><Td center>{index + 1}</Td><Td center>{date(source?.inboundDate)}</Td><Td center>{source?.plateNo || '—'}</Td><Td>{source?.materialName || '—'}</Td><Td right>{source?.measuredMoisturePct == null ? '—' : number(source.measuredMoisturePct, 2)}</Td><Td right>{tons(source?.grossWeight)}</Td><Td right>{tons(source?.tareWeight)}</Td><Td right>{tons(source?.netWeight)}</Td><Td right>{tons(source?.dryQuantity)}</Td><Td right>{tons(line.quantity)}</Td><Td right>{line.unitPrice == null ? '—' : Number(line.unitPrice).toFixed(4)}</Td><Td right>{adjustment ? signedAmount(adjustment) : '—'}</Td><Td right>{amount(line.totalAmount)}</Td></tr>;
          })}<tr className="font-bold"><Td center>合计</Td><Td colSpan={4} /><Td right>{tons(grossTotal)}</Td><Td right>{tons(tareTotal)}</Td><Td right>{tons(netTotal)}</Td><Td right>{tons(dryTotal)}</Td><Td right>{tons(settledTons)}</Td><Td right>{uniquePrices.length === 1 ? Number(uniquePrices[0]).toFixed(4) : '见明细'}</Td><Td right>{signedAmount(Number(item.adjustmentAmount || 0) - Number(item.qualityDeductionAmount || 0))}</Td><Td right>{amount(item.totalAmount)}</Td></tr></tbody>
        </table>
        <p className="mt-2 text-[10px]">净重＝毛重－皮重；干基＝净重×（1－实测水分）。干基为依据展示，实际结算数量以本单逐车确认值为准；扣款/调整净额＝其他加减项－质量扣款。</p>
        {dryDifference != null && Math.abs(dryDifference) > 0.001 && <p className="mt-1 text-[10px] font-semibold">逐车干基合计与结算数量相差 {tons(Math.abs(dryDifference))} 吨，具体处理以双方确认的备注为准。</p>}
      </section> : <section className="mt-4"><table className="w-full border-collapse text-[11px]"><thead><tr><Th>序号</Th><Th>执行批次 / 结算依据</Th><Th>数量</Th><Th>单价（元）</Th><Th>原金额（元）</Th><Th>质量扣款（元）</Th><Th>其他加减项（元）</Th><Th>结算金额（元）</Th><Th>备注</Th></tr></thead><tbody>{item.lines.length ? item.lines.map((line, index) => <tr key={line.id}><Td center>{index + 1}</Td><Td>{line.orderNo || item.sourceNo || item.contract.contractNo}{line.orderName ? ` · ${line.orderName}` : ''}</Td><Td right>{tons(line.quantity)} {line.unit ? unitLabel(line.unit) : ''}</Td><Td right>{line.unitPrice == null ? '—' : amount(line.unitPrice)}</Td><Td right>{amount(line.grossAmount)}</Td><Td right>{amount(line.qualityDeductionAmount)}</Td><Td right>{amount(line.adjustmentAmount)}</Td><Td right>{amount(line.totalAmount)}</Td><Td>{line.remarks || '—'}</Td></tr>) : <tr><Td center>1</Td><Td>{item.sourceNo || item.contract.contractNo}</Td><Td colSpan={2} /><Td right>{amount(item.grossAmount)}</Td><Td right>{amount(item.qualityDeductionAmount)}</Td><Td right>{amount(item.adjustmentAmount)}</Td><Td right>{amount(item.totalAmount)}</Td><Td>{item.remarks || '—'}</Td></tr>}</tbody></table></section>}

      <div className="mt-3 flex justify-end gap-6 border-b border-black pb-2 text-[12px]"><span>质量扣款：{amount(item.qualityDeductionAmount)} 元</span><span>其他加减项：{signedAmount(Number(item.adjustmentAmount || 0))} 元</span><strong>本次结算金额：{amount(item.totalAmount)} 元</strong></div>
      <div className="print-avoid mt-3 min-h-[36px] border border-black p-2 text-[11px]"><strong>备注／双方确认事项：</strong>{item.remarks || '　'}</div>
      {goodsPurchase && item.lines.some(line => line.remarks) && <div className="mt-2 text-[10px]">逐车说明：{item.lines.filter(line => line.remarks).map(line => `${line.sourceSnapshot?.plateNo || line.sourceSnapshot?.waybillNo || '车辆'}：${line.remarks}`).join('；')}</div>}
      <div className="print-avoid mt-5 grid grid-cols-2 gap-8 text-[11px]"><Signature title="供方确认" name={supplier.name} /><Signature title="需方确认" name={purchaser.name} /></div>
    </article>

    <style jsx global>{`
      .settlement-print-page { overflow-x: auto; }
      .settlement-print-paper { box-sizing: border-box; width: 297mm; max-width: 100%; min-height: 210mm; padding: 10mm; }
      .settlement-print-paper *, .settlement-print-paper *::before, .settlement-print-paper *::after { box-sizing: border-box; min-width: 0; }
      .settlement-print-paper table { table-layout: fixed; }
      .settlement-print-paper th, .settlement-print-paper td { overflow-wrap: anywhere; word-break: break-word; }
      @media print {
        @page { size: A4 landscape; margin: 8mm; }
        html, body { width: auto !important; min-width: 0 !important; margin: 0 !important; overflow: visible !important; background: #fff !important; }
        [data-app-sidebar], [data-dashboard-header], .settlement-print-actions { display: none !important; }
        [data-dashboard-shell] { width: auto !important; margin-left: 0 !important; min-height: auto !important; overflow: visible !important; }
        [data-dashboard-main] { width: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
        .settlement-print-page { width: auto !important; margin: 0 !important; min-height: auto !important; padding: 0 !important; overflow: visible !important; background: #fff !important; }
        .settlement-print-paper { width: 281mm !important; max-width: 281mm !important; min-height: 194mm !important; margin: 0 auto !important; padding: 0 !important; overflow: visible !important; box-shadow: none !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .settlement-print-paper thead { display: table-header-group; }
        .settlement-print-paper tr, .print-avoid { break-inside: avoid; page-break-inside: avoid; }
      }
    `}</style>
  </div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border border-black px-1 py-1 text-center font-bold">{children}</th>;
}

function Td({ children, center = false, right = false, colSpan }: { children?: React.ReactNode; center?: boolean; right?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} className={`border border-black px-1 py-1 align-middle ${center ? 'text-center' : ''} ${right ? 'text-right tabular-nums' : ''}`}>{children}</td>;
}

function Signature({ title, name }: { title: string; name: string }) {
  return <div className="min-h-[33mm]"><div className="font-semibold">{title}：{name}</div><div className="mt-4 flex justify-between"><span>经办人签字：____________</span><span>盖章（公章）：　　　　　　</span></div><div className="mt-4">日期：______年____月____日</div></div>;
}
