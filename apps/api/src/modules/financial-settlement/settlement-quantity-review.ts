import { Prisma } from '@prisma/client';

export function settlementQuantityReview(
  contract: { overfillPct?: Prisma.Decimal.Value | null; shortfallPct?: Prisma.Decimal.Value | null },
  items: Array<{ id: string; materialName?: string | null; materialId?: string | null; quantity: Prisma.Decimal.Value }>,
  lines: Array<{ quantity?: Prisma.Decimal.Value | null; sourceSnapshot?: unknown }>,
  previousLines: Array<{ quantity?: Prisma.Decimal.Value | null; sourceSnapshot?: unknown }>,
  finalSettlement = false,
) {
  const sum = (rows: typeof lines, id: string) => rows.reduce((total, row) => {
    const source = row.sourceSnapshot as any;
    const adjustment = source?.settlementAdjustment;
    const quantity = source?.contractLineItemId === id ? row.quantity || 0 : 0;
    const difference = adjustment?.version === 1 && adjustment.mode === 'QUANTITY' && adjustment.contractLineItemId === id ? adjustment.quantityDifference : 0;
    return total.plus(quantity).plus(difference || 0);
  }, new Prisma.Decimal(0));
  const differences = [...items].sort((a, b) => a.id.localeCompare(b.id)).flatMap(item => {
    const current = sum(lines, item.id), previous = sum(previousLines, item.id), total = current.plus(previous);
    const quantity = new Prisma.Decimal(item.quantity);
    const upper = quantity.mul(new Prisma.Decimal(1).plus(new Prisma.Decimal(contract.overfillPct ?? 0).div(100)));
    const lower = Prisma.Decimal.max(0, quantity.mul(new Prisma.Decimal(1).minus(new Prisma.Decimal(contract.shortfallPct ?? 0).div(100))));
    const type = total.greaterThan(upper) ? 'OVER' : finalSettlement && total.lessThan(lower) ? 'SHORT' : null;
    if (!type) return [];
    return [{ contractLineItemId: item.id, materialName: item.materialName || item.materialId || '物料', type,
      contractQuantity: quantity.toNumber(), lowerQuantity: lower.toDecimalPlaces(3).toNumber(), upperQuantity: upper.toDecimalPlaces(3).toNumber(),
      currentQuantity: current.toDecimalPlaces(3).toNumber(), previousQuantity: previous.toDecimalPlaces(3).toNumber(), totalQuantity: total.toDecimalPlaces(3).toNumber(),
      difference: (type === 'OVER' ? total.minus(upper) : lower.minus(total)).toDecimalPlaces(3).toNumber() }];
  });
  return { version: 1, finalSettlement, differences };
}
