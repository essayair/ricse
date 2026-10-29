import { resolvePagination } from './pagination';

describe('resolvePagination', () => {
  const options = { defaultPageSize: 20, maxPageSize: 100 };

  it('正常页码与条数原样使用', () => {
    expect(resolvePagination(3, 50, options)).toEqual({ page: 3, pageSize: 50, skip: 100 });
  });

  it('缺失、负数、零或非数字页码按第 1 页处理', () => {
    for (const page of [undefined, -1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolvePagination(page, 20, options)).toEqual({ page: 1, pageSize: 20, skip: 0 });
    }
  });

  it('小数页码和条数向下取整，保证 skip 为整数', () => {
    expect(resolvePagination(2.7, 10.9, options)).toEqual({ page: 2, pageSize: 10, skip: 10 });
  });

  it('非法条数取默认值，超出上限时截断', () => {
    expect(resolvePagination(1, Number.NaN, options).pageSize).toBe(20);
    expect(resolvePagination(1, -5, options).pageSize).toBe(20);
    expect(resolvePagination(1, 1000, options).pageSize).toBe(100);
  });

  it('未设置上限的列表保持原有不截断行为', () => {
    expect(resolvePagination(1, 1000, { defaultPageSize: 20 }).pageSize).toBe(1000);
  });
});
