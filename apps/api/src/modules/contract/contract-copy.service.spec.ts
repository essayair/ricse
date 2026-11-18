import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { ContractService } from './contract.service';

describe('合同复制权限与新建留痕', () => {
  let db: ReturnType<typeof mockDeep<PrismaService>>, access: ReturnType<typeof mockDeep<AccessControlService>>, service: ContractService;
  const source = { id: 'source', contractNo: 'CG-OLD', title: '旧合同', type: 'PURCHASE', status: 'COMPLETED', businessUnitId: 'old-unit', signingPartnerId: 'own', sellerId: 'disabled-partner', lineItems: [{ materialId: 'disabled-material', materialName: '停用物料', quantity: 100, unitPrice: 10 }] };
  beforeEach(() => {
    db = mockDeep<PrismaService>(); access = mockDeep<AccessControlService>(); service = new ContractService(db, access);
    access.assertPermission.mockResolvedValue({ isAdmin: true, isExternal: false, user: {} } as any);
    jest.spyOn(service, 'findOne').mockResolvedValue(source as any);
    jest.spyOn(service, 'getFormOptions').mockResolvedValue({ defaultDepartmentId: 'my-dept', defaultBusinessUnitId: 'my-unit', businessUnits: [{ id: 'my-unit' }], departments: [], partners: [{ id: 'own' }] } as any);
    db.material.findMany.mockResolvedValue([{ id: 'disabled-material', status: 'DISABLED', name: '停用物料' }] as any);
  });
  it('读取模板不创建合同，同时检查新建及来源查看权限，停用档案须重新选择', async () => {
    const result = await service.copyTemplate('source', 'user');
    expect(access.assertPermission).toHaveBeenCalledWith('user', 'contract.create');
    expect(service.findOne).toHaveBeenCalledWith('source', 'user', 'contract.view');
    expect(result.draftData.form).toMatchObject({ sellerId: '', businessUnitId: 'my-unit' });
    expect(result.lineItems[0].materialId).toBe(''); expect(result.warnings.length).toBeGreaterThan(0);
    expect(db.contract.create).not.toHaveBeenCalled(); expect(db.businessOperationLog.create).not.toHaveBeenCalled();
  });
  it('无创建权限或来源不可见时不返回内容', async () => {
    access.assertPermission.mockRejectedValue(new ForbiddenException('无权限'));
    await expect(service.copyTemplate('source', 'user')).rejects.toThrow(ForbiddenException);
    expect(service.findOne).not.toHaveBeenCalled();
  });
  it('来源已删除或越权时拒绝模板及来源留痕伪造', async () => {
    jest.mocked(service.findOne).mockRejectedValue(new NotFoundException('合同不存在'));
    await expect(service.copyTemplate('source', 'user')).rejects.toThrow(NotFoundException);
    await expect(service.create({ copySourceContractId: 'source', title: '新合同', type: 'PURCHASE', totalAmount: 0, lineItems: [] }, 'user')).rejects.toThrow(NotFoundException);
    expect(db.contract.create).not.toHaveBeenCalled();
  });
  it('外部企业不能通过复制取得双边合同两侧条款', async () => {
    access.assertPermission.mockResolvedValue({ isAdmin: false, isExternal: true } as any);
    jest.mocked(service.findOne).mockResolvedValue({ ...source, type: 'BILATERAL' } as any);
    await expect(service.copyTemplate('source', 'external')).rejects.toThrow(ForbiddenException);
  });
  it('首次保存新草稿与复制来源记录同一事务，重试不重复创建或记录', async () => {
    db.contract.count.mockResolvedValue(0);
    db.contract.findFirst.mockResolvedValue(null);
    db.$transaction.mockImplementation((async (callback: any) => callback(db)) as any);
    db.contract.create.mockResolvedValue({ id: 'new', contractNo: 'CG-NEW', status: 'DRAFT', createdBy: 'user', lineItems: [] } as any);
    const dto = { copySourceContractId: 'source', clientRequestId: 'request-key', title: '新合同', type: 'PURCHASE', totalAmount: 0, lineItems: [] };
    const created = await service.create(dto, 'user');
    expect(created.id).toBe('new');
    expect(db.businessOperationLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ businessId: 'new', action: 'COPY_FROM', operatorId: 'user', details: expect.objectContaining({ sourceContractId: 'source', sourceContractNo: 'CG-OLD', attachmentsCopied: false }) }) }));
    db.contract.findFirst.mockResolvedValue({ ...created, type: 'PURCHASE', lineItems: [] } as any);
    await service.create(dto, 'user');
    expect(db.contract.create).toHaveBeenCalledTimes(1); expect(db.businessOperationLog.create).toHaveBeenCalledTimes(1);
  });
});
