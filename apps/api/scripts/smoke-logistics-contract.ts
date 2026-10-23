/** 本地数据库回滚冒烟：不创建真实文件，不向外发送消息，不执行银行付款。 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { LogisticsContractService } from '../src/modules/logistics-settlement/logistics-contract.service';
import { LogisticsSettlementService } from '../src/modules/logistics-settlement/logistics-settlement.service';
import { FileService } from '../src/modules/common/file.service';
import { WeighTicketService } from '../src/modules/weighbridge/weigh-ticket.service';

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !/dev|test/i.test(url.pathname)) throw new Error('仅允许本机 dev/test 数据库');
  const prisma = new PrismaService(), tag = 'LOG_SMOKE_' + randomUUID().slice(0, 8), rollback = new Error('EXPECTED_ROLLBACK');
  let done = false;
  try {
    await prisma.$transaction(async tx => {
      // 服务内部事务共用本次测试事务，确保任何断言失败也能完整回滚。
      const db: PrismaService = new Proxy(tx as PrismaService, { get(target, key) {
        if (key === '$transaction') return async (callback: (client: PrismaService) => unknown) => callback(db);
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      } });
      const access = new AccessControlService(db), files = {} as FileService;
      const contracts = new LogisticsContractService(db, access, files), settlements = new LogisticsSettlementService(db, access, files);
      const company = await tx.company.create({ data: { code: tag + '_C', name: tag + '管理组织' } });
      const unit = await tx.businessUnit.create({ data: { code: tag + '_U', name: tag + '事业部', companyId: company.id } });
      const user = await tx.user.create({ data: { username: tag, name: '回滚物流测试管理员', password: randomUUID(), role: 'ADMIN', companyId: company.id,
        roleAssignments: { create: { roleId: (await tx.role.findUniqueOrThrow({ where: { code: 'ADMIN' } })).id, scopeType: 'ALL' } } } });
      const owner = await tx.partner.create({ data: { code: tag + '_OWNER', name: tag + '货主A', isInternal: true, roles: ['SUPPLIER', 'CUSTOMER'] } });
      const payer = await tx.partner.create({ data: { code: tag + '_PAYER', name: tag + '代付B', isInternal: true, roles: ['SUPPLIER', 'CUSTOMER'] } });
      const carrier = await tx.partner.create({ data: { code: tag + '_CARRIER', name: tag + '物流公司', roles: ['SUPPLIER'] } });
      await tx.serviceOrganization.create({ data: { code: tag + '_SO', partnerId: carrier.id, organizationType: 'LOGISTICS_CARRIER', transportModes: ['ROAD'] } });
      const lc = await contracts.create({ title: tag + '物流合同', externalContractNo: '纸质合同001', signingPartnerId: owner.id, carrierPartnerId: carrier.id,
        signedAt: '2026-10-01', allBusinessUnits: true, settlementBasis: 'NET_WEIGHT', priceTerms: [{ unitPrice: 100, effectiveAt: '2026-10-01' }] }, user.id);
      await assert.rejects(() => contracts.updateStatus(lc.id, { status: 'ACTIVE' }, user.id), /合同附件/);
      await tx.attachment.create({ data: { logisticsContractId: lc.id, fileName: tag + '_not_uploaded.pdf', originalName: '事务内模拟附件.pdf', mimeType: 'application/pdf', size: 10, category: 'LOGISTICS_CONTRACT', uploadedBy: user.id } });
      await contracts.updateStatus(lc.id, { status: 'ACTIVE' }, user.id);
      await assert.rejects(() => contracts.addPriceTerm(lc.id, { unitPrice: 90, effectiveAt: '2026-10-02' }, user.id), /已锁定/);
      const makeWaybill = async (type: string, suffix: string) => {
        const trade = await tx.contract.create({ data: { contractNo: tag + '_HT' + suffix, title: tag, type, status: 'EXECUTING', signingPartnerId: owner.id,
          sellerId: type === 'PURCHASE' ? carrier.id : owner.id, buyerId: type === 'PURCHASE' ? owner.id : carrier.id, businessUnitId: unit.id, companyId: company.id, totalAmount: 200000, createdBy: user.id,
          lineItems: { create: { materialId: tag + '_M', materialName: '萤石精粉', quantity: 100, unitPrice: 2000, totalPrice: 200000 } } }, include: { lineItems: true } });
        const order = await tx.order.create({ data: { orderNo: tag + '_O' + suffix, name: tag, contractId: trade.id, type, totalAmount: 200000, createdBy: user.id,
          lineItems: { create: { contractLineItemId: trade.lineItems[0].id, materialId: tag + '_M', quantity: 100, unitPrice: 2000, totalPrice: 200000 } } }, include: { lineItems: true } });
        const notice = await tx.dispatchNotice.create({ data: { noticeNo: tag + '_N' + suffix, orderId: order.id, type, totalQuantity: 100, createdBy: user.id,
          lineItems: { create: { orderLineItemId: order.lineItems[0].id, materialId: tag + '_M', quantity: 100 } } }, include: { lineItems: true } });
        const w = await tx.waybill.create({ data: { waybillNo: tag + '_WB' + suffix, dispatchNoticeId: notice.id, status: 'SIGNED', carrierPartnerId: carrier.id, carrierName: carrier.name,
          totalQuantity: 100, departedAt: new Date('2026-10-02T10:00:00+08:00'), signedAt: new Date('2026-10-03T10:00:00+08:00'), plateNo: '浙A模拟01', createdBy: user.id,
          lineItems: { create: { dispatchNoticeLineItemId: notice.lineItems[0].id, materialId: tag + '_M', materialName: '萤石精粉', quantity: 100 } } } });
        const shipping = await tx.weighTicket.create({ data: { ticketNo: tag + '_SHIP' + suffix, waybillId: w.id, direction: type === 'PURCHASE' ? 'INBOUND' : 'OUTBOUND', weighingStage: 'SHIPPING', status: 'REVIEWED', plannedQuantity: 100, grossWeight: 120, tareWeight: 20, netWeight: 100, createdBy: user.id } });
        const receiving = await tx.weighTicket.create({ data: { ticketNo: tag + '_RECV' + suffix, waybillId: w.id, direction: type === 'PURCHASE' ? 'INBOUND' : 'OUTBOUND', weighingStage: 'RECEIVING', status: 'REVIEWED', plannedQuantity: 100, grossWeight: 118, tareWeight: 20, netWeight: 98, createdBy: user.id } });
        await tx.waybillWeightSelection.createMany({ data: [{ waybillId: w.id, purpose: 'INVENTORY', weighTicketId: type === 'PURCHASE' ? receiving.id : shipping.id, quantity: type === 'PURCHASE' ? 98 : 100, selectedBy: user.id }, { waybillId: w.id, purpose: 'SETTLEMENT', weighTicketId: receiving.id, quantity: 98, selectedBy: user.id }] });
        return { w, shipping, receiving };
      };
      const purchase = await makeWaybill('PURCHASE', 'P');
      assert((await settlements.listCandidateWaybills({}, user.id)).some(w => w.id === purchase.w.id));
      assert(!(await settlements.listCandidateWaybills({ periodEnd: '2026-10-01' }, user.id)).some(w => w.id === purchase.w.id));
      const ls = await settlements.create({ lines: [{ waybillId: purchase.w.id }] }, user.id);
      assert.equal(ls.periodStart.toISOString(), '2026-10-02T16:00:00.000Z');
      assert.equal(ls.periodEnd.toISOString(), '2026-10-03T15:59:59.999Z');
      assert(!(await settlements.listCandidateWaybills({}, user.id)).some(w => w.id === purchase.w.id));
      assert.equal(Number(ls.totalAmount), 9800); assert.equal(ls.lines[0].weighTicketId, purchase.receiving.id);
      await settlements.setLineWeight(ls.id, ls.lines[0].id, { weighTicketId: purchase.shipping.id, weightReason: '运输双方确认按发货磅单' }, user.id);
      await settlements.setLinePrice(ls.id, ls.lines[0].id, { unitPrice: 90, overrideReason: '本次优惠' }, user.id);
      await settlements.setLinePrice(ls.id, ls.lines[0].id, { unitPrice: 95, overrideReason: '复核后确认价格' }, user.id);
      await settlements.setPayer(ls.id, { payerPartnerId: payer.id, reason: '内部公司代付约定' }, user.id);
      const changed = await settlements.findOne(ls.id, user.id);
      assert.equal(changed.ownerPartnerId, owner.id); assert.equal(changed.payerPartnerId, payer.id); assert.equal(Number(changed.totalAmount), 9500);
      assert.equal(Number(changed.lines[0].contractUnitPrice), 100); assert.equal(changed.adjustments.length, 4);
      assert.equal(Number((await contracts.findOne(lc.id, user.id)).priceTerms[0].unitPrice), 100);
      assert.equal((await tx.waybillWeightSelection.findFirstOrThrow({ where: { waybillId: purchase.w.id, purpose: 'INVENTORY', isCurrent: true } })).weighTicketId, purchase.receiving.id);
      await settlements.submit(ls.id, user.id); await settlements.returnDraft(ls.id, user.id); await settlements.submit(ls.id, user.id); await settlements.review(ls.id, user.id);
      await assert.rejects(() => settlements.setLinePrice(ls.id, ls.lines[0].id, { unitPrice: 80, overrideReason: '不能直接改' }, user.id), /只有草稿/);
      const records = await contracts.settlementRecords(lc.id, user.id); assert(records.some(r => r.settlementId === ls.id));
      const sales = await makeWaybill('SALES', 'S');
      const weighing = new WeighTicketService(db, access);
      await weighing.selectForPurpose(sales.w.id, 'SETTLEMENT', sales.shipping.id, '模拟先按发货确认货款', user.id);
      await weighing.selectForPurpose(sales.w.id, 'SETTLEMENT', sales.receiving.id, '双方最终确认按客户磅单', user.id);
      const saleLs = await settlements.create({ periodStart: '2026-10-01', periodEnd: '2026-10-31', lines: [{ waybillId: sales.w.id }] }, user.id);
      assert.equal(saleLs.lines[0].weighTicketId, sales.receiving.id); assert.equal(Number(saleLs.totalAmount), 9800);
      assert.equal((await tx.waybillWeightSelection.findFirstOrThrow({ where: { waybillId: sales.w.id, purpose: 'INVENTORY', isCurrent: true } })).weighTicketId, sales.shipping.id);
      console.log('PASS 合同创建/附件校验/启用锁价、采购入库与销售客户磅单默认、运费独立改选、重复调价历史、代付主体、复核锁定及合同结算记录');
      done = true; throw rollback;
    }, { timeout: 120000 });
  } catch (e) { if (e !== rollback) throw e; } finally { await prisma.$disconnect(); }
  assert(done); console.log('PASS 全部模拟记录已回滚，未修改原有业务数据、文件或线上环境');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
