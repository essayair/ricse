/** 本机领域集成测试：只写自建 QA 数据，结束时按自建 ID 清理，不清空任何现有数据。 */
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import assert from 'node:assert/strict';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { BilateralDirectService } from '../src/modules/bilateral-direct/bilateral-direct.service';
import { FinancialSettlementService } from '../src/modules/financial-settlement/financial-settlement.service';

async function main() {
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = readFileSync('.env', 'utf8').match(/^DATABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/ricse_dev') throw new Error('只允许 localhost 的 ricse_dev 开发数据库');
  const db = new PrismaService(), access = new AccessControlService(db), direct = new BilateralDirectService(db, access), finance = new FinancialSettlementService(db, access);
  const tag = `QA-DIRECT-${randomUUID().slice(0, 8)}`;
  const useHttp = process.argv.includes('--http');
  let contractId: string | undefined, materialId: string | undefined, categoryId: string | undefined, warehouseId: string | undefined;
  const partners: string[] = [], trips: string[] = [], settlements: string[] = [];
  const checks: string[] = [];
  const check = (name: string) => { checks.push(name); process.stdout.write(`PASS ${name}\n`); };
  try {
    const user = await db.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } });
    const unit = await db.businessUnit.findFirst({ where: { status: 'ACTIVE' } });
    if (!user || !unit) throw new Error('本机测试须有有效管理员和业务单元，不自动修改既有账号');
    await access.assertPermission(user.id, 'inventory.manage');
    let token = '';
    if (useHttp) {
      const secret = process.env.JWT_SECRET || readFileSync('.env', 'utf8').match(/^JWT_SECRET\s*=\s*["']?([^\s"']+)/m)?.[1];
      if (!secret) throw new Error('本机未配置 JWT_SECRET，不能验证 HTTP 鉴权');
      token = new JwtService().sign({ sub: user.id, username: user.username, role: user.role, tokenVersion: user.tokenVersion }, { secret, expiresIn: '5m' });
    }
    const http = async (method: string, path: string, data?: unknown) => {
      const response = await fetch(`http://127.0.0.1:3000/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
      const result = await response.json() as any;
      if (!response.ok) throw new Error(`本机HTTP ${response.status}: ${JSON.stringify(result.message || result)}`);
      return result;
    };
    if (useHttp) {
      const denied = await fetch('http://127.0.0.1:3000/api/v1/bilateral-direct/warehouses'); assert.equal(denied.status, 401);
      await http('GET', '/bilateral-direct/warehouses'); check('真实HTTP模块已加载，鉴权拒绝无令牌请求');
      for (const path of ['/waybills?directPending=invalid', '/bilateral-direct/trade-documents?pageNo=0']) {
        const invalid = await fetch(`http://127.0.0.1:3000/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(invalid.status, 400);
      }
      check('真实HTTP布尔筛选与分页参数无效时返回400');
    }
    const stockBefore = await db.inventoryLot.count();
    const category = await db.materialCategory.create({ data: { name: tag } }); categoryId = category.id;
    const material = await db.material.create({ data: { name: tag, code: tag, categoryId, pricingQuantityBasis: 'DRY_MATTER' } }); materialId = material.id;
    for (const kind of ['OWN', 'SUPPLIER', 'CUSTOMER']) {
      const p = await db.partner.create({ data: { name: `${tag}-${kind}`, code: `${tag}-${kind}`, roles: kind === 'OWN' ? ['SUPPLIER', 'CUSTOMER'] : [kind], isInternal: kind === 'OWN' } }); partners.push(p.id);
    }
    const c = await db.contract.create({ data: { contractNo: tag, title: tag, type: 'BILATERAL', status: 'APPROVED', signingPartnerId: partners[0], sellerId: partners[1], buyerId: partners[2], businessUnitId: unit.id, pricingType: 'FIXED', totalAmount: 20000, createdBy: user.id,
      lineItems: { create: { materialId, materialName: tag, quantity: 20, unitPrice: 1000, salesUnitPrice: 1200, totalPrice: 20000, salesTotalPrice: 24000, pricingQuantityBasis: 'DRY_MATTER', taxRatePct: 13 } },
    }, include: { lineItems: true } }); contractId = c.id;
    const request = { contractId, contractLineItemId: c.lineItems[0].id, quantity: 20, originLocation: '测试供应商装货点', destinationLocation: '测试客户收货点', requestId: tag };
    const options = useHttp ? await http('GET', `/bilateral-direct/contracts/${contractId}/execution-options`) : await direct.executionOptions(contractId, user.id);
    assert.equal(options.partners.length, 3); assert.equal(options.unallocated[0].PURCHASE, '20'); assert.equal(options.unallocated[0].SALES, '20'); check('执行候选仅合同三方地址，两向剩余数量独立展示');
    const pair = useHttp ? await http('POST', '/bilateral-direct/executions', request) : await direct.createExecution(request, user.id);
    const retry = await direct.createExecution(request, user.id); assert.equal(pair.id, retry.id);
    assert.equal(await db.outboundOrder.count({ where: { dispatchNoticeId: pair.salesNoticeId } }), 0); check('配对通知原子创建、请求幂等、不预占库存');
    const line = await db.dispatchNoticeLineItem.findFirstOrThrow({ where: { dispatchNoticeId: pair.salesNoticeId } });
    const w = await db.waybill.create({ data: { waybillNo: tag, dispatchNoticeId: pair.salesNoticeId, status: 'SIGNED', totalQuantity: 20, createdBy: user.id, signedAt: new Date(),
      lineItems: { create: { dispatchNoticeLineItemId: line.id, materialId, materialName: tag, quantity: 20 } },
      attachments: { create: { fileName: `${tag}.pdf`, originalName: '测试签收凭证.pdf', mimeType: 'application/pdf', size: 1, category: 'RECEIPT_DOCUMENT' } },
    }, include: { lineItems: true } }); trips.push(w.id);
    const ticket = await db.weighTicket.create({ data: { ticketNo: tag, waybillId: w.id, direction: 'OUTBOUND', weighingStage: 'SHIPPING', status: 'REVIEWED', plannedQuantity: 20, netWeight: 20, createdBy: user.id } });
    const task = await db.qualityTask.create({ data: { taskNo: tag, waybillId: w.id, status: 'COMPLETED', finalConclusion: 'PASS', qualityDisposition: 'PASS', createdBy: user.id } });
    const report = await db.qualityInspection.create({ data: { inspectionNo: tag, reportNo: tag, qualityTaskId: task.id, contractId, materialId, materialName: tag, status: 'CONFIRMED', conclusion: 'PASS', evidenceStage: 'SHIPPING', institutionName: '测试机构', testedAt: new Date(), sampledAt: new Date(), samplerName: '测试员', createdBy: user.id,
      indicators: { create: { code: 'MOISTURE', name: '水分', operator: 'LTE', standardValue: 12, unit: '%', measuredValue: 5, result: 'PASS' } },
    } });
    await db.qualityTask.update({ where: { id: task.id }, data: { basisInspectionId: report.id } });
    const input = { weighTicketId: ticket.id, qualityReportId: report.id, remarks: '仅发货侧有效资料，按双方确认口径交付' };
    if (useHttp) {
      const pending = await http('GET', `/waybills?directPending=true&search=${encodeURIComponent(tag)}`);
      assert(pending.items.some((item: any) => item.id === w.id)); check('真实HTTP待直拨交付筛选可找到已签收车次');
    }
    const preview = useHttp ? await http('POST', `/bilateral-direct/waybills/${w.id}/preview`, input) : await direct.preview(w.id, input, user.id); assert.equal((preview.snapshot as any).pricingQuantity, '19'); check('只有发货侧磅单、报告也可预览，20吨净重折干19吨');
    const confirm = () => useHttp ? http('POST', `/bilateral-direct/waybills/${w.id}/confirm`, input) : direct.confirm(w.id, input, user.id);
    const attempts = await Promise.allSettled([confirm(), confirm()]);
    const failure = attempts.find(r => r.status === 'rejected'); if (failure?.status === 'rejected') throw failure.reason;
    const results = attempts.map(r => r.status === 'fulfilled' ? r.value : null);
    assert.equal(results[0]?.id, results[1]?.id);
    const docs = await db.directTradeDocument.findMany({ where: { delivery: { waybillId: w.id, status: 'CONFIRMED' } } });
    assert.equal(docs.length, 2); assert(docs.every(d => d.quantity.eq(20) && d.pricingQuantity.eq(19)));
    assert.equal(await db.inventoryLot.count(), stockBefore); check('并发确认仅一组两向单据、数量相等、不产生库存');
    const purchaseSources = await finance.settlementSources(contractId, user.id, 'PAYABLE');
    const saleSources = await finance.settlementSources(contractId, user.id, 'RECEIVABLE');
    assert.equal(purchaseSources.length, 1); assert.equal(saleSources.length, 1);
    assert('previewOnly' in purchaseSources[0] && purchaseSources[0].previewOnly); assert(!purchaseSources[0].available); assert(saleSources[0].available, saleSources[0].reasons?.join(';'));
    await assert.rejects(finance.create({ contractId, direction: 'PAYABLE', settlementScope: 'GOODS', lines: [{ waybillLineItemId: purchaseSources[0].id, orderId: purchaseSources[0].orderId }] } as any, user.id), /请先完成销售结算审批/);
    check('销售结算完成前采购仅可预览，不能保存');
    for (const direction of ['RECEIVABLE', 'PAYABLE'] as const) {
      const source = (await finance.settlementSources(contractId, user.id, direction))[0];
      assert(source.available, source.reasons?.join(';'));
      const settlement = await finance.create({ contractId, direction, settlementScope: 'GOODS', lines: [{ waybillLineItemId: source.id, orderId: source.orderId }] } as any, user.id);
      settlements.push(settlement.id); assert.equal(Number(settlement.totalAmount), direction === 'PAYABLE' ? 19000 : 22800);
      await finance.confirm(settlement.id, user.id);
    }
    check('销售先确认22800元，采购跟随相同19吨、按采购价计算19000元');
    if (useHttp) {
      const list = await http('GET', `/bilateral-direct/trade-documents?contractId=${contractId}`);
      assert.equal(list.total, 1); assert.equal(list.items[0].documents.length, 2); assert.equal(Number(list.totals.quantity), 20); assert.equal(Number(list.totals.pricingQuantity), 19);
      assert.equal(list.items[0].evidence.ticketNo, tag); assert(!('snapshot' in list.items[0])); check('真实HTTP直拨进出成对展示且只汇总一次数量，快照按字段投影');
      const pending = await http('GET', `/waybills?directPending=true&search=${encodeURIComponent(tag)}`);
      assert.equal(pending.items.length, 0); check('完成直拨交付后从待确认列表移除');
    }
    await assert.rejects(direct.reverse(w.id, '测试更正', user.id), /结算单/); check('有效下游结算阻止撤销');
    await assert.rejects(finance.voidSettlement(settlements[0], user.id), /请先作废该采购结算/); check('存在跟随采购结算时不可先作废销售结算');
    for (const id of [...settlements].reverse()) await finance.voidSettlement(id, user.id);
    await direct.reverse(w.id, '结算作废后更正', user.id);
    if (useHttp) {
      const list = await http('GET', `/bilateral-direct/trade-documents?contractId=${contractId}&status=REVERSED`);
      assert.equal(list.total, 1); assert.equal(list.items[0].status, 'REVERSED'); assert.equal(Number(list.totals.quantity), 0); check('撤销版本保留两向记录但不计入有效数量汇总');
    }
    const revised = await direct.confirm(w.id, input, user.id); assert.equal(revised?.version, 2); check('结算作废后可撤销并重新确认，保留第二版');
    await direct.reverse(w.id, '撤销后测试复核', user.id);
    await direct.confirm(w.id, { ...input, requestReview: true }, user.id);
    const reviewed = await direct.review(w.id, true, '复核同意', user.id); assert.equal(reviewed.status, 'CONFIRMED'); check('运营经理复核快照稳定，JSON键序不影响通过');
    await direct.reverse(w.id, '测试结束', user.id); await direct.cancel(w.id, '测试取消', user.id);
    assert.equal((await db.waybill.findUniqueOrThrow({ where: { id: w.id } })).status, 'CANCELLED'); check('撤销后允许取消已签收运单，保留历史证据');
    const anotherTrip = async (suffix: string) => {
      const trip = await db.waybill.create({ data: { waybillNo: `${tag}-${suffix}`, dispatchNoticeId: pair.salesNoticeId, status: 'ARRIVED', totalQuantity: 20, createdBy: user.id,
        lineItems: { create: { dispatchNoticeLineItemId: line.id, materialId: material.id, materialName: tag, quantity: 20 } },
        attachments: { create: { fileName: `${tag}-${suffix}.pdf`, originalName: '测试异常凭证.pdf', mimeType: 'application/pdf', size: 1, category: 'RECEIPT_OTHER' } },
      } }); trips.push(trip.id); return trip;
    };
    const rejected = await anotherTrip('REJECT');
    await direct.rejectReturn(rejected.id, '客户整车拒收，原路退回供应商', user.id);
    assert.equal((await db.waybill.findUniqueOrThrow({ where: { id: rejected.id } })).directOutcome, 'REJECT_RETURN'); check('整车拒收不生成两向交付，保留异常去向');
    const warehouse = await db.warehouse.create({ data: { code: tag, name: tag, address: '测试仓库详细地址' } }); warehouseId = warehouse.id;
    const converted = await anotherTrip('CONVERT');
    const replacement = await direct.convertToWarehouse(converted.id, { warehouseId, reason: '客户改期，转入我方仓库待后续销售' }, user.id); trips.push(replacement.nextWaybillId);
    const next = await db.waybill.findUniqueOrThrow({ where: { id: replacement.nextWaybillId }, include: { dispatchNotice: true } });
    assert.equal(next.status, 'PENDING'); assert.equal(next.dispatchNotice.type, 'PURCHASE'); assert.equal(next.dispatchNotice.mode, 'STANDARD'); assert.equal(next.dispatchNotice.warehouseId, warehouseId);
    const purchaseNotified = await db.dispatchNotice.aggregate({ where: { orderId: pair.purchaseNotice.orderId, status: { not: 'CANCELLED' } }, _sum: { totalQuantity: true } });
    assert.equal(Number(purchaseNotified._sum.totalQuantity), 20); assert.equal(await db.inventoryLot.count(), stockBefore); check('单车转入库保留链路，采购计划不重复，尚未形成库存');
    const flowReview = await direct.contractReview(contractId, user.id); assert.equal(flowReview.trips.length, 3); check('四流核对可读取已取消、拒收及转入库的原始直拨趟次');
    if (useHttp) { const view = await http('GET', `/bilateral-direct/contracts/${contractId}/review`); assert.equal(view.trips.length, 3); check('真实HTTP四流核对接口响应正常'); }
    process.stdout.write(JSON.stringify({ result: 'PASS', checks: checks.length, http: useHttp, database: 'localhost/ricse_dev', auth: '真实管理员权限服务，令牌不写入文件或日志', cleanup: '仅清理自建QA记录' }) + '\n');
  } finally {
    // 严格限定本脚本创建的 ID；未创建任何数据时不执行空范围删除。
    if (contractId) {
      const orders = await db.order.findMany({ where: { contractId }, select: { id: true } });
      const notices = await db.dispatchNotice.findMany({ where: { orderId: { in: orders.map(o => o.id) } }, select: { id: true } });
      await db.financialSettlement.deleteMany({ where: { contractId } });
      await db.directTradeDocument.deleteMany({ where: { delivery: { waybillId: { in: trips } } } });
      await db.directDelivery.deleteMany({ where: { waybillId: { in: trips } } });
      await db.waybill.updateMany({ where: { id: { in: trips } }, data: { salesCompletionReportId: null, salesCompletionCustomerTicketId: null, salesCompletionShippingTicketId: null, replacementWaybillId: null } });
      await db.qualityTask.updateMany({ where: { waybillId: { in: trips } }, data: { basisInspectionId: null } });
      await db.qualityInspection.deleteMany({ where: { contractId } });
      await db.qualityTask.deleteMany({ where: { waybillId: { in: trips } } });
      await db.attachment.deleteMany({ where: { waybillId: { in: trips } } });
      await db.weighTicket.deleteMany({ where: { waybillId: { in: trips } } });
      await db.waybill.deleteMany({ where: { id: { in: trips } } });
      await db.directExecution.deleteMany({ where: { contractId } });
      await db.dispatchNotice.deleteMany({ where: { id: { in: notices.map(n => n.id) } } });
      await db.order.deleteMany({ where: { contractId } });
      await db.contractLineItem.deleteMany({ where: { contractId } });
      await db.contract.delete({ where: { id: contractId } });
      await db.businessOperationLog.deleteMany({ where: { businessId: { in: [contractId, ...trips] } } });
    }
    if (materialId) await db.material.delete({ where: { id: materialId } });
    if (categoryId) await db.materialCategory.delete({ where: { id: categoryId } });
    if (warehouseId) await db.warehouse.delete({ where: { id: warehouseId } });
    if (partners.length) await db.partner.deleteMany({ where: { id: { in: partners } } });
    await db.$disconnect();
  }
}
main().catch(error => { process.stderr.write(String(error?.stack || error) + '\n'); process.exitCode = 1; });
