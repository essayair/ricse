import { api } from './api';

interface OptionPage<T> {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

/** 选择框不能拿列表的第一页充当全部选项；保留原筛选，并按服务端分页逐页读取。 */
export async function loadAllOptions<T extends { id: string }>(
  path: string,
  fetchPage: (url: string) => Promise<OptionPage<T>> = url => api.get<OptionPage<T>>(url),
): Promise<{ items: T[] }> {
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('pageSize', '200');
  const items = new Map<string, T>();
  for (let page = 1; page <= 10000; page++) {
    params.set('page', String(page));
    const response = await fetchPage(`${pathname}?${params}`);
    const pagination = response?.pagination;
    if (!Array.isArray(response?.items) || !pagination || pagination.page !== page
      || !Number.isInteger(pagination.totalPages) || pagination.totalPages < 0
      || !Number.isInteger(pagination.total) || pagination.total < 0) {
      throw new Error('选项分页信息异常，请刷新后重试');
    }
    let added = 0;
    for (const item of response.items) {
      if (!items.has(item.id)) added++;
      items.set(item.id, item);
    }
    if (page >= pagination.totalPages) {
      if (items.size < pagination.total) throw new Error('选项未加载完整，请刷新后重试');
      return { items: Array.from(items.values()) };
    }
    if (!added) throw new Error('选项未加载完整，请刷新后重试');
  }
  throw new Error('选项数据量过大，请缩小查询范围后重试');
}
