/** 老合同快照可能尚未记录 materialId；不能因此被当前主数据模板覆盖。换物料时由表单主动清空快照。 */
export function contractQualitySnapshot<T extends { materialId?: string; items: unknown[] }>(value: T | null | undefined, materialId: string): T | null {
  if (!value || !Array.isArray(value.items)) return null;
  return !value.materialId || value.materialId === materialId ? value : null;
}
