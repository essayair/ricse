import { Prisma } from '@prisma/client';
import { deductibleMoisturePct, type MoisturePricingRule } from '@ricse/shared-types/moisture-pricing';

export function settlementMoistureQuantity(net: Prisma.Decimal.Value | null | undefined, moisture: number | null, rule?: MoisturePricingRule | null): number | null {
  if (net == null || moisture == null) return null;
  const deducted = deductibleMoisturePct(moisture, rule);
  if (deducted == null) return null;
  return new Prisma.Decimal(net).mul(new Prisma.Decimal(1).minus(new Prisma.Decimal(deducted).div(100))).toDecimalPlaces(3).toNumber();
}
