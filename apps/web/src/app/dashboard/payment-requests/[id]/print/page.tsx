'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface Approval { id: string; nodeName: string; step: number; round: number; status: string; comment?: string | null; actedAt?: string | null; assignee: { name: string }; actedBy?: { name: string } | null }
interface PaymentRequest {
  id: string; requestNo: string; status: string; businessType: string; paymentStage: string; paymentMethod: string; amount: string;
  requestedPayDate?: string | null; ourBankAccount?: string | null; counterpartyBankAccount?: string | null; actualPayeeName?: string | null;
  isThirdParty: boolean; thirdPartyReason?: string | null; purpose?: string | null; remarks?: string | null; createdAt: string; submittedAt?: string | null; approvedAt?: string | null;
  contract: { contractNo: string; title: string }; settlement?: { settlementNo: string } | null; relatedTransaction?: { transactionNo: string } | null;
  businessUnit?: { name: string } | null; legalEntity: { name: string }; counterparty: { name: string };
  creator: { name: string }; submitter?: { name: string } | null; approver?: { name: string } | null;
  fundTransaction?: { transactionNo: string } | null; approvals?: Approval[];
  attachments?: Array<{ id: string; originalName: string; category: string }>;
}

const STATUS: Record<string, string> = { APPROVED: '已审批', PAID: '已创建付款单', DRAFT: '草稿', PENDING_APPROVAL: '待审批', REJECTED: '已驳回', VOIDED: '已作废' };
const STAGE: Record<string, string> = { ADVANCE: '预付款', PROGRESS: '阶段款', SETTLEMENT: '结算款', FINAL: '尾款', GUARANTEE: '保证金', REFUND: '客户退款', GUARANTEE_RETURN: '退还客户保证金', OTHER: '其他付款' };
const METHOD: Record<string, string> = { BANK_TRANSFER: '银行转账', BANK_ACCEPTANCE: '银行承兑', COMMERCIAL_ACCEPTANCE: '商业承兑', LETTER_OF_CREDIT: '信用证', FUNDING_PAYMENT: '融资支付', CASH: '现金', OTHER: '其他' };
const money = (value: string | number | null | undefined) => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (value?: string | null) => value ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) : '—';

export default function PaymentRequestPrintPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<PaymentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [printedAt, setPrintedAt] = useState('');

  useEffect(() => {
    setPrintedAt(dateTime(new Date().toISOString()));
    api.get<PaymentRequest>(`/financial-settlements/payment-requests/${id}`).then(setItem).catch((reason: Error) => setError(reason.message || '付款申请加载失败')).finally(() => setLoading(false));
  }, [id]);

  const printable = !!item && ['APPROVED', 'PAID'].includes(item.status);
  const activeRound = item?.approvals?.reduce((max, approval) => Math.max(max, approval.round), 0) || 0;
  const approvals = useMemo(() => item?.approvals?.filter((approval) => approval.round === activeRound) || [], [item, activeRound]);
  const printDocument = async () => {
    if (!item || !printable) return;
    setPrinting(true);
    try { await api.post(`/financial-settlements/payment-requests/${item.id}/print`); setPrintedAt(dateTime(new Date().toISOString())); window.setTimeout(() => window.print(), 80); }
    catch (reason: any) { alert(reason.message || '打印准备失败'); }
    finally { setPrinting(false); }
  };

  if (loading) return <div className="rounded-lg border bg-background p-10 text-center text-muted-foreground">正在生成付款申请打印页面…</div>;
  if (error || !item) return <div className="space-y-4 rounded-lg border bg-background p-10 text-center"><p className="text-destructive">{error || '付款申请不存在'}</p><Button variant="outline" onClick={() => router.back()}>返回</Button></div>;

  return <div className="settlement-print-page -m-6 min-h-screen bg-slate-100 p-6">
    <div className="settlement-print-actions mx-auto mb-4 flex max-w-[1040px] items-center justify-between gap-3 rounded-lg border bg-white p-3 shadow-sm"><div className="flex items-center gap-3"><Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-1.5 h-4 w-4"/>返回</Button><div><div className="font-medium">付款申请单打印存档</div><div className="text-xs text-muted-foreground">审批完成后打印，由相关岗位签字并按公司制度归档</div></div></div><Button disabled={!printable || printing} onClick={() => void printDocument()}><Printer className="mr-1.5 h-4 w-4"/>{printing ? '正在准备…' : '打印存档'}</Button></div>
    {!printable && <div className="settlement-print-actions mx-auto mb-4 max-w-[1040px] rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">付款申请审批完成后才能打印存档。</div>}

    <article className="settlement-print-paper mx-auto max-w-[1040px] bg-white px-10 py-9 text-slate-950 shadow-lg">
      <header className="border-b-2 border-slate-900 pb-5 text-center"><div className="text-xs tracking-[0.35em] text-slate-500">RICSE · 区域产业链服务生态</div><h1 className="mt-3 text-3xl font-bold tracking-[0.2em]">付款申请单</h1><div className="mt-3 text-sm">{item.businessType === 'PURCHASE' ? '采购业务付款' : '销售退款或保证金退回'} · {STATUS[item.status] || item.status}</div></header>

      <section className="mt-5 grid grid-cols-4 border-l border-t border-slate-900 text-[12px]"><Meta label="申请单号" value={item.requestNo}/><Meta label="申请日期" value={day(item.createdAt)}/><Meta label="计划付款日" value={day(item.requestedPayDate)}/><Meta label="业务单元" value={item.businessUnit?.name || '—'}/><Meta label="合同编号" value={item.contract.contractNo}/><Meta label="合同名称" value={item.contract.title} wide/><Meta label="关联结算/资金单" value={item.settlement?.settlementNo || item.relatedTransaction?.transactionNo || '预付款/暂未关联'} wide/></section>

      <section className="mt-6"><h2 className="mb-2 text-sm font-bold">一、付款申请内容</h2><div className="grid grid-cols-2 border-l border-t border-slate-900 text-[12px]"><Meta label="我方付款主体" value={item.legalEntity.name}/><Meta label="合同交易对手" value={item.counterparty.name}/><Meta label="实际收款方" value={item.actualPayeeName || item.counterparty.name}/><Meta label="是否第三方收款" value={item.isThirdParty ? '是' : '否'}/><Meta label="款项类型" value={STAGE[item.paymentStage] || item.paymentStage}/><Meta label="支付方式" value={METHOD[item.paymentMethod] || item.paymentMethod}/><Meta label="我方付款账户" value={item.ourBankAccount || '—'}/><Meta label="对方收款账户" value={item.counterpartyBankAccount || '—'}/><Meta label="付款用途" value={item.purpose || '—'} wide/><Meta label="第三方收款原因" value={item.thirdPartyReason || '—'} wide/><Meta label="备注" value={item.remarks || '—'} wide/></div></section>

      <section className="mt-5 border-2 border-slate-900 p-5"><div className="text-sm text-slate-500">申请付款金额（人民币）</div><div className="mt-2 flex items-end justify-between"><strong className="text-3xl">¥ {money(item.amount)}</strong><span className="text-sm">金额大写：{uppercaseMoney(item.amount)}</span></div></section>

      <section className="mt-6"><h2 className="mb-2 text-sm font-bold">二、审批记录</h2><table className="w-full border-collapse text-[11px]"><thead><tr className="bg-slate-100"><Th>审批顺序</Th><Th>审批节点</Th><Th>审批人</Th><Th>审批结果</Th><Th>审批意见</Th><Th>审批时间</Th></tr></thead><tbody>{approvals.length ? approvals.map((approval) => <tr key={approval.id}><Td center>第 {approval.step} 级</Td><Td>{approval.nodeName}</Td><Td>{approval.actedBy?.name || approval.assignee.name}</Td><Td center>{approval.status === 'APPROVED' || approval.status === 'OTHERS_APPROVED' ? '通过' : approval.status}</Td><Td>{approval.comment || '—'}</Td><Td>{dateTime(approval.actedAt)}</Td></tr>) : <tr><Td center colSpan={6}>暂无审批记录</Td></tr>}</tbody></table></section>

      <section className="mt-6"><h2 className="mb-2 text-sm font-bold">三、付款依据附件</h2><div className="min-h-16 border border-slate-900 p-3 text-[12px]">{item.attachments?.length ? item.attachments.map((attachment, index) => <div key={attachment.id}>{index + 1}. {attachment.originalName}</div>) : '无附件'}</div></section>

      <section className="mt-8 grid grid-cols-4 gap-4 text-[12px]"><Signature label="申请人" name={item.submitter?.name || item.creator.name}/><Signature label="风控/财务经理"/><Signature label="业务责任人"/><Signature label="总经理"/></section>
      <footer className="mt-10 flex justify-between border-t border-slate-400 pt-3 text-[10px] text-slate-500"><span>系统单号：{item.requestNo}</span><span>打印时间：{printedAt}</span><span>付款单：{item.fundTransaction?.transactionNo || '尚未创建'}</span></footer>
    </article>
    <style jsx global>{`
      @media print {
        @page { size: A4 portrait; margin: 10mm; }
        [data-app-sidebar], [data-dashboard-header], .settlement-print-actions { display: none !important; }
        body { background: #fff !important; }
        main { padding: 0 !important; }
        .settlement-print-page { margin: 0 !important; min-height: auto !important; padding: 0 !important; background: #fff !important; }
        .settlement-print-paper { width: 100% !important; max-width: none !important; padding: 0 !important; box-shadow: none !important; }
      }
    `}</style>
  </div>;
}

function Meta({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) { return <div className={`border-b border-r border-slate-900 p-2 ${wide ? 'col-span-2' : ''}`}><div className="text-[10px] text-slate-500">{label}</div><div className="mt-1 min-h-4 break-words">{value}</div></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="border border-slate-900 p-2 text-left font-semibold">{children}</th>; }
function Td({ children, center = false, colSpan }: { children: React.ReactNode; center?: boolean; colSpan?: number }) { return <td colSpan={colSpan} className={`border border-slate-900 p-2 ${center ? 'text-center' : ''}`}>{children}</td>; }
function Signature({ label, name }: { label: string; name?: string }) { return <div className="min-h-24 border border-slate-900 p-3"><div className="font-semibold">{label}</div><div className="mt-3">签字：{name || '________________'}</div><div className="mt-3">日期：________________</div></div>; }
function uppercaseMoney(value: string | number) { const amount = Number(value || 0); if (!Number.isFinite(amount)) return '零元整'; const cnNums = ['零','壹','贰','叁','肆','伍','陆','柒','捌','玖']; const units = ['','拾','佰','仟']; const sections = ['','万','亿','万亿']; const integer = Math.floor(Math.abs(amount)); const decimal = Math.round((Math.abs(amount) - integer) * 100); const sectionText = (section: number) => { let result = ''; let zero = false; for (let i = 0; i < 4 && section > 0; i += 1) { const digit = section % 10; result = digit ? `${cnNums[digit]}${units[i]}${zero ? '零' : ''}${result}` : result; zero = digit === 0 && result.length > 0; section = Math.floor(section / 10); } return result; }; let remaining = integer; let result = ''; let index = 0; while (remaining > 0) { const section = remaining % 10000; if (section) result = `${sectionText(section)}${sections[index]}${result}`; remaining = Math.floor(remaining / 10000); index += 1; } result = result || '零'; const jiao = Math.floor(decimal / 10); const fen = decimal % 10; return `${amount < 0 ? '负' : ''}${result}元${jiao ? `${cnNums[jiao]}角` : ''}${fen ? `${cnNums[fen]}分` : '整'}`; }
