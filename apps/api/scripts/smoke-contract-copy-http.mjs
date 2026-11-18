/** 本地合同复制回归。仅写入带 E2E-COPY 标记的测试草稿，不修改来源合同或提交审批。 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';

const dbUrl = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(dbUrl.hostname) && dbUrl.port === '5433' && /dev|test/.test(dbUrl.pathname), '仅允许本地 5433 开发/测试库');
const db = new PrismaClient();
const base = 'http://127.0.0.1:3000/api/v1';
const tag = `E2E-COPY-${Date.now()}`;
let token, passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('PASS', label); };
async function call(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  return { status: response.status, ok: response.ok, data };
}
async function api(path, method, body) {
  const result = await call(path, method, body);
  assert(result.ok, `${method || 'GET'} ${path}: ${result.status} ${JSON.stringify(result.data.message || result.data)}`);
  return result.data;
}
const scalarKeys = ['type', 'title', 'signingPartnerId', 'sellerId', 'buyerId', 'departmentId', 'businessUnitId', 'externalNo', 'salesExternalNo', 'contactPerson', 'contactPhone', 'pricingType', 'deliveryMethod', 'deliveryLocation', 'settlementMethod', 'settlementBasis', 'paymentMethod', 'salesPaymentMethod', 'remarks'];
const lineKeys = ['materialId', 'materialName', 'unit', 'remarks', 'qualityRulesSnapshot', 'priceRulesSnapshot', 'salesPriceRulesSnapshot'];
function payloadOf(template) {
  const form = template.draftData.form;
  const lines = template.lineItems.filter(line => line.materialId && Number(line.quantity) > 0 && line.unitPrice !== '' && (form.type !== 'BILATERAL' || line.salesUnitPrice !== ''));
  const payload = Object.fromEntries(scalarKeys.filter(key => form[key] != null && form[key] !== '').map(key => [key, form[key]]));
  for (const key of ['overfillPct', 'shortfallPct', 'prepayPct', 'paymentDays']) if (form[key] != null && form[key] !== '') payload[key] = Number(form[key]);
  payload.lineItems = lines.map(line => {
    const item = Object.fromEntries(lineKeys.filter(key => line[key] != null).map(key => [key, line[key]]));
    for (const key of ['quantity', 'unitPrice', 'unitPriceExTax', 'taxRatePct', 'salesUnitPrice', 'salesUnitPriceExTax']) if (line[key] != null && line[key] !== '') item[key] = Number(line[key]);
    return item;
  });
  payload.totalAmount = payload.lineItems.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  payload.draftData = template.draftData;
  payload.copySourceContractId = template.copySource.id;
  payload.clientRequestId = randomUUID();
  payload.title = `${tag} 完整复制`;
  payload.draftData = { ...payload.draftData, form: { ...form, title: payload.title } };
  return payload;
}

try {
  const admin = await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } });
  assert(admin && process.env.JWT_SECRET, '需要已有有效管理员与本地 JWT 配置');
  token = new JwtService().sign({ sub: admin.id, username: admin.username, role: admin.role, tokenVersion: admin.tokenVersion }, { secret: process.env.JWT_SECRET, expiresIn: '10m' });
  const source = await db.contract.findFirst({ where: { deletedAt: null, type: 'BILATERAL', status: 'EXECUTING' }, include: { lineItems: true, attachments: true } });
  assert(source, '需要一份已有执行中的双边合同作为只读来源');
  const original = JSON.stringify(source);
  const before = await db.contract.count();
  const template = await api(`/contracts/${source.id}/copy-template`);
  const afterOpen = await db.contract.count();
  check('打开复制页不生成草稿', () => assert.equal(afterOpen, before));
  check('模板不带来源主键、编号和创建信息', () => { for (const key of ['id', 'contractNo', 'createdBy', 'createdAt', 'orders', 'approvals']) assert.equal(template[key], undefined); });
  check('外部编号与日期清空，附件不复制', () => { assert.deepEqual(template.attachments, []); for (const key of ['externalNo', 'salesExternalNo', 'signedAt', 'salesSignedAt', 'effectiveAt', 'expireAt']) assert.equal(template[key], ''); });
  check('全部货物行保留，行 ID 不复制', () => { assert.equal(template.lineItems.length, source.lineItems.length); for (const line of template.lineItems) assert.equal(line.id, undefined); });
  check('质量及采销价格快照保留，确认勾选重置', () => {
    for (const [index, line] of template.lineItems.entries()) {
      const old = source.lineItems[index];
      assert.deepEqual(line.qualityRulesSnapshot, old.qualityRulesSnapshot);
      for (const key of ['priceRulesSnapshot', 'salesPriceRulesSnapshot']) if (old[key]) assert.deepEqual(line[key], { ...old[key], formulaConfirmed: false });
    }
  });
  const actions = await api(`/contracts/${source.id}/available-actions`);
  check('详情可用操作包含复制入口', () => assert.equal(actions.canCopy, true));
  const listing = await api(`/contracts?search=${encodeURIComponent(source.contractNo)}`);
  check('列表包含复制入口', () => assert.equal(listing.items.find(item => item.id === source.id)?.canCopy, true));
  const payload = payloadOf(template);
  const copies = await Promise.all([api('/contracts', 'POST', payload), api('/contracts', 'POST', payload)]);
  check('并发重复保存返回同一个新草稿', () => { assert.equal(copies[0].id, copies[1].id); assert.notEqual(copies[0].id, source.id); assert.equal(copies[0].status, 'DRAFT'); assert.notEqual(copies[0].contractNo, source.contractNo); });
  const createdId = copies[0].id;
  const count = await db.contract.count({ where: { createdBy: admin.id, clientRequestId: payload.clientRequestId } });
  check('请求幂等，仅生成一份', () => assert.equal(count, 1));
  const logs = await db.businessOperationLog.findMany({ where: { businessType: 'CONTRACT', businessId: createdId, action: 'COPY_FROM' } });
  check('复制来源操作记录仅一条，保留人员和时间', () => { assert.equal(logs.length, 1); assert.equal(logs[0].operatorId, admin.id); assert(logs[0].createdAt); assert.equal(logs[0].details.sourceContractId, source.id); });
  const created = await api(`/contracts/${createdId}`);
  check('新合同无旧附件及执行批次', () => { assert.equal(created.attachments.length, 0); assert.equal(created.orders?.length || 0, 0); });
  const retry = await api(`/contracts/${createdId}`, 'PATCH', { title: `${tag} 继续编辑`, draftData: { ...payload.draftData, form: { ...payload.draftData.form, title: `${tag} 继续编辑` } } });
  check('复制后的草稿可以继续编辑', () => assert.equal(retry.title, `${tag} 继续编辑`));
  const blocked = await call(`/contracts/${createdId}/status`, 'PATCH', { status: 'PENDING_APPROVAL' });
  check('未补齐的新合同不能误提交审批', () => assert.equal(blocked.ok, false));
  await api('/contracts', 'POST', payload);
  const afterRetry = await db.contract.count({ where: { createdBy: admin.id, clientRequestId: payload.clientRequestId } });
  check('提交失败后重试仍只有原新建草稿', () => assert.equal(afterRetry, 1));
  const options = await api('/contracts/form-options');
  const partial = await api('/contracts', 'POST', { title: `${tag} 不完整来源草稿`, type: 'PURCHASE', totalAmount: 0, lineItems: [], businessUnitId: options.defaultBusinessUnitId || options.businessUnits[0]?.id,
    draftData: { form: { title: `${tag} 不完整来源草稿`, type: 'PURCHASE', externalNo: '旧编号', signedAt: '2026-11-01' }, lineItems: [{ materialId: template.lineItems[0]?.materialId || '', materialName: '待补价格', quantity: '25', unitPrice: '' }, { materialId: '', materialName: '未选物料', quantity: '', unitPrice: '' }] } });
  const partialTemplate = await api(`/contracts/${partial.id}/copy-template`);
  check('未完整保存的多行草稿也能完整恢复复制', () => { assert.equal(partialTemplate.lineItems.length, 2); assert.equal(partialTemplate.lineItems[0].unitPrice, ''); assert.equal(partialTemplate.lineItems[1].materialName, '未选物料'); assert.equal(partialTemplate.draftData.form.externalNo, ''); });
  const missing = await call(`/contracts/nonexistent-copy-source/copy-template`);
  check('不存在的来源不能读取', () => assert.equal(missing.ok, false));
  const finalSource = await db.contract.findUnique({ where: { id: source.id }, include: { lineItems: true, attachments: true } });
  check('来源合同、明细和附件完全未改动', () => assert.equal(JSON.stringify(finalSource), original));
  console.log(JSON.stringify({ passed, tag, createdDraft: createdId, incompleteSourceDraft: partial.id, sourceContractNo: source.contractNo, blockedSubmission: blocked.data.message }, null, 2));
} finally {
  await db.$disconnect();
}
