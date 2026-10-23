/** 本地真实数据库冒烟：全部模拟单据在同一事务内执行，完成后强制回滚。 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { FinancialSettlementService } from '../src/modules/financial-settlement/financial-settlement.service';
import { PurchaseSettlementBasis } from '../src/modules/financial-settlement/purchase-settlement-basis';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { QualityInspectionService } from '../src/modules/quality/quality-inspection.service';
import { LogisticsSettlementService } from '../src/modules/logistics-settlement/logistics-settlement.service';

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !/dev|test/i.test(url.pathname)) throw new Error('此测试只允许本地dev/test数据库，不允许生产库');
  const prisma = new PrismaService(), tag = `SMOKE_${randomUUID().slice(0, 8)}`;
  const rollback = new Error('EXPECTED_SMOKE_ROLLBACK');
  let complete = false;
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tag}, 0))::text`;
      const db: PrismaService = new Proxy(tx as PrismaService, { get(target, key) {
        if (key === '$transaction') return async (callback: (client: PrismaService) => unknown) => callback(db);
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      } });
      const access = new AccessControlService(db);
      const finance = new FinancialSettlementService(db, access);
      (finance as any).transactional = true;
      const inventory = new InventoryService(db, access), quality = new QualityInspectionService(db, access, inventory);
      const adminRole = await tx.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
      const company = await tx.company.create({ data: { code: `${tag}_C`, name: `${tag}模拟管理组织` } });
      const unit = await tx.businessUnit.create({ data: { code: `${tag}_U`, name: `${tag}模拟事业部`, companyId: company.id } });
      const user = await tx.user.create({ data: { username: `${tag}_admin`, name: '付款联调模拟人员', password: randomUUID(), companyId: company.id,
        roleAssignments: { create: { roleId: adminRole.id, scopeType: 'ALL' } } } });
      const own = await tx.partner.create({ data: { code: `${tag}_P`, name: `${tag}模拟采购方`, roles: ['SUPPLIER', 'CUSTOMER'], isInternal: true,
        bankAccounts: { create: { accountName: `${tag}模拟采购方`, accountNo: `${Date.now()}001`, bankName: '模拟付款银行' } } }, include: { bankAccounts: true } });
      const seller = await tx.partner.create({ data: { code: `${tag}_S`, name: `${tag}模拟供应商`, roles: ['SUPPLIER'],
        bankAccounts: { create: { accountName: `${tag}模拟供应商`, accountNo: `${Date.now()}002`, bankName: '模拟收款银行' } } }, include: { bankAccounts: true } });
      const category = await tx.materialCategory.create({ data: { name: `${tag}模拟物料分类` } });
      await tx.material.create({ data: { id: `${tag}_M`, code: `${tag}_M`, name: '模拟萤石精粉', categoryId: category.id } });
      const warehouse = await tx.warehouse.create({ data: { code: `${tag}_WH`, name: `${tag}模拟仓库` } });
      const contract = await tx.contract.create({ data: { contractNo: `${tag}_HT`, title: '模拟质量扣款合同', type: 'PURCHASE', status: 'APPROVED',
        sellerId: seller.id, buyerId: own.id, signingPartnerId: own.id, businessUnitId: unit.id, companyId: company.id, totalAmount: 200000, prepayPct: 30, createdBy: user.id,
        lineItems: { create: { materialId: `${tag}_M`, materialName: '模拟萤石精粉', quantity: 100, unitPrice: 2000, totalPrice: 200000 } } }, include: { lineItems: true } });
      const order = await tx.order.create({ data: { orderNo: `${tag}_O`, name: '模拟执行批次', contractId: contract.id, type: 'PURCHASE', status: 'CONFIRMED', totalAmount: 200000, createdBy: user.id,
        lineItems: { create: { contractLineItemId: contract.lineItems[0].id, materialId: `${tag}_M`, quantity: 100, unitPrice: 2000, totalPrice: 200000 } } }, include: { lineItems: true } });
      const notice = await tx.dispatchNotice.create({ data: { noticeNo: `${tag}_N`, orderId: order.id, type: 'PURCHASE', status: 'ISSUED', totalQuantity: 100, createdBy: user.id,
        lineItems: { create: { orderLineItemId: order.lineItems[0].id, materialId: `${tag}_M`, quantity: 100 } } }, include: { lineItems: true } });
      const waybill = await tx.waybill.create({ data: { waybillNo: `${tag}_W`, dispatchNoticeId: notice.id, status: 'ARRIVED', totalQuantity: 100, plateNo: '浙A模拟01', createdBy: user.id,
        lineItems: { create: { dispatchNoticeLineItemId: notice.lineItems[0].id, materialId: `${tag}_M`, materialName: '模拟萤石精粉', quantity: 100 } } }, include: { lineItems: true } });
      const ticket = await tx.weighTicket.create({ data: { ticketNo: `${tag}_B`, waybillId: waybill.id, direction: 'INBOUND', status: 'REVIEWED', plannedQuantity: 100, netWeight: 100, settlementWeight: 100, createdBy: user.id } });
      await tx.waybillWeightSelection.create({ data: { waybillId: waybill.id, weighTicketId: ticket.id, purpose: 'SETTLEMENT', quantity: 100, selectedBy: user.id } });
      const task = await tx.qualityTask.create({ data: { taskNo: `${tag}_Q`, waybillId: waybill.id, createdBy: user.id } });
      const report = await tx.qualityInspection.create({ data: { inspectionNo: `${tag}_R`, qualityTaskId: task.id, weighTicketId: ticket.id, institutionName: '模拟检测机构', reportNo: `${tag}_REPORT`, testedAt: new Date(), sampledAt: new Date(), samplerName: '模拟取样人', materialName: '模拟萤石精粉', conclusion: 'DEDUCTION', status: 'CONFIRMED', settlementWeight: 100, createdBy: user.id } });
      await tx.qualityTask.update({ where: { id: task.id }, data: { status: 'COMPLETED', basisInspectionId: report.id, decisionVersion: 1, finalConclusion: 'DEDUCTION', qualityDisposition: 'DEDUCTION_PENDING', qualityDeductionPerTon: 40 } });

      const bank = { ourBankAccount: own.bankAccounts[0].accountNo, ourBankAccountName: own.name, ourBankName: '模拟付款银行', counterpartyBankAccount: seller.bankAccounts[0].accountNo, counterpartyBankAccountName: seller.name, counterpartyBankName: '模拟收款银行' };
      const approve = async (id: string) => {
        for (let i = 0; i < 12; i++) { const r = await finance.findPaymentRequest(id, user.id); if (r.status === 'APPROVED') return; await finance.approvePaymentRequest(id, { comment: '模拟联调审批' }, user.id); }
        throw new Error('模拟审批未结束');
      };
      let index = 0;
      const pay = (id: string, amount: number) => finance.executePaymentRequest(id, { ...bank, amount, bankReference: `${tag}_BANK_${++index}`, occurredAt: new Date(Date.now() + index * 1000).toISOString(), purpose: '模拟货款', actualPayerName: own.name, actualPayeeName: seller.name } as any, user.id,
        { fileName: `${tag}_rollback_only.pdf`, originalName: '事务回滚模拟凭证.pdf', mimeType: 'application/pdf', size: 10 });
      const advance = await finance.createPaymentRequest({ ...bank, contractId: contract.id, businessType: 'PURCHASE', basisType: 'CONTRACT', paymentStage: 'ADVANCE', paymentMethod: 'BANK_TRANSFER', amount: 60000, purpose: '预付采购款', conditionText: '合同约定预付30%', clientRequestId: `${tag}_advance` }, user.id);
      assert.equal((await finance.createPaymentRequest({ ...bank, contractId: contract.id, businessType: 'PURCHASE', basisType: 'CONTRACT', paymentStage: 'ADVANCE', paymentMethod: 'BANK_TRANSFER', amount: 60000, clientRequestId: `${tag}_advance` }, user.id)).id, advance.id);
      await finance.confirmPaymentRequestBusiness(advance.id, user.id); await finance.submitPaymentRequest(advance.id, user.id); await approve(advance.id);
      const advanceFund = await pay(advance.id, 60000); await finance.confirmFund(advanceFund.id, user.id);
      console.log('PASS 合同预付款、请求幂等、完整审批与付款确认');

      await assert.rejects(() => quality.acceptContractDeduction(task.id, '模拟按合同接收', user.id, 0), /版本已变更/);
      await quality.acceptContractDeduction(task.id, '模拟依据合同扣款接收', user.id, 1);
      assert.equal((await new PurchaseSettlementBasis(db, access).sources(contract.id, user.id))[0].available, false);
      const receipt = await tx.inboundReceipt.findFirstOrThrow({ where: { waybillId: waybill.id, deletedAt: null } });
      await inventory.updatePendingReceipt(receipt.id, { warehouseId: warehouse.id, receivedAt: new Date().toISOString(), receiverName: '模拟收货人' }, user.id);
      await inventory.confirmReceipt(receipt.id, user.id);
      await inventory.postInventory(receipt.id, user.id);
      const sources = await new PurchaseSettlementBasis(db, access).sources(contract.id, user.id);
      assert.equal(sources[0].available, true, sources[0].reasons.join('；'));
      const settlement = await finance.create({ contractId: contract.id, direction: 'PAYABLE', settlementScope: 'GOODS', lines: [{ orderId: order.id, waybillLineItemId: waybill.lineItems[0].id, quantity: 100 }] }, user.id);
      assert.equal(Number(settlement.qualityDeductionAmount), 4000); assert.equal(Number(settlement.totalAmount), 196000);
      await finance.confirm(settlement.id, user.id);
      assert.equal((await finance.settlementSources(contract.id, user.id))[0].remainingQuantity, 0);
      console.log('PASS 商务扣款接收、入库依据衔接、逐车质量结算及重复数量控制');

      const final = await finance.createPaymentRequest({ ...bank, contractId: contract.id, businessType: 'PURCHASE', basisType: 'SETTLEMENT', settlementId: settlement.id, paymentStage: 'FINAL', paymentMethod: 'BANK_TRANSFER', amount: 136000, purpose: '模拟结算尾款', conditionText: '质量扣款后结清余款' }, user.id);
      await finance.confirmPaymentRequestBusiness(final.id, user.id);
      await assert.rejects(() => finance.submitPaymentRequest(final.id, user.id), /尚未处理的已付款资金/);
      await finance.allocate(settlement.id, { fundTransactionId: advanceFund.id, amount: 60000 }, user.id);
      await finance.submitPaymentRequest(final.id, user.id); await approve(final.id);
      await tx.qualityTask.update({ where: { id: task.id }, data: { decisionVersion: 2 } });
      await assert.rejects(() => pay(final.id, 30000), /依据已变更/);
      await tx.qualityTask.update({ where: { id: task.id }, data: { decisionVersion: 1 } });
      const first = await pay(final.id, 30000);
      const extra = await finance.createPaymentRequest({ ...bank, contractId: contract.id, businessType: 'PURCHASE', basisType: 'SETTLEMENT', settlementId: settlement.id, paymentStage: 'FINAL', paymentMethod: 'BANK_TRANSFER', amount: 1, purpose: '模拟重复申请', conditionText: '验证重复占用' }, user.id);
      await assert.rejects(() => finance.confirmPaymentRequestBusiness(extra.id, user.id), /可申请余额/);
      await finance.confirmFund(first.id, user.id); await finance.allocate(settlement.id, { fundTransactionId: first.id, amount: 30000 }, user.id);
      const second = await pay(final.id, 106000); await finance.confirmFund(second.id, user.id); await finance.allocate(settlement.id, { fundTransactionId: second.id, amount: 106000 }, user.id);
      const closed = await finance.findOne(settlement.id, user.id);
      assert.equal(closed.status, 'SETTLED'); assert.equal(Number(closed.totalAmount), 196000); assert.equal(Number(closed.settledAmount), 196000);
      console.log('PASS 预付款单次抵扣、依据变更阻断、部分付款防重及结清闭环');
      await tx.waybill.update({ where: { id: waybill.id }, data: { carrierPartnerId: seller.id, status: 'SIGNED' } });
      const logistics = await tx.logisticsSettlement.create({ data: { settlementNo: `${tag}_LS`, payerPartnerId: own.id, payerCompanyId: company.id,
        periodStart: new Date(), periodEnd: new Date(), status: 'REVIEWED', totalAmount: 10000, preparedBy: user.id, createdBy: user.id,
        lines: { create: { waybillId: waybill.id, netWeight: 100, unitPrice: 100, amount: 10000, priceSource: 'MANUAL' } } } });
      const logisticDto = { ...bank, businessType: 'LOGISTICS', basisType: 'LOGISTICS_SETTLEMENT', logisticsSettlementId: logistics.id, paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER', amount: 6000, purpose: '运费结算', conditionText: '按已复核物流结算支付运费' };
      const lr = await finance.createPaymentRequest({ ...logisticDto, clientRequestId: `${tag}_logistics` }, user.id);
      assert.equal(lr.contractId, null); assert.equal(lr.counterpartyId, seller.id); assert.equal(lr.legalEntityPartnerId, own.id);
      assert.equal((await finance.createPaymentRequest({ ...logisticDto, clientRequestId: `${tag}_logistics` }, user.id)).id, lr.id);
      await finance.updatePaymentRequest(lr.id, logisticDto, user.id);
      await finance.confirmPaymentRequestBusiness(lr.id, user.id); await finance.submitPaymentRequest(lr.id, user.id); await approve(lr.id);
      const lf = await pay(lr.id, 6000); await finance.confirmFund(lf.id, user.id);
      const allocatedLogistics = await finance.allocateLogisticsFund(lf.id, { fundTransactionId: lf.id, amount: 6000 }, user.id);
      assert.equal(allocatedLogistics.status, 'ALLOCATED');
      const logOver = await finance.createPaymentRequest({ ...logisticDto, amount: 4001 }, user.id);
      await assert.rejects(() => finance.confirmPaymentRequestBusiness(logOver.id, user.id), /可申请余额/);
      const lastLog = await finance.createPaymentRequest({ ...logisticDto, amount: 4000 }, user.id);
      await finance.confirmPaymentRequestBusiness(lastLog.id, user.id); await finance.submitPaymentRequest(lastLog.id, user.id); await approve(lastLog.id);
      const lastFund = await pay(lastLog.id, 4000); await finance.confirmFund(lastFund.id, user.id);
      await finance.allocateLogisticsFund(lastFund.id, { fundTransactionId: lastFund.id, amount: 4000 }, user.id);
      const allocation = await tx.logisticsPaymentAllocation.findFirstOrThrow({ where: { fundTransactionId: lf.id } });
      await finance.reverseLogisticsAllocation(allocation.id, { reason: '模拟撤销重核销' }, user.id, lf.id);
      await finance.allocateLogisticsFund(lf.id, { fundTransactionId: lf.id, amount: 6000 }, user.id);
      await assert.rejects(() => new LogisticsSettlementService(db, access, {} as any).voidSettlement(logistics.id, user.id, true), /有效付款申请或核销记录/);
      assert.equal(Number((await finance.findOne(settlement.id, user.id)).settledAmount), 196000);
      const logOptions = await finance.logisticsPaymentOptions(user.id);
      const closedLog = logOptions.find(s => s.id === logistics.id);
      assert(closedLog && 'availableAmount' in closedLog); assert.equal(closedLog.availableAmount, 0);
      console.log('PASS 物流付款草稿、审批、分次付款、额度防重、运费核销撤销及货款隔离');
      complete = true; throw rollback;
    }, { timeout: 120000 });
  } catch (e) { if (e !== rollback) throw e; }
  finally { await prisma.$disconnect(); }
  assert.equal(complete, true);
  console.log('PASS 冒烟完成，全部模拟数据已回滚，未创建真实文件或执行银行转账');
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
