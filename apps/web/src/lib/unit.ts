const UNIT_LABELS: Record<string, string> = {
  TON: '吨',
  KG: '千克',
  CUBIC_METER: '立方米',
  PIECE: '件',
  BAG: '袋',
};

export function unitLabel(unit?: string | null) {
  if (!unit) return '-';
  return UNIT_LABELS[unit.toUpperCase()] || unit;
}
