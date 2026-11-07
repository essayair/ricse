/** 每行先按业务精度取整再合计；缺失值不按零伪造，百分比和单价不参与合计。 */
export function settlementColumnTotal(values: unknown[], precision = 3): number | null {
  const scale = 10 ** precision;
  let sum = 0;
  for (const value of values) {
    if (value == null || (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value))) return null;
    sum += Math.round(Number(value) * scale);
  }
  return sum / scale;
}
