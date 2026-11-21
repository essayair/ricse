import { Prisma } from '@prisma/client';
import { buildContractCopyTemplate } from './contract-copy';

describe('合同复制白名单与重置', () => {
  const defaults = { departmentId: 'my-dept', businessUnitId: 'my-unit', allowedBusinessUnitIds: ['allowed-unit', 'my-unit'] };
  const source = () => ({ id: 'source', contractNo: 'SB-OLD', status: 'EXECUTING', title: '矿石双边合同', type: 'BILATERAL', businessUnitId: 'allowed-unit', departmentId: 'old-dept',
    externalNo: 'PAPER-OLD', salesExternalNo: 'SALE-OLD', signedAt: new Date(), effectiveAt: new Date(), expireAt: new Date(), salesSignedAt: new Date(),
    createdBy: 'other-user', createdAt: new Date(), approvals: [{ status: 'APPROVED' }], attachments: [{ id: 'signed-pdf' }], orders: [{ id: 'old-order' }],
    lineItems: [1, 2].map(index => ({ id: 'old-line-' + index, materialId: 'material-' + index, quantity: new Prisma.Decimal(index * 100), unit: 'TON', unitPrice: new Prisma.Decimal(0), salesUnitPrice: 0,
      deliveryDate: new Date(), qualityRulesSnapshot: { items: [{ code: 'CAF2', standardValue: 10 }] },
      priceRulesSnapshot: { formulaConfirmed: true, bands: [{ lower: 10, upper: 15, rates: { FRAGMENT: 14.9 } }], moistureDeductionMode: 'EXCESS', moistureBasePct: 5 },
      salesPriceRulesSnapshot: { formulaConfirmed: true, bands: [{ lower: 10, upper: 15, rates: { FRAGMENT: 14.8 } }] } })),
  });
  it('全部货物和两侧价格独立带入，重置日期、确认，禁止带入状态和关联业务', () => {
    const original = source(); const copied = buildContractCopyTemplate(original, defaults);
    expect(copied).toMatchObject({ title: '矿石双边合同（副本）', status: 'DRAFT', departmentId: 'my-dept', businessUnitId: 'allowed-unit', externalNo: '', salesExternalNo: '', signedAt: '', salesSignedAt: '', effectiveAt: '', expireAt: '', attachments: [] });
    expect(copied.lineItems).toHaveLength(2);
    expect(copied.lineItems[0]).toMatchObject({ quantity: '100', unitPrice: '0', salesUnitPrice: 0, priceRulesSnapshot: { formulaConfirmed: false, moistureBasePct: 5 }, salesPriceRulesSnapshot: { formulaConfirmed: false } });
    for (const key of ['id', 'contractNo', 'createdBy', 'createdAt', 'approvals', 'orders', 'operationLogs']) expect(copied).not.toHaveProperty(key);
    expect(copied.lineItems[0]).not.toHaveProperty('id'); expect(copied.lineItems[0]).not.toHaveProperty('deliveryDate');
    expect(copied.lineItems[0].salesPriceRulesSnapshot).not.toHaveProperty('moistureDeductionMode');
    copied.lineItems[0].priceRulesSnapshot.bands[0].lower = 12;
    expect(original.lineItems[0].priceRulesSnapshot.bands[0].lower).toBe(10);
    expect(original.lineItems[0].priceRulesSnapshot.formulaConfirmed).toBe(true);
  });
  it('来源事业部不在创建范围时改当前默认，不沿用旧部门', () => {
    expect(buildContractCopyTemplate({ ...source(), businessUnitId: 'forbidden' }, defaults)).toMatchObject({ businessUnitId: 'my-unit', departmentId: 'my-dept' });
  });
  it('复制时分别带入两侧联系人，历史共用信息不推断归属', () => {
    const contacts = { purchaseContactPerson: '供方', purchaseContactPhone: '0570-1111111', salesContactPerson: '客户', salesContactPhone: '13900000000' };
    expect(buildContractCopyTemplate({ ...source(), ...contacts }, defaults)).toMatchObject(contacts);
    const legacy = buildContractCopyTemplate({ ...source(), contactPerson: '旧共用联系人', contactPhone: '123' }, defaults);
    expect(legacy).toMatchObject({ contactPerson: '旧共用联系人', contactPhone: '123' });
    expect(legacy).not.toHaveProperty('purchaseContactPerson');
    expect(legacy).not.toHaveProperty('salesContactPerson');
    expect(buildContractCopyTemplate({ ...source(), status: 'DRAFT', draftData: { form: contacts } }, defaults).draftData.form).toMatchObject(contacts);
  });
  it('草稿恢复已保存但不完整的多行原值，不能让旧日期和原附件混入', () => {
    const copied = buildContractCopyTemplate({ ...source(), status: 'DRAFT', draftData: { form: { title: '尚未填完', externalNo: 'BAD', departmentId: 'old', signedAt: '2026-01-01', createdBy: 'hacker' }, lineItems: [{ materialId: '', quantity: '', unitPrice: '' }] } }, defaults);
    expect(copied).toMatchObject({ title: '尚未填完（副本）', departmentId: 'my-dept', externalNo: '', signedAt: '', lineItems: [{ materialId: '', quantity: '', unitPrice: '' }] });
    expect(copied.draftData.form).not.toHaveProperty('createdBy');
  });
  it('原草稿已删除全部货物时不能恢复旧归一化行', () => {
    expect(buildContractCopyTemplate({ ...source(), status: 'DRAFT', draftData: { lineItems: [] } }, defaults).lineItems).toEqual([]);
  });
  it('审批后只读合同以正式内容为准，不使用残留草稿缓存', () => {
    expect(buildContractCopyTemplate({ ...source(), draftData: { form: { title: '旧缓存' }, lineItems: [] } }, defaults)).toMatchObject({ title: '矿石双边合同（副本）', lineItems: [{ materialId: 'material-1' }, { materialId: 'material-2' }] });
  });
});
