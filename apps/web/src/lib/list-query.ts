/**
 * 列表页筛选条件与 URL 查询参数之间的转换。
 * 只有与默认值不同的条件才写入 URL，保证默认视图的地址保持干净。
 */
export type ListQueryValues = Record<string, string>;

export interface QueryReader {
  get(name: string): string | null;
}

/** 按默认值声明的键从 URL 读取筛选条件；URL 中没有的键取默认值。 */
export function readListQuery<T extends ListQueryValues>(params: QueryReader, defaults: T): T {
  const values = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof T & string>) {
    const value = params.get(key);
    if (value !== null) values[key] = value as T[typeof key];
  }
  return values;
}

/** URL 中是否带有任何一个筛选键。 */
export function hasListQuery(params: QueryReader, defaults: ListQueryValues) {
  return Object.keys(defaults).some((key) => params.get(key) !== null);
}

/**
 * 在当前查询串上应用变更，返回新的查询串（不含问号）。
 * 等于默认值的条件从 URL 中移除；不属于本列表的其他参数（如 tab）原样保留。
 */
export function mergeListQuery(current: string, defaults: ListQueryValues, patch: Partial<ListQueryValues>) {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === (defaults[key] ?? '')) params.delete(key);
    else params.set(key, value);
  }
  return params.toString();
}

/** 只保留本列表声明的筛选键，用于在会话内记住最近一次的筛选条件。 */
export function pickListQuery(current: string, defaults: ListQueryValues) {
  const source = new URLSearchParams(current);
  const picked = new URLSearchParams();
  for (const key of Object.keys(defaults)) {
    const value = source.get(key);
    if (value !== null) picked.set(key, value);
  }
  return picked.toString();
}
