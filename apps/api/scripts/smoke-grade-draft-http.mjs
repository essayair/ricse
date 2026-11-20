/** 仅本地E2E来源合同：复制模板→新草稿→再次编辑→读取，验证规格/价格不丢失。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';

const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '5433' && url.pathname === '/ricse_dev', '仅本机ricse_dev');
assert(process.argv.length > 2, '请提供本次成功的E2E资金验收结果，不允许零用例通过');
const db = new PrismaClient(); const results = []; let token;
const api = async (path, method = 'GET', body) => {
  const r = await fetch('http://127.0.0.1:3000/api/v1' + path, { method, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await r.json(); assert(r.ok, `${path}: ${r.status} ${JSON.stringify(value)}`); return value;
};
try {
  const admin = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', status: 'ACTIVE' } });
  token = new JwtService().sign({ sub: admin.id, username: admin.username, role: admin.role, tokenVersion: admin.tokenVersion }, { secret: process.env.JWT_SECRET, expiresIn: '10m' });
  for (const path of process.argv.slice(2)) {
    const input = JSON.parse(fs.readFileSync(path, 'utf8')); assert(input.tag?.startsWith('E2E-ZB-') && input.ids.contractId);
    const source = await api(`/contracts/${input.ids.contractId}`); assert(source.title.startsWith(input.tag));
    const copy = await api(`/contracts/${source.id}/copy-template`);
    const mode = source.lineItems[0].priceRulesSnapshot.specPricingMode; assert(['UNIFIED', 'BY_SPEC'].includes(mode));
    assert.equal(copy.lineItems[0].priceRulesSnapshot.formulaConfirmed, false);
    assert.deepEqual(copy.lineItems[0].priceRulesSnapshot.applicableSpecs, ['FRAGMENT', 'RUN_OF_MINE']);
    assert.equal(copy.lineItems[0].priceRulesSnapshot.specPricingMode, mode);
    assert.deepEqual(copy.lineItems[0].salesPriceRulesSnapshot.bands, source.lineItems[0].salesPriceRulesSnapshot.bands);
    assert.deepEqual(copy.attachments, []); assert.equal(copy.externalNo, '');
    const lineItems = copy.lineItems.map(line => ({ materialId: line.materialId, materialName: line.materialName, quantity: Number(line.quantity), unit: line.unit, unitPrice: Number(line.unitPrice), salesUnitPrice: Number(line.salesUnitPrice), taxRatePct: Number(line.taxRatePct), qualityRulesSnapshot: line.qualityRulesSnapshot, priceRulesSnapshot: line.priceRulesSnapshot, salesPriceRulesSnapshot: line.salesPriceRulesSnapshot }));
    const body = { title: `${input.tag}-${mode}-复制及再次编辑测试`, type: 'BILATERAL', signingPartnerId: source.signingPartnerId, sellerId: source.sellerId, buyerId: source.buyerId, departmentId: source.departmentId, businessUnitId: source.businessUnitId, pricingType: 'GRADE_TIER', totalAmount: Number(source.totalAmount), lineItems, clientRequestId: randomUUID(), remarks: '纯本地模拟草稿，不提交审批' };
    const draft = await api('/contracts', 'POST', body); assert.equal(draft.status, 'DRAFT');
    const repeat = await api('/contracts', 'POST', body); assert.equal(repeat.id, draft.id);
    await api(`/contracts/${draft.id}`, 'PATCH', { title: body.title + '（已编辑）', lineItems, remarks: '已验证再次编辑保存' });
    const saved = await api(`/contracts/${draft.id}`);
    assert.equal(saved.status, 'DRAFT'); assert.equal(saved.lineItems.length, 1);
    assert.deepEqual(saved.lineItems[0].priceRulesSnapshot, lineItems[0].priceRulesSnapshot);
    assert.deepEqual(saved.lineItems[0].salesPriceRulesSnapshot, lineItems[0].salesPriceRulesSnapshot);
    assert.equal(saved.attachments.length, 0);
    assert.equal((await api(`/contracts/${source.id}`)).updatedAt, source.updatedAt, '复制和编辑不能改原合同');
    results.push({ mode, contractNo: draft.contractNo, contractId: draft.id, status: 'DRAFT', checks: 12 });
  }
  console.log(JSON.stringify({ result: 'PASS', checks: results.reduce((sum, r) => sum + r.checks, 0), drafts: results }));
} finally { await db.$disconnect(); }
