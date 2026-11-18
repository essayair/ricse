interface ArchiveRow { key: string; name: string; type: string; remarks?: string; status: string; error?: string }
/** 切换整批类型后要求重新核对，已归档的资料不作静默改写。 */
export function applyArchiveBatchType<T extends { type: string; status: string; confirmed: boolean; error?: string }>(rows: T[], type: string): T[] {
  return rows.map(row => row.status === 'DONE' || row.type === type ? row : { ...row, type, confirmed: false, status: 'READY', error: '' });
}
export function archiveBatchTypeError(type: string, rows: Pick<ArchiveRow, 'type' | 'status'>[]): string | null {
  if (!type) return '请先选择影像类型，再添加文件';
  if (rows.some(row => row.status !== 'DONE' && row.type !== type)) return '本批文件类型不一致，请在顶部重新选择影像类型';
  return null;
}
export function archiveRowErrors(rows: ArchiveRow[]): Record<string, { name?: string; type?: string; remarks?: string }> {
  const names = new Map<string, number>();
  for (const row of rows) { const name = row.name.trim().toLowerCase(); if (name) names.set(name, (names.get(name) || 0) + 1); }
  return Object.fromEntries(rows.filter(row => row.status !== 'DONE').map(row => [row.key, {
    ...((row.remarks?.length || 0) > 1000 ? { remarks: '备注不能超过1000字' } : {}),
    ...(!row.type ? { type: '请选择影像类型' } : {}),
    ...(!row.name.trim() ? { name: '请填写文件名称' } : names.get(row.name.trim().toLowerCase())! > 1 ? { name: '本批次存在同名文件，请修改名称' } : row.error?.includes('同名归档文件') ? { name: row.error } : {}),
  }]));
}
