export interface MoisturePricingRule {
  moistureDeductionMode?: 'ACTUAL' | 'EXCESS';
  moistureBasePct?: number | null;
}
export function deductibleMoisturePct(moisture: number, rule?: MoisturePricingRule | null): number | null;
export function moisturePricingQuantity(net: number | null | undefined, moisture: number | null | undefined, rule?: MoisturePricingRule | null): number | null;
export function moisturePricingSnapshot(rule?: MoisturePricingRule | null): MoisturePricingRule;
