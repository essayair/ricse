/** 双边直拨全流程本地 HTTP 实测：合同 → 配对直拨 → 共享运单 → 双侧磅单 → 质检 → 直拨交付（销售出库）→ 销售出库核查。
 *  仅本地 dev 库；不执行任何付款；数据以 TAG 标记保留。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';

const BASE = 'http://127.0.0.1:3000/api/v1';
const OUT = process.argv[2] || `/private/tmp/ricse-direct-http-${Date.now()}.json`;
const stamp = new Date().toISOString().replace(/\D/g, '').slice(4, 14);
const TAG = `E2E-ZB-${stamp}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
const results = []; const observations = []; const ctx = {};
let token; let THIRD_PARTY_ID;
const iso = () => new Date().toISOString();
const rows = v => Array.isArray(v) ? v : v?.items || v?.list || v?.data || [];
const save = () => fs.writeFileSync(OUT, JSON.stringify({ tag: TAG, results, observations, ctx }, null, 2));

async function call(path, method = 'GET', body) {
  const r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000) });
  const text = await r.text(); let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, ok: r.ok, data };
}
async function api(path, method, body) {
  const r = await call(path, method, body);
  if (!r.ok) throw new Error(`${method || 'GET'} ${path} → HTTP ${r.status} ${JSON.stringify(r.data?.message ?? r.data)}`);
  return r.data;
}
async function expectFail(path, method, body, pattern) {
  const r = await call(path, method, body);
  assert(!r.ok, `${path} 应被拦截，实际 HTTP ${r.status}`);
  const msg = Array.isArray(r.data?.message) ? r.data.message.join('；') : String(r.data?.message ?? JSON.stringify(r.data));
  if (pattern) assert.match(msg, pattern, `拦截原因不符：${msg}`);
  return `HTTP ${r.status}：${msg}`;
}
async function upload(path, category, name = '模拟凭证') {
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), `${TAG}-${name}.png`);
  if (category) form.append('category', category);
  const r = await fetch(BASE + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(45000) });
  const d = await r.json(); if (!r.ok) throw new Error(`UPLOAD ${path} → ${r.status} ${JSON.stringify(d.message ?? d)}`); return d;
}
async function step(id, title, fn) {
  const t0 = Date.now();
  try { const v = await fn(); results.push({ id, title, result: 'PASS', detail: typeof v === 'string' ? v : '', ms: Date.now() - t0 }); console.log('PASS', id, title, typeof v === 'string' ? v : ''); save(); return v; }
  catch (e) { results.push({ id, title, result: 'FAIL', detail: e.message, ms: Date.now() - t0 }); console.log('FAIL', id, title, e.message); save(); return undefined; }
}
const observe = (id, title, detail) => { observations.push({ id, title, detail }); console.log('OBS ', id, title, JSON.stringify(detail)); save(); };

const bands = (delta = 0) => [[10, 15, 14.8], [15, 20, 18.5], [20, 25, 20.5], [25, 30, 22], [30, 35, 22.7], [35, 40, 23.2], [40, 45, 23.5], [45, 50, 23.8]]
  .map(([lower, upper, rate]) => ({ lower, upper, rates: { FRAGMENT: +(rate + delta).toFixed(4), RUN_OF_MINE: +(rate + delta).toFixed(4) } }));
const grade = delta => ({ version: 1, method: 'CAF2_GRADE_TIER', quantityBasis: 'DRY_MATTER', gradeUnit: 'PERCENT_POINTS', rateUnit: 'CNY_PER_DEGREE_EX_TAX',
  moistureMaxPct: 8, bands: bands(delta), exceptionHandling: 'MANUAL_REVIEW', selectedSpec: 'RUN_OF_MINE', formulaConfirmed: true, recoveryAdjustment: null });

async function fillTicket(ticketId, gross, tare, remark) {
  await api(`/weigh-tickets/${ticketId}/weights`, 'PATCH', { source: 'DIRECT', grossWeight: gross, tareWeight: tare });
  await upload(`/weigh-tickets/${ticketId}/attachments`, undefined, '磅单');
  await api(`/weigh-tickets/${ticketId}/status`, 'PATCH', { status: 'COMPLETED' });
  return api(`/weigh-tickets/${ticketId}/status`, 'PATCH', { status: 'REVIEWED', reviewRemark: remark });
}
async function ticketsOf(waybillId) {
  const m = await api(`/weigh-tickets/management-files/${waybillId}`);
  return (m.weighTickets || m.tickets || []).filter(t => !t.deletedAt && t.status !== 'VOIDED');
}
async function report(taskId, sampleId, ticketId, stage, institutionType, caf2, moisture, no) {
  const r = await api('/quality-inspections', 'POST', {
    qualityTaskId: taskId, qualitySampleId: sampleId, weighTicketId: ticketId, sampledAt: iso(), samplerName: '模拟取样员',
    institutionType, ...(institutionType === 'THIRD_PARTY' ? { institutionPartnerId: THIRD_PARTY_ID } : { institutionName: `${TAG}-${stage === 'SHIPPING' ? '供应商化验室' : '客户化验室'}` }),
    reportNo: `${TAG}-${no}`, evidenceStage: stage, testedAt: iso(), submit: true,
    indicators: [
      { code: 'CAF2', name: '氟化钙', operator: 'GTE', standardValue: 10, measuredValue: caf2, unit: '%' },
      { code: 'MOISTURE', name: '水分', operator: 'LTE', standardValue: 8, measuredValue: moisture, unit: '%' },
    ], remarks: '本地模拟数据，非真实检测',
  });
  await upload(`/quality-inspections/${r.id}/attachments`, 'REPORT', '检测报告');
  await api(`/quality-inspections/${r.id}/status`, 'PATCH', { status: 'CONFIRMED' });
  return r;
}
async function sample(taskId, label) {
  const s = await api(`/quality-tasks/${taskId}/samples`, 'POST', { sampledAt: iso(), sampleLabel: `${TAG}-${label}`, samplerName: '模拟取样员', plannedReportCount: 1, samplingMethod: '混匀取样', remarks: '模拟' });
  await upload(`/quality-tasks/samples/${s.id}/attachments`, 'SAMPLING_PHOTO', '取样照片');
  return s;
}
async function findTask(waybill) {
  const list = rows(await api('/quality-tasks?search=' + encodeURIComponent(waybill.waybillNo)));
  return list.find(t => t.waybillId === waybill.id);
}

/** 一车直拨：建运单 → 发货磅单 → 发运 → 到达 → 收货磅单 → 签收 → 质检。返回运单与依据 */
async function truck(n, salesNoticeId, plate, shipping, receiving, reports) {
  const P = `T${n}`;
  const w = await step(`${P}-01`, `第${n}车：从销售直拨通知创建共享运单（运输方式：供应商承运）`, async () => {
    const notice = await api(`/dispatch-notices/${salesNoticeId}`);
    const w = await api('/waybills', 'POST', { dispatchNoticeId: salesNoticeId, freightMode: 'SUPPLIER', plateNo: plate, driverName: `模拟司机${n}`, driverPhone: `1990000${String(1100 + n)}`, lineItems: [{ dispatchNoticeLineItemId: notice.lineItems[0].id, quantity: 20 }], remarks: TAG });
    ctx[`waybill${n}`] = { id: w.id, waybillNo: w.waybillNo }; return w;
  });
  if (!w) return {};
  await step(`${P}-02`, `第${n}车：运单创建后自动生成的磅单`, async () => {
    const t = await ticketsOf(w.id);
    observe(`${P}-02`, '运单创建后自动磅单', t.map(x => ({ ticketNo: x.ticketNo, stage: x.weighingStage, direction: x.direction, status: x.status, shipper: x.shipperName, receiver: x.receiverName, remarks: x.remarks })));
    return `自动磅单 ${t.length} 张：${t.map(x => `${x.weighingStage}/${x.direction}`).join('，')}`;
  });
  let shipTicket = await step(`${P}-03`, `第${n}车：登记供应商发货磅单 毛${shipping[0]}/皮${shipping[1]}`, async () => {
    const t = (await ticketsOf(w.id)).find(x => x.weighingStage === 'SHIPPING') || await api('/weigh-tickets', 'POST', { waybillId: w.id, direction: 'OUTBOUND', weighingStage: 'SHIPPING', dataSource: 'MANUAL', additionReason: `${TAG}供应商发货磅单` });
    const r = await fillTicket(t.id, shipping[0], shipping[1], `${TAG}供应商发货磅单（照片录入）`);
    assert.equal(Number(r.netWeight), +(shipping[0] - shipping[1]).toFixed(3)); return r;
  });
  await step(`${P}-04`, `第${n}车：确认发运（直拨无需我方出库扣库存）`, async () => { const r = await api(`/waybills/${w.id}/status`, 'PATCH', { status: 'IN_TRANSIT' }); assert.equal(r.status, 'IN_TRANSIT'); return r.status; });
  await step(`${P}-05`, `第${n}车：确认送达`, async () => { const r = await api(`/waybills/${w.id}/status`, 'PATCH', { status: 'ARRIVED' }); return r.status; });
  observe(`${P}-05b`, '送达后自动磅单', (await ticketsOf(w.id)).map(x => ({ ticketNo: x.ticketNo, stage: x.weighingStage, direction: x.direction, shipper: x.shipperName, receiver: x.receiverName, remarks: x.remarks })));
  const task = await step(`${P}-06`, `第${n}车：送达后自动生成收货质检任务`, async () => { const t = await findTask(w); assert(t, '直拨送达后应自动生成质检任务'); return t; });
  let recvTicket = await step(`${P}-07`, `第${n}车：登记客户收货磅单 毛${receiving[0]}/皮${receiving[1]}`, async () => {
    const t = (await ticketsOf(w.id)).find(x => x.weighingStage === 'RECEIVING') || await api('/weigh-tickets', 'POST', { waybillId: w.id, direction: 'OUTBOUND', weighingStage: 'RECEIVING', dataSource: 'MANUAL', additionReason: `${TAG}客户收货磅单` });
    const r = await fillTicket(t.id, receiving[0], receiving[1], `${TAG}客户收货磅单（照片录入）`);
    assert.equal(Number(r.netWeight), +(receiving[0] - receiving[1]).toFixed(3)); return r;
  });
  await step(`${P}-08`, `第${n}车：无签收凭证时禁止签收`, () => expectFail(`/waybills/${w.id}/status`, 'PATCH', { status: 'SIGNED' }, /凭证/));
  await step(`${P}-09`, `第${n}车：上传签收凭证并确认客户签收`, async () => { await upload(`/waybills/${w.id}/attachments`, 'RECEIPT_DOCUMENT', '签收单'); const r = await api(`/waybills/${w.id}/status`, 'PATCH', { status: 'SIGNED' }); assert.equal(r.status, 'SIGNED'); return r.status; });
  const reps = {};
  if (task) {
    for (const [key, stage, inst, caf2, moist, ticket] of reports(shipTicket, recvTicket)) {
      reps[key] = await step(`${P}-10${key}`, `第${n}车：${stage === 'SHIPPING' ? '发货侧' : '收货侧'}检测报告（${inst}）CaF₂ ${caf2}% 水分 ${moist}%`, async () => {
        const s = await sample(task.id, `${P}-${key}`); return report(task.id, s.id, ticket?.id, stage, inst, caf2, moist, `${P}-${key}`);
      });
    }
  }
  return { w, task, shipTicket, recvTicket, reps };
}

async function main() {
  const db = new URL(process.env.DATABASE_URL || ''); assert(['localhost', '127.0.0.1'].includes(db.hostname) && /dev|test/.test(db.pathname), '仅允许本地 dev 库');
  if (process.env.TEST_USERNAME && process.env.TEST_PASSWORD) {
    const login = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: process.env.TEST_USERNAME, password: process.env.TEST_PASSWORD }) }).then(r => r.json());
    assert(login.token, '登录失败'); token = login.token;
  } else {
    assert(process.env.JWT_SECRET, '本机未配置 JWT_SECRET');
    const prisma = new PrismaClient();
    try {
      const user = await prisma.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' } });
      assert(user, '本地缺少有效管理员，不自动创建或修改既有账号');
      token = new JwtService().sign({ sub: user.id, username: user.username, role: user.role, tokenVersion: user.tokenVersion }, { secret: process.env.JWT_SECRET, expiresIn: '10m' });
    } finally { await prisma.$disconnect(); }
  }
  console.log('TAG', TAG);

  // ---------- 一、主数据 ----------
  const opts = await api('/contracts/form-options');
  const unit = opts.businessUnits.find(u => u.name === '龙游萤石事业部'); const dept = opts.departments.find(d => d.name === '业务运营部');
  const material = rows(await api('/master-data/materials?pageSize=100')).find(m => m.code === (process.env.TEST_MATERIAL_CODE || 'TRD000003') && m.status === 'ACTIVE');
  assert(unit && dept && material, '缺少本地龙游事业部、业务运营部或测试物料（TEST_MATERIAL_CODE 默认 TRD000003）');
  const institutions = rows(await api('/service-organizations?type=QUALITY_INSTITUTION&status=ACTIVE'));
  assert(institutions.length, '本地缺少可用第三方质检机构'); THIRD_PARTY_ID = institutions[0].partnerId;
  const own = await step('M-01', '新建模拟我方签约主体', () => api('/partners', 'POST', { code: `Z${stamp.slice(-5)}`, name: `${TAG}模拟贸易主体`, isInternal: true, roles: ['SUPPLIER', 'CUSTOMER'], remark: '本地测试' }));
  const supplier = await step('M-02', '新建模拟上游供应商', () => api('/partners', 'POST', { name: `${TAG}模拟矿山供应商`, roles: ['SUPPLIER'], remark: '本地测试' }));
  const customer = await step('M-03', '新建模拟下游客户', () => api('/partners', 'POST', { name: `${TAG}模拟氟化工客户`, roles: ['CUSTOMER'], remark: '本地测试' }));
  ctx.customerId = customer?.id; ctx.partners = { own: own?.name, supplier: supplier?.name, customer: customer?.name };

  // ---------- 二、合同 ----------
  const resolved = await api(`/quality-standards/resolve?materialId=${material.id}&scene=PURCHASE`); const t = resolved.template;
  const qualityRulesSnapshot = { materialId: material.id, templateId: t.id, templateCode: t.code, templateName: t.name, templateVersion: t.version,
    items: t.items.map(i => ({ indicatorId: i.indicatorId, code: i.indicator.code, name: i.indicator.name, symbol: i.indicator.symbol, unit: i.unit, operator: i.operator, standardValue: Number(i.standardValue), upperValue: null,
      deductionMode: 'NONE', deductionStep: null, deductionAmount: null, deductionCondition: 'OUTSIDE_STANDARD', deductionLowerValue: null, deductionUpperValue: null, deductionLimitValue: null, rejectOperator: 'NONE', rejectValue: null })) };
  const contractBody = { clientRequestId: TAG, title: `${TAG}双边直拨全流程模拟`, type: 'BILATERAL', signingPartnerId: own.id, sellerId: supplier.id, buyerId: customer.id,
    departmentId: dept.id, businessUnitId: unit.id, externalNo: `${TAG}-CG`, salesExternalNo: `${TAG}-XS`, signedAt: '2026-11-10', salesSignedAt: '2026-11-11', salesPaymentMethod: '货到验收后 T/T',
    pricingType: 'GRADE_TIER', totalAmount: 50000, settlementMethod: '逐车结算', settlementBasis: '各方向分别选择磅单与检测报告', prepayPct: 0, paymentDays: 0, paymentMethod: 'T/T',
    deliveryMethod: '供应商直送客户（直拨）', deliveryLocation: '模拟客户厂区', overfillPct: 10, shortfallPct: 10, remarks: `${TAG}纯模拟`,
    lineItems: [{ materialId: material.id, materialName: material.name, quantity: 60, unit: '吨', unitPrice: 834, salesUnitPrice: 870, taxRatePct: 13,
      priceRulesSnapshot: grade(0), salesPriceRulesSnapshot: grade(1), qualityRulesSnapshot }] };
  let contract = await step('C-01', '创建双边合同（品位分档计价，两向合同号/签订日期/收款约定）', async () => { const c = await api('/contracts', 'POST', contractBody); ctx.contract = { id: c.id, contractNo: c.contractNo }; return c; });
  if (!contract) return;
  await step('C-02', '仅上传采购合同附件时禁止提交（缺销售合同）', async () => { await upload(`/contracts/${contract.id}/attachments`, 'PURCHASE_CONTRACT', '采购合同'); return expectFail(`/contracts/${contract.id}/status`, 'PATCH', { status: 'PENDING_APPROVAL' }, /销售合同/); });
  await step('C-03', '上传销售合同附件后提交审批', async () => { await upload(`/contracts/${contract.id}/attachments`, 'SALES_CONTRACT', '销售合同'); const r = await api(`/contracts/${contract.id}/status`, 'PATCH', { status: 'PENDING_APPROVAL' }); return r.status; });
  contract = await step('C-04', '完成合同审批链（管理员模拟各节点）', async () => {
    for (let i = 0; i < 15; i++) { const c = await api(`/contracts/${contract.id}`); if (c.status === 'APPROVED') return c; await api(`/contracts/${contract.id}/status`, 'PATCH', { status: 'APPROVED', comment: `${TAG}模拟审批` }); }
    throw new Error('审批未结束');
  }) || contract;
  const line = contract.lineItems[0];

  // ---------- 三、配对直拨执行 ----------
  await step('E-01', '单独建立“直拨”执行通知被拦截（须从双边合同配对创建）', async () => {
    const o = await api('/orders', 'POST', { name: `${TAG}拦截测试批次`, contractId: contract.id, type: 'SALES', lineItems: [{ contractLineItemId: line.id, quantity: 1 }] });
    await api(`/orders/${o.id}/status`, 'PATCH', { status: 'CONFIRMED' }); ctx.blockOrder = o.id;
    return expectFail('/dispatch-notices', 'POST', { orderId: o.id, mode: 'DIRECT', originLocation: 'a', destinationLocation: 'b', lineItems: [{ orderLineItemId: o.lineItems[0].id, quantity: 1 }] }, /配对/);
  });
  if (ctx.blockOrder) await call(`/orders/${ctx.blockOrder}/status`, 'PATCH', { status: 'CANCELLED' });
  await step('E-02', '查询直拨执行选项（两向剩余量、地址、仓库）', async () => {
    const o = await api(`/bilateral-direct/contracts/${contract.id}/execution-options`); observe('E-02', '执行选项-未分配数量', o.unallocated); return JSON.stringify(o.unallocated);
  });
  const execBody = { contractId: contract.id, contractLineItemId: line.id, requestId: `${TAG}-EXEC1`, quantity: 40, name: `${TAG}第一批直拨`, plannedDate: '2026-11-12',
    originLocation: '浙江省衢州市龙游县模拟矿山堆场', destinationLocation: '浙江省衢州市模拟氟化工厂原料库', originSourceType: 'MANUAL', destinationSourceType: 'MANUAL',
    originContactPerson: '供应商现场', originContactPhone: '19900002001', destinationContactPerson: '客户收料员', destinationContactPhone: '19900002002', remarks: TAG };
  await step('E-03', '新建直拨执行：40吨，一次生成采购/销售批次与配对通知', async () => {
    const e = await api('/bilateral-direct/executions', 'POST', execBody);
    const _x = { id: e.id, purchaseNoticeId: e.purchaseNoticeId, salesNoticeId: e.salesNoticeId, purchaseNoticeNo: e.purchaseNotice?.noticeNo, salesNoticeNo: e.salesNotice?.noticeNo }; ctx.execution = _x;
    assert.equal(e.purchaseNotice.status, 'ISSUED'); assert.equal(e.salesNotice.status, 'ISSUED'); assert.equal(e.salesNotice.mode, 'DIRECT');
    ctx.execObj = e; return `采购指令 ${e.purchaseNotice.noticeNo} / 销售通知 ${e.salesNotice.noticeNo}`;
  });
  const exec = ctx.execObj; if (!exec) return;
  await step('E-04', '相同请求标识重复提交返回同一执行（防重复）', async () => { const e = await api('/bilateral-direct/executions', 'POST', execBody); assert.equal(e.id, exec.id); return '返回同一执行'; });
  await step('E-05', '超过合同剩余数量被拦截（再建 30 吨，剩余 20 吨）', () => expectFail('/bilateral-direct/executions', 'POST', { ...execBody, requestId: `${TAG}-EXEC-OVER`, quantity: 30 }, /超过/));
  await step('E-06', '从采购直拨指令创建运单被拦截（防重复派车）', async () => expectFail('/waybills', 'POST', { dispatchNoticeId: exec.purchaseNoticeId, freightMode: 'SUPPLIER', plateNo: '浙H00000', driverName: 'x', lineItems: [{ dispatchNoticeLineItemId: (await api(`/dispatch-notices/${exec.purchaseNoticeId}`)).lineItems[0].id, quantity: 1 }] }, /配对|共享/));
  await step('E-07', '销售直拨通知是否生成出库管理单', async () => {
    const list = rows(await api(`/outbound-receipts/orders?search=${encodeURIComponent(exec.salesNotice.noticeNo)}`));
    const notice = await api(`/dispatch-notices/${exec.salesNoticeId}`);
    observe('E-07', '销售直拨通知的出库管理单', { outboundOrdersFound: list.length, noticeOutboundOrder: notice.outboundOrder ? { status: notice.outboundOrder.status } : null });
    return `出库管理列表命中 ${list.length} 条；通知关联出库管理单：${notice.outboundOrder ? '有' : '无'}`;
  });

  // ---------- 四、第 1 车：直接确认 ----------
  const t1 = await truck(1, exec.salesNoticeId, `浙H${stamp.slice(-4)}1`, [35, 15], [34.8, 15], (s, r) => [['A', 'SHIPPING', 'OTHER', 33.2, 4.2, s], ['B', 'RECEIVING', 'OTHER', 32.6, 4.5, r]]);
  if (t1.w && t1.task) {
    await step('T1-10C', '客户化验室报告按“合作方”机构类型录入（选择下游客户）', async () => {
      const s = await sample(t1.task.id, 'T1-C');
      const body = { qualityTaskId: t1.task.id, qualitySampleId: s.id, weighTicketId: t1.recvTicket?.id, sampledAt: iso(), samplerName: 'x', institutionType: 'PARTNER', institutionPartnerId: ctx.customerId,
        reportNo: `${TAG}-T1-C`, evidenceStage: 'RECEIVING', testedAt: iso(), submit: true, indicators: [{ code: 'CAF2', name: '氟化钙', operator: 'GTE', standardValue: 10, measuredValue: 32.6, unit: '%' }] };
      const r = await api('/quality-inspections', 'POST', body);
      assert.equal(r.institutionPartnerId, ctx.customerId); assert.equal(r.institutionType, 'PARTNER');
      await expectFail('/quality-inspections', 'POST', { ...body, institutionPartnerId: own.id }, /合同的供应商或客户/);
      await expectFail('/quality-inspections', 'POST', { ...body, institutionType: 'THIRD_PARTY' }, /质检机构/);
      return '合同客户可作为合作方；无关公司及冒充第三方均拦截';
    });
    await step('T1-10D', '独立合作方报告先录入、再关联；全部解除后释放合同范围', async () => {
      const options = await api(`/quality-inspections/institution-options?qualityTaskId=${t1.task.id}`);
      assert(options.partners.some(p => p.partnerId === ctx.customerId));
      const r = await api('/quality-inspections/standalone', 'POST', { materialId: material.id, contextContractId: contract.id,
        evidenceStage: 'RECEIVING', sampledAt: iso(), testedAt: iso(), samplerName: '模拟独立报告', institutionType: 'PARTNER', institutionPartnerId: ctx.customerId,
        reportNo: `${TAG}-STANDALONE`, submit: true, indicators: [{ code: 'MOISTURE', name: '水分', operator: 'LTE', standardValue: 12, measuredValue: 4.5, unit: '%' }] });
      assert.equal(r.contractId, null); assert.equal(r.institutionPartnerId, ctx.customerId);
      await upload(`/quality-inspections/${r.id}/attachments`, 'REPORT'); await api(`/quality-inspections/${r.id}/status`, 'PATCH', { status: 'CONFIRMED' });
      await api(`/quality-inspections/${r.id}/tasks/${t1.task.id}`, 'POST', {});
      const linked = await api(`/quality-inspections/${r.id}`); assert.equal(linked.contractId, contract.id);
      await api(`/quality-inspections/${r.id}/tasks/${t1.task.id}`, 'DELETE');
      const released = await api(`/quality-inspections/${r.id}`); assert.equal(released.contractId, null); assert.equal(released.businessUnitId, null);
      return '合同仅筛选机构，首次关联才锁定，全部解除后可重新关联';
    });
  }
  if (t1.w) {
    await step('T1-11', '采购配对指令详情展示共享运单', async () => { const n = await api(`/dispatch-notices/${exec.purchaseNoticeId}`); assert(n.waybills.some(x => x.id === t1.w.id)); return `采购指令状态 ${n.status}，共享运单 ${n.waybills.length} 张`; });
    await step('T1-12', '质检未最终判定前，直拨交付预览被拦截', () => expectFail(`/bilateral-direct/waybills/${t1.w.id}/preview`, 'POST', { weighTicketId: t1.recvTicket?.id, qualityReportId: t1.reps.B?.id, remarks: '测试' }, /质检|判定|报告/));
    await step('T1-13', '质检最终判定：采用客户收货报告（两份报告，填写采用原因）', async () => {
      const body = { conclusion: 'PASS', basisInspectionId: t1.reps.B.id, reason: `${TAG}按销售合同约定以客户收货检测为准；供应商报告留存比对` };
      const r = await api(`/quality-tasks/${t1.task.id}/finalize`, 'PATCH', body); return `任务 ${r.status} 结论 ${r.finalConclusion}`;
    });
    await step('T1-14', '常规“销售完成确认”接口对直拨运单被拦截', () => expectFail(`/waybills/${t1.w.id}/sales-completion`, 'POST', { customerWeighTicketId: t1.recvTicket?.id, qualityReportId: t1.reps.B?.id, remarks: 'x' }, /直拨交付/));
    await step('T1-15', '交付说明为空被拦截', () => expectFail(`/bilateral-direct/waybills/${t1.w.id}/preview`, 'POST', { weighTicketId: t1.recvTicket?.id, qualityReportId: t1.reps.B?.id, remarks: '' }));
    await step('T1-16', '采用发货侧报告（非最终采用报告）被拦截', () => expectFail(`/bilateral-direct/waybills/${t1.w.id}/preview`, 'POST', { weighTicketId: t1.recvTicket?.id, qualityReportId: t1.reps.A?.id, remarks: '测试' }, /报告|判定/));
    const prev = await step('T1-17', '直拨交付预览：收货磅单 19.8 吨 × (1-4.5%) 折干', async () => {
      const p = await api(`/bilateral-direct/waybills/${t1.w.id}/preview`, 'POST', { weighTicketId: t1.recvTicket.id, qualityReportId: t1.reps.B.id, remarks: '预览' });
      observe('T1-17', '交付预览快照', { quantity: p.snapshot.quantity, pricingQuantity: p.snapshot.pricingQuantity, basis: p.snapshot.pricingQuantityBasis, moisture: p.snapshot.measuredMoisturePct, createsInventory: p.createsInventory });
      assert.equal(Number(p.snapshot.quantity), 19.8); assert.equal(Number(p.snapshot.pricingQuantity), 18.909); return `实物 ${p.snapshot.quantity} / 折干 ${p.snapshot.pricingQuantity}`;
    });
    const inv0 = await api('/inventory/overview').catch(() => null);
    const d1 = await step('T1-18', '确认直拨交付（仓储库管）：生成采购业务入库 + 销售出库', async () => {
      const d = await api(`/bilateral-direct/waybills/${t1.w.id}/confirm`, 'POST', { weighTicketId: t1.recvTicket.id, qualityReportId: t1.reps.B.id, remarks: `${TAG}按客户收货磅单与客户检测交付；发货 20.000 吨、收货 19.800 吨，差 0.2 吨为途耗，各自结算时处理` });
      assert.equal(d.status, 'CONFIRMED'); assert.equal(d.documents.length, 2); ctx.d1id = d.id;
      ctx.delivery1 = d.documents.map(x => ({ no: x.documentNo, dir: x.direction, q: x.quantity, pq: x.pricingQuantity }));
      return d.documents.map(x => `${x.direction === 'PURCHASE' ? '采购业务入库' : '销售出库'} ${x.documentNo} ${x.quantity}/${x.pricingQuantity}`).join('；');
    });
    await step('T1-19', '重复确认相同依据返回原交付（幂等）', async () => { const d = await api(`/bilateral-direct/waybills/${t1.w.id}/confirm`, 'POST', { weighTicketId: t1.recvTicket.id, qualityReportId: t1.reps.B.id, remarks: '重复' }); assert.equal(d.id, ctx.d1id); return '未重复生成'; });
    await step('T1-20', '交付确认后更换采信磅单被拦截', () => expectFail(`/weigh-tickets/waybills/${t1.w.id}/selections/RECEIVING`, 'PATCH', { weighTicketId: t1.recvTicket.id, reason: '测试' }, /撤销|交付/));
    await step('T1-21', '运单写入销售交付确认信息', async () => {
      const w = await api(`/waybills/${t1.w.id}`);
      observe('T1-21', '交付后运单销售完成字段', { salesCompletionConfirmedAt: w.salesCompletionConfirmedAt, customerTicket: w.salesCompletionCustomerTicketId === t1.recvTicket.id, report: w.salesCompletionReportId === t1.reps.B.id,
        customerWeight: w.salesCompletionCustomerWeight, shippingTicket: w.salesCompletionShippingTicketId, shippingWeight: w.salesCompletionShippingWeight, variance: w.salesCompletionWeightVariance, outboundReceipts: w.outboundReceipts?.length });
      assert(w.salesCompletionConfirmedAt); assert.equal(Number(w.salesCompletionShippingWeight), 20); assert.equal(Number(w.salesCompletionCustomerWeight), 19.8); assert.equal(Number(w.salesCompletionWeightVariance), -0.2);
      const detail = await api(`/bilateral-direct/waybills/${t1.w.id}`), sides = detail.deliveries.find(d => d.status === 'CONFIRMED').snapshot.evidenceSides;
      assert.equal(sides.shipping.ticket.id, t1.shipTicket.id); assert.equal(sides.receiving.ticket.id, t1.recvTicket.id);
      assert.equal(sides.shipping.reports.find(r => r.id === t1.reps.A.id).moisturePct, 4.2); assert.equal(sides.receiving.reports.find(r => r.id === t1.reps.B.id).gradePct, 32.6);
      return `双侧快照已固化；客户重量 ${w.salesCompletionCustomerWeight}，发货重量 ${w.salesCompletionShippingWeight}，差异 ${w.salesCompletionWeightVariance}`;
    });
    await step('T1-22', '直拨交付不影响我方库存（库存总览前后对比）', async () => {
      const inv1 = await api('/inventory/overview').catch(() => null);
      const sum = v => rows(v).reduce((s, x) => s + Number(x.availableQuantity ?? x.quantity ?? 0), 0);
      const a = sum(inv0), b = sum(inv1); observe('T1-22', '库存总览可用量合计', { before: a, after: b });
      assert.equal(a, b); return `前 ${a} / 后 ${b}`;
    });
    await step('T1-23', '“出库管理”与库存台账中能否看到本车销售出库', async () => {
      const orders = rows(await api(`/outbound-receipts/orders?search=${encodeURIComponent(exec.salesNotice.noticeNo)}`));
      const ledger = rows(await api('/inventory/ledger').catch(() => [])).filter(x => JSON.stringify(x).includes(t1.w.waybillNo) || JSON.stringify(x).includes(ctx.contract.contractNo));
      const eligible = rows(await api('/outbound-receipts/eligible-waybills').catch(() => [])).filter(x => x.id === t1.w.id || x.waybillId === t1.w.id);
      observe('T1-23', '销售出库可见性', { outboundOrders: orders.length, ledgerRows: ledger.length, eligibleWaybills: eligible.length });
      return `出库管理 ${orders.length} 条，库存台账 ${ledger.length} 条，待出库作业 ${eligible.length} 条`;
    });
    await step('T1-24', '撤销交付（两向单据成对冲销）', async () => { const r = await api(`/bilateral-direct/waybills/${t1.w.id}/reverse`, 'POST', { reason: `${TAG}模拟误确认后撤销` }); assert(r.reversed); return '已撤销'; });
    await step('T1-25', '撤销后运单销售交付信息清空', async () => { const w = await api(`/waybills/${t1.w.id}`); assert.equal(w.salesCompletionConfirmedAt, null); return '已清空'; });
    await step('T1-26a', '跨侧组合（供应商磅单＋客户报告水分）预览可显示跨侧标记', async () => {
      const p = await api(`/bilateral-direct/waybills/${t1.w.id}/preview`, 'POST', { weighTicketId: t1.shipTicket.id, qualityReportId: t1.reps.B.id, remarks: '预览' });
      assert.equal(p.snapshot.crossSide, true); return `crossSide=${p.snapshot.crossSide}`;
    });
    await step('T1-26b', '跨侧组合未选择原因时确认被拦截', () => expectFail(`/bilateral-direct/waybills/${t1.w.id}/confirm`, 'POST', { weighTicketId: t1.shipTicket.id, qualityReportId: t1.reps.B.id, remarks: '测试' }, /不同环节/));
    await step('T1-26', '重新确认（第 2 版）：供应商发货磅单＋客户报告，原因“磅单协商”', async () => {
      const d = await api(`/bilateral-direct/waybills/${t1.w.id}/confirm`, 'POST', { weighTicketId: t1.shipTicket.id, qualityReportId: t1.reps.B.id, crossSideReason: 'NEGOTIATED_TICKET', remarks: `${TAG}第2版：双方协商按供应商发货磅单 20 吨，水分按客户报告` });
      assert.equal(d.snapshot?.crossSideReason, 'NEGOTIATED_TICKET');
      ctx.delivery1v2 = d.documents.map(x => ({ no: x.documentNo, dir: x.direction, q: x.quantity, pq: x.pricingQuantity }));
      assert.equal(d.version, 2); assert.equal(Number(d.quantity), 20); return `第 ${d.version} 版 ${d.quantity}/${d.pricingQuantity}`;
    });
  }

  // ---------- 五、第 2 车：提交运营经理复核 ----------
  const t2 = await truck(2, exec.salesNoticeId, `浙H${stamp.slice(-4)}2`, [36, 15.5], [35.2, 15.5], (s, r) => [['B', 'RECEIVING', 'THIRD_PARTY', 29.4, 4.8, r]]);
  if (t2.w && t2.task && t2.reps.B) {
    await step('T2-11', '质检最终判定：仅一份第三方收货报告（须填写原因）', async () => {
      const e = await expectFail(`/quality-tasks/${t2.task.id}/finalize`, 'PATCH', { conclusion: 'PASS', basisInspectionId: t2.reps.B.id }, /原因/);
      await api(`/quality-tasks/${t2.task.id}/finalize`, 'PATCH', { conclusion: 'PASS', basisInspectionId: t2.reps.B.id, reason: `${TAG}客户未出报告，采用第三方收货检测` }); return e;
    });
    await step('T2-12', '两侧品位跨档（发货侧未检，收货侧 29.4% 落 25–30 档）提交运营经理复核', async () => {
      const d = await api(`/bilateral-direct/waybills/${t2.w.id}/confirm`, 'POST', { weighTicketId: t2.recvTicket.id, qualityReportId: t2.reps.B.id, remarks: `${TAG}收货 19.7 吨、发货 20.5 吨，差 0.8 吨超常规，提交复核`, requestReview: true });
      assert.equal(d.status, 'PENDING_REVIEW'); assert.equal(d.documents.length, 0); return `状态 ${d.status}，未生成单据`;
    });
    await step('T2-13', '复核意见为空被拦截', () => expectFail(`/bilateral-direct/waybills/${t2.w.id}/review`, 'POST', { approved: true, reason: '' }));
    await step('T2-14', '运营经理复核通过后生成两向单据', async () => {
      const d = await api(`/bilateral-direct/waybills/${t2.w.id}/review`, 'POST', { approved: true, reason: `${TAG}差异已与客户、供应商确认` });
      ctx.delivery2 = d.documents.map(x => ({ no: x.documentNo, dir: x.direction, q: x.quantity, pq: x.pricingQuantity }));
      assert.equal(d.status, 'CONFIRMED'); assert.equal(d.documents.length, 2); return d.documents.map(x => `${x.documentNo} ${x.quantity}/${x.pricingQuantity}`).join('；');
    });
  }


  // ---------- 七、结算：采购跟随销售 ----------
  if (t1.w && t2.w) {
    const C = contract.id;
    const src = async dir => rows(await api(`/financial-settlements/options/goods-sources?contractId=${C}&direction=${dir}`)).filter(x => x.direct);
    const lineOf = (s, extra = {}) => ({ orderId: s.orderId, waybillLineItemId: s.id, ...extra });
    const approveAll = async id => { for (let i = 0; i < 15; i++) { const x = await api(`/financial-settlements/${id}`); if (x.status !== 'PENDING_APPROVAL') return x; await api(`/financial-settlements/${id}/approve`, 'POST', { comment: `${TAG}模拟审批` }); } throw new Error('审批未结束'); };
    let p0 = await step('S-01', '销售结算前：采购来源标记“跟随销售、仅可预览”', async () => {
      const list = await src('PAYABLE'); assert.equal(list.length, 2);
      for (const x of list) { assert(x.followSales); assert(x.previewOnly); assert(!x.available); assert(x.reasons.some(r => r.includes('请先完成销售结算审批'))); }
      ctx.p0 = list; return list.map(x => `${x.waybillNo}：${x.reasons.join('；')}`).join(' | ');
    });
    await step('S-02', '采购预览可用，但标记禁止保存', async () => {
      const list = await src('PAYABLE');
      const r = await api('/financial-settlements/preview-goods', 'POST', { contractId: C, direction: 'PAYABLE', settlementScope: 'GOODS', lines: list.map(x => lineOf(x)) });
      assert.equal(r.saveBlocked, true); return `预览金额 ${r.totalAmount}；${r.saveBlockedReason}`;
    });
    await step('S-03', '销售结算未建时保存采购结算被拦截', async () => {
      const list = await src('PAYABLE'); return expectFail('/financial-settlements', 'POST', { contractId: C, direction: 'PAYABLE', settlementScope: 'GOODS', lines: list.map(x => lineOf(x)) }, /请先完成销售结算审批/);
    });
    const sales = await src('RECEIVABLE');
    const s1 = sales.find(x => x.waybillId === t1.w.id), s2 = sales.find(x => x.waybillId === t2.w.id);
    await step('S-04', '销售结算默认采用交付确认的磅单与报告（第1车为供应商发货磅单 20 吨 × (1-4.5%) = 19.1）', async () => {
      assert.equal(s1.weighTicketId, t1.shipTicket.id); assert.equal(s1.reportId, t1.reps.B.id); assert.equal(s1.remainingQuantity, 19.1);
      return `第1车 ${s1.ticketNo} ${s1.remainingQuantity} 吨；第2车 ${s2.ticketNo} ${s2.remainingQuantity} 吨`;
    });
    const ys1 = await step('S-05', '第1车销售结算（默认依据）：创建草稿', async () => {
      const r = await api('/financial-settlements', 'POST', { contractId: C, direction: 'RECEIVABLE', settlementScope: 'GOODS', lines: [lineOf(s1)], remarks: TAG });
      ctx.ys1 = { id: r.id, no: r.settlementNo, q: r.quantity, amt: r.totalAmount }; return r;
    });
    await step('S-06', '销售结算为草稿时，采购结算仍被拦截（提示当前草稿）', async () => {
      const x = (await src('PAYABLE')).find(v => v.waybillId === t1.w.id);
      return expectFail('/financial-settlements', 'POST', { contractId: C, direction: 'PAYABLE', settlementScope: 'GOODS', lines: [lineOf(x)] }, /草稿/);
    });
    await step('S-07', '第1车销售结算确认并审批', async () => { await api(`/financial-settlements/${ys1.id}/confirm`, 'POST', {}); const r = await approveAll(ys1.id); assert.equal(r.status, 'CONFIRMED'); return `${r.settlementNo} ${r.status} 数量 ${r.quantity} 金额 ${r.totalAmount}`; });
    const ys2 = await step('S-08', '第2车销售结算：协商数量 18.3 吨（低于折干 18.754）', async () => {
      const r = await api('/financial-settlements', 'POST', { contractId: C, direction: 'RECEIVABLE', settlementScope: 'GOODS', lines: [lineOf(s2, { quantity: 18.3, negotiatedQuantity: true, remarks: `${TAG}与客户协商按 18.3 吨结算` })], remarks: TAG });
      ctx.ys2 = { id: r.id, no: r.settlementNo, q: r.quantity, amt: r.totalAmount }; assert.equal(Number(r.quantity), 18.3); return r;
    });
    await step('S-09', '第2车销售结算上传双方签章确认单，确认并审批', async () => {
      await upload(`/financial-settlements/${ys2.id}/attachments`, 'SIGNED_SETTLEMENT_CONFIRMATION', '销售签章确认单');
      await api(`/financial-settlements/${ys2.id}/confirm`, 'POST', {}); const r = await approveAll(ys2.id); assert.equal(r.status, 'CONFIRMED'); return `${r.settlementNo} ${r.status}`;
    });
    const pay = await step('S-10', '销售审批后：采购来源跟随销售（磅单、报告、数量）', async () => {
      const list = await src('PAYABLE'); const a = list.find(v => v.waybillId === t1.w.id), b = list.find(v => v.waybillId === t2.w.id);
      assert(a.available && b.available, JSON.stringify([a.reasons, b.reasons]));
      assert.equal(a.weighTicketId, t1.shipTicket.id); assert.equal(a.reportId, t1.reps.B.id); assert.equal(a.remainingQuantity, 19.1); assert.equal(a.availableWeighTickets.length, 1);
      assert.equal(b.remainingQuantity, 18.3); assert.equal(b.followSalesSettlementNo, ys2.settlementNo);
      ctx.p1 = { a: { q: a.remainingQuantity, price: a.unitPrice }, b: { q: b.remainingQuantity, price: b.unitPrice } };
      return `第1车 ${a.remainingQuantity} 吨（采购价 ${a.unitPrice} 元/吨）跟随 ${a.followSalesSettlementNo}；第2车 ${b.remainingQuantity} 吨跟随 ${b.followSalesSettlementNo}`;
    });
    if (pay) {
      const list = await src('PAYABLE'); const a = list.find(v => v.waybillId === t1.w.id), b = list.find(v => v.waybillId === t2.w.id);
      const base = extraA => ({ contractId: C, direction: 'PAYABLE', settlementScope: 'GOODS', lines: [lineOf(a, extraA), lineOf(b)], remarks: TAG });
      await step('S-11', '采购改选另一侧磅单被拦截', () => expectFail('/financial-settlements', 'POST', base({ weighTicketId: t1.recvTicket.id, remarks: 'x' }), /不能改选/));
      await step('S-12', '采购改选另一份检测报告被拦截', () => expectFail('/financial-settlements', 'POST', base({ qualityReportId: t1.reps.A.id, remarks: 'x' }), /不能改选/));
      await step('S-13', '采购填写与销售不同的数量被拦截', () => expectFail('/financial-settlements', 'POST', base({ quantity: 18.5 }), /一致/));
      await step('S-14', '采购单独协商数量被拦截', () => expectFail('/financial-settlements', 'POST', base({ quantity: 19.1, negotiatedQuantity: true, remarks: 'x' }), /不能单独协商/));
      await step('S-15', '采购单独整单调整总干基被拦截', () => expectFail('/financial-settlements', 'POST', { ...base({}), settlementAdjustment: { mode: 'QUANTITY', quantity: 37, reason: 'x' } }, /不能单独调整总干基/));
      const yf = await step('S-16', '采购结算按跟随数量创建（金额按采购价）', async () => {
        const r = await api('/financial-settlements', 'POST', base({}));
        ctx.yfId = r.id; ctx.yf = { id: r.id, no: r.settlementNo, q: r.quantity, amt: r.totalAmount, lines: r.lines.map(l => ({ q: l.quantity, price: l.unitPrice, amt: l.totalAmount })) };
        assert.equal(Number(r.quantity), 37.4); return `${r.settlementNo} 数量 ${r.quantity}（销售 19.1＋18.3）金额 ${r.totalAmount}`;
      });
      await step('S-17', '存在跟随的采购结算时，作废销售结算被拦截', () => expectFail(`/financial-settlements/${ys1.id}/void`, 'POST', {}, /先作废该采购结算/));
      if (ctx.yfId) await step('S-18', '采购结算确认并审批（含协商数量车次须上传签章确认单）', async () => {
        await upload(`/financial-settlements/${ctx.yfId}/attachments`, 'SIGNED_SETTLEMENT_CONFIRMATION', '采购签章确认单');
        await api(`/financial-settlements/${ctx.yfId}/confirm`, 'POST', {}); const r = await approveAll(ctx.yfId); assert.equal(r.status, 'CONFIRMED'); return `${r.settlementNo} ${r.status}`;
      });
      await step('S-19', '进出数量核对：销售合计 = 采购合计', async () => {
        const ysA = await api(`/financial-settlements/${ys1.id}`), ysB = await api(`/financial-settlements/${ys2.id}`), yfX = await api(`/financial-settlements/${ctx.yfId}`);
        const sq = Number(ysA.quantity) + Number(ysB.quantity), pq = Number(yfX.quantity);
        observe('S-19', '两向结算对照', { sales: [ysA.settlementNo, ysA.quantity, ysA.totalAmount, ysB.settlementNo, ysB.quantity, ysB.totalAmount], purchase: [yfX.settlementNo, yfX.quantity, yfX.totalAmount] });
        assert.equal(Number(sq.toFixed(3)), pq); return `销售 ${sq.toFixed(3)} 吨 / 采购 ${pq} 吨`;
      });
      await step('S-20', '整单数量专项准备：先采购后销售作废原测试结算', async () => {
        await api(`/financial-settlements/${ctx.yfId}/void`, 'POST', {});
        await api(`/financial-settlements/${ys1.id}/void`, 'POST', {}); await api(`/financial-settlements/${ys2.id}/void`, 'POST', {});
        return '原记录保留，重新验证两车整单调整';
      });
      await step('S-21', '不同品位单价不允许统一调整总干基，应逐车或同价分组', async () => {
        const list = (await src('RECEIVABLE')).filter(x => [t1.w.id, t2.w.id].includes(x.waybillId));
        return expectFail('/financial-settlements', 'POST', { contractId: C, direction: 'RECEIVABLE', settlementScope: 'GOODS', lines: list.map(x => lineOf(x)), settlementAdjustment: { mode: 'QUANTITY', quantity: 37.5, reason: '验证不同单价保护' } }, /单价|物料/);
      });
    }
  }

  // ---------- 六、汇总核查 ----------
  await step('R-01', '四流核对视图', async () => {
    const r = await api(`/bilateral-direct/contracts/${contract.id}/review`);
    observe('R-01', '四流核对', { contractEvidence: r.contractEvidence, trips: r.trips.map(x => ({ waybillNo: x.waybillNo, status: x.status, delivered: x.delivered, receiptProvided: x.receiptProvided, consistent: x.quantitiesConsistent, q: x.quantity, pq: x.pricingQuantity })) });
    return `合同依据 ${JSON.stringify(r.contractEvidence)}；车次 ${r.trips.length}`;
  });
  await step('R-02', '执行通知/批次状态', async () => {
    const p = await api(`/dispatch-notices/${exec.purchaseNoticeId}`), s = await api(`/dispatch-notices/${exec.salesNoticeId}`);
    observe('R-02', '通知状态', { purchase: p.status, sales: s.status, purchaseOutbound: p.outboundOrder ?? null, salesOutbound: s.outboundOrder ?? null });
    return `采购指令 ${p.status}，销售通知 ${s.status}`;
  });
  save();
  const failed = results.filter(item => item.result === 'FAIL');
  console.log(JSON.stringify({ result: failed.length ? 'FAIL' : 'PASS', checks: results.length, failed: failed.length, tag: TAG, output: OUT }));
  if (failed.length) process.exitCode = 1;
}

main().catch(e => { console.error('FATAL', e.stack); results.push({ id: 'FATAL', title: '脚本异常', result: 'FAIL', detail: e.message }); save(); process.exitCode = 1; });
