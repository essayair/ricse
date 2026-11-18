"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deductibleMoisturePct = deductibleMoisturePct;
exports.moisturePricingQuantity = moisturePricingQuantity;
exports.moisturePricingSnapshot = moisturePricingSnapshot;
function deductibleMoisturePct(moisture, rule) {
    if (!Number.isFinite(moisture) || moisture < 0 || moisture >= 100)
        return null;
    if (rule?.moistureDeductionMode === 'EXCESS') {
        const base = rule.moistureBasePct;
        if (base == null || !Number.isFinite(base) || base < 0 || base >= 100)
            return null;
        return Math.max(0, Math.round((moisture - base) * 1e9) / 1e9);
    }
    if (rule?.moistureDeductionMode && rule.moistureDeductionMode !== 'ACTUAL')
        return null;
    return moisture;
}
function moisturePricingQuantity(net, moisture, rule) {
    if (net == null || !Number.isFinite(net) || net < 0 || moisture == null)
        return null;
    const deducted = deductibleMoisturePct(moisture, rule);
    return deducted == null ? null : Math.round((net * (100 - deducted) * 10) + Number.EPSILON) / 1000;
}
/** 仅新规则携带字段，避免改变既有来源签名。 */
function moisturePricingSnapshot(rule) {
    return rule?.moistureDeductionMode ? {
        moistureDeductionMode: rule.moistureDeductionMode,
        ...(rule.moistureDeductionMode === 'EXCESS' ? { moistureBasePct: rule.moistureBasePct } : {}),
    } : {};
}
