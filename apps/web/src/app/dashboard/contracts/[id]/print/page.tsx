'use client';

import { attachmentCategoryLabel } from '@/lib/attachment-file';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { settlementMethodLabel } from '@/lib/contract-settlement';
import { unitLabel } from '@/lib/unit';

interface Approval {
  id: string;
  nodeName: string;
  roleName?: string | null;
  approvalMode: string;
  step: number;
  round: number;
  status: string;
  comment?: string | null;
  actedAt?: string | null;
  createdAt: string;
  assignee: { name: string };
  actedBy?: { name: string } | null;
}

interface ContractPrintDetail {
  id: string;
  contractNo: string;
  externalNo?: string | null;
  title: string;
  type: string;
  status: string;
  totalAmount: string;
  contactPerson?: string | null;
  contactPhone?: string | null;
  pricingType?: string | null;
  overfillPct?: string | null;
  shortfallPct?: string | null;
  deliveryMethod?: string | null;
  deliveryLocation?: string | null;
  signedAt?: string | null;
  effectiveAt?: string | null;
  expireAt?: string | null;
  settlementMethod?: string | null;
  settlementBasis?: string | null;
  prepayPct?: string | null;
  paymentDays?: number | null;
  paymentMethod?: string | null;
  moistureRule?: string | null;
  impurityRule?: string | null;
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
  creator: { name: string };
  businessUnit?: { code: string; name: string } | null;
  department?: { name: string } | null;
  signingPartner?: { code: string; name: string } | null;
  company?: { code: string; name: string } | null;
  seller?: { code: string; name: string } | null;
  buyer?: { code: string; name: string } | null;
  lineItems: Array<{
    id: string;
    materialName?: string | null;
    quantity: string;
    unit: string;
    unitPrice: string;
    totalPrice: string;
    salesUnitPrice?: string | null;
    salesTotalPrice?: string | null;
    remarks?: string | null;
    qualityRulesSnapshot?: any;
  }>;
  approvals?: Approval[];
  attachments?: Array<{ id: string; originalName: string; category: string; size: number; createdAt?: string }>;
}

const STATUS: Record<string, string> = {
  DRAFT: '草稿', PENDING_APPROVAL: '审批中', APPROVED: '审批通过', REJECTED: '已驳回',
  EXECUTING: '执行中', COMPLETED: '已完成', CLOSED: '已关闭', VOIDED: '已作废',
};
const TYPE: Record<string, string> = { PURCHASE: '采购合同', SALES: '销售合同', BILATERAL: '双边合同' };
const PRICING: Record<string, string> = { FIXED: '一口价', BASIS: '基差定价', FLOATING: '不定价' };
const BASIS: Record<string, string> = { WEIGHT: '地磅净重', QUALITY: '质检干重', CONTRACT: '合同量' };
const APPROVAL_STATUS: Record<string, string> = {
  PENDING: '待审批', APPROVED: '已通过', REJECTED: '已驳回',
  OTHERS_APPROVED: '他人已审批', OTHERS_REJECTED: '他人已驳回', CANCELLED: '已取消',
};
const APPROVAL_MODE: Record<string, string> = { ANY: '或签', ALL: '会签' };

const money = (value: string | number | null | undefined) => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (value?: string | null) => value ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' }) : '—';
const partnerText = (partner?: { code: string; name: string } | null) => partner ? `${partner.code} ${partner.name}` : '—';

export default function ContractPrintPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ContractPrintDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [printedAt, setPrintedAt] = useState('');

  useEffect(() => {
    setPrintedAt(dateTime(new Date().toISOString()));
    api.get<ContractPrintDetail>(`/contracts/${id}`)
      .then(setItem)
      .catch((reason: Error) => setError(reason.message || '合同加载失败'))
      .finally(() => setLoading(false));
  }, [id]);

  const approvals = useMemo(() => [...(item?.approvals || [])].sort((left, right) => left.round - right.round || left.step - right.step), [item]);
  const salesAmount = useMemo(() => item?.lineItems.reduce((sum, line) => sum + Number(line.salesTotalPrice || 0), 0) || 0, [item]);

  const printDocument = async () => {
    if (!item) return;
    setPrinting(true);
    try {
      await api.post(`/contracts/${item.id}/print`);
      setPrintedAt(dateTime(new Date().toISOString()));
      window.setTimeout(() => window.print(), 80);
    } catch (reason: any) {
      alert(reason.message || '打印准备失败');
    } finally {
      setPrinting(false);
    }
  };

  if (loading) return <div className="rounded-lg border bg-background p-10 text-center text-muted-foreground">正在生成合同打印页面…</div>;
  if (error || !item) return <div className="space-y-4 rounded-lg border bg-background p-10 text-center"><p className="text-destructive">{error || '合同不存在'}</p><Button variant="outline" onClick={() => router.back()}>返回</Button></div>;

  const internalParty = item.signingPartner || item.company;
  const statusText = STATUS[item.status] || item.status;
  const isDraftLike = ['DRAFT', 'PENDING_APPROVAL', 'REJECTED'].includes(item.status);

  return <div className="contract-print-page -m-6 min-h-screen bg-slate-100 p-6">
    <div className="contract-print-actions mx-auto mb-4 flex max-w-[1040px] items-center justify-between gap-3 rounded-lg border bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="mr-1.5 h-4 w-4" />返回</Button>
        <div><div className="font-medium">合同信息及审批流打印存档</div><div className="text-xs text-muted-foreground">合同创建后即可打印；审批完成后打印件将包含完整审批记录</div></div>
      </div>
      <Button disabled={printing} onClick={() => void printDocument()}><Printer className="mr-1.5 h-4 w-4" />{printing ? '正在准备…' : '打印存档'}</Button>
    </div>
    {isDraftLike && <div className="contract-print-actions mx-auto mb-4 max-w-[1040px] rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">当前合同状态为“{statusText}”，打印件仅反映当前信息和审批进度，不代表合同已审批生效。</div>}

    <article className="contract-print-paper relative mx-auto bg-white text-slate-950 shadow-lg">
      {item.status === 'VOIDED' && <div className="contract-print-watermark">已作废</div>}
      {item.status === 'DRAFT' && <div className="contract-print-watermark">草稿</div>}
      <header className="border-b-2 border-slate-900 pb-5 text-center">
        <div className="text-xs tracking-[0.35em] text-slate-500">RICSE — 和光云链区域产业链服务生态</div>
        <h1 className="mt-3 text-3xl font-bold tracking-[0.14em]">合同信息及审批流存档单</h1>
        <div className="mt-3 text-sm">{TYPE[item.type] || item.type} · {statusText}</div>
      </header>

      <section className="mt-5 grid grid-cols-4 border-l border-t border-slate-900 text-[11px]">
        <Meta label="合同编号" value={item.contractNo} />
        <Meta label="外部合同号" value={item.externalNo || '—'} />
        <Meta label="合同状态" value={statusText} />
        <Meta label="创建时间" value={dateTime(item.createdAt)} />
        <Meta label="合同标题" value={item.title} span={4} />
        <Meta label="业务单元（事业部）" value={item.businessUnit ? `${item.businessUnit.code} ${item.businessUnit.name}` : '—'} span={2} />
        <Meta label="业务部门" value={item.department?.name || '—'} />
        <Meta label="创建人" value={item.creator?.name || '—'} />
      </section>

      <PrintSection title="一、合同主体与基本信息">
        <div className="grid grid-cols-2 border-l border-t border-slate-900 text-[11px]">
          <Meta label="我方签约主体（内部）" value={partnerText(internalParty)} span={2} />
          <Meta label={item.type === 'PURCHASE' ? '交易对手方（供应商）' : item.type === 'SALES' ? '交易对手方（客户）' : '上游交易对手方（供应商）'} value={partnerText(item.seller)} />
          <Meta label={item.type === 'BILATERAL' ? '下游交易对手方（客户）' : '联系人及电话'} value={item.type === 'BILATERAL' ? partnerText(item.buyer) : `${item.contactPerson || '—'}${item.contactPhone ? ` / ${item.contactPhone}` : ''}`} />
          {item.type === 'BILATERAL' && <Meta label="联系人及电话" value={`${item.contactPerson || '—'}${item.contactPhone ? ` / ${item.contactPhone}` : ''}`} span={2} />}
          <Meta label="签订日期" value={day(item.signedAt)} />
          <Meta label="生效日期" value={day(item.effectiveAt)} />
          <Meta label="到期日期" value={day(item.expireAt)} />
          <Meta label="定价类型" value={PRICING[item.pricingType || ''] || item.pricingType || '—'} />
          <Meta label="交货方式" value={item.deliveryMethod || '—'} />
          <Meta label="交货地点" value={item.deliveryLocation || '—'} />
          <Meta label="溢装 / 短装" value={`${item.overfillPct ?? '—'}% / ${item.shortfallPct ?? '—'}%`} />
          <Meta label="最后修改时间" value={dateTime(item.updatedAt)} />
        </div>
      </PrintSection>

      <PrintSection title="二、货物与价格">
        <table className="w-full border-collapse text-[10px]">
          <thead><tr className="bg-slate-100"><Th>序号</Th><Th>物料</Th><Th>数量</Th><Th>{item.type === 'SALES' ? '销售单价' : '采购单价'}</Th>{item.type === 'BILATERAL' && <Th>销售单价</Th>}<Th>小计</Th>{item.type === 'BILATERAL' && <Th>销售小计</Th>}<Th>备注</Th></tr></thead>
          <tbody>{item.lineItems.length ? item.lineItems.map((line, index) => <tr key={line.id}><Td center>{index + 1}</Td><Td>{line.materialName || '—'}</Td><Td>{Number(line.quantity).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} {unitLabel(line.unit)}</Td><Td>¥{money(line.unitPrice)}</Td>{item.type === 'BILATERAL' && <Td>{line.salesUnitPrice == null ? '—' : `¥${money(line.salesUnitPrice)}`}</Td>}<Td>¥{money(line.totalPrice)}</Td>{item.type === 'BILATERAL' && <Td>{line.salesTotalPrice == null ? '—' : `¥${money(line.salesTotalPrice)}`}</Td>}<Td>{line.remarks || '—'}</Td></tr>) : <tr><Td center colSpan={item.type === 'BILATERAL' ? 8 : 6}>暂无货物明细</Td></tr>}</tbody>
        </table>
        <div className="mt-2 flex justify-end gap-8 border border-t-0 border-slate-900 p-2 text-[11px] font-semibold"><span>{item.type === 'BILATERAL' ? '采购总额' : '合同总额'}：¥{money(item.totalAmount)}</span>{item.type === 'BILATERAL' && <span>销售总额：¥{money(salesAmount)}</span>}</div>
      </PrintSection>

      <PrintSection title="三、结算与质量条款">
        <div className="grid grid-cols-3 border-l border-t border-slate-900 text-[11px]">
          <Meta label="结算依据" value={BASIS[item.settlementBasis || ''] || '合同量'} />
          <Meta label="结算方式" value={settlementMethodLabel(item.settlementMethod || '')} />
          <Meta label="预付比例" value={item.prepayPct == null ? '—' : `${item.prepayPct}%`} />
          <Meta label="尾款账期" value={item.paymentDays == null ? '—' : `${item.paymentDays} 天`} />
          <Meta label="付款方式" value={item.paymentMethod || '—'} />
          <Meta label="合同备注" value={item.remarks || '—'} span={2} />
        </div>
        {item.lineItems.filter(line => line.qualityRulesSnapshot?.items?.length).map((line, index) => <div key={line.id} className="mt-3"><div className="mb-1 text-[11px] font-semibold">{index + 1}. {line.materialName || '合同物料'}质量结算规则（{line.qualityRulesSnapshot.templateName || '质检模板'} V{line.qualityRulesSnapshot.templateVersion || 1}）</div><table className="w-full border-collapse text-[9px]"><thead><tr className="bg-slate-100"><Th>检测指标 / 合同标准</Th><Th>扣款方式</Th><Th>扣款标准</Th><Th>拒收条件</Th></tr></thead><tbody>{line.qualityRulesSnapshot.items.map((rule: any, ruleIndex: number) => <tr key={`${rule.code}-${ruleIndex}`}><Td>{rule.symbol || rule.name} {rule.operator} {rule.standardValue}{rule.operator === 'RANGE' ? `–${rule.upperValue}` : ''} {rule.unit}</Td><Td>{rule.deductionMode === 'PER_STEP' ? `每 ${rule.deductionStep} 偏差` : rule.deductionMode === 'FLAT' ? (rule.deductionCondition === 'IN_RANGE' ? `区间 ${rule.deductionLowerValue}-${rule.deductionUpperValue}` : '固定扣款') : '按标准验收'}</Td><Td>{rule.deductionMode === 'NONE' ? '—' : `${rule.deductionAmount ?? '—'} 元/吨`}</Td><Td>{rule.rejectOperator && rule.rejectOperator !== 'NONE' ? `${rule.rejectOperator} ${rule.rejectValue}` : '未设置'}</Td></tr>)}</tbody></table></div>)}
        {!item.lineItems.some(line => line.qualityRulesSnapshot?.items?.length) && <p className="mt-2 text-[10px]">未配置结构化质量结算规则；存量合同按原合同约定处理。</p>}
      </PrintSection>

      <PrintSection title="四、审批流程">
        <table className="w-full border-collapse text-[10px]">
          <thead><tr className="bg-slate-100"><Th>轮次 / 顺序</Th><Th>审批节点</Th><Th>审批角色</Th><Th>审批方式</Th><Th>审批人</Th><Th>处理结果</Th><Th>审批意见</Th><Th>处理时间</Th></tr></thead>
          <tbody>{approvals.length ? approvals.map((approval) => <tr key={approval.id}><Td center>第 {approval.round} 轮 / {approval.step} 级</Td><Td>{approval.nodeName || '合同审批'}</Td><Td>{approval.roleName || '—'}</Td><Td center>{APPROVAL_MODE[approval.approvalMode] || approval.approvalMode || '—'}</Td><Td>{approval.actedBy?.name || approval.assignee?.name || '—'}</Td><Td center>{APPROVAL_STATUS[approval.status] || approval.status}</Td><Td>{approval.comment || '—'}</Td><Td>{dateTime(approval.actedAt)}</Td></tr>) : <tr><Td center colSpan={8}>合同尚未发起审批</Td></tr>}</tbody>
        </table>
      </PrintSection>

      <PrintSection title="五、合同附件清单">
        <div className="min-h-14 border border-slate-900 p-3 text-[11px]">{item.attachments?.length ? item.attachments.map((attachment, index) => <div key={attachment.id}>{index + 1}. {attachment.originalName}（{attachmentCategoryLabel(attachment.category)}，{Math.max(1, Math.round(attachment.size / 1024))} KB）</div>) : '无附件'}</div>
      </PrintSection>

      <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-slate-400 pt-3 text-[10px] text-slate-500"><span>系统合同编号：{item.contractNo}</span><span>打印状态：{statusText}</span><span>打印时间：{printedAt}</span></footer>
    </article>

    <style jsx global>{`
      .contract-print-page { overflow-x: auto; }
      .contract-print-actions { width: min(210mm, 100%); }
      .contract-print-paper { box-sizing: border-box; width: 210mm; max-width: 100%; min-height: 297mm; padding: 10mm; }
      .contract-print-paper *, .contract-print-paper *::before, .contract-print-paper *::after { box-sizing: border-box; min-width: 0; }
      .contract-print-paper table { width: 100%; table-layout: fixed; }
      .contract-print-paper th, .contract-print-paper td { overflow-wrap: anywhere; word-break: break-word; }
      .contract-print-watermark { position: absolute; top: 48%; left: 50%; z-index: 0; transform: translate(-50%, -50%) rotate(-28deg); color: rgba(148, 163, 184, .15); font-size: 84px; font-weight: 800; letter-spacing: .25em; pointer-events: none; }
      .contract-print-paper > *:not(.contract-print-watermark) { position: relative; z-index: 1; }
      @media print {
        @page { size: A4 portrait; margin: 10mm; }
        html, body { width: auto !important; min-width: 0 !important; margin: 0 !important; overflow: visible !important; background: #fff !important; }
        [data-app-sidebar], [data-dashboard-header], .contract-print-actions { display: none !important; }
        [data-dashboard-shell] { width: auto !important; margin-left: 0 !important; min-height: auto !important; overflow: visible !important; }
        [data-dashboard-main] { width: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
        .contract-print-page { width: auto !important; margin: 0 !important; min-height: auto !important; padding: 0 !important; overflow: visible !important; background: #fff !important; }
        .contract-print-paper { width: 190mm !important; max-width: 190mm !important; min-height: 277mm !important; margin: 0 auto !important; padding: 0 !important; overflow: visible !important; box-shadow: none !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .contract-print-paper thead { display: table-header-group; }
        .contract-print-paper tfoot { display: table-footer-group; }
        .contract-print-paper tr, .print-avoid { break-inside: avoid; page-break-inside: avoid; }
      }
    `}</style>
  </div>;
}

function PrintSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mt-6"><h2 className="mb-2 text-sm font-bold">{title}</h2>{children}</section>; }
function Meta({ label, value, span }: { label: string; value: string; span?: 2 | 3 | 4 }) { const columnClass = span === 4 ? 'col-span-4' : span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : ''; return <div className={`min-w-0 border-b border-r border-slate-900 p-2 ${columnClass}`}><div className="text-[9px] text-slate-500">{label}</div><div className="mt-1 min-h-4 break-all">{value}</div></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="border border-slate-900 p-1.5 text-left font-semibold">{children}</th>; }
function Td({ children, center = false, colSpan }: { children: React.ReactNode; center?: boolean; colSpan?: number }) { return <td colSpan={colSpan} className={`border border-slate-900 p-1.5 ${center ? 'text-center' : ''}`}>{children}</td>; }
