import { mockDeep, mockReset } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { FileService } from '../common/file.service';
import { LogisticsContractService } from './logistics-contract.service';

describe('物流合同档案、共享范围与锁价', () => {
  const prisma = mockDeep<PrismaService>(), access = mockDeep<AccessControlService>(), files = mockDeep<FileService>();
  const service = new LogisticsContractService(prisma, access, files);
  const dto = () => ({ title: '年度物流合同', carrierPartnerId: 'carrier', signingPartnerId: 'owner', allBusinessUnits: true });
  const base = () => ({ id: 'lc', title: '年度物流合同', status: 'DRAFT', signingPartnerId: 'owner', attachments: [{ id: 'a', fileName: 'a.pdf' }], priceTerms: [{ id: 'p' }] });
  beforeEach(() => {
    mockReset(prisma); mockReset(access); mockReset(files);
    access.assertPermission.mockResolvedValue({ user: { company: { id: 'management-company' } } } as any);
    access.getBusinessUnitOptions.mockResolvedValue([{ id: 'unit' }] as any); access.getLogisticsContractScope.mockResolvedValue({});
    prisma.serviceOrganization.findFirst.mockResolvedValue({ id: 'carrier-service' } as any);
    prisma.partner.findFirst.mockResolvedValue({ id: 'owner', isInternal: true } as any);
    prisma.logisticsContract.findFirst.mockResolvedValue(base() as any);
    prisma.logisticsContractPriceTerm.findMany.mockResolvedValue([]);
    prisma.logisticsContract.count.mockResolvedValue(0); prisma.logisticsSettlementLine.count.mockResolvedValue(0);
    prisma.logisticsContract.create.mockResolvedValue(base() as any);
    prisma.logisticsContract.findUniqueOrThrow.mockResolvedValue(base() as any);
    prisma.$transaction.mockImplementation(async (f: any) => f(prisma));
  });
  it('签约主体使用内部合作伙伴，管理组织不作为法律主体；默认全部事业部', async () => {
    await service.create(dto(), 'u');
    expect(prisma.logisticsContract.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ signingPartnerId: 'owner', companyId: 'management-company', allBusinessUnits: true, defaultWeightBasis: 'SETTLEMENT', createdBy: 'u', contractNo: expect.stringMatching(/^LC\d{12}$/) }) }));
  });
  it('无效承运方或内部签约主体不能创建', async () => {
    prisma.serviceOrganization.findFirst.mockResolvedValue(null);
    await expect(service.create(dto(), 'u')).rejects.toThrow('有效的物流承运商');
    prisma.serviceOrganization.findFirst.mockResolvedValue({ id: 's' } as any); prisma.partner.findFirst.mockResolvedValue(null);
    await expect(service.create(dto(), 'u')).rejects.toThrow('内部我方签约主体');
  });
  it('指定事业部必须是账号维护范围的子集', async () => {
    await expect(service.create({ ...dto(), allBusinessUnits: false, businessUnitIds: ['other'] }, 'u')).rejects.toThrow('有维护权限');
    await service.create({ ...dto(), allBusinessUnits: false, businessUnitIds: ['unit'] }, 'u');
    expect(prisma.logisticsContract.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ businessUnits: { create: [{ businessUnitId: 'unit' }] } }) }));
  });
  it('没有事业部或外部账号不能利用全部适用创建合同', async () => {
    access.getBusinessUnitOptions.mockResolvedValue([]);
    await expect(service.create(dto(), 'u')).rejects.toThrow('先配置');
    access.assertPermission.mockResolvedValue({ isExternal: true } as any);
    await expect(service.create(dto(), 'u')).rejects.toThrow('外部企业');
  });
  it('草稿可修改，生效合同原信息与运价不能覆盖', async () => {
    await service.update('lc', dto(), 'u');
    expect(prisma.logisticsContract.update).toHaveBeenCalled();
    prisma.logisticsContract.findFirst.mockResolvedValue({ ...base(), status: 'ACTIVE' } as any);
    await expect(service.update('lc', dto(), 'u')).rejects.toThrow('合同已生效');
    await expect(service.addPriceTerm('lc', { unitPrice: 100, effectiveAt: '2026-10-01' }, 'u')).rejects.toThrow('运价已锁定');
  });
  it('不限路线允许两端留空，但不能只填写一个地点', async () => {
    await service.addPriceTerm('lc', { unitPrice: 100, effectiveAt: '2026-10-01' }, 'u');
    expect(prisma.logisticsContractPriceTerm.create).toHaveBeenCalledWith({ data: expect.objectContaining({ originLocation: '', destinationLocation: '', unitPrice: 100 }) });
    await expect(service.addPriceTerm('lc', { originLocation: '玉门', unitPrice: 100, effectiveAt: '2026-10-01' }, 'u')).rejects.toThrow('同时填写');
  });
  it('草稿内同一路线重叠运价拒绝，不会自动改写旧条款', async () => {
    prisma.logisticsContractPriceTerm.findMany.mockResolvedValue([{ id: 'old', effectiveAt: new Date('2026-01-01'), expiresAt: null }] as any);
    await expect(service.addPriceTerm('lc', { unitPrice: 120, effectiveAt: '2026-10-01' }, 'u')).rejects.toThrow('已存在运价');
    expect(prisma.logisticsContractPriceTerm.update).not.toHaveBeenCalled();
  });
  it('启用前必须有附件与运价；启用后记录终止时间', async () => {
    prisma.logisticsContract.findFirst.mockResolvedValue({ ...base(), attachments: [] } as any);
    await expect(service.updateStatus('lc', { status: 'ACTIVE' }, 'u')).rejects.toThrow('合同附件');
    prisma.logisticsContract.findFirst.mockResolvedValue(base() as any);
    await service.updateStatus('lc', { status: 'ACTIVE' }, 'u');
    prisma.logisticsContract.findFirst.mockResolvedValue({ ...base(), status: 'ACTIVE' } as any);
    await service.updateStatus('lc', { status: 'TERMINATED' }, 'u');
    expect(prisma.logisticsContract.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: 'TERMINATED', terminatedAt: expect.any(Date) } }));
  });
  it('合同结算记录继续按全部关联运单范围过滤，不能通过共享合同越权', async () => {
    access.getLogisticsSettlementScope.mockResolvedValue({ lines: { every: { waybill: { id: 'visible' } } } });
    prisma.logisticsSettlementLine.findMany.mockResolvedValue([]);
    await service.settlementRecords('lc', 'u');
    expect(prisma.logisticsSettlementLine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ settlement: { AND: [expect.objectContaining({ lines: expect.anything() }), { deletedAt: null }] } }) }));
  });
  it('生效合同附件不可删除，查看地址仍校验所属合同', async () => {
    prisma.logisticsContract.findFirst.mockResolvedValue({ ...base(), status: 'ACTIVE' } as any);
    await expect(service.attachment('lc', 'a', 'u', true)).rejects.toThrow('不能删除');
    await expect(service.attachment('lc', 'foreign', 'u')).rejects.toThrow('附件不存在');
  });
});
