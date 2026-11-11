import { QualityInspectionService } from './quality-inspection.service';

describe('合同合作方检测机构', () => {
  let db: any, access: any, service: QualityInspectionService;
  const scope = { businessUnitId: { in: ['unit-1'] } };
  beforeEach(() => {
    db = { contract: { findFirst: jest.fn().mockResolvedValue({ sellerId: 'supplier', buyerId: 'customer' }), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      partner: { findFirst: jest.fn().mockResolvedValue({ id: 'customer', name: '客户化验室' }), findMany: jest.fn().mockResolvedValue([{ id: 'customer', name: '客户', code: 'C1' }]) },
      serviceOrganization: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) } };
    access = { assertPermission: jest.fn().mockResolvedValue({ isExternal: false }), getContractScope: jest.fn().mockResolvedValue(scope) };
    service = new QualityInspectionService(db, access, {} as any);
  });
  it('合同客户无需供应商角色或服务生态档案，即可作为合作方出具报告', async () => {
    const institution = await (service as any).resolveInstitution('PARTNER', 'customer', undefined, 'contract', 'user');
    expect(institution).toEqual({ id: 'customer', name: '客户化验室' });
    expect(db.partner.findFirst.mock.calls[0][0].where).not.toHaveProperty('roles');
    expect(db.serviceOrganization.findFirst).not.toHaveBeenCalled();
    expect(db.contract.findFirst.mock.calls[0][0].where.AND).toEqual([scope]);
  });
  it('不能选择无关公司，也不能借用无权访问的合同', async () => {
    await expect((service as any).resolveInstitution('PARTNER', 'other', '', 'contract', 'user')).rejects.toThrow('必须是所选合同的供应商或客户');
    db.contract.findFirst.mockResolvedValue(null);
    await expect((service as any).resolveInstitution('PARTNER', 'customer', '', 'private', 'user')).rejects.toThrow('无权操作');
  });
  it('独立报告选择合作方时必须有合同上下文', async () => {
    await expect((service as any).resolveInstitution('PARTNER', 'customer', '', undefined, 'user')).rejects.toThrow('先选择合同');
  });
  it('第三方检测仍必须为有效服务生态质检机构，不能借合作方规则绕过', async () => {
    db.serviceOrganization.findFirst.mockResolvedValue(null);
    await expect((service as any).resolveInstitution('THIRD_PARTY', 'customer', '', 'contract', 'user')).rejects.toThrow('质检机构不存在');
    expect(db.partner.findFirst).not.toHaveBeenCalled();
  });
  it('候选接口只投影关联合同的交易方，且保留业务单元范围', async () => {
    const result = await service.institutionOptions('user', undefined, 'contract');
    expect(db.partner.findMany.mock.calls[0][0].where.id.in).toEqual(['supplier', 'customer']);
    expect(result.partners[0].partnerId).toBe('customer');
    expect(db.contract.findFirst.mock.calls[0][0].where.AND).toEqual([scope]);
  });
  it('外部身份不能从候选接口获取另一方向企业', async () => {
    access.assertPermission.mockResolvedValue({ isExternal: true, externalPartnerId: 'customer' });
    await service.institutionOptions('external', undefined, 'contract');
    expect(db.partner.findMany.mock.calls[0][0].where.id.in).toEqual(['customer']);
  });
});
