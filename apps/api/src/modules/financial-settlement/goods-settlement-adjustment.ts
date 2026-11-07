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
    const ceiling = lines.reduce((total, line) => total.plus(line.sourceSnapshot.lineAdjustment.quantityCeiling), D(0));
    if (!Number.isFinite(quantity) || quantity <= 0 || D(quantity).decimalPlaces() > 3 || D(quantity).gt(ceiling)) throw new BadRequestException('调整后干基数量必须大于零，且不能超过所选磅单支持的可结算数量');
    final = goodsAmounts(quantity, unitPrice, Number([...deductions][0]));
    if (D(quantity).eq(base.quantity)) { mode = 'NONE'; final = { ...base }; }
  }
  if (mode === 'AMOUNT') {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || D(amount).decimalPlaces() > 2) throw new BadRequestException('最终结算金额必须大于零，最多保留两位小数');
    final.totalAmount = decimalMoney(amount);
    final.adjustmentAmount = D(base.adjustmentAmount).plus(D(amount).minus(base.totalAmount)).toDecimalPlaces(2).toNumber();
    if (D(amount).eq(base.totalAmount)) mode = 'NONE';
  }
  if (final.totalAmount <= 0) throw new BadRequestException('最终结算金额必须大于零');
  if (mode !== 'NONE' && !input.reason?.trim()) throw new BadRequestException('请填写整单结算调整说明');
  return { version: 1, mode, base, final, contractLineItemId: contractLineItemId || null, unitPrice: unitPrice ?? null,
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
