/** 本地外部身份接口专项；自建角色/账号/企业，finally按自建ID清理。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/modules/common/password-hasher';
async function main() {
  const env = fs.readFileSync('.env', 'utf8');
  const database = process.env.DATABASE_URL || env.match(/^DATABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
  const url = new URL(database || ''); assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/ricse_dev');
  const secret = process.env.JWT_SECRET || env.match(/^JWT_SECRET\s*=\s*["']?([^\s"']+)/m)?.[1]; assert(secret);
  const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); assert(result.tag?.startsWith('E2E-ZB-'));
  const db = new PrismaClient({ datasources: { db: { url: database } } }), tag = `QA-EXT-${randomUUID().slice(0, 8)}`;
  const ids = { companies: [] as string[], departments: [] as string[], employees: [] as string[], users: [] as string[], roles: [] as string[] };
  let checks = 0;
  try {
    const contract = await db.contract.findUniqueOrThrow({ where: { id: result.ids.contractId }, include: { attachments: true } }); assert(contract.title.startsWith(result.tag));
    const permissions = await db.permission.findMany({ where: { code: { in: ['contract.view', 'execution.view', 'logistics.view', 'quality.view', 'settlement.view', 'inventory.view'] } } });
    const role = await db.role.create({ data: { code: tag, name: tag, permissions: { create: permissions.map(p => ({ permissionId: p.id })) } } }); ids.roles.push(role.id);
    for (const [direction, partnerId] of [['PURCHASE', contract.sellerId], ['SALES', contract.buyerId]] as const) {
      const company = await db.company.create({ data: { code: `${tag}-${direction}`, name: `${tag}-${direction}`, type: 'EXTERNAL', partnerId } }); ids.companies.push(company.id);
      const department = await db.department.create({ data: { name: tag, companyId: company.id } }); ids.departments.push(department.id);
      const employee = await db.employee.create({ data: { name: tag, companyId: company.id, departmentId: department.id } }); ids.employees.push(employee.id);
      const u = await db.user.create({ data: { username: `${tag}-${direction}`, name: tag, companyId: company.id, employeeId: employee.id, password: await hashPassword(randomUUID()), roleAssignments: { create: { roleId: role.id, scopeType: 'COMPANY' } } } }); ids.users.push(u.id);
      const token = new JwtService().sign({ sub: u.id, username: u.username, role: u.role, tokenVersion: u.tokenVersion }, { secret, expiresIn: '10m' });
      async function get(path: string, expected = 200, method = 'GET') { const r = await fetch(`http://127.0.0.1:3000/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) }); const b: any = await r.json(); if (expected === -1) assert([400, 403, 404].includes(r.status), `${path} 必须拒绝，实际${r.status}`); else assert.equal(r.status, expected, `${path} ${JSON.stringify(b)}`); return b; }
      const detail = await get(`/contracts/${contract.id}`); assert.equal(detail.visibleDirection, direction); assert(!detail.approvals); assert(!detail.draftData);
      for (const line of detail.lineItems) { if (direction === 'PURCHASE') { assert(!('salesUnitPrice' in line)); assert(!('salesPriceRulesSnapshot' in line)); } else { assert(!('unitPrice' in line)); assert(!('priceRulesSnapshot' in line)); } }
      assert(detail.attachments.every((a: any) => a.category === `${direction}_CONTRACT`)); checks++; console.log(`PASS ${direction}合同详情字段及附件方向隔离`);
      for (const a of contract.attachments) {
        if (a.category === `${direction}_CONTRACT`) await get(`/contracts/attachments/${a.id}/view-url`);
        else await get(`/contracts/attachments/${a.id}/view-url`, -1);
      }
      checks++; console.log(`PASS ${direction}附件预览下载接口独立鉴权`);
      await get(`/bilateral-direct/trade-documents?contractId=${contract.id}`, 403);
      const waybill = await db.waybill.findFirstOrThrow({ where: { dispatchNotice: { directSalesExecution: { is: { contractId: contract.id } } } } });
      await get(`/bilateral-direct/waybills/${waybill.id}`, 403);
      const shared = await get(`/waybills/${waybill.id}`); assert(shared.id === waybill.id);
      const serialized = JSON.stringify(shared.dispatchNotice); assert(!serialized.includes('salesPriceRulesSnapshot')); assert(!serialized.includes('"unitPrice"'));
      checks++; console.log(`PASS ${direction}共享物流无两向价格，内部直拨记录不可访问`);
      const other = direction === 'PURCHASE' ? result.ids.saleId : result.ids.payId;
      await get(`/financial-settlements/${other}`, -1);
      checks++; console.log(`PASS ${direction}对向资金结算不可读取`);
    }
    console.log(JSON.stringify({ result: 'PASS', checks, cleanup: '仅自建外部账号、角色及组织' }));
  } finally {
    await db.userRoleAssignment.deleteMany({ where: { userId: { in: ids.users } } });
    await db.user.deleteMany({ where: { id: { in: ids.users } } }); await db.employee.deleteMany({ where: { id: { in: ids.employees } } });
    await db.department.deleteMany({ where: { id: { in: ids.departments } } }); await db.company.deleteMany({ where: { id: { in: ids.companies } } }); await db.rolePermission.deleteMany({ where: { roleId: { in: ids.roles } } }); await db.role.deleteMany({ where: { id: { in: ids.roles } } }); await db.$disconnect();
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
