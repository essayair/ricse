import { FinancialSettlementService } from './financial-settlement.service';

describe('双边资金对手方限制', () => {
  const db: any = { contract: { findUnique: jest.fn() }, partner: { findUnique: jest.fn() } };
  const service = new FinancialSettlementService(db, {} as any);
  beforeEach(() => { jest.clearAllMocks(); db.contract.findUnique.mockResolvedValue({ sellerId: 'supplier', buyerId: 'customer' }); });
  it('正常采购货款不能支付给同合同下游客户，别名和账号均核对', async () => {
    db.partner.findUnique.mockResolvedValue({ name: '客户公司', bankAccounts: [{ accountName: '客户公司收款户', accountNo: '123456' }] });
    await expect((service as any).assertBilateralFundParty({ id: 'c', type: 'BILATERAL' }, 'PAYABLE', '客户公司', '')).rejects.toThrow('下游客户');
    await expect((service as any).assertBilateralFundParty({ id: 'c', type: 'BILATERAL' }, 'PAYABLE', '其他名称', '123 456')).rejects.toThrow('下游客户');
  });
  it('销售货款不能由同合同上游供应商代付', async () => {
    db.partner.findUnique.mockResolvedValue({ name: '供应商', bankAccounts: [] });
    await expect((service as any).assertBilateralFundParty({ id: 'c', type: 'BILATERAL' }, 'RECEIVABLE', '供应商', '')).rejects.toThrow('上游供应商');
    await expect((service as any).assertBilateralFundParty({ id: 'c', type: 'BILATERAL' }, 'RECEIVABLE', '客户公司', '')).resolves.toBeUndefined();
  });
  it('单向合同不套用双边专项限制', async () => {
    await (service as any).assertBilateralFundParty({ id: 'c', type: 'PURCHASE' }, 'PAYABLE', '对手方', '123');
    expect(db.contract.findUnique).not.toHaveBeenCalled();
  });
});
