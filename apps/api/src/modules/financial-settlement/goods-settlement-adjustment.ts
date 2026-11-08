import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { goodsAmounts, decimalMoney } from './payment-balance';
import { gradeTierAmounts } from './settlement-pricing';

type Source = {
  remainingQuantity: number; negotiableRemainingQuantity?: number; unitPrice: number; deductionPerTon?: number; recoveryDeductionPerTon?: number;
  pricingQuantityBasis?: string; contractLineItemId?: string;
};
export type SummaryAdjustmentInput = { mode: 'NONE' | 'QUANTITY' | 'AMOUNT'; quantity?: number; amount?: number; reason?: string };
type Amounts = { quantity: number; grossAmount: number; qualityDeductionAmount: number; adjustmentAmount: number; totalAmount: number };
const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

export function adjustedGoodsLine(source: Source, input: { quantity: number; adjustedUnitPrice?: number; adjustmentAmount?: number; remarks?: string }, gradeTier: boolean, taxRatePct?: number | null) {
  const factor = gradeTier ? D(1).plus(D(taxRatePct || 0).div(100)) : D(1);
  const contractUnitPrice = D(source.unitPrice).mul(factor).toDecimalPlaces(4).toNumber();
  const deductionPerTon = gradeTier ? D(source.recoveryDeductionPerTon || 0).mul(factor).toNumber() : source.deductionPerTon || 0;
  const unitPrice = input.adjustedUnitPrice ?? contractUnitPrice;
  const priceAdjusted = !D(unitPrice).eq(contractUnitPrice), quantityAdjusted = !D(input.quantity).eq(source.remainingQuantity);
  if (priceAdjusted && quantityAdjusted) throw new BadRequestException('本车数量调整与单价调整只能选择一种，请先恢复另一项');
  if (D(unitPrice).lte(0) || !D(unitPrice).isFinite()) throw new BadRequestException('本车调整后单价必须大于零');
  if ((priceAdjusted || quantityAdjusted) && !input.remarks?.trim()) throw new BadRequestException('调整本车数量或单价时，请填写调整说明');
  if (priceAdjusted && Number(input.adjustmentAmount || 0) !== 0) throw new BadRequestException('本车不能同时调整单价和叠加历史加减金额，请先取消历史金额调整');
  let amounts: ReturnType<typeof goodsAmounts> & { amountExTax?: number; taxAmount?: number };
  if (!priceAdjusted && gradeTier) amounts = gradeTierAmounts(input.quantity, source.unitPrice, source.recoveryDeductionPerTon, taxRatePct || 0, input.adjustmentAmount || 0);
  else {
    amounts = goodsAmounts(input.quantity, unitPrice, deductionPerTon, input.adjustmentAmount || 0);
    if (gradeTier) {
      const net = D(amounts.grossAmount).minus(amounts.qualityDeductionAmount);
      amounts.amountExTax = net.div(factor).toDecimalPlaces(2).toNumber();
      amounts.taxAmount = net.minus(amounts.amountExTax).toNumber();
    }
  }
  return { amounts, unitPrice, adjustment: { version: 1, quantityAdjusted, priceAdjusted,
    baseQuantity: source.remainingQuantity, contractUnitPrice, finalUnitPrice: unitPrice,
    deductionPerTon, quantityCeiling: source.negotiableRemainingQuantity ?? source.remainingQuantity,
    reason: input.remarks?.trim() || '' } };
}

type Line = Amounts & { sourceSnapshot: any };
export function goodsSettlementSummary(lines: Line[], input: SummaryAdjustmentInput = { mode: 'NONE' }) {
  const sum = (key: keyof Amounts) => lines.reduce((total, line) => total.plus(line[key]), D(0)).toDecimalPlaces(key === 'quantity' ? 3 : 2).toNumber();
  const base: Amounts = { quantity: sum('quantity'), grossAmount: sum('grossAmount'), qualityDeductionAmount: sum('qualityDeductionAmount'), adjustmentAmount: sum('adjustmentAmount'), totalAmount: sum('totalAmount') };
  let final = { ...base }, mode = input.mode;
  const quantityCeiling = lines.reduce((total, line) => total.plus(line.sourceSnapshot?.lineAdjustment?.quantityCeiling ?? line.quantity), D(0)).toDecimalPlaces(3).toNumber();
  if (!['NONE', 'QUANTITY', 'AMOUNT'].includes(mode)) throw new BadRequestException('整单调整方式无效');
  if ((mode !== 'QUANTITY' && input.quantity != null) || (mode !== 'AMOUNT' && input.amount != null)) throw new BadRequestException('整单数量调整与金额调整只能选择一种，不能叠加');
  if (mode !== 'NONE' && lines.some(line => line.sourceSnapshot?.lineAdjustment?.quantityAdjusted || line.sourceSnapshot?.lineAdjustment?.priceAdjusted || Number(line.adjustmentAmount) !== 0)) {
    throw new BadRequestException('已有逐车数量、单价或历史金额调整，请先恢复逐车系统计算，再进行整单调整');
  }
  let contractLineItemId: string | undefined, unitPrice: number | undefined;
  if (mode === 'QUANTITY') {
    if (!lines.length || lines.some(line => line.sourceSnapshot?.pricingQuantityBasis !== 'DRY_MATTER')) throw new BadRequestException('整单数量调整只支持干基数量，净重及实物数量不能整体修改');
    const itemIds = new Set(lines.map(line => line.sourceSnapshot?.contractLineItemId));
    const prices = new Set(lines.map(line => String(line.sourceSnapshot?.lineAdjustment?.contractUnitPrice)));
    const deductions = new Set(lines.map(line => String(line.sourceSnapshot?.lineAdjustment?.deductionPerTon)));
    if (itemIds.size !== 1 || ![...itemIds][0] || prices.size !== 1 || deductions.size !== 1 || [...prices][0] === 'undefined' || [...deductions][0] === 'undefined') {
      throw new BadRequestException('所选车辆物料、合同单价或每吨扣款不一致，无法按统一单价调整总干基，请改用逐车调整');
    }
    contractLineItemId = [...itemIds][0]; unitPrice = Number([...prices][0]);
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('请填写大于 0 的协商干基数量。');
    if (D(quantity).decimalPlaces() > 3) throw new BadRequestException('干基数量最多保留 3 位小数。');
    if (D(quantity).gt(quantityCeiling)) throw new BadRequestException(`协商干基数量不能超过 ${quantityCeiling.toFixed(3)} 吨，请核对双方单据或修改数量。`);
    final = goodsAmounts(quantity, unitPrice, Number([...deductions][0]));
    if (D(quantity).eq(base.quantity)) { mode = 'NONE'; final = { ...base }; }
  }
  if (mode === 'AMOUNT') {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('请填写大于 0 的结算金额。');
    if (D(amount).decimalPlaces() > 2) throw new BadRequestException('结算金额最多保留 2 位小数。');
    final.totalAmount = decimalMoney(amount);
    final.adjustmentAmount = D(base.adjustmentAmount).plus(D(amount).minus(base.totalAmount)).toDecimalPlaces(2).toNumber();
    if (D(amount).eq(base.totalAmount)) mode = 'NONE';
  }
  if (final.totalAmount <= 0) throw new BadRequestException('最终结算金额必须大于零');
  if (mode !== 'NONE' && !input.reason?.trim()) throw new BadRequestException('请填写双方协商调整的原因。');
  return { version: 1, mode, base, final, quantityCeiling, contractLineItemId: contractLineItemId || null, unitPrice: unitPrice ?? null,
    quantityDifference: D(final.quantity).minus(base.quantity).toDecimalPlaces(3).toNumber(),
    amountDifference: D(final.totalAmount).minus(base.totalAmount).toDecimalPlaces(2).toNumber(), reason: mode === 'NONE' ? '' : input.reason!.trim() };
}

export function assertGoodsSettlementSummary(item: { quantity?: any; grossAmount: any; qualityDeductionAmount: any; adjustmentAmount: any; totalAmount: any; lines: any[] }) {
  const stored = item.lines.map(line => line.sourceSnapshot?.settlementAdjustment).find(Boolean);
  if (!stored || stored.version !== 1) return; // 历史单据按原快照处理，不追溯重算。
  const input: SummaryAdjustmentInput = { mode: stored.mode, reason: stored.reason,
    ...(stored.mode === 'QUANTITY' ? { quantity: stored.final.quantity } : stored.mode === 'AMOUNT' ? { amount: stored.final.totalAmount } : {}) };
  const current = goodsSettlementSummary(item.lines.map(line => ({ ...line,
    quantity: Number(line.quantity), grossAmount: Number(line.grossAmount), qualityDeductionAmount: Number(line.qualityDeductionAmount), adjustmentAmount: Number(line.adjustmentAmount), totalAmount: Number(line.totalAmount) })), input);
  for (const key of ['quantity', 'grossAmount', 'qualityDeductionAmount', 'adjustmentAmount', 'totalAmount'] as const) {
    if (!D(item[key] ?? 0).eq(current.final[key]) || !D(stored.final[key]).eq(current.final[key])) throw new BadRequestException('最终结算数量或金额与调整依据不一致，请重新编辑预览');
  }
}

/** 确认、审批时重新读取双方依据；不能只信保存时的协商上限快照。 */
export function assertCurrentGoodsQuantityCeiling(
  item: { lines: Array<{ waybillLineItemId?: string | null; sourceSnapshot?: any }> },
  sources: Array<{ id: string; remainingQuantity: number; negotiableRemainingQuantity?: number }>,
) {
  const summary = item.lines.map(line => line.sourceSnapshot?.settlementAdjustment).find(Boolean);
  if (!summary || summary.version !== 1 || summary.mode !== 'QUANTITY') return;
  const ceiling = item.lines.filter(line => line.waybillLineItemId).reduce((total, line) => {
    const source = sources.find(candidate => candidate.id === line.waybillLineItemId);
    return total.plus(source?.negotiableRemainingQuantity ?? source?.remainingQuantity ?? 0);
  }, D(0));
  if (D(summary.final.quantity).gt(ceiling)) {
    throw new BadRequestException(`双方计量或质检依据已变更，当前可协商数量为 ${ceiling.toFixed(3)} 吨，请重新核对最终干基数量`);
  }
}
