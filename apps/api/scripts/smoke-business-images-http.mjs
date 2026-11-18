/** 仅本机开发库；创建自有 E2E 资料，测试后清理，不改变用户合同。 */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import sharp from 'sharp';
const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '5433' && /dev|test/.test(url.pathname), '仅允许本机 5433 开发库');
const db = new PrismaClient(); const base = 'http://127.0.0.1:3000/api/v1'; const tag = `E2E-IMAGE-${Date.now()}`; let token; let passed = 0; const contracts = []; const ids = []; let testUser; let testRole; let testUnit;
async function call(path, method = 'GET', body, auth = token) { const res = await fetch(base + path, { method, headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000) }); const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = { message: text }; } return { status: res.status, ok: res.ok, data }; }
async function api(path, method, body) { const r = await call(path, method, body); assert(r.ok, `${method || 'GET'} ${path}: ${r.status} ${JSON.stringify(r.data.message || r.data)}`); return r.data; }
function check(label, test) { test(); passed++; console.log('PASS', label); }
function uploadBody(contractId, bytes, name, key = randomUUID(), confirmed = true, type = 'OTHER', remarks = '') { const f = new FormData(); f.append('file', new Blob([bytes]), name); for (const [k,v] of Object.entries({ contractId, originalName: name, sourceOriginalName: name, documentType: type, nameConfirmed: String(confirmed), clientRequestId: key, originalSize: String(bytes.length), remarks })) f.append(k,v); return f; }
function fixturePdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream = 'BT /F1 20 Tf 50 750 Td (RICSE image smoke test) Tj ET'; objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}
try {
  const user = await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } }); assert(user && process.env.JWT_SECRET);
  token = new JwtService().sign({ sub: user.id, username: user.username, role: user.role, tokenVersion: user.tokenVersion }, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
  const options = await api('/contracts/form-options');
  for (let i = 0; i < 2; i++) { const c = await api('/contracts', 'POST', { title: `${tag}-${i}`, type: 'PURCHASE', totalAmount: 0, lineItems: [], businessUnitId: options.defaultBusinessUnitId || options.businessUnits[0]?.id }); contracts.push(c.id); }
  const bytes = await sharp({ create: { width: 1400, height: 800, channels: 3, background: '#234567' } }).png().toBuffer();
  const key = randomUUID(); const first = await api('/business-images', 'POST', uploadBody(contracts[0], bytes, '模拟现场照片.png', key, true, 'OTHER', '  原件留存\n第一车  ')); ids.push(first.id);
  check('归档不自动成为合同附件', () => { assert.equal(first.linkState, 'ARCHIVED'); assert.equal(first.contract.id, contracts[0]); });
  check('逐文件上传备注保存并去首尾空格', () => assert.equal(first.remarks, '原件留存\n第一车'));
  const original = await api(`/contracts/${contracts[0]}`); check('原合同附件仍为空', () => assert.equal(original.attachments.length, 0));
  const repeated = await api('/business-images', 'POST', uploadBody(contracts[0], bytes, '模拟现场照片.png', key)); check('请求幂等不重复保存且不覆盖原备注', () => { assert.equal(repeated.id, first.id); assert(repeated.duplicate); assert.equal(repeated.remarks, first.remarks); });
  const same = await api('/business-images', 'POST', uploadBody(contracts[0], bytes, '重复名称.png')); check('同合同按内容去重', () => assert.equal(same.id, first.id));
  const variant = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#123456' } }).png().toBuffer();
  assert.equal((await call('/business-images', 'POST', uploadBody(contracts[0], variant, '模拟现场照片.png'))).status, 400); check('同合同不同文件不可使用重复名称', () => {});
  assert.equal((await call('/business-images', 'POST', uploadBody(contracts[0], variant, '未选类型.png', randomUUID(), true, ''))).status, 400); check('未选择类型不能自动归为其他', () => {});
  const parallel = await Promise.all([call('/business-images', 'POST', uploadBody(contracts[0], variant, 'Concurrent.PNG')), call('/business-images', 'POST', uploadBody(contracts[0], await sharp({ create: { width: 100, height: 100, channels: 3, background: '#abcdef' } }).png().toBuffer(), 'concurrent.png'))]);
  for (const result of parallel) if (result.ok) ids.push(result.data.id);
  check('并发上传忽略大小写的同名文件只保留一份', () => assert.deepEqual(parallel.map(r => r.status).sort(), [201, 400]));
  const winner = parallel.find(r => r.ok).data;
  assert.equal((await call(`/business-images/${first.id}`, 'PATCH', { originalName: winner.originalName, documentType: 'OTHER', nameConfirmed: true })).status, 400); check('改名不能与其他归档资料重名', () => {});
  await assert.rejects(db.attachment.update({ where: { id: first.id }, data: { originalName: winner.originalName } }), e => e.code === 'P2002'); check('原单据改名也受数据库名称唯一约束', () => {});
  await api(`/business-images/${winner.id}`, 'DELETE'); ids.splice(ids.indexOf(winner.id), 1);
  const ownUnit = await db.businessUnit.findUniqueOrThrow({ where: { id: options.defaultBusinessUnitId || options.businessUnits[0]?.id } });
  testUnit = await db.businessUnit.create({ data: { code: tag, name: tag, companyId: ownUnit.companyId } });
  await db.contract.update({ where: { id: contracts[1] }, data: { businessUnitId: testUnit.id } });
  const hidden = await api('/business-images', 'POST', uploadBody(contracts[1], bytes, '其他事业部资料.png')); ids.push(hidden.id);
  const limitedPermissions = await db.permission.findMany({ where: { code: { in: ['business_image.view', 'business_image.manage', 'contract.view'] } } }); assert.equal(limitedPermissions.length, 3);
  testRole = await db.role.create({ data: { code: tag, name: tag, permissions: { create: limitedPermissions.map(p => ({ permissionId: p.id })) } } });
  testUser = await db.user.create({ data: { username: tag, name: '影像权限测试', password: '!smoke-no-login', roleAssignments: { create: { roleId: testRole.id, scopeType: 'ALL' } }, businessUnits: { create: { businessUnitId: ownUnit.id, isDefault: true } } } });
  const limitedToken = new JwtService().sign({ sub: testUser.id, username: testUser.username, role: 'USER', tokenVersion: 0 }, { secret: process.env.JWT_SECRET, expiresIn: '5m' });
  const scoped = await call(`/business-images?contractId=${contracts[0]}`, 'GET', undefined, limitedToken); check('普通用户可以查看所属事业部归档', () => { assert.equal(scoped.status, 200); assert.equal(scoped.data.total, 1); });
  const excluded = await call(`/business-images?contractId=${contracts[1]}`, 'GET', undefined, limitedToken); check('角色 ALL 仍受顶层事业部归属限制', () => { assert.equal(excluded.status, 200); assert.equal(excluded.data.total, 0); });
  assert.equal((await call(`/business-images/${hidden.id}/view-url`, 'GET', undefined, limitedToken)).status, 404); check('跨事业部猜附件 ID 不能获取原件', () => {});
  assert.equal((await call(`/business-images/${first.id}/link`, 'POST', { targetType: 'CONTRACT', targetId: contracts[0] }, limitedToken)).status, 403); check('有归档维护但无合同编辑权限不能关联合同', () => {});
  check('未核对名称被拒绝', () => {}); assert.equal((await call('/business-images', 'POST', uploadBody(contracts[0], bytes, '未确认.png', randomUUID(), false))).status, 400);
  await api(`/business-images/${first.id}`, 'PATCH', { originalName: '已核对现场照片.png', documentType: 'SCENE_PHOTO', dispatchNoticeId: null, nameConfirmed: true });
  const listing = await api(`/business-images?contractId=${contracts[0]}&linkState=ARCHIVED`); check('列表筛选、汇总及改名有效', () => { assert.equal(listing.total, 1); assert.equal(listing.items[0].originalName, '已核对现场照片.png'); assert.equal(listing.totalSize, bytes.length); });
  check('旧客户端改名不清空备注，列表展示备注', () => assert.equal(listing.items[0].remarks, first.remarks));
  const patch = { originalName: '已核对现场照片.png', documentType: 'SCENE_PHOTO', dispatchNoticeId: null, nameConfirmed: true };
  await api(`/business-images/${first.id}`, 'PATCH', { ...patch, remarks: '更新备注\n第二行' });
  check('编辑后详情返回完整多行备注', () => {});
  assert.equal((await api(`/business-images/${first.id}`)).remarks, '更新备注\n第二行');
  assert.equal((await call(`/business-images/${first.id}`, 'PATCH', { ...patch, remarks: '字'.repeat(1001) })).status, 400);
  check('超长备注被接口拒绝', () => {});
  await api(`/business-images/${first.id}`, 'PATCH', { ...patch, remarks: '' });
  check('备注可主动清空', () => {});
  assert.equal((await api(`/business-images/${first.id}`)).remarks, '');
  await api(`/business-images/${first.id}`, 'PATCH', { ...patch, remarks: '关联后保留的备注' });
  const preview = await api(`/business-images/${first.id}/preview-url`); check('生成独立缩略图', () => { assert.equal(preview.mimeType, 'image/jpeg'); assert(preview.thumbnail); });
  const originUrl = await api(`/business-images/${first.id}/view-url`); const downloaded = Buffer.from(await (await fetch(originUrl.url)).arrayBuffer()); check('图片原件字节不变', () => assert.equal(createHash('sha256').update(downloaded).digest('hex'), createHash('sha256').update(bytes).digest('hex')));
  assert.equal((await call(`/business-images/${first.id}/link`, 'POST', { targetType: 'CONTRACT', targetId: contracts[1] })).status, 404); check('不能跨合同关联', () => {});
  await api(`/business-images/${first.id}/link`, 'POST', { targetType: 'CONTRACT', targetId: contracts[0] });
  const linked = await api(`/contracts/${contracts[0]}`); check('关联后原单据直接显示同一附件', () => { assert.equal(linked.attachments.length, 1); assert.equal(linked.attachments[0].id, first.id); });
  check('关联原单据后资料备注保留', () => {}); assert.equal((await api(`/business-images/${first.id}`)).remarks, '关联后保留的备注');
  assert.equal((await call(`/business-images/${first.id}`, 'DELETE')).status, 400); check('已关联凭证不能从资料库直接删除', () => {});
  await db.contract.update({ where: { id: contracts[0] }, data: { status: 'APPROVED' } });
  assert.equal((await call(`/business-images/${first.id}/unlink`, 'POST')).status, 400); check('审批后不能绕过合同附件锁定', () => {});
  await db.contract.update({ where: { id: contracts[0] }, data: { status: 'DRAFT' } });
  await api(`/business-images/${first.id}/unlink`, 'POST'); const after = await api(`/business-images/${first.id}`); check('解除后资料继续保留且记录人员时间', () => { assert.equal(after.linkState, 'ARCHIVED'); assert(after.operationLogs.some(l => l.action === 'UNLINK' && l.operator.id === user.id)); });
  const pdf = fixturePdf();
  const pdfRow = await api('/business-images', 'POST', uploadBody(contracts[0], pdf, '模拟合同原件.pdf', randomUUID(), true, 'CONTRACT')); ids.push(pdfRow.id);
  const pdfPreview = await api(`/business-images/${pdfRow.id}/preview-url`); check('PDF 首页缩略图可用', () => assert.equal(pdfPreview.thumbnail, true));
  const pdfSource = await api(`/business-images/${pdfRow.id}/view-url`); const pdfBytes = Buffer.from(await (await fetch(pdfSource.url)).arrayBuffer()); check('PDF 原件完整保留', () => assert.equal(createHash('sha256').update(pdfBytes).digest('hex'), createHash('sha256').update(pdf).digest('hex')));
  const big = uploadBody(contracts[0], Buffer.alloc(20 * 1024 * 1024 + 1), '超限.pdf'); assert.equal((await call('/business-images', 'POST', big)).status, 413); check('20MB 后端限制有效', () => {});
  assert.equal((await call(`/business-images/${first.id}/view-url`, 'GET', undefined, '')).status, 401); check('匿名不能获取文件地址', () => {});
  const invalid = await call('/business-images?search[]=invalid'); check('非法筛选参数不会触发内部错误', () => assert.equal(invalid.status, 400));
  assert.equal((await call('/business-images/targets?contractId=x&targetType=INVALID')).status, 400); check('非法关联目标参数被验证拦截', () => {});
  console.log(JSON.stringify({ passed, tag }, null, 2));
} finally {
  for (const id of ids) { try { await api(`/business-images/${id}`, 'DELETE'); } catch {} }
  for (const id of contracts) { await db.businessOperationLog.deleteMany({ where: { businessId: id } }); await db.contract.delete({ where: { id } }).catch(() => undefined); }
  await db.businessOperationLog.deleteMany({ where: { businessId: { in: ids } } });
  if (testUser) await db.user.delete({ where: { id: testUser.id } });
  if (testRole) await db.role.delete({ where: { id: testRole.id } });
  if (testUnit) await db.businessUnit.delete({ where: { id: testUnit.id } });
  await db.$disconnect();
}
