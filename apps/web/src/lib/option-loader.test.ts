import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAllOptions } from './option-loader';

test('超过200条的供应商完整加载，保留角色、状态及搜索条件', async () => {
  const all = Array.from({ length: 451 }, (_, index) => ({ id: String(index), name: `供应商${index}` }));
  const calls: number[] = [];
  const result = await loadAllOptions('/partners?role=SUPPLIER&status=ACTIVE&search=矿业&pageSize=20', async url => {
    const params = new URL(url, 'http://local').searchParams;
    const page = Number(params.get('page')); calls.push(page);
    assert.equal(params.get('role'), 'SUPPLIER'); assert.equal(params.get('status'), 'ACTIVE'); assert.equal(params.get('search'), '矿业');
    return { items: all.slice((page - 1) * 200, page * 200), pagination: { page, pageSize: 200, total: 451, totalPages: 3 } };
  });
  assert.equal(result.items.length, 451); assert.equal(result.items.at(-1)?.id, '450'); assert.deepEqual(calls, [1, 2, 3]);
});
test('服务端缩小每页条数时仍按实际分页加载，不以请求条数判断结束', async () => {
  let calls = 0;
  const result = await loadAllOptions('/service-organizations?type=QUALITY_INSTITUTION', async () => {
    const page = ++calls;
    return { items: [{ id: String(page) }], pagination: { page, pageSize: 1, total: 3, totalPages: 3 } };
  });
  assert.equal(result.items.length, 3);
});
test('空列表正常结束，重复ID只保留一份', async () => {
  assert.deepEqual(await loadAllOptions('/partners', async () => ({ items: [], pagination: { page: 1, pageSize: 200, total: 0, totalPages: 0 } })), { items: [] });
  const result = await loadAllOptions('/partners', async url => {
    const page = Number(new URL(url, 'http://local').searchParams.get('page'));
    return { items: page === 1 ? [{ id: 'a' }] : [{ id: 'a' }, { id: 'b' }], pagination: { page, pageSize: 1, total: 2, totalPages: 2 } };
  });
  assert.deepEqual(result.items, [{ id: 'a' }, { id: 'b' }]);
});
test('后续页面失败或服务端忽略页码时，不把不完整选项当成功', async () => {
  await assert.rejects(loadAllOptions('/partners', async url => {
    if (new URL(url, 'http://local').searchParams.get('page') === '2') throw new Error('网络中断');
    return { items: [{ id: 'a' }], pagination: { page: 1, pageSize: 1, total: 2, totalPages: 2 } };
  }), /网络中断/);
  await assert.rejects(loadAllOptions('/partners', async () => ({ items: [{ id: 'a' }], pagination: { page: 1, pageSize: 1, total: 2, totalPages: 2 } })), /分页信息异常/);
});
test('最后一页缺失、总数未加载齐时明确失败', async () => {
  await assert.rejects(loadAllOptions('/partners', async url => {
    const page = Number(new URL(url, 'http://local').searchParams.get('page'));
    return { items: page === 1 ? [{ id: 'a' }] : [], pagination: { page, pageSize: 1, total: 2, totalPages: 2 } };
  }), /未加载完整/);
});
