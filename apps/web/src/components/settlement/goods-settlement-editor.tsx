'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LocalAttachmentThumbnail } from '@/components/attachment-thumbnail';
import { GoodsSource, paymentMoney } from './purchase-payment-context';
import { alertAction, promptAction, confirmAction } from '@/lib/system-dialog';
import { QuantityReviewSummary, quantityReviewPrintText, type SettlementQuantityReview } from './settlement-quantity-review';
import { batchReportSelection, batchWeighSelection, selectedSettlementReportId } from '@/lib/settlement-basis-selection';
import { settlementColumnTotal } from '@/lib/settlement-table-totals';
import { adjustmentIssuesFromServer, CHECK_ADJUSTMENT_FIELDS, settlementAdjustmentIssues, type AdjustmentIssues } from '@/lib/settlement-adjustment-validation';
import { focusInvalidField } from '@/lib/form-validation';


type Line = { quantity: string; adjustmentAmount: string; remarks: string; negotiatedQuantity: boolean; priceAdjusted: boolean; adjustedUnitPrice: string; qualityReportId: string; weighTicketId: string };
type ContractOption = { id: string; contractNo: string; title: string; pricingType?: string; signingPartnerId?: string; counterparty?: { name: string }; seller?: { id: string; name: string }; buyer?: { id: string; name: string } };
type Saved = { id: string; contractId: string; direction: 'PAYABLE' | 'RECEIVABLE'; settlementScope: string; status: string; dueDate?: string | null; remarks?: string | null; lines: Array<{ waybillLineItemId?: string | null; quantity: string; adjustmentAmount: string; remarks?: string | null; sourceSnapshot?: GoodsSource & { negotiatedQuantity?: boolean; taxRatePct?: number } }> };
type WeighTicket = NonNullable<GoodsSource['availableWeighTickets']>[number];
type QualityReportOption = NonNullable<GoodsSource['availableQualityReports']>[number];
const tons = (value: number | null | undefined) => value == null ? '—' : Number(value).toFixed(3);
const unitPriceText = (value: number | null | undefined) => value == null ? '—' : `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const SHIPPING_REASON = '本次货款按发货侧采信磅单结算';
const reportConclusion: Record<string, string> = { PASS: '合格', DEDUCTION: '指标异常', FUSE: '拒收', PENDING: '待判定' };
const reportForLine = (source: GoodsSource, reportId?: string): QualityReportOption | undefined =>
  source.availableQualityReports?.find(report => report.id === selectedSettlementReportId(source, reportId));
const ticketForStage = (source: GoodsSource, stage: 'SHIPPING' | 'RECEIVING') =>
  source.availableWeighTickets?.find(ticket => ticket.weighingStage === stage && ticket.isSelectable !== false && ticket.netWeight != null);
const weighVariance = (source: GoodsSource) => {
  const shipping = ticketForStage(source, 'SHIPPING');
  const receiving = ticketForStage(source, 'RECEIVING');
  if (shipping?.netWeight == null || receiving?.netWeight == null) return null;
  const differenceInKg = Math.round(Number(shipping.netWeight) * 1000) - Math.round(Number(receiving.netWeight) * 1000);
  return differenceInKg === 0 ? null : {
    amount: Math.abs(differenceInKg) / 1000,
    lowerStage: differenceInKg < 0 ? 'SHIPPING' as const : 'RECEIVING' as const,
  };
};
const selectedMoisture = (source: GoodsSource, reportId?: string): number | null => {
  const report = reportForLine(source, reportId);
  if (report) return report.measuredMoisturePct ?? null;
  return !reportId || reportId === source.reportId ? source.measuredMoisturePct ?? null : null;
};
const dryWeight = (netWeight: number | null | undefined, moisturePct: number | null): number | null => {
  if (netWeight == null || moisturePct == null || !Number.isFinite(Number(netWeight))
    || !Number.isFinite(Number(moisturePct)) || moisturePct < 0 || moisturePct > 100) return null;
  return Number((Number(netWeight) * (1 - moisturePct / 100)).toFixed(3));
};
const ticketQuantity = (source: GoodsSource, ticket: WeighTicket, reportId?: string) => {
  const netWeight = Number(ticket.netWeight || 0);
  const moisture = selectedMoisture(source, reportId);
  if (source.pricingQuantityBasis === 'DRY_MATTER' && moisture == null) return 0;
  const priced = source.pricingQuantityBasis === 'DRY_MATTER' && moisture != null
    ? netWeight * (1 - Number(moisture) / 100) : netWeight;
  return Math.max(0, Number((Number(priced.toFixed(3)) - Number(source.usedQuantity || 0)).toFixed(3)));
};
const defaultLine = (source: GoodsSource, sales = false): Line => {
  const preferred = ticketForStage(source, sales ? 'RECEIVING' : 'SHIPPING');
  const ticket = preferred || ticketForStage(source, sales ? 'SHIPPING' : 'RECEIVING');
  const shippingSelected = ticket?.weighingStage === 'SHIPPING' && (sales || ticket.id !== source.weighTicketId);
  // 直拨采购跟随销售结算：数量直接取销售结算数量（可能含销售协商），不按磅单重算。
  return { quantity: String(source.followSales || !ticket ? source.remainingQuantity : ticketQuantity(source, ticket)), adjustmentAmount: '0', priceAdjusted: false, adjustedUnitPrice: '',
    remarks: shippingSelected ? SHIPPING_REASON : '', negotiatedQuantity: false,
    qualityReportId: source.defaultReportId || source.inventoryReportId || '', weighTicketId: ticket?.id || source.weighTicketId || '' };
};
const eligible = (source: GoodsSource) => !source.settlementOccupied && (source.available || Boolean(source.previewOnly)) && source.remainingQuantity > 0;
const rowTotals = (rows: GoodsSource[], selected: Record<string, Line>) => ({
  shipping: settlementColumnTotal(rows.map(source => ticketForStage(source, 'SHIPPING')?.netWeight)),
  receiving: settlementColumnTotal(rows.map(source => ticketForStage(source, 'RECEIVING')?.netWeight)),
  net: settlementColumnTotal(rows.map(source => source.availableWeighTickets?.find(ticket => ticket.id === selected[source.id].weighTicketId)?.netWeight)),
  dry: settlementColumnTotal(rows.map(source => {
    const line = selected[source.id];
    const ticket = source.availableWeighTickets?.find(ticket => ticket.id === line.weighTicketId);
    return dryWeight(ticket?.netWeight, selectedMoisture(source, line.qualityReportId));
  })),
  quantity: settlementColumnTotal(rows.map(source => selected[source.id].quantity)),
  available: settlementColumnTotal(rows.map(source => {
    const line = selected[source.id];
    const ticket = source.availableWeighTickets?.find(ticket => ticket.id === line.weighTicketId);
    return ticket ? ticketQuantity(source, ticket, line.qualityReportId) : source.remainingQuantity;
  })),
  adjustment: settlementColumnTotal(rows.map(source => selected[source.id].adjustmentAmount || 0), 2),
});

export function GoodsSettlementEditor({ direction = 'PAYABLE', editId }: { direction?: 'PAYABLE' | 'RECEIVABLE'; editId?: string }) {
  const router = useRouter();
  const query = useSearchParams();
  const sales = direction === 'RECEIVABLE';
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [sources, setSources] = useState<GoodsSource[]>([]);
  const [contractId, setContractId] = useState(query.get('contractId') || '');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, Line>>({});
  const [dueDate, setDueDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [taxRatePct, setTaxRatePct] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);
  const previewRequestId = useRef(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(editId));
  const [batchFilter, setBatchFilter] = useState('');
  const [canAccept, setCanAccept] = useState(false);
  const [isFinalSettlement, setIsFinalSettlement] = useState(false);
  const [quantityReason, setQuantityReason] = useState('');
  const [quantityDialogReview, setQuantityDialogReview] = useState<SettlementQuantityReview | null>(null);
  const [quantityDialogOpen, setQuantityDialogOpen] = useState(false);
  const [quantityDialogError, setQuantityDialogError] = useState('');
  const [varianceFiles, setVarianceFiles] = useState<File[]>([]);
  const [reportModeHint, setReportModeHint] = useState('');
  const [adjustmentMode, setAdjustmentMode] = useState<'NONE' | 'QUANTITY' | 'AMOUNT'>('NONE');
  const [finalQuantity, setFinalQuantity] = useState('');
  const [finalAmount, setFinalAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [adjustmentBaseAmount, setAdjustmentBaseAmount] = useState<number | null>(null);
  const [serverAdjustmentIssues, setServerAdjustmentIssues] = useState<AdjustmentIssues>({});

  useEffect(() => {
    if (previewOpen) previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [previewOpen]);

  useEffect(() => {
    void api.get<ContractOption[]>(`/financial-settlements/options/contracts?direction=${direction}`).then(setContracts).catch(e => setError(e.message));
    if (editId) void api.get<Saved>(`/financial-settlements/${editId}`).then(item => {
      if (item.direction !== direction || item.status !== 'DRAFT' || item.settlementScope !== 'GOODS') throw new Error('这张结算单不能编辑');
      setSaved(item); setContractId(item.contractId); setDueDate(item.dueDate?.slice(0, 10) || ''); setRemarks(item.remarks || '');
      const tax = item.lines.find(line => line.sourceSnapshot?.taxRatePct != null)?.sourceSnapshot?.taxRatePct;
      if (tax != null) setTaxRatePct(String(tax));
      const review = item.lines.find(line => line.sourceSnapshot?.settlementQuantityReview)?.sourceSnapshot?.settlementQuantityReview;
      setIsFinalSettlement(Boolean(review?.finalSettlement)); setQuantityReason(review?.reason || '');
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
    try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setCanAccept(user.role === 'ADMIN' || user.permissions?.includes('settlement.quality.accept') || user.permissions?.includes('settlement.manage')); } catch { /* 无本地用户信息时由服务端鉴权 */ }
  }, [direction, editId]);

  const refresh = useCallback(async () => {
    if (!contractId) return;
    const editQuery = editId ? `&editId=${editId}` : '';
    setSources(await api.get<GoodsSource[]>(`/financial-settlements/options/goods-sources?contractId=${contractId}&direction=${direction}${editQuery}`));
  }, [contractId, direction, editId]);

  useEffect(() => {
    setSources([]); setSelected({}); setPreview(null); setBatchFilter(''); setTaxRatePct('');
    const review = saved?.lines.find(line => line.sourceSnapshot?.settlementQuantityReview)?.sourceSnapshot?.settlementQuantityReview;
    setIsFinalSettlement(Boolean(review?.finalSettlement)); setQuantityReason(review?.reason || '');
    setQuantityDialogOpen(false); setVarianceFiles([]);
    setReportModeHint('');
    const adjustment = saved?.lines.map(line => line.sourceSnapshot?.settlementAdjustment).find(Boolean);
    setAdjustmentMode(adjustment?.mode || 'NONE');
    setFinalQuantity(adjustment?.mode === 'QUANTITY' ? String(adjustment.final.quantity) : '');
    setFinalAmount(adjustment?.mode === 'AMOUNT' ? String(adjustment.final.totalAmount) : '');
    setAdjustmentReason(adjustment?.reason || '');
    setAdjustmentBaseAmount(adjustment?.base.totalAmount ?? null);
    setServerAdjustmentIssues({});
    if (contractId && (!editId || saved?.contractId === contractId)) void refresh().catch(e => setError(e.message));
  }, [contractId, editId, saved, refresh]);

  useEffect(() => {
    if (!sources.length) return;
    const savedRate = saved?.lines.find(line => line.sourceSnapshot?.taxRatePct != null)?.sourceSnapshot?.taxRatePct;
    const contractRates = [...new Set(sources.map(source => source.contractTaxRatePct).filter(rate => rate != null))];
    if (savedRate != null) setTaxRatePct(String(savedRate));
    else if (contractRates.length === 1) setTaxRatePct(String(contractRates[0]));
    else if (contractRates.length > 1) setError('合同物料存在不同税率，请分开结算或先核对合同税率');
  }, [sources, saved]);

  useEffect(() => {
    if (!sources.length) return;
    if (saved) {
      const existing: Record<string, Line> = {};
      for (const line of saved.lines) {
        const source = sources.find(row => row.id === line.waybillLineItemId);
        if (!source) continue;
        existing[source.id] = { ...defaultLine(source, sales), quantity: line.quantity, adjustmentAmount: line.adjustmentAmount,
          remarks: line.remarks || '', weighTicketId: line.sourceSnapshot?.weighTicketId || source.weighTicketId || '',
          qualityReportId: line.sourceSnapshot?.reportId || source.defaultReportId || '', negotiatedQuantity: Boolean(line.sourceSnapshot?.negotiatedQuantity),
          priceAdjusted: Boolean(line.sourceSnapshot?.lineAdjustment?.priceAdjusted), adjustedUnitPrice: line.sourceSnapshot?.lineAdjustment?.priceAdjusted ? String(line.sourceSnapshot.lineAdjustment.finalUnitPrice) : '' };
      }
      setSelected(existing);
    } else setSelected(Object.fromEntries(sources.filter(eligible).map(source => [source.id, defaultLine(source, sales)])));
  }, [sources, saved, sales]);

  const contract = contracts.find(item => item.id === contractId);
  const counterpartyName = (item: ContractOption) => item.counterparty?.name || (item.signingPartnerId === item.buyer?.id ? item.seller?.name : item.buyer?.name) || item.seller?.name || '—';
  const gradeTier = contract?.pricingType === 'GRADE_TIER';
  const batches = useMemo(() => [...new Map(sources.map(source => [source.orderId, { id: source.orderId, label: `${source.orderNo} · ${source.orderName}`, status: source.orderStatus }])).values()], [sources]);
  const filtered = sources.filter(source => !batchFilter || source.orderId === batchFilter);
  const selectedRows = sources.filter(source => selected[source.id]);
  const followSaveBlocked = selectedRows.some(source => source.previewOnly);
  const selectedInView = filtered.filter(source => selected[source.id]);
  const viewTotals = rowTotals(selectedInView, selected);
  const detailTotals = rowTotals(selectedRows, selected);
  const negotiationCeiling = preview?.settlementAdjustment?.quantityCeiling
    ?? settlementColumnTotal(selectedRows.map(source => {
      const line = selected[source.id], ticket = source.availableWeighTickets?.find(item => item.id === line.weighTicketId);
      return Math.max(source.negotiableRemainingQuantity ?? source.remainingQuantity,
        ticket ? ticketQuantity(source, ticket, line.qualityReportId) : source.remainingQuantity);
    }));
  const adjustmentIssues: AdjustmentIssues = { ...serverAdjustmentIssues, ...settlementAdjustmentIssues({
    mode: adjustmentMode, quantity: finalQuantity, amount: finalAmount, reason: adjustmentReason,
    quantityCeiling: negotiationCeiling, baseQuantity: detailTotals.quantity,
    baseAmount: preview?.settlementAdjustment?.base.totalAmount ?? adjustmentBaseAmount,
  }) };
  const hasAdjustmentIssues = Object.keys(adjustmentIssues).length > 0;
  const clearAdjustmentErrors = () => {
    previewRequestId.current++;
    setServerAdjustmentIssues({}); setError(''); setPreviewError(''); setPreview(null);
  };
  const showAdjustmentIssues = async (issues: AdjustmentIssues) => {
    setBusy(false); setError(CHECK_ADJUSTMENT_FIELDS); setPreview(null); setPreviewOpen(false); setPreviewError('');
    await alertAction(CHECK_ADJUSTMENT_FIELDS, { title: '结算信息待完善', destructive: false });
    const key = (['quantity', 'amount', 'reason'] as const).find(field => issues[field]);
    if (key) focusInvalidField(`settlement-adjustment-${key}`);
  };
  const reportSelection = batchReportSelection(selectedInView, selected, reportModeHint);
  const weighSelection = batchWeighSelection(selectedInView, selected);
  const allSelectedInView = filtered.some(eligible) && filtered.filter(eligible).every(source => Boolean(selected[source.id]));
  const commonReports = selectedInView.length ? (selectedInView[0].availableQualityReports || []).filter(report =>
    selectedInView.every(source => source.availableQualityReports?.some(candidate => candidate.id === report.id))) : [];
  const selectedTotals = useMemo(() => {
    const rows = sources.filter(source => selected[source.id]);
    const weight = (stage: 'SHIPPING' | 'RECEIVING') => rows.reduce((sum, source) => sum + Number(ticketForStage(source, stage)?.netWeight || 0), 0);
    const chosenWeight = rows.reduce((sum, source) => sum + Number(source.availableWeighTickets?.find(ticket => ticket.id === selected[source.id].weighTicketId)?.netWeight || 0), 0);
    const dryWeights = rows.map(source => {
      const line = selected[source.id];
      const ticket = source.availableWeighTickets?.find(candidate => candidate.id === line.weighTicketId);
      return dryWeight(ticket?.netWeight, selectedMoisture(source, line.qualityReportId));
    });
    return { count: rows.length, shippingWeight: weight('SHIPPING'), receivingWeight: weight('RECEIVING'), chosenWeight,
      dryWeight: rows.length && dryWeights.every(value => value != null)
        ? Number(dryWeights.reduce((sum, value) => sum + Number(value), 0).toFixed(3)) : null,
      varianceCount: rows.filter(source => weighVariance(source)).length,
      absoluteVariance: rows.reduce((sum, source) => sum + (weighVariance(source)?.amount || 0), 0),
      quantity: rows.reduce((sum, source) => sum + Number(selected[source.id].quantity || 0), 0) };
  }, [selected, sources]);
  const setField = (id: string, patch: Partial<Line>) => { setSelected(rows => ({ ...rows, [id]: { ...rows[id], ...patch } })); setPreview(null); setError(''); };
  const toggle = (rows: GoodsSource[], checked: boolean) => {
    setSelected(current => { const next = { ...current }; for (const row of rows) { if (checked && eligible(row)) next[row.id] = next[row.id] || defaultLine(row, sales); if (!checked) delete next[row.id]; } return next; });
    setPreview(null); setError('');
  };
  const selectTicket = (source: GoodsSource, ticket: WeighTicket) => {
    if (!selected[source.id] || ticket.isSelectable === false || ticket.netWeight == null) return;
    setSelected(current => {
      const line = current[source.id];
      if (!line) return current;
      const shippingReason = ticket.weighingStage === 'SHIPPING' && (sales || ticket.id !== source.weighTicketId);
      return { ...current, [source.id]: { ...line, weighTicketId: ticket.id,
        quantity: line.negotiatedQuantity ? line.quantity : String(ticketQuantity(source, ticket, line.qualityReportId)),
        remarks: shippingReason ? line.remarks || SHIPPING_REASON : line.remarks === SHIPPING_REASON ? '' : line.remarks } };
    });
    setPreview(null); setError('');
  };
  const selectReport = (source: GoodsSource, reportId: string) => {
    setReportModeHint('');
    setSelected(current => {
      const line = current[source.id]; if (!line) return current;
      const ticket = source.availableWeighTickets?.find(candidate => candidate.id === line.weighTicketId);
      return { ...current, [source.id]: { ...line, qualityReportId: reportId,
        quantity: ticket && !line.negotiatedQuantity ? String(ticketQuantity(source, ticket, reportId)) : line.quantity } };
    });
    setPreview(null);
    const report = source.availableQualityReports?.find(candidate => candidate.id === reportId);
    setError(source.pricingQuantityBasis === 'DRY_MATTER' && reportId !== source.reportId && report && report.measuredMoisturePct == null ? `${source.waybillNo}所选检测报告缺少水分实测值，无法计算折干数量` : '');
  };
  const bulkSide = async (stage: 'SHIPPING' | 'RECEIVING') => {
    const changes = selectedInView.flatMap(source => {
      const ticket = ticketForStage(source, stage);
      return ticket ? [{ source, ticket }] : [];
    });
    if (!changes.length) { setError(`当前范围内没有可选的${stage === 'SHIPPING' ? '发货' : '收货'}磅单`); return; }
    const needsReason = stage === 'SHIPPING' && changes.some(({ source, ticket }) => (sales || ticket.id !== source.weighTicketId) && !selected[source.id]?.remarks?.trim());
    const reason = needsReason ? (await promptAction('请填写统一采用发货侧磅单的依据说明', SHIPPING_REASON, { title: '批量切换货款磅单' }))?.trim() : undefined;
    if (needsReason && !reason) return;
    setSelected(current => { const next = { ...current }; for (const { source, ticket } of changes) {
      const line = next[source.id]; if (!line) continue;
      const shippingReason = stage === 'SHIPPING' && (sales || ticket.id !== source.weighTicketId);
      next[source.id] = { ...line, weighTicketId: ticket.id,
        quantity: line.negotiatedQuantity ? line.quantity : String(ticketQuantity(source, ticket, line.qualityReportId)),
        remarks: shippingReason ? reason || line.remarks || SHIPPING_REASON : line.remarks === SHIPPING_REASON ? '' : line.remarks };
    } return next; });
    setPreview(null);
    setError(selectedInView.length > changes.length ? `已切换 ${changes.length} 车；其余车辆该侧没有已确认的采信磅单，请逐车核对。` : '');
  };
  const bulkReport = async (mode: string) => {
    if (!mode) return;
    if (!selectedInView.length) { setError('请先选用需要切换检测报告的车辆'); return; }
    const changes = selectedInView.flatMap(source => {
      const reportId = mode === 'DEFAULT'
        ? source.defaultReportId || source.inventoryReportId || source.reportId
        : mode.startsWith('REPORT:') ? mode.slice('REPORT:'.length)
          : (() => {
            const candidates = source.availableQualityReports?.filter(report => report.evidenceStage === mode) || [];
            return candidates.length === 1 ? candidates[0].id : '';
          })();
      const report = source.availableQualityReports?.find(candidate => candidate.id === reportId);
      if (!report || source.pricingQuantityBasis === 'DRY_MATTER' && report.measuredMoisturePct == null) return [];
      return [{ source, report }];
    });
    if (!changes.length) { setError('当前范围内没有可统一选用的检测报告；同侧多份报告请逐车选择'); return; }
    const changed = changes.filter(({ source, report }) => selected[source.id]?.qualityReportId !== report.id);
    const needsReason = changed.some(({ source, report }) => report.id !== (sales ? source.defaultReportId : source.inventoryReportId));
    const reason = needsReason ? (await promptAction('请填写批量改选检测报告的依据说明', '按双方确认的检测报告作为本次货款结算依据', { title: '批量切换检测报告' }))?.trim() : undefined;
    if (needsReason && !reason) return;
    setSelected(current => {
      const next = { ...current };
      for (const { source, report } of changed) {
        const line = next[source.id]; if (!line) continue;
        const ticket = source.availableWeighTickets?.find(candidate => candidate.id === line.weighTicketId);
        next[source.id] = { ...line, qualityReportId: report.id,
          quantity: ticket && !line.negotiatedQuantity ? String(ticketQuantity(source, ticket, report.id)) : line.quantity,
          remarks: reason ? [line.remarks.trim(), reason].filter(Boolean).join('；') : line.remarks };
      }
      return next;
    });
    setReportModeHint(mode);
    setPreview(null);
    setError(selectedInView.length > changes.length ? `已切换 ${changes.length} 车；其余车辆缺少该侧唯一报告或折干所需水分，请逐车核对。` : '');
  };
  const payload = (acceptVariance = false) => ({ contractId, direction, settlementScope: 'GOODS', dueDate: dueDate ? `${dueDate}T12:00:00+08:00` : undefined,
    remarks, taxRatePct: gradeTier && taxRatePct !== '' ? Number(taxRatePct) : undefined,
    isFinalSettlement, quantityVarianceReason: quantityReason, quantityVarianceConfirmed: acceptVariance,
    quantityVarianceKey: acceptVariance ? quantityDialogReview?.key : undefined,
    settlementAdjustment: { mode: adjustmentMode, reason: adjustmentReason,
      ...(adjustmentMode === 'QUANTITY' ? { quantity: Number(finalQuantity) } : adjustmentMode === 'AMOUNT' ? { amount: Number(finalAmount) } : {}) },
    lines: selectedRows.map(source => { const line = selected[source.id]; return { orderId: source.orderId, waybillLineItemId: source.id,
      weighTicketId: line.weighTicketId || undefined, qualityReportId: line.qualityReportId || undefined,
      quantity: Number(line.quantity), adjustmentAmount: Number(line.adjustmentAmount || 0), remarks: line.remarks,
      adjustedUnitPrice: line.priceAdjusted ? Number(line.adjustedUnitPrice) : undefined,
      negotiatedQuantity: line.negotiatedQuantity }; }) });

  const resetOverall = () => { setAdjustmentMode('NONE'); setFinalQuantity(''); setFinalAmount(''); setAdjustmentReason(''); setAdjustmentBaseAmount(null); clearAdjustmentErrors(); };
  const resetLine = (source: GoodsSource, line: Line): Line => {
    const ticket = source.availableWeighTickets?.find(ticket => ticket.id === line.weighTicketId);
    return { ...line, quantity: String(ticket ? ticketQuantity(source, ticket, line.qualityReportId) : source.remainingQuantity), negotiatedQuantity: false, priceAdjusted: false, adjustedUnitPrice: '', adjustmentAmount: '0' };
  };
  const changeOverallMode = async (mode: 'NONE' | 'QUANTITY' | 'AMOUNT') => {
    if (mode === adjustmentMode || busy) return;
    const hasLineChanges = selectedRows.some(source => { const line = selected[source.id]; return line.negotiatedQuantity || line.priceAdjusted || Number(line.adjustmentAmount) !== 0; });
    if ((adjustmentMode !== 'NONE' || hasLineChanges) && !await confirmAction('已存在数量、单价或金额调整。切换将取消原整单调整，并恢复逐车系统计算，是否继续？', { title: '切换结算调整方式', confirmText: '恢复并切换' })) return;
    if (mode === 'NONE' && !hasLineChanges) { resetOverall(); return; }
    const next = Object.fromEntries(selectedRows.map(source => [source.id, resetLine(source, selected[source.id])]));
    setBusy(true); setError('');
    try {
      const base = await api.post<any>(editId ? `/financial-settlements/${editId}/preview-goods` : '/financial-settlements/preview-goods', {
        ...payload(), settlementAdjustment: { mode: 'NONE' }, lines: selectedRows.map(source => ({ orderId: source.orderId, waybillLineItemId: source.id,
          weighTicketId: next[source.id].weighTicketId || undefined, qualityReportId: next[source.id].qualityReportId || undefined,
          quantity: Number(next[source.id].quantity), negotiatedQuantity: false, adjustmentAmount: 0, remarks: next[source.id].remarks })) });
      if (mode === 'QUANTITY') {
        const rows = base.lines || [];
        if (rows.some((line: any) => line.sourceSnapshot?.pricingQuantityBasis !== 'DRY_MATTER')
          || new Set(rows.map((line: any) => line.sourceSnapshot?.contractLineItemId)).size !== 1
          || new Set(rows.map((line: any) => line.sourceSnapshot?.lineAdjustment?.contractUnitPrice)).size !== 1
          || new Set(rows.map((line: any) => line.sourceSnapshot?.lineAdjustment?.deductionPerTon)).size !== 1) {
          throw new Error('所选车辆物料、合同单价或每吨扣款不一致，无法按统一单价调整总干基，请使用逐车调整');
        }
      }
      setSelected(next); setAdjustmentMode(mode); setFinalQuantity(String(base.quantity)); setFinalAmount(String(base.totalAmount)); setAdjustmentBaseAmount(base.totalAmount); setAdjustmentReason(''); clearAdjustmentErrors();
    } catch (cause: any) { setError(cause.message); } finally { setBusy(false); }
  };
  const changeLineMode = async (source: GoodsSource, kind: 'QUANTITY' | 'PRICE', enabled: boolean) => {
    if (busy) return;
    const line = selected[source.id];
    const other = kind === 'QUANTITY' ? line.priceAdjusted : line.negotiatedQuantity;
    if (enabled && (adjustmentMode !== 'NONE' || other || Number(line.adjustmentAmount) !== 0)
      && !await confirmAction(adjustmentMode !== 'NONE' ? '开启逐车调整将取消整单调整，是否继续？' : '本车数量与单价不可同时调整。切换将恢复另一项，并取消历史加减金额，是否继续？', { title: '切换本车结算调整', confirmText: '恢复并切换' })) return;
    const result = preview?.lines?.find((item: any) => item.waybillLineItemId === source.id);
    const reference = result?.sourceSnapshot?.lineAdjustment?.contractUnitPrice;
    if (enabled && kind === 'PRICE' && reference == null) { setError('请先等待本车合同单价计算完成'); return; }
    if (adjustmentMode !== 'NONE') resetOverall();
    const reset = resetLine(source, line);
    setField(source.id, kind === 'QUANTITY'
      ? { negotiatedQuantity: enabled, quantity: enabled ? line.quantity : reset.quantity, ...(enabled ? { priceAdjusted: false, adjustedUnitPrice: '' } : {}), adjustmentAmount: enabled ? '0' : line.adjustmentAmount }
      : { priceAdjusted: enabled, adjustedUnitPrice: enabled ? String(reference) : '', ...(enabled ? { negotiatedQuantity: false, quantity: reset.quantity } : {}), adjustmentAmount: enabled ? '0' : line.adjustmentAmount });
  };

  useEffect(() => {
    const requestId = ++previewRequestId.current;
    setPreview(null);
    setPreviewOpen(false);
    setPreviewError('');
    setServerAdjustmentIssues({});
    if (!contractId || !selectedRows.length || (gradeTier && taxRatePct === '')) return;
    const issues = settlementAdjustmentIssues({ mode: adjustmentMode, quantity: finalQuantity, amount: finalAmount,
      reason: adjustmentReason, quantityCeiling: negotiationCeiling, baseQuantity: detailTotals.quantity, baseAmount: adjustmentBaseAmount });
    if (Object.keys(issues).length) return;
    const invalidRows = selectedRows.filter(source => !Number.isFinite(Number(selected[source.id].quantity)) || Number(selected[source.id].quantity) <= 0);
    if (invalidRows.length) {
      const message = `${invalidRows.slice(0, 3).map(source => source.waybillNo).join('、')}${invalidRows.length > 3 ? `等 ${invalidRows.length} 车` : ''}的本次数量为空或不大于零，请核对选用磅单、检测报告和已结数量`;
      setPreviewError(message);
      setError(message);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api.post<any>(editId ? `/financial-settlements/${editId}/preview-goods` : '/financial-settlements/preview-goods', payload())
        .then(value => { if (!cancelled && requestId === previewRequestId.current) { setPreview(value); setPreviewError(''); setError(''); } })
        .catch(cause => { if (!cancelled && requestId === previewRequestId.current) {
          const message = String(cause.message || '实时试算失败，请检查逐车依据');
          const issues = adjustmentIssuesFromServer(message, adjustmentMode);
          setServerAdjustmentIssues(issues); setPreview(null);
          setPreviewError(Object.keys(issues).length ? '' : message);
          setError(Object.keys(issues).length ? CHECK_ADJUSTMENT_FIELDS : message);
        } });
    }, 400);
    return () => { cancelled = true; previewRequestId.current++; window.clearTimeout(timer); };
    // 仅数量、磅单、报告和税率变化触发试算；备注与日期在提交时一并保存。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, selected, sources, gradeTier, taxRatePct, editId, isFinalSettlement, adjustmentMode, finalQuantity, finalAmount, adjustmentReason, adjustmentBaseAmount]);

  const submit = async (save: boolean, acceptVariance = false) => {
    if (acceptVariance && !quantityReason.trim()) { setQuantityDialogError('请填写数量差异说明'); return; }
    if (hasAdjustmentIssues) { await showAdjustmentIssues(adjustmentIssues); return; }
    if (!save && preview) {
      setPreviewOpen(true);
      return;
    }
    const requestId = ++previewRequestId.current;
    setBusy(true); setError('');
    if (!save) setPreviewError('');
    try {
      if (!contractId) throw new Error('请选择合同');
      if (!selectedRows.length) throw new Error('请选择至少一车货物');
      if (gradeTier && (taxRatePct === '' || Number(taxRatePct) < 0 || Number(taxRatePct) > 100)) throw new Error('请填写本次结算税率');
      const url = editId ? `/financial-settlements/${editId}` : '/financial-settlements';
      if (save && !acceptVariance) {
        const checked = await api.post<any>(editId ? `${url}/preview-goods` : '/financial-settlements/preview-goods', payload());
        if (requestId !== previewRequestId.current) return;
        setPreview(checked);
        if (checked.quantityReview?.differences?.length) {
          setQuantityDialogReview(checked.quantityReview); setQuantityDialogError(''); setQuantityDialogOpen(true);
          return;
        }
      }
      const value = save ? editId ? await api.patch<{ id: string }>(url, payload(acceptVariance)) : await api.post<{ id: string }>(url, payload(acceptVariance))
        : await api.post<any>(editId ? `${url}/preview-goods` : '/financial-settlements/preview-goods', payload());
      if (save) {
        setQuantityDialogOpen(false);
        const failed: string[] = [];
        for (const file of varianceFiles) {
          try { const form = new FormData(); form.append('file', file); await api.upload(`/financial-settlements/${value.id}/attachments?category=QUANTITY_VARIANCE_EVIDENCE`, form); }
          catch { failed.push(file.name); }
        }
        setVarianceFiles([]);
        if (failed.length) await alertAction(`结算草稿已保存，以下附件上传失败：${failed.join('、')}。请在结算单详情补传，不要重复创建结算单。`, { title: '草稿已保存，附件待补传' });
        router.push(`/dashboard/settlements/${value.id}`);
      }
      else if (requestId === previewRequestId.current) {
        setPreview(value);
        setPreviewOpen(true);
      }
    } catch (cause: any) {
      if (!save && requestId !== previewRequestId.current) return;
      const message = String(cause.message || '结算单处理失败');
      const issues = adjustmentIssuesFromServer(message, adjustmentMode);
      if (Object.keys(issues).length) {
        setServerAdjustmentIssues(issues);
        await showAdjustmentIssues(issues);
        return;
      }
      setError(message);
      if (acceptVariance) setQuantityDialogError(message);
      if (!save) { setPreview(null); setPreviewOpen(false); setPreviewError(message); }
    }
    finally { setBusy(false); }
  };

  if (loading) return <p className="p-8 text-sm text-muted-foreground">正在加载结算草稿…</p>;
  return <div className="space-y-5 pb-28">
    <div className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">{editId ? '编辑' : '新建'}{sales ? '销售' : '采购'}结算单</h1><p className="mt-1 text-sm text-muted-foreground">改选磅单仅影响本次结算，不改出入库记录。</p></div><Button variant="outline" onClick={() => router.back()}>返回</Button></div>
    {error && <div role="alert" className="rounded border border-warning-border bg-warning-bg p-3 text-sm text-warning">{error}</div>}
    <Card className="grid gap-4 p-5 md:grid-cols-2"><label className="space-y-1 text-sm"><span>{sales ? '销售' : '采购'}合同 *</span><select className="h-10 w-full rounded border bg-background px-2" value={contractId} disabled={Boolean(editId)} onChange={e => setContractId(e.target.value)}><option value="">请选择合同</option>{contracts.filter(item => item.id === contractId || `${item.contractNo} ${item.title} ${item.counterparty?.name} ${item.seller?.name} ${item.buyer?.name}`.includes(search.trim())).map(item => <option key={item.id} value={item.id}>{item.contractNo} · {item.title} · {counterpartyName(item)}</option>)}</select></label><label className="space-y-1 text-sm"><span>查找合同</span><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="合同编号、标题、企业名称" /></label></Card>
    {sources.length > 0 && <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-semibold">逐车货款计量与质量依据</h2>
        <p className="mt-1 text-xs text-muted-foreground">{sales ? '默认采用收货侧依据。' : '优先采用发货磅单，无可用发货磅单时沿用收货磅单。'}切换磅单或报告后，数量和金额自动重算。</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BasisMetric label="已选车辆" value={`${selectedTotals.count} / ${sources.length} 车`} />
        <BasisMetric label="发货净重合计" value={`${tons(selectedTotals.shippingWeight)} 吨`} />
        <BasisMetric label="收货净重合计" value={`${tons(selectedTotals.receivingWeight)} 吨`} />
        <BasisMetric label="选用净重合计" value={`${tons(selectedTotals.chosenWeight)} 吨`} />
        <BasisMetric label="折干重量合计" value={!selectedTotals.count ? '未选车辆' : selectedTotals.dryWeight == null ? '待补齐水分' : `${tons(selectedTotals.dryWeight)} 吨`} />
        <BasisMetric label="最终结算数量" value={`${tons(preview?.quantity ?? (adjustmentMode === 'QUANTITY' ? Number(finalQuantity) : selectedTotals.quantity))} 吨`} emphasis />
        <div className="sm:col-span-2"><BasisMetric label="结算金额（含税）" value={preview ? paymentMoney(preview.totalAmount) : !selectedTotals.count ? '未选车辆' : gradeTier && !taxRatePct ? '待填写税率' : previewError ? '计算失败' : '计算中…'} emphasis /></div>
      </div>
      {preview?.quantityReview?.differences?.length > 0 && <div role="alert" className="space-y-2 rounded border border-warning-border bg-warning-bg p-3 text-warning"><div className="text-sm font-medium">存在溢短装数量差异，生成时须填写说明并确认，附件选填。</div><QuantityReviewSummary review={preview.quantityReview} /></div>}
      {selectedTotals.varianceCount > 0 && <p className="text-xs text-warning">{selectedTotals.varianceCount} 车发货与收货净重不同，逐车磅差绝对值合计 {tons(selectedTotals.absoluteVariance)} 吨；请核对并选定结算磅单。</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[1560px] table-fixed text-sm">
          <colgroup>{[200, 180, 190, 190, 280, 120, 110, 120, 170].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
          <thead className="bg-surface-2 text-left text-xs font-medium text-muted-foreground"><tr>
            <th className="sticky left-0 z-20 whitespace-nowrap border-r bg-surface-2 px-4 py-3">批次／运单</th>
            <th className="whitespace-nowrap px-4 py-3">货物／车牌</th>
            <th className="whitespace-nowrap px-4 py-3">发货磅单</th>
            <th className="whitespace-nowrap px-4 py-3">收货磅单</th>
            <th className="whitespace-nowrap px-4 py-3">质量依据</th>
            <th className="whitespace-nowrap px-4 py-3 text-right">净重（吨）</th>
            <th className="whitespace-nowrap px-4 py-3 text-right">水分（%）</th>
            <th className="whitespace-nowrap px-4 py-3 text-right">折干（吨）</th>
            <th className="whitespace-nowrap px-4 py-3 text-right">结算数量（吨）</th>
          </tr><tr className="border-t bg-surface-2 align-top text-xs font-normal text-foreground">
            <th className="sticky left-0 z-20 space-y-2 border-r bg-surface-2 px-4 py-3 font-normal">
              <select aria-label="筛选执行批次" className="h-9 min-w-0 w-full rounded border bg-background px-2" value={batchFilter} onChange={event => setBatchFilter(event.target.value)}>
                <option value="">全部批次（{batches.length}）</option>
                {batches.map(batch => <option key={batch.id} value={batch.id}>{batch.label} · {batch.status}</option>)}
              </select>
              <div className="flex gap-1"><Button size="sm" variant={allSelectedInView ? 'default' : 'outline'} aria-pressed={allSelectedInView} className="h-7 flex-1 px-2 text-xs" onClick={() => toggle(filtered, true)}>{allSelectedInView ? '已全选' : '全选'}</Button><Button size="sm" variant="outline" className="h-7 flex-1 px-2 text-xs" disabled={!selectedInView.length} onClick={() => toggle(filtered, false)}>全取消</Button></div>
            </th>
            <th className="px-4 py-3 text-center align-top text-xs font-medium text-foreground"><span className="flex h-9 items-center justify-center whitespace-nowrap">已选 {selectedInView.length} / {filtered.length} 车</span>{weighSelection === 'MIXED' && <span className="text-warning">磅单混合口径</span>}</th>
            <th className="px-4 py-3 font-normal"><Button size="sm" variant={weighSelection === 'SHIPPING' ? 'default' : 'outline'} aria-pressed={weighSelection === 'SHIPPING'} className="h-9 w-full text-xs" disabled={!selectedInView.length} onClick={() => void bulkSide('SHIPPING')}>{weighSelection === 'SHIPPING' ? '已选发货磅单' : '统一选发货'}</Button></th>
            <th className="px-4 py-3 font-normal"><Button size="sm" variant={weighSelection === 'RECEIVING' ? 'default' : 'outline'} aria-pressed={weighSelection === 'RECEIVING'} className="h-9 w-full text-xs" disabled={!selectedInView.length} onClick={() => void bulkSide('RECEIVING')}>{weighSelection === 'RECEIVING' ? '已选收货磅单' : '统一选收货'}</Button></th>
            <th className="px-4 py-3 font-normal"><select aria-label="批量选择检测报告" className={`h-9 min-w-0 w-full rounded border px-3 text-xs ${reportSelection && !['MIXED', 'MISSING'].includes(reportSelection) ? 'border-primary bg-primary-bg text-primary' : 'bg-background'}`} value={reportSelection} disabled={!selectedInView.length} onChange={event => void bulkReport(event.target.value)}>
              <option value="" disabled>批量选择检测报告</option><option value="MIXED" disabled>混合口径（逐车选用）</option><option value="MISSING" disabled>缺少可用报告</option><option value="DEFAULT">沿用默认报告</option><option value="SHIPPING">发货侧报告</option><option value="RECEIVING">收货侧报告</option>
              {commonReports.map(report => <option key={report.id} value={`REPORT:${report.id}`}>共用报告 · {report.reportNo}</option>)}
            </select></th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-normal text-muted-foreground">所选磅单</th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-normal text-muted-foreground">所选报告</th>
            <th className="whitespace-nowrap px-4 py-3 text-right font-normal text-muted-foreground">自动折算</th>
            <th className="px-4 py-3 text-right font-normal text-muted-foreground">本次／可结算</th>
          </tr></thead>
          <tbody>{filtered.map(source => {
            const line = selected[source.id];
            const selectedTicket = source.availableWeighTickets?.find(ticket => ticket.id === line?.weighTicketId);
            const chosenReport = line ? reportForLine(source, line.qualityReportId) : undefined;
            const moisturePct = line ? selectedMoisture(source, line.qualityReportId) : null;
            const selectedDryWeight = line ? dryWeight(selectedTicket?.netWeight, moisturePct) : null;
            const basisRemaining = selectedTicket ? ticketQuantity(source, selectedTicket, line?.qualityReportId) : source.remainingQuantity;
            const variance = weighVariance(source);
            return <tr key={source.id} className={source.settlementOccupied ? 'border-t align-top bg-muted/40 text-muted-foreground' : line ? 'border-t align-top bg-primary-bg/30' : 'border-t align-top'}>
              <td className={`sticky left-0 z-10 border-r px-4 py-4 ${source.settlementOccupied ? 'bg-muted' : line ? 'bg-primary-bg' : 'bg-background'}`}><label className={`flex items-start gap-2 font-medium ${source.settlementOccupied ? 'cursor-not-allowed' : 'cursor-pointer'}`}><input className="mt-0.5 shrink-0" type="checkbox" aria-label={`选用运单 ${source.waybillNo}`} checked={Boolean(line)} disabled={source.settlementOccupied || (!eligible(source) && !line)} onChange={event => toggle([source], event.target.checked)} /><span className="break-all text-xs leading-5">{source.orderNo}</span></label><div className="mt-1 pl-5 text-xs leading-5 text-muted-foreground">{source.waybillNo}</div>{source.followSales && <div className="mt-2 pl-5 text-xs leading-5 text-muted-foreground">磅单、报告、数量跟随销售结算{source.followSalesSettlementNo ? <a className="ml-1 text-primary hover:underline" href={`/dashboard/settlements/${source.followSalesSettlementId}`}>{source.followSalesSettlementNo}</a> : ''}</div>}{source.previewOnly && <div className="mt-1 pl-5 text-xs leading-5 text-warning">请先完成销售结算审批，当前仅可预览</div>}{source.settlementOccupied && <div className="mt-2 pl-5 text-xs">已创建结算单{source.occupiedSettlements?.map(settlement => <a key={settlement.id} className="mt-1 block text-primary hover:underline" href={`/dashboard/settlements/${settlement.id}`}>{settlement.settlementNo}</a>)}</div>}</td>
              <td className="space-y-1.5 px-4 py-4"><div className="font-medium">{source.plateNo || '未录车牌'}</div><div className="line-clamp-2 text-xs leading-5 text-muted-foreground" title={source.materialName}>{source.materialName || '—'}</div>{variance && <div className="text-xs text-warning">磅差 {tons(variance.amount)} 吨</div>}</td>
              <td className="px-4 py-4"><WeighSideChoice source={source} stage="SHIPPING" selectedId={line?.weighTicketId} lower={variance?.lowerStage === 'SHIPPING'} disabled={!line} onSelect={ticket => selectTicket(source, ticket)} /></td>
              <td className="px-4 py-4"><WeighSideChoice source={source} stage="RECEIVING" selectedId={line?.weighTicketId} lower={variance?.lowerStage === 'RECEIVING'} disabled={!line} onSelect={ticket => selectTicket(source, ticket)} /></td>
              <td className="px-4 py-4"><select aria-label={`${source.waybillNo}本次检测报告`} className="h-9 min-w-0 w-full rounded border bg-background px-2 text-xs" disabled={!line} value={line?.qualityReportId || ''} onChange={event => selectReport(source, event.target.value)}><option value="">沿用默认报告</option>{source.availableQualityReports?.map(report => <option key={report.id} value={report.id}>{report.evidenceStage === 'SHIPPING' ? '发货侧' : report.evidenceStage === 'RECEIVING' ? '收货侧' : '未标明环节'} · {report.reportNo}</option>)}</select>{line && chosenReport && <div className="mt-2 space-y-1.5 text-xs text-muted-foreground"><div className="line-clamp-2 leading-5" title={chosenReport.institutionName}>{chosenReport.institutionName || '未填机构'}</div><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className={chosenReport.conclusion === 'FUSE' ? 'text-destructive' : chosenReport.conclusion === 'DEDUCTION' ? 'text-warning' : ''}>{reportConclusion[chosenReport.conclusion] || chosenReport.conclusion}</span><span>CaF₂ {chosenReport.measuredGradePct == null ? '—' : `${chosenReport.measuredGradePct}%`}</span>{chosenReport.measuredRecoveryPct != null && <span>回收率 {chosenReport.measuredRecoveryPct}%</span>}</div></div>}</td>
              <td className="px-4 py-4 text-right align-middle tabular-nums"><div className="whitespace-nowrap font-medium">{line ? tons(selectedTicket?.netWeight) : '—'}</div>{line && source.inventoryTicketNo && selectedTicket?.ticketNo !== source.inventoryTicketNo && <div className="mt-1 text-xs leading-5 text-warning" title="本次结算磅单与出入库磅单不同">非出入库口径</div>}</td>
              <td className="whitespace-nowrap px-4 py-4 text-right align-middle tabular-nums">{moisturePct == null ? '—' : Number(moisturePct).toFixed(2)}</td>
              <td className="px-4 py-4 text-right align-middle tabular-nums"><div className="whitespace-nowrap font-medium">{tons(selectedDryWeight)}</div>{line && source.pricingQuantityBasis === 'DRY_MATTER' && selectedDryWeight == null && <div className="mt-1 text-xs text-warning">缺少水分</div>}</td>
              <td className="space-y-1 px-4 py-4 text-right align-middle tabular-nums"><div className="whitespace-nowrap font-medium">本次 {line ? tons(Number(line.quantity)) : '—'}</div><div className="whitespace-nowrap text-xs text-muted-foreground">可结算 {tons(basisRemaining)}</div>{line && <div className="text-xs text-muted-foreground">{source.pricingQuantityBasis === 'DRY_MATTER' ? '折干计价' : '净重计价'}</div>}{!source.available && <div className="mt-1 text-xs text-warning">{source.reasons.join('；')}</div>}{!sales && canAccept && source.qualityDisposition === 'DEDUCTION_PENDING' && <Button size="sm" variant="outline" className="mt-2" onClick={async () => { const reason = await promptAction('请填写按合同扣款接收的业务依据', '', { title: '确认扣款接收' }); if (!reason?.trim()) return; try { await api.post(`/quality-tasks/${source.qualityTaskId}/accept-contract-deduction`, { reason, decisionVersion: source.decisionVersion }); await refresh(); } catch (cause: any) { setError(cause.message); } }}>确认扣款接收</Button>}</td>
            </tr>;
          })}</tbody>
          <tfoot className="border-t-2 bg-surface-2 text-xs font-medium tabular-nums"><tr>
            <td colSpan={2} className="px-4 py-4">已选合计（{selectedInView.length} 车）<div className="mt-1 font-normal text-muted-foreground">当前筛选范围；缺失数据不按零计</div></td>
            <td className="px-4 py-4 text-right">{tons(viewTotals.shipping)} 吨</td>
            <td className="px-4 py-4 text-right">{tons(viewTotals.receiving)} 吨</td>
            <td className="px-4 py-4 text-muted-foreground">仅统计已勾选车辆</td>
            <td className="px-4 py-4 text-right">{tons(viewTotals.net)}</td>
            <td className="px-4 py-4 text-right text-muted-foreground">—</td>
            <td className="px-4 py-4 text-right">{tons(viewTotals.dry)}</td>
            <td className="space-y-1 px-4 py-4 text-right"><div>本次 {tons(viewTotals.quantity)}</div><div className="font-normal text-muted-foreground">可结算 {tons(viewTotals.available)}</div></td>
          </tr></tfoot>
        </table>
      </div>
    </Card>}
    {selectedRows.length > 0 && <Card className="space-y-4 p-5"><h2 className="font-semibold">逐车结算明细</h2><div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[1430px] table-fixed text-sm">
      <colgroup>{[180, 190, 200, 220, 300, 150, 190].map((width, index) => <col key={index} style={{ width }}/>)}</colgroup>
      <thead className="bg-surface-2 text-left text-xs text-muted-foreground"><tr>{['运单／车牌', '重量与水分', '数量调整（吨）', '单价调整（含税元/吨）', '依据与调整说明', '质量扣款（元）', '本车含税金额（元）'].map(label => <th className="whitespace-nowrap px-4 py-3" key={label}>{label}</th>)}</tr></thead>
      <tbody>{selectedRows.map(source => {
        const line = selected[source.id], result = preview?.lines?.find((item: any) => item.waybillLineItemId === source.id);
        const ticket = source.availableWeighTickets?.find(candidate => candidate.id === line.weighTicketId);
        const moisturePct = selectedMoisture(source, line.qualityReportId);
        const baseQuantity = ticket ? ticketQuantity(source, ticket, line.qualityReportId) : source.remainingQuantity;
        const reference = result?.sourceSnapshot?.lineAdjustment?.contractUnitPrice;
        return <Fragment key={source.id}><tr className="border-t align-top">
          <td className="px-4 py-4"><div className="break-all font-mono text-xs leading-5">{source.waybillNo}</div><div className="mt-1 font-medium">{source.plateNo}</div></td>
          <td className="space-y-1 px-4 py-4 text-xs tabular-nums"><div className="flex justify-between gap-3"><span className="text-muted-foreground">净重</span><span>{tons(ticket?.netWeight)} 吨</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">水分</span><span>{moisturePct == null ? '—' : Number(moisturePct).toFixed(2) + '%'}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">折干</span><span>{tons(dryWeight(ticket?.netWeight, moisturePct))} 吨</span></div></td>
          <td className="space-y-2 px-4 py-4"><label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" disabled={busy || Boolean(source.followSales)} title={source.followSales ? '直拨采购数量跟随销售结算，不能单独调整' : undefined} aria-label={source.waybillNo + '数量调整'} checked={line.negotiatedQuantity} onChange={event => void changeLineMode(source, 'QUANTITY', event.target.checked)}/>调整{source.pricingQuantityBasis === 'DRY_MATTER' ? '干基' : '净重'}</label><Input aria-label={source.waybillNo + '调整后数量'} className="text-right tabular-nums" type="number" min="0.001" step="0.001" readOnly={!line.negotiatedQuantity} disabled={busy} value={line.quantity} onChange={event => setField(source.id, { quantity: event.target.value })}/><p className="text-xs text-muted-foreground">原值 {tons(baseQuantity)} 吨{line.negotiatedQuantity && ' → ' + tons(Number(line.quantity)) + ' 吨'}</p></td>
          <td className="space-y-2 px-4 py-4"><label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" disabled={busy} aria-label={source.waybillNo + '单价调整'} checked={line.priceAdjusted} onChange={event => void changeLineMode(source, 'PRICE', event.target.checked)}/>调整单价</label><Input aria-label={source.waybillNo + '调整后含税单价'} className="text-right tabular-nums" type="number" min="0.0001" step="0.0001" readOnly={!line.priceAdjusted} disabled={busy} placeholder="待计算" value={line.priceAdjusted ? line.adjustedUnitPrice : result?.unitPrice ?? ''} onChange={event => setField(source.id, { adjustedUnitPrice: event.target.value })}/><p className="text-xs text-muted-foreground">合同 {reference == null ? '待计算' : unitPriceText(reference)}{line.priceAdjusted && ' → ' + unitPriceText(Number(line.adjustedUnitPrice))}</p></td>
          <td className="space-y-2 px-4 py-4"><textarea aria-label={source.waybillNo + '依据与调整说明'} className="min-h-[90px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm" rows={3} value={line.remarks} placeholder={line.negotiatedQuantity || line.priceAdjusted ? '请填写本车调整说明' : '改选磅单或报告时填写依据'} onChange={event => setField(source.id, { remarks: event.target.value })}/>{Number(line.adjustmentAmount) !== 0 && <p className="text-xs text-warning">历史金额调整 {paymentMoney(line.adjustmentAmount)}<Button size="sm" variant="ghost" onClick={async () => { if (await confirmAction('取消本车历史加减金额，并重新计算货款？', { title: '取消历史金额调整' })) setField(source.id, { adjustmentAmount: '0' }); }}>取消此项</Button></p>}</td>
          <td className="px-4 py-4 text-right align-middle tabular-nums">{result ? paymentMoney(result.qualityDeductionAmount) : '待计算'}</td><td className="px-4 py-4 text-right align-middle font-medium tabular-nums">{result ? paymentMoney(result.totalAmount) : previewError ? '计算失败' : '待计算'}</td>
        </tr><tr className="border-t bg-muted/10"><td colSpan={7}><SettlementLineFacts source={source} line={line} result={result}/></td></tr></Fragment>;
      })}</tbody>
      <tfoot className="border-t-2 bg-surface-2 font-medium tabular-nums"><tr><td colSpan={2} className="px-4 py-4">明细合计（{selectedRows.length} 车）</td><td className="px-4 py-4 text-right">{tons(detailTotals.quantity)}</td><td className="px-4 py-4 text-right text-muted-foreground">—</td><td className="px-4 py-4 text-xs font-normal text-muted-foreground">整单调整不摊回车辆</td><td className="px-4 py-4 text-right">{preview ? paymentMoney(preview.settlementAdjustment?.base.qualityDeductionAmount ?? preview.qualityDeductionAmount) : '待计算'}</td><td className="px-4 py-4 text-right">{preview ? paymentMoney(preview.settlementAdjustment?.base.totalAmount ?? preview.totalAmount) : '待计算'}</td></tr></tfoot>
    </table></div>
    <section className="space-y-4 rounded-md border bg-surface-2 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">最终结算</h3><div className="flex flex-wrap gap-2">{([['NONE', '按明细合计'], ['QUANTITY', '调整总干基'], ['AMOUNT', '调整总金额']] as const).map(([mode, label]) => <Button key={mode} size="sm" variant={adjustmentMode === mode ? 'default' : 'outline'} aria-pressed={adjustmentMode === mode} disabled={busy || (mode === 'QUANTITY' && selectedRows.some(source => source.pricingQuantityBasis !== 'DRY_MATTER'))} onClick={() => void changeOverallMode(mode)}>{label}</Button>)}</div></div>
      <div className="grid gap-4 md:grid-cols-3">
        <label data-validation-field="settlement-adjustment-quantity" className="space-y-1 text-sm"><span>最终结算数量（{selectedRows.every(source => source.pricingQuantityBasis === 'DRY_MATTER') ? '干基' : '计价'}吨）</span>
          <Input id="settlement-adjustment-quantity" aria-label="最终结算数量" aria-invalid={Boolean(adjustmentIssues.quantity) || undefined}
            aria-describedby={adjustmentMode === 'QUANTITY' ? `settlement-adjustment-ceiling${adjustmentIssues.quantity ? ' settlement-adjustment-quantity-error' : ''}` : undefined}
            className={adjustmentIssues.quantity ? 'border-destructive focus-visible:ring-destructive' : ''}
            type="number" min="0.001" step="0.001" disabled={busy} readOnly={adjustmentMode !== 'QUANTITY'}
            value={adjustmentMode === 'QUANTITY' ? finalQuantity : preview?.quantity ?? detailTotals.quantity ?? ''}
            onChange={event => { setFinalQuantity(event.target.value); clearAdjustmentErrors(); }}/>
          {adjustmentMode === 'QUANTITY' && <p id="settlement-adjustment-ceiling" className="text-xs text-muted-foreground">{negotiationCeiling == null ? '可协商上限待核对，请补齐双方单据。' : `可协商上限：${tons(negotiationCeiling)} 吨，按双方有效磅单及质检报告计算。`}</p>}
          {adjustmentIssues.quantity && <p id="settlement-adjustment-quantity-error" role="alert" className="text-xs text-destructive">{adjustmentIssues.quantity}</p>}
        </label>
        <label data-validation-field="settlement-adjustment-amount" className="space-y-1 text-sm"><span>最终结算金额（含税元）</span>
          <Input id="settlement-adjustment-amount" aria-label="最终结算金额" aria-invalid={Boolean(adjustmentIssues.amount) || undefined}
            aria-describedby={adjustmentIssues.amount ? 'settlement-adjustment-amount-error' : undefined}
            className={adjustmentIssues.amount ? 'border-destructive focus-visible:ring-destructive' : ''}
            type="number" min="0.01" step="0.01" placeholder="待计算" disabled={busy} readOnly={adjustmentMode !== 'AMOUNT'}
            value={adjustmentMode === 'AMOUNT' ? finalAmount : preview?.totalAmount ?? ''}
            onChange={event => { setFinalAmount(event.target.value); clearAdjustmentErrors(); }}/>
          {adjustmentIssues.amount && <p id="settlement-adjustment-amount-error" role="alert" className="text-xs text-destructive">{adjustmentIssues.amount}</p>}
        </label>
        <div className="space-y-1 pt-1 text-xs text-muted-foreground"><p>数量、单价或整单金额调整不可重复叠加。</p>{adjustmentMode === 'QUANTITY' && <p>按合同单价同步重算金额，并计入适用质量扣款。</p>}{preview?.settlementAdjustment && adjustmentMode !== 'NONE' && <p>数量差额 {tons(preview.settlementAdjustment.quantityDifference)} 吨；金额差额 {paymentMoney(preview.settlementAdjustment.amountDifference)}</p>}</div>
      </div>
      {adjustmentMode !== 'NONE' && <label data-validation-field="settlement-adjustment-reason" className="block space-y-1 text-sm"><span>整单调整说明 *</span>
        <textarea id="settlement-adjustment-reason" aria-label="整单调整说明" aria-invalid={Boolean(adjustmentIssues.reason) || undefined}
          aria-describedby={adjustmentIssues.reason ? 'settlement-adjustment-reason-error' : undefined} rows={2}
          className={`w-full rounded-md border bg-background p-2 ${adjustmentIssues.reason ? 'border-destructive focus-visible:outline-destructive' : ''}`}
          value={adjustmentReason} onChange={event => { setAdjustmentReason(event.target.value); clearAdjustmentErrors(); }} placeholder="请填写双方确认的调整依据"/>
        {adjustmentIssues.reason && <p id="settlement-adjustment-reason-error" role="alert" className="text-xs text-destructive">{adjustmentIssues.reason}</p>}
      </label>}
    </section></Card>}
    {gradeTier && <Card className="p-5"><label className="block max-w-xs space-y-1 text-sm">{sources.some(source => source.contractTaxRatePct != null) ? '合同税率（%）' : '本次结算税率（%）*'}<Input type="number" min="0" max="100" step="0.01" value={taxRatePct} readOnly={sources.some(source => source.contractTaxRatePct != null)} onChange={e => setTaxRatePct(e.target.value)} /></label></Card>}
    <Card className="grid gap-4 p-5 md:grid-cols-2"><label className="space-y-1 text-sm">约定{sales ? '收款' : '付款'}到期日<Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label><label className="space-y-1 text-sm">结算说明<Input value={remarks} onChange={e => setRemarks(e.target.value)} /></label><div className="md:col-span-2"><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={isFinalSettlement} onChange={e => setIsFinalSettlement(e.target.checked)} />本次为最终结算</label><p className="mt-1 text-xs text-muted-foreground">勾选后核对合同短装下限；分批结算无需勾选。</p></div></Card>
    {previewOpen && preview && <Card ref={previewRef} className="space-y-4 p-5" id="goods-settlement-preview">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">结算单预览</h2><p className="text-xs text-muted-foreground">预览稿未保存；正式结算单在确认后打印并交双方签章。</p></div><Button type="button" variant="ghost" size="sm" onClick={() => setPreviewOpen(false)}>收起</Button></div>
      {preview.quantityReview?.differences?.length > 0 && <p role="alert" className="rounded border border-warning-border bg-warning-bg p-3 text-sm text-warning">存在数量差异，生成时请填写双方确认说明，线下签字盖章。</p>}
      <GoodsSettlementDocumentPreview contract={contract} preview={preview} sources={sources} sales={sales} remarks={remarks} quantityReason={quantityReason} />
    </Card>}
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-4 shadow-lg"><div className="text-sm">已选 <b>{selectedTotals.count}</b> 车 · 最终结算数量 <b>{tons(preview?.quantity ?? (adjustmentMode === 'QUANTITY' ? Number(finalQuantity) : selectedTotals.quantity))}</b> 吨 · {preview ? <>货物原金额 {paymentMoney(preview.grossAmount)} · 质量扣款 {paymentMoney(preview.qualityDeductionAmount)} · 其他加减 {paymentMoney(preview.adjustmentAmount)} · 结算金额 <b>{paymentMoney(preview.totalAmount)}</b></> : <span className="text-muted-foreground">{hasAdjustmentIssues ? '待完善调整信息' : previewError ? '试算失败' : '金额待试算'}</span>}{error && <div role="alert" className="mt-1 font-medium text-warning">{error === CHECK_ADJUSTMENT_FIELDS ? error : <>{previewError ? '无法生成结算单预览：' : '请先处理：'}{error}</>}</div>}</div><div className="flex flex-wrap items-center gap-2">{followSaveBlocked && <span className="text-xs text-warning">请先完成销售结算审批，当前仅可预览</span>}<Button type="button" variant="outline" disabled={busy} onClick={() => void submit(false)}>{busy ? '生成预览中…' : '预览结算单'}</Button><Button type="button" disabled={busy || followSaveBlocked} onClick={() => void submit(true)}>{busy ? '处理中…' : editId ? '保存草稿修改' : '保存结算草稿'}</Button></div></div>
    <Dialog open={quantityDialogOpen} onOpenChange={open => { if (!busy) setQuantityDialogOpen(open); }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>确认溢短装数量差异</DialogTitle><DialogDescription>按实际数量生成结算单，说明进入打印件，供双方线下签字盖章。</DialogDescription></DialogHeader>
      {quantityDialogReview && <QuantityReviewSummary review={quantityDialogReview} />}
      <label className="mt-4 block space-y-1 text-sm"><span>数量差异说明 *</span><textarea aria-label="数量差异说明" rows={3} className={`w-full rounded-md border bg-background p-2 ${quantityDialogError && !quantityReason.trim() ? 'border-destructive' : ''}`} value={quantityReason} onChange={e => { setQuantityReason(e.target.value); setQuantityDialogError(''); }} placeholder="请填写实际数量偏差及双方确认的处理依据" /></label>
      <div className="mt-4 space-y-2"><label className="block text-sm">依据附件（选填）<input aria-label="数量差异依据附件" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-2 block w-full text-sm" onChange={e => { const files = Array.from(e.target.files || []); if (files.some(file => file.size > 20 * 1024 * 1024 || !/\.(jpe?g|png|webp|pdf)$/i.test(file.name))) setQuantityDialogError('仅支持 JPG、PNG、WEBP、PDF，单个文件不超过 20MB'); else { setVarianceFiles(current => [...current, ...files]); setQuantityDialogError(''); } e.target.value = ''; }} /></label>
        {varianceFiles.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{varianceFiles.map((file, index) => <div key={`${file.name}-${index}`} className="space-y-2 rounded-md border p-2"><LocalAttachmentThumbnail file={file} large /><p className="truncate text-xs" title={file.name}>{file.name}</p><Button type="button" size="sm" variant="ghost" onClick={() => setVarianceFiles(files => files.filter((_, i) => i !== index))}>移除</Button></div>)}</div>}
      </div>
      {quantityDialogError && <p role="alert" className="mt-3 text-sm text-destructive">{quantityDialogError}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setQuantityDialogOpen(false)}>返回修改</Button><Button type="button" disabled={busy} onClick={() => void submit(true, true)}>{busy ? '正在生成…' : '确认按实际数量生成'}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

function GoodsSettlementDocumentPreview({ contract, preview, sources, sales, remarks, quantityReason }: {
  contract?: ContractOption; preview: any; sources: GoodsSource[]; sales: boolean; remarks: string; quantityReason: string;
}) {
  const supplier = contract?.seller?.name || (!sales ? contract?.counterparty?.name : undefined) || '—';
  const purchaser = contract?.buyer?.name || (sales ? contract?.counterparty?.name : undefined) || '—';
  const lines: any[] = preview.lines || [];
  const number = (value: unknown, digits = 2) => value == null || value === '' ? '—'
    : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const date = (value?: string | null) => value ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—';
  const totalKnown = (key: 'grossWeight' | 'tareWeight' | 'netWeight' | 'dryQuantity') =>
    lines.length && lines.every(line => line.sourceSnapshot?.[key] != null)
      ? lines.reduce((sum, line) => sum + Number(line.sourceSnapshot[key]), 0) : null;
  return <div className="overflow-x-auto rounded-md border bg-slate-100 p-3 sm:p-5">
    <article className="mx-auto w-[1120px] bg-white p-8 text-black shadow-sm">
      <h3 className="text-center text-xl font-bold tracking-wider">{sales ? `${supplier}销售结算单` : `${purchaser}采购结算单`}</h3>
      <div className="mt-1 text-center text-xs">预览稿 · 未保存</div>
      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1 text-xs"><div>供方：{supplier}</div><div>需方：{purchaser}</div><div>合同编号：{contract?.contractNo || '—'}</div><div>结算单号：保存后生成</div><div>合同名称：{contract?.title || '—'}</div><div>结算日期：确认后生成</div></div>
      <table className="mt-5 w-full table-fixed border-collapse text-[11px] leading-tight">
        <colgroup>{[3, 8, 8, 13, 6, 7, 7, 7, 7, 8, 9, 8, 9].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
        <thead><tr>{['序号', sales ? '交付日期' : '入库日期', '车牌', '货物', '水分（%）', '毛重（吨）', '皮重（吨）', '净重（吨）', '干基（吨）', '结算数量（吨）', '含税单价（元/吨）', '扣款/调整净额（元）', '含税金额（元）'].map(label => <th key={label} className="border border-black p-1 text-center">{label}</th>)}</tr></thead>
        <tbody>{lines.map((line, index) => {
          const source = line.sourceSnapshot || {};
          const vehicle = sources.find(item => item.id === line.waybillLineItemId);
          const adjustment = Number(line.adjustmentAmount || 0) - Number(line.qualityDeductionAmount || 0);
          const values = [index + 1, date(sales ? source.salesCompletionConfirmedAt : source.inboundDate), source.plateNo || vehicle?.plateNo || '—', source.materialName || vehicle?.materialName || '—', number(source.measuredMoisturePct), number(source.grossWeight), number(source.tareWeight), number(source.netWeight), number(source.dryQuantity), number(line.quantity, 3), number(line.unitPrice, 4), adjustment ? number(adjustment) : '—', number(line.totalAmount)];
          return <tr key={line.waybillLineItemId || index}>{values.map((value, cellIndex) => <td key={cellIndex} className={`border border-black p-1 ${cellIndex === 3 ? '' : 'text-center tabular-nums'}`}>{value}</td>)}</tr>;
        })}<tr className="font-semibold">{['明细合计', '', '', '', '', number(totalKnown('grossWeight')), number(totalKnown('tareWeight')), number(totalKnown('netWeight')), number(totalKnown('dryQuantity')), number(preview.settlementAdjustment?.base.quantity ?? preview.quantity, 3), '见明细', number(Number(preview.settlementAdjustment?.base.adjustmentAmount ?? preview.adjustmentAmount ?? 0) - Number(preview.settlementAdjustment?.base.qualityDeductionAmount ?? preview.qualityDeductionAmount ?? 0)), number(preview.settlementAdjustment?.base.totalAmount ?? preview.totalAmount)].map((value, index) => <td key={index} className="border border-black p-1 text-center tabular-nums">{value}</td>)}</tr><tr className="font-semibold"><td colSpan={9} className="border border-black p-1">最终结算</td><td className="border border-black p-1 text-right">{number(preview.quantity, 3)}</td><td className="border border-black p-1 text-right">{preview.settlementAdjustment?.unitPrice == null ? '见明细' : number(preview.settlementAdjustment.unitPrice, 4)}</td><td className="border border-black p-1 text-right">{number(Number(preview.adjustmentAmount || 0) - Number(preview.qualityDeductionAmount || 0))}</td><td className="border border-black p-1 text-right">{number(preview.totalAmount)}</td></tr></tbody>
      </table>
      <div className="mt-3 flex justify-end gap-6 border-b border-black pb-2 text-xs"><span>质量扣款：{number(preview.qualityDeductionAmount)} 元</span><span>其他加减：{number(preview.adjustmentAmount)} 元</span><strong>本次结算金额：{number(preview.totalAmount)} 元</strong></div>
      <div className="mt-3 min-h-12 border border-black p-2 text-xs"><strong>备注／双方确认事项：</strong>{remarks || '　'}{preview.settlementAdjustment?.mode && preview.settlementAdjustment.mode !== 'NONE' && <p className="mt-1">整单调整：{preview.settlementAdjustment.reason}；数量差额 {number(preview.settlementAdjustment.quantityDifference, 3)} 吨，金额差额 {number(preview.settlementAdjustment.amountDifference)} 元。</p>}{preview.quantityReview?.differences?.length > 0 && <p className="mt-1">{quantityReviewPrintText({ ...preview.quantityReview, reason: quantityReason || '生成时填写' })}</p>}</div>
      {lines.some(line => line.remarks) && <div className="mt-2 text-[11px]">逐车说明：{lines.filter(line => line.remarks).map(line => `${line.sourceSnapshot?.plateNo || line.sourceSnapshot?.waybillNo || '车辆'}：${line.remarks}`).join('；')}</div>}
      <div className="mt-6 grid grid-cols-2 gap-12 text-xs"><div><strong>供方确认：{supplier}</strong><p className="mt-5">经办人签字：____________　盖章：____________</p><p className="mt-4">日期：______年____月____日</p></div><div><strong>需方确认：{purchaser}</strong><p className="mt-5">经办人签字：____________　盖章：____________</p><p className="mt-4">日期：______年____月____日</p></div></div>
    </article>
  </div>;
}

function BasisMetric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="rounded-md border bg-background px-3 py-2.5"><div className="text-xs text-muted-foreground">{label}</div><div className={`mt-1 tabular-nums ${emphasis ? 'font-semibold text-primary' : 'font-medium'}`}>{value}</div></div>;
}

function SettlementLineFacts({ source, line, result }: { source: GoodsSource; line: Line; result?: any }) {
  const snapshot = result?.sourceSnapshot || source;
  const selectedTicket = source.availableWeighTickets?.find(ticket => ticket.id === line.weighTicketId);
  const gradeTier = source.pricingType === 'GRADE_TIER';
  const grade = result?.measuredGradePct;
  const bandLower = result?.gradeBandLower;
  const bandUpper = result?.gradeBandUpper;
  const recovery = result?.measuredRecoveryPct;
  const fact = (label: string, value: string) => <div key={label}><span className="text-muted-foreground">{label}：</span><span className="tabular-nums">{value}</span></div>;
  return <details className="px-3 py-2 text-xs"><summary className="w-fit cursor-pointer text-primary">查看计价与核对</summary>
    <div className="mt-3 grid gap-x-6 gap-y-2 rounded-md bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-4">
      {fact('计价数量口径', snapshot.pricingQuantityBasis === 'DRY_MATTER' ? '选用净重折干' : '选用净重')}
      {fact('累计已结算', `${tons(source.usedQuantity)} 吨`)}
      {fact('当前可结算', `${tons(snapshot.remainingQuantity ?? source.remainingQuantity)} 吨`)}
      {fact('本次结算磅单', selectedTicket?.ticketNo || '—')}
      {fact('出入库磅单', source.inventoryTicketNo ? `${source.inventoryTicketNo} · ${tons(source.inventoryNetWeight)} 吨` : '—')}
      {gradeTier && <>
        {fact('CaF₂ 实测品位', grade == null ? '待试算' : `${grade}%`)}
        {fact('命中品位档', bandLower == null || bandUpper == null ? '待试算' : `${bandLower}% ≤ CaF₂ < ${bandUpper}%`)}
        {fact('档位价（不含税）', result?.gradeRateExTax == null ? '待试算' : `${result.gradeRateExTax} 元/度`)}
        {fact('选矿回收率', recovery == null ? '—' : `${recovery}%`)}
        {fact('回收率扣价', result?.recoveryDeductionPerTonExTax == null ? '—' : `${result.recoveryDeductionPerTonExTax} 元/吨（不含税）`)}
        {fact('税率', result?.taxRatePct == null ? '待试算' : `${result.taxRatePct}%`)}
        {fact('税前净额', result?.amountExTax == null ? '待试算' : paymentMoney(result.amountExTax))}
        {fact('税额', result?.taxAmount == null ? '待试算' : paymentMoney(result.taxAmount))}
      </>}
      {fact('质量扣款（含税）', result ? paymentMoney(result.qualityDeductionAmount) : '待试算')}
      {fact('其他加减', result ? paymentMoney(result.adjustmentAmount) : '待试算')}
      {fact('结算金额（含税）', result ? paymentMoney(result.totalAmount) : '待试算')}
    </div>
  </details>;
}

function WeighSideChoice({ source, stage, selectedId, lower, disabled, onSelect }: {
  source: GoodsSource; stage: 'SHIPPING' | 'RECEIVING'; selectedId?: string; lower: boolean; disabled: boolean; onSelect: (ticket: WeighTicket) => void;
}) {
  const tickets = source.availableWeighTickets?.filter(ticket => ticket.weighingStage === stage) || [];
  if (!tickets.length) return <span className="text-xs text-muted-foreground">暂无磅单</span>;
  return <div className="space-y-1.5">{tickets.map(ticket => {
    const selected = ticket.id === selectedId;
    const unavailable = ticket.isSelectable === false || ticket.netWeight == null;
    const isLower = lower && ticket.id === ticketForStage(source, stage)?.id;
    return <button key={ticket.id} type="button" aria-pressed={selected} aria-label={`${source.waybillNo}选用${stage === 'SHIPPING' ? '发货' : '收货'}磅单 ${ticket.ticketNo}`}
      disabled={disabled || unavailable} onClick={() => onSelect(ticket)}
      className={`block w-full space-y-2 rounded-md border px-3 py-2.5 text-left text-xs transition-colors ${selected ? 'border-primary bg-primary-bg text-primary' : isLower ? 'border-warning-border bg-warning-bg' : 'border-border bg-background hover:border-primary-border hover:bg-muted/30'} disabled:cursor-not-allowed disabled:opacity-60`}>
      <span className="block truncate font-mono" title={ticket.ticketNo}>{ticket.ticketNo}</span>
      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"><span className={`whitespace-nowrap tabular-nums ${isLower ? 'font-semibold text-warning' : ''}`}>{tons(ticket.netWeight)} 吨</span><span>{unavailable ? '待采信' : selected ? '已选' : '选用'}{isLower && <span className="ml-1 text-warning">较低</span>}</span></span>
    </button>;
  })}</div>;
}
