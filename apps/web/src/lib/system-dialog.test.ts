import assert from 'node:assert/strict';
import test from 'node:test';
import { alertPresentation } from './system-dialog';

const blocker = '销售常规出库必须先完成物流出库和库存扣减';
test('发运失败明确使用上下文标题与警示色，不受原因中的完成字样影响', () => {
  assert.deepEqual(alertPresentation(blocker, '发运失败'), { title: '发运失败', destructive: true });
});
test('通用原生提示中的前置条件不能被识别为操作成功', () => {
  for (const text of [blocker, '请先完成库存扣减', '操作未完成', '尚未完成出库', '无法完成操作', '保存失败，部分资料已保存']) {
    const result = alertPresentation(text);
    assert.notEqual(result.title, '操作成功'); assert.equal(result.destructive, true);
  }
});
test('实际成功信息保留正常反馈，普通信息不染错误色', () => {
  for (const text of ['操作成功', '出库已完成', '合同已保存', '资料更新完成']) assert.deepEqual(alertPresentation(text), { title: '操作成功', destructive: false });
  assert.deepEqual(alertPresentation('暂无记录'), { title: '系统提示', destructive: false });
});
