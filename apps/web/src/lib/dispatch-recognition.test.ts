import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchDate, dispatchField, splitDispatchLines } from './dispatch-recognition';

test('一辆车多行字段仍识别为一张运单，保留司机、地址和日期', () => {
  const text = '车牌：甘A12345\n司机姓名：张三\n手机号：13800000001\n起运地：玉门仓库\n计划发运时间：2026-10-23 08:30';
  assert.deepEqual(splitDispatchLines(text), [text]);
  assert.equal(dispatchField(text, ['司机姓名', '司机']), '张三');
  assert.equal(dispatchField(text, ['起运地']), '玉门仓库');
  assert.equal(dispatchDate(text, ['计划发运时间']), '2026-10-23T08:30');
});
test('多辆车以及同车多趟保留独立行', () => {
  assert.equal(splitDispatchLines('甘A12345，张三\n甘A56789，李四').length, 2);
  assert.equal(splitDispatchLines('甘A12345，上午\n甘A12345，下午').length, 2);
});
test('空白不生成行，批量输入不超过100行', () => {
  assert.deepEqual(splitDispatchLines('  \n '), []);
  assert.equal(splitDispatchLines(Array(110).fill('甘A12345，张三').join('\n')).length, 100);
});
