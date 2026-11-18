import assert from 'node:assert/strict';
import test from 'node:test';
import { applyArchiveBatchType, archiveBatchTypeError, archiveRowErrors } from './business-image-validation';
test('先选类型，且同批待归档文件必须统一', () => {
  assert.equal(archiveBatchTypeError('', []), '请先选择影像类型，再添加文件');
  assert.equal(archiveBatchTypeError('WEIGH_TICKET', [{ type: 'WEIGH_TICKET', status: 'READY' }]), null);
  assert.match(archiveBatchTypeError('WEIGH_TICKET', [{ type: 'QUALITY_REPORT', status: 'READY' }])!, /类型不一致/);
});
test('顶部更改类型统一修改待归档文件并重新要求确认，备注名称不变', () => {
  const rows = [
    { key: 'a', type: 'WEIGH_TICKET', status: 'READY', confirmed: true, name: '回单.pdf', remarks: '第一车' },
    { key: 'b', type: 'WEIGH_TICKET', status: 'ERROR', confirmed: true, name: '照片.png', remarks: '第二车', error: '上传失败' },
  ];
  const changed = applyArchiveBatchType(rows, 'QUALITY_REPORT');
  assert(changed.every(row => row.type === 'QUALITY_REPORT' && !row.confirmed && row.status === 'READY' && !row.error));
  assert.equal(changed[0].name, rows[0].name);
  assert.equal(changed[1].remarks, rows[1].remarks);
  assert.equal(rows[0].type, 'WEIGH_TICKET');
});
test('同类型不取消已核对状态，已归档资料不被批量静默改写', () => {
  const rows = [
    { type: 'WEIGH_TICKET', status: 'READY', confirmed: true },
    { type: 'QUALITY_REPORT', status: 'DONE', confirmed: true },
  ];
  const changed = applyArchiveBatchType(rows, 'WEIGH_TICKET');
  assert.equal(changed[0], rows[0]);
  assert.equal(changed[1], rows[1]);
  assert.equal(archiveBatchTypeError('WEIGH_TICKET', changed), null);
});
test('清空顶部类型后不能归档，须重新选择并核对', () => {
  const changed = applyArchiveBatchType([{ type: 'WEIGH_TICKET', status: 'READY', confirmed: true }], '');
  assert.equal(changed[0].type, '');
  assert.equal(changed[0].confirmed, false);
  assert.match(archiveBatchTypeError('', changed)!, /先选择/);
});
test('归档备注选填，超长时定位到对应文件', () => {
  const row = { key: 'a', name: '回单.pdf', type: 'OTHER', status: 'READY' };
  assert.deepEqual(archiveRowErrors([row]).a, {});
  assert.deepEqual(archiveRowErrors([{ ...row, remarks: '字'.repeat(1000) }]).a, {});
  assert.equal(archiveRowErrors([{ ...row, remarks: '字'.repeat(1001) }]).a.remarks, '备注不能超过1000字');
});
test('影像类型不默认其他，必须主动选择', () => {
  assert.equal(archiveRowErrors([{ key: 'a', name: '磅单.pdf', type: '', status: 'READY' }]).a.type, '请选择影像类型');
  assert.deepEqual(archiveRowErrors([{ key: 'a', name: '磅单.pdf', type: 'OTHER', status: 'READY' }]).a, {});
});
test('本批次重名忽略首尾空格及大小写，已成功归档的文件也参与查重', () => {
  const errors = archiveRowErrors([{ key: 'a', name: ' Photo.PDF ', type: 'OTHER', status: 'DONE' }, { key: 'b', name: 'photo.pdf', type: 'OTHER', status: 'READY' }]);
  assert.match(errors.b.name!, /同名/); assert.equal(errors.a, undefined);
});
test('空名称与缺失类型分别定位，不能自动归入其他', () => {
  assert.deepEqual(archiveRowErrors([{ key: 'a', name: ' ', type: '', status: 'ERROR' }]).a, { name: '请填写文件名称', type: '请选择影像类型' });
});
