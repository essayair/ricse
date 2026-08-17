export const PRODUCTION_STATUS: Record<string, string> = {
  DRAFT: '草稿',
  RELEASED: '已下达',
  MATERIAL_PREPARED: '待领料',
  IN_PROGRESS: '加工中',
  PENDING_QC: '待质检',
  PARTIAL_COMPLETED: '部分完工',
  COMPLETED: '已完工',
  CLOSED: '已关闭',
  CANCELLED: '已取消',
};

export const COMPLETION_STATUS: Record<string, string> = {
  PENDING_QC: '待质检',
  READY_TO_POST: '待入库',
  REWORK: '返工',
  SCRAPPED: '报废',
  POSTED: '已入库',
};

export const MATERIAL_ROLE: Record<string, string> = {
  RAW: '主料',
  AUXILIARY: '辅料',
  PACKAGING: '包装物',
};

export function quantity(value: unknown, unit = '吨') {
  return `${Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} ${unit === 'TON' ? '吨' : unit}`;
}

export function percent(value: unknown) {
  return value === null || value === undefined ? '-' : `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`;
}
