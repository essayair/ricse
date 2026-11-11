/** 本地 HTTP 全链路实测；保留带 E2E 标识的模拟单据，不执行任何银行支付。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:3000/api/v1';
const variant = process.env.TEST_VARIANT || 'A';
assert(['A', 'B'].includes(variant), '测试变体仅允许A或B');
const STATE = variant === 'A' ? '/private/tmp/ricse-bilateral-20261110-state.json' : '/private/tmp/ricse-bilateral-20261110-B-state.json';
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {
  tag: `E2E-BI-20261110-${variant}`, cache: {}, checks: [], failures: [], startedAt: new Date().toISOString(),
};
const tag = state.tag;
const checkpoint = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
let token;
const iso = () => new Date().toISOString();
async function api(path, method = 'GET', body, expected = 200) {
  const response = await fetch(BASE + path, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000),
  });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { throw new Error(`${method} ${path}: 非JSON响应 ${response.status}`); }
  if (expected >= 400) {
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
    return data;
  }
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function upload(path, category, fields = {}) {
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), `${tag}-模拟凭证.png`);
  if (category) form.append('category', category);
  for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
  const response = await fetch(BASE + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(45000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`UPLOAD ${path}: HTTP ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function once(key, action) {
  if (Object.hasOwn(state.cache, key)) return state.cache[key];
  try {
    const result = await action(); state.cache[key] = result ?? true; checkpoint();
    console.log(`PASS ${key}`, result?.id || ''); return result;
  } catch (error) {
    state.failures.push({ key, error: error.message, at: iso() }); checkpoint();
    throw error;
  }
}
const rows = value => Array.isArray(value) ? value : value.items || value.list || [];
async function approveContract(id) {
  for (let i = 0; i < 15; i++) {
    const c = await api(`/contracts/${id}`); if (c.status === 'APPROVED') return c;
    assert.equal(c.status, 'PENDING_APPROVAL');
    await api(`/contracts/${id}/status`, 'PATCH', { status: 'APPROVED', comment: `${tag}管理员模拟审批` });
  }
  throw new Error('合同审批未结束');
}
async function weigh(waybillId, stage, prefix) {
  const ticket = await once(`${prefix}-磅单`, async () => {
    const m = await api(`/weigh-tickets/management-files/${waybillId}`);
    const candidates = m.weighTickets || m.tickets || [];
    return candidates.find(t => t.weighingStage === stage) || api('/weigh-tickets', 'POST', {
      waybillId, direction: prefix.startsWith('采购') ? 'INBOUND' : 'OUTBOUND', weighingStage: stage,
      additionReason: `${tag}模拟双侧磅单`, dataSource: 'MANUAL',
    });
  });
  await once(`${prefix}-重量`, () => api(`/weigh-tickets/${ticket.id}/weights`, 'PATCH', { source: 'DIRECT', grossWeight: 35, tareWeight: 15 }));
  await once(`${prefix}-磅单附件`, () => upload(`/weigh-tickets/${ticket.id}/attachments`));
  await once(`${prefix}-完成称重`, () => api(`/weigh-tickets/${ticket.id}/status`, 'PATCH', { status: 'COMPLETED' }));
  const reviewed = await once(`${prefix}-复核`, () => api(`/weigh-tickets/${ticket.id}/status`, 'PATCH', { status: 'REVIEWED', reviewRemark: `${tag}模拟复核，按实际磅单` }));
  assert.equal(Number(reviewed.netWeight), 20);
  return reviewed;
}
async function quality(waybill, ticket, prefix, stage = 'RECEIVING') {
  const task = await once(`${prefix}-自动质检任务`, async () => {
    const list = rows(await api('/quality-tasks?search=' + encodeURIComponent(waybill.waybillNo)));
    const found = list.find(t => t.waybillId === waybill.id); assert(found, '车辆到达后应自动生成质检任务'); return found;
  });
  const sample = await once(`${prefix}-取样`, () => api(`/quality-tasks/${task.id}/samples`, 'POST', {
    sampledAt: iso(), sampleLabel: `${tag}-${prefix}样品`, samplerName: '模拟质检员',
    plannedReportCount: 1, samplingMethod: '混匀取样', remarks: '全链路模拟数据，不是真实检测',
  }));
  await once(`${prefix}-样品影像`, () => upload(`/quality-tasks/samples/${sample.id}/attachments`, 'SAMPLING_PHOTO'));
  const report = await once(`${prefix}-检测报告`, () => api('/quality-inspections', 'POST', {
    qualityTaskId: task.id, qualitySampleId: sample.id, weighTicketId: ticket.id, sampledAt: iso(), samplerName: '模拟质检员',
    institutionType: 'OUR', institutionName: `${tag}模拟检测室`, reportNo: `${tag}-${prefix}-REPORT`,
    evidenceStage: stage, testedAt: iso(), submit: true,
    indicators: [
      { code: 'CAF2', name: '氟化钙', operator: 'GTE', standardValue: 10, measuredValue: 32.5, unit: '%' },
      { code: 'MOISTURE', name: '水分', operator: 'LTE', standardValue: 5, measuredValue: 5, unit: '%' },
    ], remarks: '仅本地系统联调，不作为真实化验结果',
  }));
  await once(`${prefix}-报告附件`, () => upload(`/quality-inspections/${report.id}/attachments`, 'REPORT'));
  await once(`${prefix}-确认报告`, () => api(`/quality-inspections/${report.id}/status`, 'PATCH', { status: 'CONFIRMED' }));
  await once(`${prefix}-单报告原因校验`, async () => {
    const error = await api(`/quality-tasks/${task.id}/finalize`, 'PATCH', { conclusion: 'PASS', basisInspectionId: report.id }, 400);
    assert.match(error.message, /原因/); return true;
  });
  await once(`${prefix}-最终质检结论`, () => api(`/quality-tasks/${task.id}/finalize`, 'PATCH', {
    conclusion: 'PASS', basisInspectionId: report.id, reason: `${tag}模拟场景约定仅一份有效报告，人工确认采用此报告`,
  }));
  return { task, report };
}
async function approveSettlement(id) {
  for (let i = 0; i < 15; i++) {
    const s = await api(`/financial-settlements/${id}`);
    if (s.status !== 'PENDING_APPROVAL') return s;
    await api(`/financial-settlements/${id}/approve`, 'POST', { comment: `${tag}模拟财务结算审批` });
  }
  throw new Error('结算审批未结束');
}

async function finance(business) {
  const b = business;
  const bankName = '模拟银行（不可用于真实转账）';
  const bank = { ourBankAccount: '000000001101', ourBankAccountName: b.own.name, ourBankName: bankName,
    counterpartyBankAccount: '000000001102', counterpartyBankAccountName: b.supplier.name, counterpartyBankName: bankName };
  const payableDto = { contractId: b.contractId, direction: 'PAYABLE', settlementScope: 'GOODS', taxRatePct: 13,
    lines: [{ orderId: b.purchaseOrderId, waybillLineItemId: b.purchaseWaybillLineId, weighTicketId: b.purchaseTicketId, qualityReportId: b.purchaseReportId, quantity: 19 }], remarks: tag };
  const receivableDto = { contractId: b.contractId, direction: 'RECEIVABLE', settlementScope: 'GOODS', taxRatePct: 13,
    lines: [{ orderId: b.saleOrderId, waybillLineItemId: b.saleWaybillLineId, weighTicketId: b.saleTicketId, qualityReportId: b.saleReportId, quantity: 19 }], remarks: tag };
  await once('采购结算预览计算', async () => { const r = await api('/financial-settlements/preview-goods', 'POST', payableDto); assert.equal(Number(r.totalAmount), 19000); return r; });
  const payable = await once('采购结算单', () => api('/financial-settlements', 'POST', payableDto));
  assert.equal(Number(payable.totalAmount), 19000);
  await once('采购防重复结算', () => api('/financial-settlements', 'POST', payableDto, 400));
  await once('确认采购应付', () => api(`/financial-settlements/${payable.id}/confirm`, 'POST', {}));
  await once('采购结算审批如需', () => approveSettlement(payable.id));
  await once('销售结算预览计算', async () => { const r = await api('/financial-settlements/preview-goods', 'POST', receivableDto); assert.equal(Number(r.totalAmount), 22800); return r; });
  const receivable = await once('销售结算单', () => api('/financial-settlements', 'POST', receivableDto));
  assert.equal(Number(receivable.totalAmount), 22800);
  await once('销售防重复结算', () => api('/financial-settlements', 'POST', receivableDto, 400));
  await once('确认销售应收', () => api(`/financial-settlements/${receivable.id}/confirm`, 'POST', {}));
  await once('销售结算审批如需', () => approveSettlement(receivable.id));
  const request = await once('创建采购付款申请', () => api('/financial-settlements/payment-requests', 'POST', {
    ...bank, contractId: b.contractId, settlementId: payable.id, basisType: 'SETTLEMENT', businessType: 'PURCHASE',
    paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER', amount: 19000, conditionTypes: ['INBOUND', 'QUALITY'],
    purpose: `${tag}采购结算付款`, conditionText: '已收货、合格质检及入库过账，按已确认结算金额申请', clientRequestId: tag + '-payment', remarks: '模拟，不执行银行支付',
  }));
  await once('业务确认付款申请', () => api(`/financial-settlements/payment-requests/${request.id}/business-confirm`, 'POST', {}));
  await once('提交付款审批', () => api(`/financial-settlements/payment-requests/${request.id}/submit`, 'POST', {}));
  await once('付款完整审批链', async () => {
    for (let i = 0; i < 15; i++) {
      const r = await api(`/financial-settlements/payment-requests/${request.id}`); if (r.status === 'APPROVED') return r;
      assert.equal(r.status, 'PENDING_APPROVAL');
      await api(`/financial-settlements/payment-requests/${request.id}/approve`, 'POST', { comment: `${tag}管理员模拟审批` });
    }
    throw new Error('付款审批未结束');
  });
  const execution = { ...bank, amount: 6000, occurredAt: iso(), bankReference: tag + '-PAY-1', actualPayerName: b.own.name,
    actualPayeeName: b.supplier.name, purpose: '模拟采购货款', remarks: '本地模拟凭证，不执行银行支付' };
  await once('付款未上传凭证阻断', async () => { const e = await api(`/financial-settlements/payment-requests/${request.id}/execute`, 'POST', execution, 400); assert.match(e.message, /凭证/); return true; });
  const firstPayment = await once('第一笔模拟付款单6000', () => upload(`/financial-settlements/payment-requests/${request.id}/execute-with-voucher`, undefined, execution));
  await once('财务确认第一笔付款', () => api(`/financial-settlements/funds/${firstPayment.id}/confirm`, 'POST', {}));
  const partial = await once('核销第一笔付款', () => api(`/financial-settlements/${payable.id}/allocate`, 'POST', { fundTransactionId: firstPayment.id, amount: 6000 }));
  assert.equal(partial.status, 'PARTIALLY_SETTLED'); assert.equal(Number(partial.settledAmount), 6000);
  const secondPayment = await once('第二笔模拟付款单13000', () => upload(`/financial-settlements/payment-requests/${request.id}/execute-with-voucher`, undefined,
    { ...execution, amount: 13000, occurredAt: iso(), bankReference: tag + '-PAY-2' }));
  await once('财务确认第二笔付款', () => api(`/financial-settlements/funds/${secondPayment.id}/confirm`, 'POST', {}));
  const paid = await once('核销付款结清应付', () => api(`/financial-settlements/${payable.id}/allocate`, 'POST', { fundTransactionId: secondPayment.id, amount: 13000 }));
  assert.equal(paid.status, 'SETTLED'); assert.equal(Number(paid.settledAmount), 19000);
  const requestAfter = await api(`/financial-settlements/payment-requests/${request.id}`); assert.equal(requestAfter.status, 'PAID');
  await once('已付清禁止重复付款', () => api(`/financial-settlements/payment-requests/${request.id}/execute`, 'POST', { ...execution, amount: 1 }, 400));
  const receipt = await once('登记未认领收款22800', () => api('/financial-settlements/funds', 'POST', {
    legalEntityPartnerId: b.own.id, businessType: 'SALES', paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER',
    amount: 22800, occurredAt: iso(), bankReference: tag + '-RECEIPT', ourBankAccount: bank.ourBankAccount,
    ourBankAccountName: b.own.name, ourBankName: bankName, counterpartyBankAccount: '000000001103',
    counterpartyBankAccountName: b.customer.name, counterpartyBankName: bankName, actualPayerName: b.customer.name, actualPayeeName: b.own.name,
    remarks: `${tag}模拟银行到账，先登记后认领`,
  }));
  assert.equal(receipt.status, 'PENDING_CLAIM');
  await once('收款认领到销售批次', () => api(`/financial-settlements/funds/${receipt.id}/claim`, 'POST', {
    contractId: b.contractId, orderId: b.saleOrderId, paymentStage: 'SETTLEMENT', amount: 22800, remarks: tag,
  }));
  await once('收款无凭证确认阻断', () => api(`/financial-settlements/funds/${receipt.id}/confirm`, 'POST', {}, 400));
  await once('收款回单附件', () => upload(`/financial-settlements/funds/${receipt.id}/attachments`));
  await once('财务确认销售收款', () => api(`/financial-settlements/funds/${receipt.id}/confirm`, 'POST', {}));
  const collected = await once('核销收款结清应收', () => api(`/financial-settlements/${receivable.id}/allocate`, 'POST', { fundTransactionId: receipt.id, amount: 22800 }));
  assert.equal(collected.status, 'SETTLED'); assert.equal(Number(collected.settledAmount), 22800);
  await once('重复收款流水阻断', () => api('/financial-settlements/funds', 'POST', {
    legalEntityPartnerId: b.own.id, businessType: 'SALES', paymentStage: 'SETTLEMENT', paymentMethod: 'BANK_TRANSFER', amount: 22800,
    occurredAt: iso(), bankReference: tag + '-RECEIPT', ourBankAccount: bank.ourBankAccount, actualPayerName: b.customer.name,
  }, 400));
  for (const [key, settlement, amount] of [['进项', payable, 19000], ['销项', receivable, 22800]]) {
    await once(`${key}发票登记与分摊`, () => api(`/financial-settlements/${settlement.id}/invoices`, 'POST', {
      invoiceNo: tag + '-' + key, issuedAt: '2026-11-10', materialName: '模拟萤石矿', quantity: 19,
      taxRate: 13, taxAmount: Math.round((amount - amount / 1.13) * 100) / 100, taxInclusiveAmount: amount,
      remarks: `${tag}仅模拟发票，不是真实发票`,
    }));
  }
  await once('采购结算打印登记', () => api(`/financial-settlements/${payable.id}/print`, 'POST', {}));
  await once('付款申请打印登记', () => api(`/financial-settlements/payment-requests/${request.id}/print`, 'POST', {}));
  await once('销售结算打印登记', () => api(`/financial-settlements/${receivable.id}/print`, 'POST', {}));
  await once('撤销核销并重新核销', async () => {
    const s = await api(`/financial-settlements/${payable.id}`);
    const allocation = s.allocations.find(a => a.fundTransactionId === firstPayment.id && !a.reversedAt); assert(allocation);
    const reversed = await api(`/financial-settlements/allocations/${allocation.id}/reverse`, 'POST', { reason: `${tag}模拟冲回后重核销` });
    assert.equal(reversed.status, 'PARTIALLY_SETTLED'); assert.equal(Number(reversed.settledAmount), 13000);
    const reapplied = await api(`/financial-settlements/${payable.id}/allocate`, 'POST', { fundTransactionId: firstPayment.id, amount: 6000 });
    assert.equal(reapplied.status, 'SETTLED'); return true;
  });
  for (const [key, waybillId, orderId] of [['采购', b.purchaseWaybillId, b.purchaseOrderId], ['销售', b.saleWaybillId, b.saleOrderId]]) {
    const w = await api(`/waybills/${waybillId}`);
    await once(`${key}通知完成`, () => api(`/dispatch-notices/${w.dispatchNoticeId}/status`, 'PATCH', { status: 'COMPLETED' }));
    await once(`${key}批次完成`, async () => {
      const order = await api(`/orders/${orderId}`);
      return order.status === 'COMPLETED' ? order : api(`/orders/${orderId}/status`, 'PATCH', { status: 'COMPLETED' });
    });
  }
  await once('双边合同履约完成', async () => {
    const contract = await api(`/contracts/${b.contractId}`);
    return ['COMPLETED', 'CLOSED'].includes(contract.status) ? contract : api(`/contracts/${b.contractId}/status`, 'PATCH', { status: 'COMPLETED' });
  });
  await once('双边合同关闭', async () => {
    const contract = await api(`/contracts/${b.contractId}`);
    return contract.status === 'CLOSED' ? contract : api(`/contracts/${b.contractId}/status`, 'PATCH', { status: 'CLOSED' });
  });
  const overview = await api(`/inventory/overview?warehouseId=${b.warehouse.id}&ownerPartnerId=${b.own.id}`);
  state.final = { contractId: b.contractId, contractNo: b.contractNo, payableId: payable.id, receivableId: receivable.id,
    paymentRequestId: request.id, paymentIds: [firstPayment.id, secondPayment.id], receiptId: receipt.id, inventory: overview,
    payable: await api(`/financial-settlements/${payable.id}`), receivable: await api(`/financial-settlements/${receivable.id}`),
    contract: await api(`/contracts/${b.contractId}`), completedAt: iso(), steps: Object.keys(state.cache).length };
  checkpoint();
  console.log('PASS FULL_FLOW', JSON.stringify({ tag, contractNo: b.contractNo, payable: state.final.payable.status,
    receivable: state.final.receivable.status, contractStatus: state.final.contract.status, paid: state.final.payable.settledAmount,
    received: state.final.receivable.settledAmount, steps: state.final.steps }));
}

async function main() {
  const database = new URL(process.env.DATABASE_URL || '');
  assert(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) && /dev|test/i.test(database.pathname), '仅允许本地dev/test数据库；请使用 node --env-file=.env 运行');
  const health = await fetch(BASE + '/health').then(r => r.json()); assert.equal(health.status, 'ok');
  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;
  assert(username && password, '请通过 TEST_USERNAME、TEST_PASSWORD 提供本地测试账号，不在脚本中保存登录凭据');
  const login = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const auth = await login.json(); assert(auth.token, '本地管理员登录失败'); token = auth.token;
  const opts = await api('/contracts/form-options');
  const unit = opts.businessUnits.find(u => u.name === '龙游萤石事业部');
  const dept = opts.departments.find(d => d.name === '业务运营部'); assert(unit && dept);
  const material = rows(await api('/master-data/materials?pageSize=100')).find(m => m.code === 'TRD000003' && m.status === 'ACTIVE');
  assert(material && material.pricingQuantityBasis === 'DRY_MATTER');
  const own = await once('模拟我方主体', () => api('/partners', 'POST', { code: variant === 'A' ? 'E61110' : 'E61111', name: `${tag}模拟贸易主体`, isInternal: true, roles: ['SUPPLIER', 'CUSTOMER'], remark: '仅本地全链路测试，非真实企业' }));
  const supplier = await once('模拟供应商', () => api('/partners', 'POST', { name: `${tag}模拟供应商`, roles: ['SUPPLIER'], remark: '仅本地全链路测试' }));
  const customer = await once('模拟客户', () => api('/partners', 'POST', { name: `${tag}模拟客户`, roles: ['CUSTOMER'], remark: '仅本地全链路测试' }));
  for (const [key, partner, no] of [['我方', own, '000000001101'], ['供方', supplier, '000000001102'], ['客户', customer, '000000001103']]) {
    await once(`${key}模拟银行账户`, () => api(`/partners/${partner.id}/bank-accounts`, 'POST', {
      accountName: partner.name, accountNo: no, bankName: '模拟银行（不可用于真实转账）', isDefault: true,
    }));
  }
  const warehouse = await once('独立模拟仓库', () => api('/master-data/warehouses', 'POST', { code: tag, name: `${tag}模拟仓库`, address: '浙江省衢州市龙游县模拟测试地址', remark: '仅本地测试，与已有库存隔离' }));
  const resolved = await api(`/quality-standards/resolve?materialId=${material.id}&scene=PURCHASE`);
  const t = resolved.template;
  const qualityRulesSnapshot = { materialId: material.id, templateId: t.id, templateCode: t.code, templateName: t.name, templateVersion: t.version,
    items: t.items.map(i => ({ indicatorId: i.indicatorId, code: i.indicator.code, name: i.indicator.name, symbol: i.indicator.symbol, unit: i.unit,
      operator: i.operator, standardValue: Number(i.standardValue), upperValue: null, deductionMode: 'NONE', deductionStep: null, deductionAmount: null,
      deductionCondition: 'OUTSIDE_STANDARD', deductionLowerValue: null, deductionUpperValue: null, deductionLimitValue: null, rejectOperator: 'NONE', rejectValue: null })) };
  let contract = await once('创建双边合同', () => api('/contracts', 'POST', {
    clientRequestId: tag, title: `${tag}双边合同采购销售全链路模拟`, type: 'BILATERAL', signingPartnerId: own.id,
    sellerId: supplier.id, buyerId: customer.id, departmentId: dept.id, businessUnitId: unit.id, externalNo: tag,
    pricingType: 'FIXED', totalAmount: 20000, signedAt: '2026-11-10', settlementMethod: '收货质检后按折干重量结算；货款结清后闭环',
    settlementBasis: '各方向分别采用选定的净重及实测水分折干', prepayPct: 0, paymentDays: 0, paymentMethod: 'T/T',
    deliveryMethod: '供方送货入库，后由我方发货至客户', deliveryLocation: warehouse.address,
    overfillPct: 10, shortfallPct: 10, remarks: `${tag}纯模拟，不进行真实收付`,
    lineItems: [{ materialId: material.id, materialName: material.name, quantity: 20, unit: '吨', unitPrice: 1000,
      salesUnitPrice: 1200, taxRatePct: 13, qualityRulesSnapshot }],
  }));
  await once('合同缺附件阻断', async () => { const e = await api(`/contracts/${contract.id}/status`, 'PATCH', { status: 'PENDING_APPROVAL' }, 400); assert.match(e.message, /附件/); return true; });
  await once('合同附件上传', () => upload(`/contracts/${contract.id}/attachments`, 'OTHER'));
  await once('合同提交审批', () => api(`/contracts/${contract.id}/status`, 'PATCH', { status: 'PENDING_APPROVAL' }));
  contract = await once('合同完整审批链', () => approveContract(contract.id));
  const line = contract.lineItems[0]; assert.equal(Number(line.unitPrice), 1000); assert.equal(Number(line.salesUnitPrice), 1200);
  const order = await once('采购执行批次', () => api('/orders', 'POST', { name: `${tag}采购批次`, contractId: contract.id, type: 'PURCHASE', lineItems: [{ contractLineItemId: line.id, quantity: 20 }] }));
  await once('确认采购批次', () => api(`/orders/${order.id}/status`, 'PATCH', { status: 'CONFIRMED' }));
  const notice = await once('采购执行通知', () => api('/dispatch-notices', 'POST', { orderId: order.id, originLocation: '模拟供应商发货地', destinationLocation: warehouse.address,
    destinationSourceType: 'WAREHOUSE', destinationWarehouseId: warehouse.id, warehouseId: warehouse.id,
    mode: 'STANDARD', qualityRequired: true, lineItems: [{ orderLineItemId: order.lineItems[0].id, quantity: 20 }], remarks: tag }));
  await once('下达采购通知', () => api(`/dispatch-notices/${notice.id}/status`, 'PATCH', { status: 'ISSUED' }));
  const purchaseWaybill = await once('采购运单', () => api('/waybills', 'POST', { dispatchNoticeId: notice.id, freightMode: 'SOCIAL', plateNo: '浙H11110', driverName: '模拟采购司机', driverPhone: '19900001101', remarks: tag }));
  await once('采购发运', () => api(`/waybills/${purchaseWaybill.id}/status`, 'PATCH', { status: 'IN_TRANSIT' }));
  await once('采购到达', () => api(`/waybills/${purchaseWaybill.id}/status`, 'PATCH', { status: 'ARRIVED' }));
  const purchaseShipping = await weigh(purchaseWaybill.id, 'SHIPPING', '采购发货');
  const purchaseReceiving = await weigh(purchaseWaybill.id, 'RECEIVING', '采购收货');
  await once('采购库存磅单选用', () => api(`/weigh-tickets/waybills/${purchaseWaybill.id}/selections/INVENTORY`, 'PATCH', { weighTicketId: purchaseReceiving.id, reason: `${tag}采用我方收货实测` }));
  await once('采购结算磅单选用', () => api(`/weigh-tickets/waybills/${purchaseWaybill.id}/selections/SETTLEMENT`, 'PATCH', { weighTicketId: purchaseReceiving.id, reason: `${tag}货款采用我方收货口径` }));
  await once('采购无签收凭证阻断', async () => { const e = await api(`/waybills/${purchaseWaybill.id}/status`, 'PATCH', { status: 'SIGNED' }, 400); assert.match(e.message, /凭证/); return true; });
  await once('采购签收凭证', () => upload(`/waybills/${purchaseWaybill.id}/attachments`, 'RECEIPT_DOCUMENT'));
  await once('采购签收', () => api(`/waybills/${purchaseWaybill.id}/status`, 'PATCH', { status: 'SIGNED' }));
  const purchaseQuality = await quality(purchaseWaybill, purchaseReceiving, '采购');
  const receipt = await once('自动入库管理单', async () => {
    const found = rows(await api('/inbound-receipts?search=' + encodeURIComponent(purchaseWaybill.waybillNo))).find(r => r.waybillId === purchaseWaybill.id);
    assert(found, '采购运单应自动生成入库管理单'); return found;
  });
  await once('补充入库信息', () => api(`/inbound-receipts/${receipt.id}`, 'PATCH', { warehouseId: warehouse.id, receivedAt: iso(), remarks: tag }));
  const received = await once('确认收货折干', () => api(`/inbound-receipts/${receipt.id}/confirm`, 'PATCH', {}));
  assert.equal(Number(received.receivedQuantity), 20); assert.equal(Number(received.pricingQuantity), 19); assert.equal(Number(received.measuredMoisturePct), 5);
  const posted = await once('采购入库过账', () => api(`/inbound-receipts/${receipt.id}/post`, 'POST', {}));
  assert.equal(posted.status, 'POSTED');
  await once('防止重复入库', () => api(`/inbound-receipts/${receipt.id}/post`, 'POST', {}, 400));
  const saleOrder = await once('销售执行批次', () => api('/orders', 'POST', { name: `${tag}销售批次`, contractId: contract.id, type: 'SALES', lineItems: [{ contractLineItemId: line.id, quantity: 20 }] }));
  assert.equal(Number(saleOrder.lineItems[0].unitPrice), 1200);
  await once('确认销售批次', () => api(`/orders/${saleOrder.id}/status`, 'PATCH', { status: 'CONFIRMED' }));
  const saleNotice = await once('销售执行通知', () => api('/dispatch-notices', 'POST', { orderId: saleOrder.id, mode: 'STANDARD', warehouseId: warehouse.id,
    originLocation: warehouse.address, originSourceType: 'WAREHOUSE', originWarehouseId: warehouse.id, destinationLocation: '模拟客户收货地',
    qualityRequired: variant === 'B', lineItems: [{ orderLineItemId: saleOrder.lineItems[0].id, quantity: 20 }], remarks: tag }));
  await once('下达销售通知预占', () => api(`/dispatch-notices/${saleNotice.id}/status`, 'PATCH', { status: 'ISSUED' }));
  const saleWaybill = await once('销售运单', () => api('/waybills', 'POST', { dispatchNoticeId: saleNotice.id, freightMode: 'SOCIAL', plateNo: '浙H11111', driverName: '模拟销售司机', driverPhone: '19900001102', remarks: tag }));
  await once('未出库禁止发运', async () => { const e = await api(`/waybills/${saleWaybill.id}/status`, 'PATCH', { status: 'IN_TRANSIT' }, 400); assert.match(e.message, /出库/); return true; });
  const saleShipping = await weigh(saleWaybill.id, 'SHIPPING', '销售发货');
  await once('销售出库磅单选用', () => api(`/weigh-tickets/waybills/${saleWaybill.id}/selections/INVENTORY`, 'PATCH', { weighTicketId: saleShipping.id, reason: tag }));
  const lot = await once('采购入库批次引用', async () => {
    if (state.business?.lotId) return { id: state.business.lotId };
    const prior = state.cache['销售出库分配']?.allocations?.[0]?.inventoryLotId;
    if (prior) return { id: prior };
    const lots = await api(`/outbound-receipts/eligible-lots?waybillId=${saleWaybill.id}`);
    state.availableLotsShape = lots; checkpoint();
    const found = rows(lots).find(l => l.warehouseId === warehouse.id && Number(l.availableQuantity) === 20);
    assert(found, '应可选择刚才入库的隔离批次'); return found;
  });
  const outbound = await once('销售出库分配', () => api('/outbound-receipts', 'POST', { waybillId: saleWaybill.id, weighTicketId: saleShipping.id, departedAt: iso(), operatorName: '模拟仓管员', allocations: [{ inventoryLotId: lot.id, quantity: 20 }], remarks: tag }));
  await once('缺发货质检提示', async () => { const e = await api(`/outbound-receipts/${outbound.id}/post`, 'POST', {}, 400); assert.match(e.message, /质量|检测报告|质检/); return true; });
  await once('人工质量例外出库', () => api(`/outbound-receipts/${outbound.id}/post`, 'POST', { qualityExceptionReason: `${tag}模拟：本次按来源入库合格报告放行，客户收货后再进行独立检测` }));
  await once('防止重复出库', () => api(`/outbound-receipts/${outbound.id}/post`, 'POST', {}, 400));
  let saleCurrent = await api(`/waybills/${saleWaybill.id}`);
  if (saleCurrent.status === 'PENDING') await once('销售发运', () => api(`/waybills/${saleWaybill.id}/status`, 'PATCH', { status: 'IN_TRANSIT' }));
  await once('销售送达', () => api(`/waybills/${saleWaybill.id}/status`, 'PATCH', { status: 'ARRIVED' }));
  const saleReceiving = await weigh(saleWaybill.id, 'RECEIVING', '销售客户收货');
  await once('销售客户签收凭证', () => upload(`/waybills/${saleWaybill.id}/attachments`, 'RECEIPT_DOCUMENT'));
  await once('销售客户签收', () => api(`/waybills/${saleWaybill.id}/status`, 'PATCH', { status: 'SIGNED' }));
  const saleQuality = await quality(saleWaybill, saleReceiving, '销售客户');
  await once('确认销售完成', () => api(`/waybills/${saleWaybill.id}/sales-completion`, 'POST', { customerWeighTicketId: saleReceiving.id, qualityReportId: saleQuality.report.id, remarks: `${tag}已核对客户磅单和质检，确认销售交付` }));
  state.business = { contractId: contract.id, contractNo: contract.contractNo, own, supplier, customer, warehouse, materialId: material.id,
    purchaseOrderId: order.id, saleOrderId: saleOrder.id, purchaseWaybillId: purchaseWaybill.id, saleWaybillId: saleWaybill.id,
    purchaseTicketId: purchaseReceiving.id, saleTicketId: saleReceiving.id, purchaseReportId: purchaseQuality.report.id, saleReportId: saleQuality.report.id,
    purchaseWaybillLineId: purchaseWaybill.lineItems[0].id, saleWaybillLineId: saleWaybill.lineItems[0].id, lotId: lot.id };
  checkpoint();
  console.log('PASS 业务流程完成，开始资金结算阶段');
  await finance(state.business);
}

main().catch(error => { console.error('FAIL', error.stack || error.message); process.exitCode = 1; });
