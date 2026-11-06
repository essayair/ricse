import assert from 'node:assert/strict';
import test from 'node:test';
import { hasListQuery, mergeListQuery, pickListQuery, readListQuery } from './list-query';

const defaults = { search: '', status: '', page: '1' };

test('URL 中没有的筛选键取默认值', () => {
  const params = new URLSearchParams('status=ACTIVE');
  assert.deepEqual(readListQuery(params, defaults), { search: '', status: 'ACTIVE', page: '1' });
});

test('等于默认值的条件不写入 URL，其他参数保留', () => {
  assert.equal(mergeListQuery('tab=users&status=ACTIVE', defaults, { status: '', search: '诺龙' }), 'tab=users&search=%E8%AF%BA%E9%BE%99');
  assert.equal(mergeListQuery('page=3', defaults, { page: '1' }), '');
});

test('仅识别本列表声明的筛选键', () => {
  assert.equal(hasListQuery(new URLSearchParams('tab=users'), defaults), false);
  assert.equal(hasListQuery(new URLSearchParams('page=2'), defaults), true);
  assert.equal(pickListQuery('tab=users&status=DRAFT&x=1', defaults), 'status=DRAFT');
});
