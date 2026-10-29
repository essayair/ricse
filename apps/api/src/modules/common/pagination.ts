/**
 * 列表分页参数归一：缺失、非数字、小于 1 或带小数的页码按第 1 页处理；
 * 每页条数非法时取默认值，并按各列表原有上限截断。避免负数或小数 skip 进入 Prisma 引发 500。
 */
export function resolvePagination(
  page: number | undefined,
  pageSize: number | undefined,
  options: { defaultPageSize: number; maxPageSize?: number },
) {
  const safePage = Number.isFinite(page) && (page as number) >= 1 ? Math.floor(page as number) : 1;
  const requestedSize = Number.isFinite(pageSize) && (pageSize as number) >= 1
    ? Math.floor(pageSize as number)
    : options.defaultPageSize;
  const safePageSize = options.maxPageSize ? Math.min(requestedSize, options.maxPageSize) : requestedSize;
  return { page: safePage, pageSize: safePageSize, skip: (safePage - 1) * safePageSize };
}
