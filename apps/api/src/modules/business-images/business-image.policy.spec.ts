import { imageTargetCategory, inferImageType, isLinkedImage, normalizeImageRemarks } from './business-image.policy';

describe('业务影像关联门禁', () => {
  it('备注规范化上传表单换行，并保留内部多行内容', () => {
    expect(normalizeImageRemarks('  第一行\r\n第二行\r第三行  ')).toBe('第一行\n第二行\n第三行');
    expect(normalizeImageRemarks('  ')).toBeNull();
    expect(normalizeImageRemarks(undefined)).toBeNull();
  });
  it.each(['DRAFT', 'REJECTED'])('合同 %s 可关联，双边必须选择附件类别', status => {
    expect(imageTargetCategory('CONTRACT', { status, type: 'PURCHASE' })).toBe('PURCHASE_CONTRACT');
    expect(() => imageTargetCategory('CONTRACT', { status, type: 'BILATERAL' })).toThrow('类别');
    expect(imageTargetCategory('CONTRACT', { status, type: 'BILATERAL' }, 'SALES_CONTRACT')).toBe('SALES_CONTRACT');
  });
  it.each(['PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'COMPLETED', 'VOIDED'])('合同 %s 不得从资料库绕过附件锁定', status => expect(() => imageTargetCategory('CONTRACT', { status, type: 'PURCHASE' })).toThrow());
  it('运单已签收可补凭证，不得解除关联；类别与原模块保持一致', () => {
    expect(imageTargetCategory('WAYBILL', { status: 'SIGNED' }, 'RECEIPT_DOCUMENT')).toBe('RECEIPT_DOCUMENT');
    expect(() => imageTargetCategory('WAYBILL', { status: 'SIGNED' }, 'RECEIPT_PHOTO', true)).toThrow();
    expect(() => imageTargetCategory('WAYBILL', { status: 'IN_TRANSIT' }, 'RECEIPT_OTHER')).toThrow();
  });
  it('磅单完成称重后可补附件，完成复核后不能再变更', () => {
    expect(imageTargetCategory('WEIGH_TICKET', { status: 'COMPLETED' })).toBe('WEIGH_TICKET');
    expect(() => imageTargetCategory('WEIGH_TICKET', { status: 'COMPLETED' }, undefined, true)).toThrow();
    expect(() => imageTargetCategory('WEIGH_TICKET', { status: 'REVIEWED' })).toThrow();
  });
  it.each(['CONFIRMED', 'VOIDED'])('检测报告 %s 已锁定', status => expect(() => imageTargetCategory('QUALITY_REPORT', { status })).toThrow());
  it.each([['INBOUND', 'POSTED'], ['INBOUND', 'RECEIVED'], ['OUTBOUND', 'POSTED'], ['OUTBOUND', 'CANCELLED'], ['PAYMENT_REQUEST', 'APPROVED'], ['PAYMENT_REQUEST', 'PENDING_APPROVAL']])('%s %s 不可变更', (type, status) => expect(() => imageTargetCategory(type as any, { status })).toThrow());
  it('结算单已确认可补签章件，不允许移走凭证', () => { expect(imageTargetCategory('SETTLEMENT', { status: 'CONFIRMED' })).toBe('SETTLEMENT_CONFIRMATION'); expect(() => imageTargetCategory('SETTLEMENT', { status: 'CONFIRMED' }, undefined, true)).toThrow(); });
  it('资金单已核销不能移走凭证', () => expect(() => imageTargetCategory('FUND', { status: 'ALLOCATED' }, undefined, true)).toThrow());
  it('归档合同与具体单据关系分离，原始现场资料可推断类型', () => {
    expect(isLinkedImage({ businessImage: { contractId: 'c' } })).toBe(false);
    expect(isLinkedImage({ contractId: 'c' })).toBe(true);
    expect(inferImageType({ waybillId: 'w', category: 'RECEIPT_PHOTO' })).toBe('SCENE_PHOTO');
    expect(inferImageType({ contractId: 'c', businessImage: { documentType: 'OTHER' } })).toBe('OTHER');
  });
});
