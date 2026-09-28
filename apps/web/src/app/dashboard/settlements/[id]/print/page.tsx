'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { unitLabel } from '@/lib/unit';
import { Button } from '@/components/ui/button';

interface BankAccount {
  accountName: string;
  accountNo: string;
  bankName: string;
  currency: string;
}

interface Party {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  bizAddress?: string | null;
  contactPerson?: string | null;
  contactPhone?: string | null;
  bankAccounts?: BankAccount[];
}

interface SettlementLine {
  id: string;
  orderNo?: string | null;
  orderName?: string | null;
  quantity?: string | null;
  unit?: string | null;
  unitPrice?: string | null;
  grossAmount: string;
  adjustmentAmount: string;
  totalAmount: string;
  remarks?: string | null;
}

interface Allocation {
  id: string;
  amount: string;
  createdAt: string;
  reversedAt?: string | null;
  fundTransaction: {
    transactionNo: string;
    paymentStage: string;
    paymentMethod: string;
    occurredAt: string;
    bankReference?: string | null;
  };
  creator: { name: string };
}

interface Settlement {
  id: string;
  settlementNo: string;
  direction: 'RECEIVABLE' | 'PAYABLE';
  sourceNo?: string | null;
  settlementScope: string;
  stageName?: string | null;
  status: string;
  grossAmount: string;
  adjustmentAmount: string;
  totalAmount: string;
  settledAmount: string;
  dueDate?: string | null;
  remarks?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
  contract: { contractNo: string; title: string; type: string };
  businessUnit?: { code: string; name: string } | null;
  legalEntity: Party;
  counterparty: Party;
  creator: { name: string };
  confirmer?: { name: string } | null;
  lines: SettlementLine[];
  allocations: Allocation[];
}

const STATUS: Record<string, string> = {
  CONFIRMED: '已确认', PARTIALLY_SETTLED: '部分结清', SETTLED: '已结清', DRAFT: '草稿', VOIDED: '已作废',
};
const SCOPE: Record<string, string> = {
  BATCH: '执行批次结算', CONTRACT_STAGE: '合同阶段结算', CONTRACT_FINAL: '合同最终结算', ADJUSTMENT: '调整结算',
};
const STAGE: Record<string, string> = {
  ADVANCE: '预收预付款', PROGRESS: '阶段款', SETTLEMENT: '结算款', FINAL: '尾款', OTHER: '其他款项',
};
const METHOD: Record<string, string> = {
  BANK_TRANSFER: '银行转账', BANK_ACCEPTANCE: '银行承兑', COMMERCIAL_ACCEPTANCE: '商业承兑',
  LETTER_OF_CREDIT: '信用证', FUNDING_PAYMENT: '融资支付', CASH: '现金', OTHER: '其他',
};

const money = (value: string | number | null | undefined) => Number(value || 0).toLocaleString('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const day = (value?: string | null) => value ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) : '—';

function uppercaseMoney(value: string | number) {
  const amount = Number(value || 0);
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const fractionUnits = ['角', '分'];
  const units = [['元', '万', '亿', '万亿'], ['', '拾', '佰', '仟']];
  let remaining = Math.abs(amount);
  let result = '';
  for (let index = 0; index < fractionUnits.length; index += 1) {
    result += `${digits[Math.floor(remaining * 10 * (10 ** index)) % 10]}${fractionUnits[index]}`.replace(/零./, '');
  }
  result = result || '整';
  remaining = Math.floor(remaining);
  for (let sectionIndex = 0; sectionIndex < units[0].length && remaining > 0; sectionIndex += 1) {
    let section = '';
    for (let unitIndex = 0; unitIndex < units[1].length && remaining > 0; unitIndex += 1) {
      section = `${digits[remaining % 10]}${units[1][unitIndex]}${section}`;
      remaining = Math.floor(remaining / 10);
    }
    result = `${section.replace(/(零.)*零$/, '').replace(/^$/, '零')}${units[0][sectionIndex]}${result}`;
  }
  const normalized = result
    .replace(/(零.)*零元/, '元')
    .replace(/(零.)+/g, '零')
    .replace(/^整$/, '零元整');
  return `${amount < 0 ? '负' : ''}${normalized}`;
}

function partyAddress(party: Party) {
  return party.bizAddress || party.address || '—';
}

function PartyBox({ title, party }: { title: string; party: Party }) {
  const bank = party.bankAccounts?.[0];
  return <div className="print-avoid min-h-[190px] border border-slate-900 p-4">
    <h3 className="border-b border-slate-400 pb-2 text-base font-bold">{title}</h3>
    <dl className="mt-3 grid grid-cols-[72px_1fr] gap-x-2 gap-y-2 text-[12px] leading-5">
      <dt className="text-slate-500">单位名称</dt><dd>{party.name}</dd>
      <dt className="text-slate-500">联系地址</dt><dd>{partyAddress(party)}</dd>
      <dt className="text-slate-500">联系人</dt><dd>{party.contactPerson || '—'}{party.contactPhone ? ` / ${party.contactPhone}` : ''}</dd>
      <dt className="text-slate-500">开户银行</dt><dd>{bank?.bankName || '—'}</dd>
      <dt className="text-slate-500">银行账号</dt><dd className="break-all font-mono">{bank?.accountNo || '—'}</dd>
    </dl>
    <div className="mt-5 flex items-end justify-between text-[12px]"><span>经办人签字：________________</span><span>盖章：</span></div>
  </div>;
}

export default function SettlementPrintPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Settlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [printedAt, setPrintedAt] = useState('');

  useEffect(() => {
    setPrintedAt(dateTime(new Date().toISOString()));
    api.get<Settlement>(`/financial-settlements/${id}`)
      .then(setItem)
      .catch((reason: Error) => setError(reason.message || '结算单加载失败'))
      .finally(() => setLoading(false));
  }, [id]);

  const validAllocations = useMemo(() => item?.allocations.filter((entry) => !entry.reversedAt) || [], [item]);
  const supplier = item?.direction === 'PAYABLE' ? item.counterparty : item?.legalEntity;
  const purchaser = item?.direction === 'PAYABLE' ? item.legalEntity : item?.counterparty;
  const printable = !!item && ['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'].includes(item.status);

  const printDocument = async () => {
    if (!item || !printable) return;
    setPrinting(true);
    try {
      await api.post(`/financial-settlements/${item.id}/print`);
      setPrintedAt(dateTime(new Date().toISOString()));
      window.setTimeout(() => window.print(), 80);
    } catch (reason: any) {
      alert(reason.message || '打印准备失败');
    } finally {
      setPrinting(false);
    }
  };

  if (loading) return <div className="rounded-lg border bg-background p-10 text-center text-muted-foreground">正在生成结算单打印页面…</div>;
  if (error || !item || !supplier || !purchaser) return <div className="space-y-4 rounded-lg border bg-background p-10 text-center"><p className="text-destructive">{error || '结算单不存在'}</p><Button variant="outline" onClick={() => router.back()}>返回</Button></div>;

  return <div className="settlement-print-page -m-6 min-h-screen bg-slate-100 p-6">
    <div className="settlement-print-actions mx-auto mb-4 flex max-w-[1040px] items-center justify-between gap-3 rounded-lg border bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3"><Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-1.5 h-4 w-4" />返回</Button><div><div className="font-medium">结算单打印存档</div><div className="text-xs text-muted-foreground">请核对单据内容后打印、签字盖章并按公司制度归档</div></div></div>
      <Button disabled={!printable || printing} onClick={() => void printDocument()}><Printer className="mr-1.5 h-4 w-4" />{printing ? '正在准备…' : '打印存档'}</Button>
    </div>

    {!printable && <div className="settlement-print-actions mx-auto mb-4 max-w-[1040px] rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{item.status === 'DRAFT' ? '该结算单尚未确认，不能作为正式单据打印存档。' : '该结算单已作废，不能打印存档。'}</div>}

    <article className="settlement-print-paper mx-auto max-w-[1040px] bg-white px-10 py-9 text-slate-950 shadow-lg">
      <header className="border-b-2 border-slate-900 pb-5 text-center">
        <div className="text-xs tracking-[0.35em] text-slate-500">RICSE · 区域产业链服务生态</div>
        <h1 className="mt-3 text-3xl font-bold tracking-[0.18em]">业务确认及结算单</h1>
        <div className="mt-3 text-sm">{item.direction === 'PAYABLE' ? '采购应付结算' : '销售应收结算'} · {STATUS[item.status] || item.status}</div>
      </header>

      <section className="print-avoid mt-5 grid grid-cols-4 border-l border-t border-slate-900 text-[12px]">
        <Meta label="供应方" value={supplier.name} wide />
        <Meta label="采购方" value={purchaser.name} wide />
        <Meta label="结算单号" value={item.settlementNo} />
        <Meta label="合同编号" value={item.contract.contractNo} />
        <Meta label="结算口径" value={`${SCOPE[item.settlementScope] || item.settlementScope}${item.stageName ? ` / ${item.stageName}` : ''}`} />
        <Meta label={item.direction === 'PAYABLE' ? '付款到期日' : '收款到期日'} value={day(item.dueDate)} />
        <Meta label="业务单元" value={item.businessUnit ? `${item.businessUnit.code} · ${item.businessUnit.name}` : '—'} />
        <Meta label="确认日期" value={day(item.confirmedAt)} />
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold">一、结算明细</h2>
        <table className="w-full table-fixed border-collapse text-[11px]">
          <thead><tr className="bg-slate-100">
            <Th className="w-10">序号</Th><Th className="w-40">执行批次 / 来源</Th><Th>数量</Th><Th>单价（元）</Th><Th>原金额（元）</Th><Th>加减项（元）</Th><Th>结算金额（元）</Th><Th className="w-32">调整原因 / 备注</Th>
          </tr></thead>
          <tbody>{item.lines.length ? item.lines.map((line, index) => <tr key={line.id}>
            <Td center>{index + 1}</Td><Td>{line.orderNo || item.sourceNo || '—'}<div className="text-[10px] text-slate-500">{line.orderName || ''}</div></Td><Td right>{line.quantity || '—'} {line.unit ? unitLabel(line.unit) : ''}</Td><Td right>{line.unitPrice ? money(line.unitPrice) : '—'}</Td><Td right>{money(line.grossAmount)}</Td><Td right>{money(line.adjustmentAmount)}</Td><Td right strong>{money(line.totalAmount)}</Td><Td>{line.remarks || '—'}</Td>
          </tr>) : <tr><Td center>1</Td><Td>{item.sourceNo || item.contract.contractNo}</Td><Td center colSpan={2}>{SCOPE[item.settlementScope] || item.settlementScope}</Td><Td right>{money(item.grossAmount)}</Td><Td right>{money(item.adjustmentAmount)}</Td><Td right strong>{money(item.totalAmount)}</Td><Td>{item.remarks || '—'}</Td></tr>}</tbody>
        </table>
      </section>

      <section className="print-avoid mt-4 border-2 border-slate-900 p-4">
        <div className="grid grid-cols-3 gap-4 text-[12px]">
          <Total label="结算原金额" value={`¥ ${money(item.grossAmount)}`} />
          <Total label="价格 / 质量等加减项" value={`¥ ${money(item.adjustmentAmount)}`} />
          <Total label="本单结算金额" value={`¥ ${money(item.totalAmount)}`} emphasis />
        </div>
        <div className="mt-4 border-t border-slate-400 pt-3 text-sm"><span className="text-slate-500">人民币大写：</span><strong>{uppercaseMoney(item.totalAmount)}</strong></div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold">二、资金核销情况</h2>
        {validAllocations.length ? <table className="w-full table-fixed border-collapse text-[11px]"><thead><tr className="bg-slate-100"><Th>资金流水号</Th><Th>款项类型</Th><Th>收付方式</Th><Th>实际收付日期</Th><Th>本次核销金额（元）</Th><Th>经办人</Th></tr></thead><tbody>{validAllocations.map((entry) => <tr key={entry.id}><Td>{entry.fundTransaction.transactionNo}</Td><Td>{STAGE[entry.fundTransaction.paymentStage] || entry.fundTransaction.paymentStage}</Td><Td>{METHOD[entry.fundTransaction.paymentMethod] || entry.fundTransaction.paymentMethod}</Td><Td center>{day(entry.fundTransaction.occurredAt)}</Td><Td right strong>{money(entry.amount)}</Td><Td center>{entry.creator.name}</Td></tr>)}</tbody></table> : <div className="border border-slate-900 p-4 text-center text-[12px] text-slate-500">暂未发生资金核销；本结算单仍可先行打印确认并归档。</div>}
        <div className="mt-2 flex justify-end gap-8 text-[12px]"><span>累计已核销：¥ {money(item.settledAmount)}</span><strong>未结金额：¥ {money(Number(item.totalAmount) - Number(item.settledAmount))}</strong></div>
      </section>

      <section className="print-avoid mt-6">
        <h2 className="mb-2 text-sm font-bold">三、系统确认信息</h2>
        <div className="grid grid-cols-3 border-l border-t border-slate-900 text-[12px]"><Meta label="制单人" value={item.creator.name} /><Meta label="确认人" value={item.confirmer?.name || '—'} /><Meta label="确认时间" value={dateTime(item.confirmedAt)} /></div>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-5"><PartyBox title="供应方确认" party={supplier} /><PartyBox title="采购方确认" party={purchaser} /></section>

      <section className="print-avoid mt-5 border border-slate-900 p-4 text-[12px] leading-6">
        <div><strong>备注：</strong>{item.remarks || '无'}</div>
        <div className="mt-1 text-slate-600">本单由系统已确认结算数据生成。双方签字盖章及纸质/电子归档方式，按合同约定与公司档案制度执行。</div>
      </section>

      <footer className="mt-5 flex justify-between border-t border-slate-300 pt-3 text-[10px] text-slate-500"><span>单据编号：{item.settlementNo}</span><span>打印时间：{printedAt || '—'}</span></footer>
    </article>

    <style jsx global>{`
      @media print {
        @page { size: A4 portrait; margin: 9mm; }
        html, body { background: #fff !important; }
        [data-app-sidebar], [data-dashboard-header], .settlement-print-actions { display: none !important; }
        [data-dashboard-shell] { margin-left: 0 !important; min-height: auto !important; }
        [data-dashboard-main] { padding: 0 !important; }
        .settlement-print-page { margin: 0 !important; min-height: auto !important; padding: 0 !important; background: #fff !important; }
        .settlement-print-paper { width: 100% !important; max-width: none !important; padding: 0 !important; box-shadow: none !important; }
        .print-avoid, table, tr { break-inside: avoid; page-break-inside: avoid; }
      }
    `}</style>
  </div>;
}

function Meta({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`grid min-h-11 grid-cols-[88px_1fr] border-b border-r border-slate-900 ${wide ? 'col-span-2' : ''}`}><div className="flex items-center bg-slate-100 px-2 font-medium">{label}</div><div className="flex items-center break-words px-2">{value}</div></div>;
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`border border-slate-900 px-2 py-2 text-center font-bold ${className}`}>{children}</th>;
}

function Td({ children, center = false, right = false, strong = false, colSpan }: { children: React.ReactNode; center?: boolean; right?: boolean; strong?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} className={`border border-slate-900 px-2 py-2 align-top ${center ? 'text-center' : ''} ${right ? 'text-right' : ''} ${strong ? 'font-bold' : ''}`}>{children}</td>;
}

function Total({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div><div className="text-slate-500">{label}</div><div className={`mt-1 ${emphasis ? 'text-lg font-bold' : 'font-medium'}`}>{value}</div></div>;
}
