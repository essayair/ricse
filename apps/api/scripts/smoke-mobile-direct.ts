/** 本地移动API真实Guard验收，不替代安卓/iOS设备交互。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { WechatTokenService } from '../src/modules/common/wechat-token.service';
import bcrypt from 'bcryptjs';
async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  const config: Record<string, string> = {}; for (const line of env.split('\n')) { const match = line.match(/^(\w+)\s*=\s*["']?([^"'\r\n]*)/); if (match) config[match[1]] = match[2]; }
  const url = new URL(process.env.DATABASE_URL || config.DATABASE_URL); assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.port === '5433' && url.pathname === '/ricse_dev');
  const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); assert(result.tag.startsWith('E2E-ZB-'));
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } }); let id: string | undefined, checks = 0, temporaryUserId: string | undefined, temporaryEmployeeId: string | undefined;
  try {
    const contract = await db.contract.findUniqueOrThrow({ where: { id: result.ids.contractId } }); assert(contract.title.startsWith(result.tag), '只能检查本次自建模拟合同');
    let user = result.ui?.id ? await db.user.findUniqueOrThrow({ where: { id: result.ui.id } }) : await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE', company: { status: 'ACTIVE' }, employee: { status: 'ACTIVE' } } });
    if (!user) {
      const company = await db.company.findFirstOrThrow({ where: { type: 'INTERNAL', status: 'ACTIVE' } });
      const department = await db.department.findFirstOrThrow({ where: { companyId: company.id } });
      const employee = await db.employee.create({ data: { name: `${result.tag}移动验收`, companyId: company.id, departmentId: department.id } }); temporaryEmployeeId = employee.id;
      const role = await db.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
      user = await db.user.create({ data: { username: `${result.tag}-${randomUUID().slice(0, 8)}`, name: employee.name, role: 'ADMIN', companyId: company.id, employeeId: employee.id, password: await bcrypt.hash(randomUUID(), 12), roleAssignments: { create: { roleId: role.id, scopeType: 'ALL' } } } }); temporaryUserId = user.id;
    }
    if (result.ui?.id) assert(user.username.startsWith(result.tag));
    const openId = `QA-MOBILE-${randomUUID()}`;
    id = (await db.wechatIdentity.create({ data: { openId, linkedUserId: user.id } })).id;
    const token = new WechatTokenService(new ConfigService({ ...config, ...process.env })).sign(openId);
    const get = async (path: string, method = 'GET', body?: object, expected = 200) => { const r = await fetch(`http://127.0.0.1:3000/api/v1/mobile${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); const b: any = await r.json(); assert.equal(r.status, expected, `${path} ${JSON.stringify(b)}`); checks++; return b; };
    await get('/workspace'); await get('/business-modules');
    const waybill = await db.waybill.findFirstOrThrow({ where: { dispatchNotice: { directSalesExecution: { is: { contractId: result.ids.contractId } } } } });
    const w = await get(`/business/waybills/${waybill.id}`); assert.equal(w.id, waybill.id);
    assert.deepEqual(w.cargoSpecOptions, ['FRAGMENT', 'RUN_OF_MINE']);
    assert(!JSON.stringify(w).includes('priceRulesSnapshot'));
    await get(`/waybills/${waybill.id}/cargo-spec`, 'PATCH', { cargoSpec: w.cargoSpec });
    await get(`/waybills/${waybill.id}/cargo-spec`, 'PATCH', { cargoSpec: ['FRAGMENT', 'RUN_OF_MINE'] }, 400);
    await get(`/waybills/${waybill.id}/cargo-spec`, 'PATCH', { cargoSpec: w.cargoSpec === 'FRAGMENT' ? 'RUN_OF_MINE' : 'FRAGMENT', reason: '模拟已结算更正拦截' }, 400);
    const available = await get(`/waybills/dispatch-notices/${waybill.dispatchNoticeId}/availability`);
    assert.deepEqual(available.lineItems[0].cargoSpecOptions, ['FRAGMENT', 'RUN_OF_MINE']);
    const row = { clientRowId: randomUUID(), freightMode: 'SUPPLIER', cargoSpec: 'RUN_OF_MINE', plateNo: `浙H${String(Date.now()).slice(-5)}`, driverName: '模拟移动端司机', driverPhone: '19900009991', remarks: result.tag, lineItems: [{ dispatchNoticeLineItemId: available.lineItems[0].dispatchNoticeLineItemId, quantity: 0 }] };
    const created = await get('/waybills/batch', 'POST', { dispatchNoticeId: waybill.dispatchNoticeId, batchRequestId: randomUUID(), items: [row] }, 201);
    assert.equal(created.createdCount, 1); const temporary = created.items[0]; assert.equal(temporary.cargoSpec, 'RUN_OF_MINE');
    await get(`/waybills/${temporary.id}/cargo-spec`, 'PATCH', { cargoSpec: 'FRAGMENT' }, 400);
    const changed = await get(`/waybills/${temporary.id}/cargo-spec`, 'PATCH', { cargoSpec: 'FRAGMENT', reason: '模拟装车前规格更正' }); assert.equal(changed.cargoSpec, 'FRAGMENT');
    await get(`/bilateral-direct/waybills/${temporary.id}/cancel`, 'POST', { reason: '移动端建单及规格测试完成，取消模拟空车运单' }, 201);
    const direct = await get(`/bilateral-direct/waybills/${waybill.id}`); assert(direct.deliveries.some((d: any) => d.snapshot.evidenceSides));
    const task = await db.qualityTask.findUniqueOrThrow({ where: { waybillId: waybill.id } });
    const partners = await get(`/quality-institutions?qualityTaskId=${task.id}&institutionType=PARTNER`); assert(partners.length >= 2);
    await get(`/bilateral-direct/waybills/${waybill.id}/reverse`, 'POST', { reason: '本地移动端禁止绕过下游占用测试' }, 400);
    await db.wechatIdentity.update({ where: { id }, data: { status: 'DISABLED' } }); await get('/workspace', 'GET', undefined, 401);
    console.log(JSON.stringify({ result: 'PASS', checks, scope: '移动API真实Guard、任务、双侧快照、批量建单、规格补填更正、机构、下游占用与身份停用', cleanup: '自建微信身份删除，自建验收账号与员工停用；保留取消的模拟空车及操作记录' }));
  } finally {
    if (id) await db.wechatIdentity.delete({ where: { id } });
    if (temporaryUserId) await db.user.update({ where: { id: temporaryUserId }, data: { status: 'DISABLED', tokenVersion: { increment: 1 } } });
    if (temporaryEmployeeId) await db.employee.update({ where: { id: temporaryEmployeeId }, data: { status: 'DISABLED' } });
    await db.$disconnect();
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
