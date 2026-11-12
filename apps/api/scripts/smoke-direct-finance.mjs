/** 本地直拨资金闭环验收；只用指定E2E结果生成的模拟合同，不执行银行支付。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
const url = new URL(process.env.DATABASE_URL || '');
assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/ricse_dev', '仅本地ricse_dev');
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
assert(input.tag?.startsWith('E2E-ZB-') && input.results.every(r => r.result === 'PASS'), '仅接续成功的自建E2E流程');
const db = new PrismaClient(); const base = 'http://127.0.0.1:3000/api/v1';
const out = process.argv[3] || '/private/tmp/ricse-direct-finance-result.json';
const result = { tag: input.tag, checks: [], ids: {} }; let token;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
const iso = () => new Date().toISOString();
const save = () => fs.writeFileSync(out, JSON.stringify(result, null, 2), { mode: 0o600 });
async function api(path, method = 'GET', data, expected) {
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const text = await r.text(), body = text ? JSON.parse(text) : null;
  if (expected) assert.equal(r.status, expected, JSON.stringify(body)); else assert(r.ok, `${path} ${r.status} ${JSON.stringify(body)}`);
  return body;
}
async function upload(path, fields = {}) {
  const body = new FormData(); body.append('file', new Blob([png], { type: 'image/png' }), `${input.tag}-模拟回单.png`);
  for (const [key, value] of Object.entries(fields)) body.append(key, String(value));
  const r = await fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  const data = await r.json(); assert(r.ok, `${path} ${r.status} ${JSON.stringify(data)}`); return data;
}
async function step(name, run) { const value = await run(); result.checks.push(name); save(); console.log('PASS', name); return value; }
async function main() {
  const admin = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', status: 'ACTIVE' } });
  token = new JwtService().sign({ sub: admin.id, username: admin.username, role: admin.role, tokenVersion: admin.tokenVersion }, { secret: process.env.JWT_SECRET, expiresIn: '30m' });
  const contract = await db.contract.findFirstOrThrow({ where: { contractNo: input.ctx.contractNo || undefined, title: { startsWith: input.tag } }, include: { seller: true, buyer: true, signingPartner: true } });
  result.ids.contractId = contract.id;
  if (process.env.FINISH_ONLY === '1') { Object.assign(result, JSON.parse(fs.readFileSync(out, 'utf8'))); delete result.error; assert.equal(result.tag, input.tag); }
  else {
  const sources = direction => api(`/financial-settlements/options/goods-sources?contractId=${contract.id}&direction=${direction}`);
  const rows = await sources('RECEIVABLE'); assert.equal(rows.length, 2);
  const line = s => ({ orderId: s.orderId, waybillLineItemId: s.id, weighTicketId: s.weighTicketId, qualityReportId: s.reportId, remarks: '模拟双方确认采用该侧依据，不调整数量或价格' });
  const saleLines = rows.map(line);
  const change = rows[0].availableWeighTickets.find(t => t.isSelectable && t.id !== rows[0].weighTicketId);
  assert(change); saleLines[0].weighTicketId = change.id;
  const otherReport = rows[0].availableQualityReports.find(r => r.id !== rows[0].reportId); assert(otherReport); saleLines[0].qualityReportId = otherReport.id;
  const sale = await step('销售换侧磅单与报告创建结算', () => api('/financial-settlements', 'POST', { contractId: contract.id, direction: 'RECEIVABLE', settlementScope: 'GOODS', lines: saleLines }));
  await step('直拨仅换侧确认直接形成应收，不新增审批', async () => { const s = await api(`/financial-settlements/${sale.id}/confirm`, 'POST', {}); assert.equal(s.status, 'CONFIRMED'); });
  result.ids.saleId = sale.id;
  const payRows = await sources('PAYABLE'); assert(payRows.every(r => r.available));
  const pay = await step('采购按销售选用依据和数量创建结算', () => api('/financial-settlements', 'POST', { contractId: contract.id, direction: 'PAYABLE', settlementScope: 'GOODS', lines: payRows.map(line) }));
  await step('采购跟随确认无额外侧别审批，两向数量一致', async () => { const p = await api(`/financial-settlements/${pay.id}/confirm`, 'POST', {}); assert.equal(p.status, 'CONFIRMED'); assert.equal(Number(pay.quantity), Number(sale.quantity)); });
  result.ids.payId = pay.id;
  const own = contract.signingPartner, supplier = contract.seller, customer = contract.buyer;
  const bankName = '模拟银行（不可真实转账）';
  const bank = { ourBankAccount: '000000001101', ourBankAccountName: own.name, ourBankName: bankName, counterpartyBankAccount: '000000001102', counterpartyBankAccountName: supplier.name, counterpartyBankName: bankName };
  for (const [p, accountNo] of [[own, bank.ourBankAccount], [supplier, bank.counterpartyBankAccount], [customer, '000000001103']]) await api(`/partners/${p.id}/bank-accounts`, 'POST', { accountNo, accountName: p.name, bankName, isDefault: true });
  const payAmount = Number(pay.totalAmount), saleAmount = Number(sale.totalAmount);
  const request = await step('根据直拨采购结算创建付款申请', () => api('/financial-settlements/payment-requests', 'POST', { ...bank, contractId: contract.id, settlementId: pay.id, basisType: 'SETTLEMENT', businessType: 'PURCHASE', paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER', amount: payAmount, conditionTypes: ['QUALITY'], purpose: `${input.tag}模拟货款`, conditionText: '直拨交付及结算完成，仅模拟', clientRequestId: randomUUID() }));
  result.ids.requestId = request.id;
  await step('业务确认并提交付款审批', async () => { await api(`/financial-settlements/payment-requests/${request.id}/business-confirm`, 'POST', {}); await api(`/financial-settlements/payment-requests/${request.id}/submit`, 'POST', {}); });
  await step('付款申请完整审批链', async () => { for (let i = 0; i < 20; i++) { const r = await api(`/financial-settlements/payment-requests/${request.id}`); if (r.status === 'APPROVED') return; await api(`/financial-settlements/payment-requests/${request.id}/approve`, 'POST', { comment: '本地模拟审批，不执行银行支付' }); } throw Error('审批未完成'); });
  const execution = { ...bank, occurredAt: iso(), actualPayerName: own.name, actualPayeeName: supplier.name, purpose: '模拟采购付款' };
  await step('无回单拒绝创建付款单', () => api(`/financial-settlements/payment-requests/${request.id}/execute`, 'POST', { ...execution, amount: payAmount }, 400));
  const first = Math.floor(payAmount * 40) / 100, amounts = [first, Math.round((payAmount - first) * 100) / 100];
  const payments = [];
  for (let i = 0; i < amounts.length; i++) await step(`第${i + 1}笔付款凭证录入、确认及核销`, async () => {
    const fund = await upload(`/financial-settlements/payment-requests/${request.id}/execute-with-voucher`, { ...execution, amount: amounts[i], bankReference: `${input.tag}-FINAL-PAY-${i}` }); payments.push(fund.id);
    await api(`/financial-settlements/funds/${fund.id}/confirm`, 'POST', {});
    const s = await api(`/financial-settlements/${pay.id}/allocate`, 'POST', { fundTransactionId: fund.id, amount: amounts[i] }); assert.equal(s.status, i ? 'SETTLED' : 'PARTIALLY_SETTLED');
  });
  result.ids.payments = payments;
  await step('付款申请已付清，禁止重复付款', async () => { assert.equal((await api(`/financial-settlements/payment-requests/${request.id}`)).status, 'PAID'); await api(`/financial-settlements/payment-requests/${request.id}/execute`, 'POST', { ...execution, amount: 1 }, 400); });
  const receiptBody = { legalEntityPartnerId: own.id, businessType: 'SALES', paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER', amount: saleAmount, occurredAt: iso(), bankReference: `${input.tag}-FINAL-RECEIPT`, ourBankAccount: bank.ourBankAccount, ourBankAccountName: own.name, ourBankName: bankName, counterpartyBankAccount: '000000001103', counterpartyBankAccountName: customer.name, counterpartyBankName: bankName, actualPayerName: customer.name, actualPayeeName: own.name };
  const receipt = await step('独立登记收款，等待认领', async () => { const r = await api('/financial-settlements/funds', 'POST', receiptBody); assert.equal(r.status, 'PENDING_CLAIM'); return r; }); result.ids.receiptId = receipt.id;
  await step('收款认领到销售批次并确认核销应收', async () => { await api(`/financial-settlements/funds/${receipt.id}/claim`, 'POST', { contractId: contract.id, orderId: rows[0].orderId, paymentStage: 'SETTLEMENT', amount: saleAmount }); await api(`/financial-settlements/funds/${receipt.id}/confirm`, 'POST', {}, 400); await upload(`/financial-settlements/funds/${receipt.id}/attachments`); await api(`/financial-settlements/funds/${receipt.id}/confirm`, 'POST', {}); const s = await api(`/financial-settlements/${sale.id}/allocate`, 'POST', { fundTransactionId: receipt.id, amount: saleAmount }); assert.equal(s.status, 'SETTLED'); });
  await step('重复到账流水被拦截', () => api('/financial-settlements/funds', 'POST', receiptBody, 400));
  for (const [kind, s, amount] of [['进项', pay, payAmount], ['销项', sale, saleAmount]]) await step(`${kind}发票登记分摊与打印登记`, async () => { await api(`/financial-settlements/${s.id}/invoices`, 'POST', { invoiceNo: `${input.tag}-FINAL-${kind}`, issuedAt: iso(), materialName: rows[0].materialName, quantity: Number(s.quantity), taxRate: 13, taxAmount: Math.round((amount - amount / 1.13) * 100) / 100, taxInclusiveAmount: amount, remarks: '模拟发票' }); await api(`/financial-settlements/${s.id}/print`, 'POST', {}); });
  await step('付款申请打印登记', () => api(`/financial-settlements/payment-requests/${request.id}/print`, 'POST', {}));
  await step('核销冲回再核销，余额重新闭环', async () => { const s = await api(`/financial-settlements/${pay.id}`); const a = s.allocations.find(a => a.fundTransactionId === payments[0] && !a.reversedAt); assert(a); const reversed = await api(`/financial-settlements/allocations/${a.id}/reverse`, 'POST', { reason: '本地模拟反向与重核销' }); assert.equal(reversed.status, 'PARTIALLY_SETTLED'); const done = await api(`/financial-settlements/${pay.id}/allocate`, 'POST', { fundTransactionId: payments[0], amount: amounts[0] }); assert.equal(done.status, 'SETTLED'); });
  result.amounts = { payable: payAmount, receivable: saleAmount, quantity: Number(sale.quantity) };
  result.status = { payable: (await api(`/financial-settlements/${pay.id}`)).status, receivable: (await api(`/financial-settlements/${sale.id}`)).status };
  }
  await step('下游资金发票存在时禁止直接撤销交付', async () => { const w = await db.directDelivery.findFirstOrThrow({ where: { waybill: { dispatchNotice: { directSalesExecution: { is: { contractId: contract.id } } } }, status: 'CONFIRMED' } }); await api(`/bilateral-direct/waybills/${w.waybillId}/reverse`, 'POST', { reason: '模拟非法撤销' }, 400); });
  const payDone = await api(`/financial-settlements/${result.ids.payId}`), saleDone = await api(`/financial-settlements/${result.ids.saleId}`);
  result.amounts = { payable: Number(payDone.totalAmount), receivable: Number(saleDone.totalAmount), quantity: Number(saleDone.quantity) }; result.status = { payable: payDone.status, receivable: saleDone.status };
  if (process.env.TEST_CREATE_UI === '1') {
  const company = await db.company.findFirstOrThrow({ where: { type: 'INTERNAL', status: 'ACTIVE' } }); const department = await db.department.findFirstOrThrow({ where: { companyId: company.id } });
  const employee = await db.employee.create({ data: { name: `${input.tag}页面验收`, companyId: company.id, departmentId: department.id } });
  const adminRole = await db.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  const password = randomUUID() + 'Aa1!'; const ui = await db.user.create({ data: { username: `${input.tag}-ui`, name: employee.name, password: await bcrypt.hash(password, 12), role: 'ADMIN', companyId: company.id, employeeId: employee.id, roleAssignments: { create: { roleId: adminRole.id, scopeType: 'ALL' } } } });
  // 仅本地临时验收账户；文件0600，不打印密码/令牌。验收后应停用该账户。
  result.ui = { id: ui.id, username: ui.username, password }; save();
  }
  save();
  console.log(JSON.stringify({ result: 'PASS', checks: result.checks.length, amounts: result.amounts, status: result.status, output: out }));
}
main().catch(e => { result.error = e.message; save(); console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
