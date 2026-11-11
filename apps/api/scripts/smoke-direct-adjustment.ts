/** 本地专项：整单数量跟随、真实岗位/事业部权限。只删除脚本自建ID，不修改既有角色或账号。 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashPassword } from '../src/modules/common/password-hasher';

async function main() {
  const env = readFileSync('.env', 'utf8');
  process.env.DATABASE_URL ||= env.match(/^DATABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
  const url = new URL(process.env.DATABASE_URL || '');
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/ricse_dev', '仅允许本地 ricse_dev');
  const secret = process.env.JWT_SECRET || env.match(/^JWT_SECRET\s*=\s*["']?([^\s"']+)/m)?.[1]; assert(secret);
  const db = new PrismaService(), jwt = new JwtService(), tag = `QA-DIRECT-ADJ-${randomUUID().slice(0, 8)}`;
  const trips: string[] = [], partners: string[] = [], users: string[] = [], employees: string[] = [], roles: string[] = [];
  let contractId: string | undefined, materialId: string | undefined, categoryId: string | undefined, otherUnitId: string | undefined;
  let checks = 0;
  const check = (name: string) => { checks++; process.stdout.write(`PASS ${name}\n`); };
  const token = (u: { id: string; username: string; role: string; tokenVersion: number }) => jwt.sign({ sub: u.id, username: u.username, role: u.role, tokenVersion: u.tokenVersion }, { secret, expiresIn: '10m' });
  const call = async (u: Parameters<typeof token>[0], path: string, method = 'GET', body?: unknown, expected?: number) => {
    const response = await fetch(`http://127.0.0.1:3000/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token(u)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json() as any;
    if (expected) { assert.equal(response.status, expected, JSON.stringify(data)); return data; }
    assert(response.ok, `${path} HTTP${response.status} ${JSON.stringify(data)}`); return data;
  };
  try {
    const admin = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', status: 'ACTIVE' } });
    const unit = await db.businessUnit.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const company = await db.company.findFirstOrThrow({ where: { type: 'INTERNAL', status: 'ACTIVE' } });
    const dept = await db.department.findFirstOrThrow({ where: { companyId: company.id } });
    otherUnitId = (await db.businessUnit.create({ data: { code: tag, name: `${tag}其他事业部`, companyId: company.id } })).id;
    async function actor(name: string, codes: string[], unitId: string, manager = false) {
      let role;
      if (manager) role = await db.role.findUniqueOrThrow({ where: { code: 'BUSINESS_MANAGER' } });
      else {
        const permissions = await db.permission.findMany({ where: { code: { in: codes } } }); assert.equal(permissions.length, codes.length);
        role = await db.role.create({ data: { code: `${tag}-${name}`, name: `${tag}-${name}`, permissions: { create: permissions.map(p => ({ permissionId: p.id })) } } }); roles.push(role.id);
      }
      const employee = await db.employee.create({ data: { name: `${tag}-${name}`, companyId: company.id, departmentId: dept.id } }); employees.push(employee.id);
      const u = await db.user.create({ data: { username: `${tag}-${name}`, name: employee.name, password: await hashPassword(randomUUID()), companyId: company.id, employeeId: employee.id,
        businessUnits: { create: { businessUnitId: unitId, isDefault: true } },
        roleAssignments: { create: { roleId: role.id, scopeType: manager ? 'BUSINESS_UNIT' : 'ALL', ...(manager ? { scopes: { create: { targetType: 'BUSINESS_UNIT', targetId: unitId } } } : {}) } },
      } }); users.push(u.id); return u;
    }
    const viewer = await actor('只读', ['inventory.view', 'logistics.view'], unit.id);
    const warehouse = await actor('仓管', ['inventory.view', 'inventory.manage', 'logistics.view'], unit.id);
    const logistics = await actor('物流', ['logistics.view', 'logistics.manage'], unit.id);
    const outsider = await actor('其他事业部仓管', ['inventory.view', 'inventory.manage', 'logistics.view'], otherUnitId);
    const reviewer = await actor('运营经理', [], unit.id, true);
    const category = await db.materialCategory.create({ data: { name: tag } }); categoryId = category.id;
    const material = await db.material.create({ data: { name: tag, code: tag, categoryId, pricingQuantityBasis: 'DRY_MATTER' } }); materialId = material.id;
    for (const kind of ['OWN', 'SUPPLIER', 'CUSTOMER']) partners.push((await db.partner.create({ data: { code: `${tag}-${kind}`, name: `${tag}-${kind}`, roles: kind === 'OWN' ? ['SUPPLIER', 'CUSTOMER'] : [kind], isInternal: kind === 'OWN' } })).id);
    const contract = await db.contract.create({ data: { contractNo: tag, title: tag, type: 'BILATERAL', status: 'APPROVED', signingPartnerId: partners[0], sellerId: partners[1], buyerId: partners[2], businessUnitId: unit.id, pricingType: 'FIXED', totalAmount: 40000, createdBy: admin.id,
      lineItems: { create: { materialId, materialName: tag, quantity: 40, unitPrice: 1000, salesUnitPrice: 1200, totalPrice: 40000, salesTotalPrice: 48000, pricingQuantityBasis: 'DRY_MATTER', taxRatePct: 13 } },
    }, include: { lineItems: true } }); contractId = contract.id;
    const pair = await call(admin, '/bilateral-direct/executions', 'POST', { contractId, contractLineItemId: contract.lineItems[0].id, requestId: tag, quantity: 40, originLocation: '模拟矿山', destinationLocation: '模拟客户' });
    const line = await db.dispatchNoticeLineItem.findFirstOrThrow({ where: { dispatchNoticeId: pair.salesNoticeId } });
    const stocks = await db.inventoryLot.count();
    for (let n = 1; n <= 2; n++) {
      const w = await db.waybill.create({ data: { waybillNo: `${tag}-${n}`, dispatchNoticeId: pair.salesNoticeId, status: 'SIGNED', totalQuantity: 20, createdBy: admin.id, lineItems: { create: { dispatchNoticeLineItemId: line.id, materialId, materialName: tag, quantity: 20 } }, attachments: { create: { fileName: `${tag}-${n}.png`, originalName: '模拟签收单.png', size: 1, mimeType: 'image/png', category: 'RECEIPT_DOCUMENT' } } } }); trips.push(w.id);
      const ticket = await db.weighTicket.create({ data: { ticketNo: `${tag}-${n}`, waybillId: w.id, direction: 'OUTBOUND', status: 'REVIEWED', netWeight: 20, plannedQuantity: 20, weighingStage: 'SHIPPING', createdBy: admin.id } });
      const task = await db.qualityTask.create({ data: { taskNo: `${tag}-${n}`, waybillId: w.id, status: 'COMPLETED', finalConclusion: 'PASS', qualityDisposition: 'PASS', createdBy: admin.id } });
      const report = await db.qualityInspection.create({ data: { inspectionNo: `${tag}-${n}`, reportNo: `${tag}-${n}`, qualityTaskId: task.id, contractId, materialId, materialName: tag, status: 'CONFIRMED', institutionType: 'PARTNER', institutionPartnerId: partners[2], institutionName: '模拟客户化验室', evidenceStage: 'SHIPPING', conclusion: 'PASS', sampledAt: new Date(), testedAt: new Date(), samplerName: '模拟', createdBy: admin.id, indicators: { create: { code: 'MOISTURE', name: '水分', operator: 'LTE', standardValue: 12, measuredValue: 5, unit: '%', result: 'PASS' } } } });
      await db.qualityTask.update({ where: { id: task.id }, data: { basisInspectionId: report.id } });
      const input = { weighTicketId: ticket.id, qualityReportId: report.id, remarks: 'QA模拟交付' };
      if (n === 1) {
        await call(viewer, `/bilateral-direct/waybills/${w.id}/confirm`, 'POST', input, 403);
        await call(logistics, `/bilateral-direct/waybills/${w.id}/confirm`, 'POST', input, 403);
        await call(outsider, `/bilateral-direct/waybills/${w.id}/preview`, 'POST', input, 404);
        await call(warehouse, `/bilateral-direct/waybills/${w.id}/preview`, 'POST', input);
        check('真实只读/物流账号不能交付；仓管可预览；其他事业部即使角色ALL也被范围拦截');
        await call(warehouse, `/bilateral-direct/waybills/${w.id}/confirm`, 'POST', { ...input, requestReview: true });
        await call(warehouse, `/bilateral-direct/waybills/${w.id}/review`, 'POST', { approved: true, reason: '不能越权审批' }, 403);
        await call(reviewer, `/bilateral-direct/waybills/${w.id}/review`, 'POST', { approved: true, reason: 'QA岗位复核通过' }); check('仓管提交复核后，由真实运营经理角色完成审批');
      } else await call(warehouse, `/bilateral-direct/waybills/${w.id}/confirm`, 'POST', input);
    }
    const visible = await call(viewer, `/bilateral-direct/trade-documents?contractId=${contractId}`), hidden = await call(outsider, `/bilateral-direct/trade-documents?contractId=${contractId}`);
    assert.equal(visible.total, 2); assert.equal(hidden.total, 0); check('真实只读账号可查成对记录，跨事业部账号查询为空');
    assert.equal(await db.inventoryLot.count(), stocks); check('两车岗位操作后仓库库存不变');
    const sources = (direction: string) => call(admin, `/financial-settlements/options/goods-sources?contractId=${contractId}&direction=${direction}`);
    const makeLines = (rows: any[]) => rows.map(r => ({ waybillLineItemId: r.id, orderId: r.orderId, weighTicketId: r.weighTicketId, qualityReportId: r.reportId }));
    const salesSources = await sources('RECEIVABLE'); assert.equal(salesSources.length, 2);
    const sales = await call(admin, '/financial-settlements', 'POST', { contractId, direction: 'RECEIVABLE', settlementScope: 'GOODS', lines: makeLines(salesSources), settlementAdjustment: { mode: 'QUANTITY', quantity: 37.5, reason: '两车同价，按37.5干基吨协商' } });
    async function approve(id: string) {
      await db.attachment.create({ data: { financialSettlementId: id, fileName: `${tag}-${id}.png`, originalName: 'QA签章确认单.png', mimeType: 'image/png', size: 1, category: 'SIGNED_SETTLEMENT_CONFIRMATION', uploadedBy: admin.id } });
      await call(admin, `/financial-settlements/${id}/confirm`, 'POST', {});
      for (let i = 0; i < 20; i++) { const item = await call(admin, `/financial-settlements/${id}`); if (item.status === 'CONFIRMED') return item; await call(admin, `/financial-settlements/${id}/approve`, 'POST', { comment: 'QA本地模拟审批' }); }
      throw Error('审批未结束');
    }
    const saleDone = await approve(sales.id); assert.equal(Number(saleDone.quantity), 37.5); assert.equal(Number(saleDone.totalAmount), 45000); check('两车销售38干基吨整单调整为37.5吨，审批后金额45000元');
    const paySources = await sources('PAYABLE'); assert(paySources.every((r: any) => Number(r.followAdjustment.finalQuantity) === 37.5));
    const base = { contractId, direction: 'PAYABLE', settlementScope: 'GOODS', lines: makeLines(paySources), settlementAdjustment: { mode: 'QUANTITY', quantity: 37.5, reason: '跟随销售整单数量' } };
    await call(admin, '/financial-settlements', 'POST', { ...base, lines: [base.lines[0]] }, 400);
    await call(admin, '/financial-settlements', 'POST', { ...base, settlementAdjustment: { ...base.settlementAdjustment, quantity: 37.4 } }, 400); check('采购少选车、不同总干基均被真实接口拦截');
    const purchase = await call(admin, '/financial-settlements', 'POST', base), payDone = await approve(purchase.id);
    assert.equal(Number(payDone.quantity), 37.5); assert.equal(Number(payDone.totalAmount), 37500); check('采购同车同37.5吨审批通过，金额按采购价独立计算37500元');
    await call(admin, `/financial-settlements/${sales.id}/void`, 'POST', {}, 400); await call(admin, `/financial-settlements/${purchase.id}/void`, 'POST', {}); await call(admin, `/financial-settlements/${sales.id}/void`, 'POST', {}); check('整单调整后的销售仍须先作废跟随采购才能作废');
    process.stdout.write(JSON.stringify({ result: 'PASS', checks, database: 'localhost/ricse_dev', cleanup: '仅自建QA数据与模拟岗位账号' }) + '\n');
  } finally {
    if (contractId) {
      const settlements = await db.financialSettlement.findMany({ where: { contractId }, select: { id: true } });
      await db.attachment.deleteMany({ where: { financialSettlementId: { in: settlements.map(s => s.id) } } });
      await db.financialSettlement.deleteMany({ where: { contractId } });
      await db.directTradeDocument.deleteMany({ where: { delivery: { waybillId: { in: trips } } } }); await db.directDelivery.deleteMany({ where: { waybillId: { in: trips } } });
      await db.waybill.updateMany({ where: { id: { in: trips } }, data: { salesCompletionReportId: null, salesCompletionCustomerTicketId: null, salesCompletionShippingTicketId: null } });
      await db.qualityTask.updateMany({ where: { waybillId: { in: trips } }, data: { basisInspectionId: null } });
      await db.qualityInspection.deleteMany({ where: { contractId } }); await db.qualityTask.deleteMany({ where: { waybillId: { in: trips } } });
      await db.attachment.deleteMany({ where: { waybillId: { in: trips } } }); await db.weighTicket.deleteMany({ where: { waybillId: { in: trips } } }); await db.waybill.deleteMany({ where: { id: { in: trips } } });
      const orders = await db.order.findMany({ where: { contractId }, select: { id: true } });
      await db.directExecution.deleteMany({ where: { contractId } }); await db.dispatchNotice.deleteMany({ where: { orderId: { in: orders.map(o => o.id) } } }); await db.order.deleteMany({ where: { contractId } });
      await db.contractLineItem.deleteMany({ where: { contractId } }); await db.contract.delete({ where: { id: contractId } });
      await db.businessOperationLog.deleteMany({ where: { businessId: { in: [contractId, ...trips, ...settlements.map(s => s.id)] } } });
    }
    if (materialId) await db.material.delete({ where: { id: materialId } }); if (categoryId) await db.materialCategory.delete({ where: { id: categoryId } });
    if (partners.length) await db.partner.deleteMany({ where: { id: { in: partners } } });
    if (users.length) await db.user.deleteMany({ where: { id: { in: users } } }); if (employees.length) await db.employee.deleteMany({ where: { id: { in: employees } } });
    if (roles.length) await db.role.deleteMany({ where: { id: { in: roles } } }); if (otherUnitId) await db.businessUnit.delete({ where: { id: otherUnitId } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
