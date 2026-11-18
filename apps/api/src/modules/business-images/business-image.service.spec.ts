import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { BusinessImageService } from './business-image.service';
import { UNLINKED } from './business-image.policy';

describe('业务影像数据范围和原单据门禁', () => {
  let db: ReturnType<typeof mockDeep<PrismaService>>;
  let access: ReturnType<typeof mockDeep<AccessControlService>>;
  let service: BusinessImageService;
  const permissions = ['business_image.view', 'business_image.manage', 'contract.view'];
  const context = { isAdmin: false, isExternal: false, permissions };
  const archive = { id: 'image', originalName: '凭证.png', mimeType: 'image/png', fileName: 'key', businessImage: { contractId: 'contract', dispatchNoticeId: 'notice-A', documentType: 'OTHER' } };
  beforeEach(() => {
    db = mockDeep<PrismaService>(); access = mockDeep<AccessControlService>();
    service = new BusinessImageService(db, access, {} as any, {} as any);
    access.assertPermission.mockResolvedValue(context as any);
    access.getContext.mockResolvedValue(context as any);
    access.getContractScope.mockImplementation(async (_user, permission) => ({ businessUnitId: permission === 'contract.view' ? 'view-unit' : 'image-unit' }));
    access.getWaybillScope.mockResolvedValue({ businessUnitId: 'waybill-unit' } as any);
    db.attachment.findFirst.mockResolvedValue(archive as any);
    db.contract.findFirst.mockResolvedValue({ id: 'contract' } as any);
  });
  it('即便有影像权限，也不向外部企业开放新资料库', async () => {
    access.assertPermission.mockResolvedValue({ ...context, isExternal: true } as any);
    await expect(service.contractOptions('external')).rejects.toThrow(ForbiddenException);
    expect(db.contract.findMany).not.toHaveBeenCalled();
  });
  it('视频监控权限不能替代业务影像权限', async () => {
    access.assertPermission.mockRejectedValue(new ForbiddenException('缺少业务影像权限'));
    await expect(service.url('image', 'viewer')).rejects.toThrow(ForbiddenException);
    expect(db.attachment.findFirst).not.toHaveBeenCalled();
  });
  it('归档权限与合同查看范围取交集，不以影像权限扩大可见事业部', async () => {
    await service.contractOptions('viewer');
    expect(db.contract.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [
      { deletedAt: null, AND: [{ businessUnitId: 'image-unit' }, { businessUnitId: 'view-unit' }] },
    ] } }));
  });
  it('仅归档分支排除所有原单据外键，关联后不能借归档权限绕过原单据查看权限', async () => {
    const where = await (service as any).readable('viewer');
    const branches = where.AND[0].OR;
    expect(branches).toHaveLength(2); // 仅归档 + 具备 contract.view 的合同附件。
    expect(branches[0]).toEqual(expect.objectContaining(UNLINKED));
    expect(branches.some((b: any) => b.waybill || b.weighTicket || b.qualityInspection)).toBe(false);
  });
  it('物流附件需要物流查看权限，并叠加原物流数据范围', async () => {
    access.assertPermission.mockResolvedValue({ ...context, permissions: [...permissions, 'logistics.view'] } as any);
    const where = await (service as any).readable('viewer');
    expect(where.AND[0].OR.find((b: any) => b.waybill).waybill.AND).toContainEqual({ businessUnitId: 'waybill-unit' });
  });
  it('看得到原单据，但没有修改权限时不得关联文件', async () => {
    db.waybill.findFirst.mockResolvedValue({ id: 'waybill', status: 'ARRIVED' } as any);
    access.assertPermission.mockImplementation(async (_user, permission) => {
      if (permission === 'logistics.manage') throw new ForbiddenException('无物流操作权限');
      return context as any;
    });
    await expect(service.link('image', { targetType: 'WAYBILL', targetId: 'waybill' }, 'viewer')).rejects.toThrow(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('关联车次必须属于已选执行通知，不能只校验同合同', async () => {
    db.waybill.findFirst.mockResolvedValue(null);
    await expect(service.link('image', { targetType: 'WAYBILL', targetId: 'waybill-B' }, 'viewer')).rejects.toThrow(NotFoundException);
    expect(db.waybill.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.arrayContaining([{ dispatchNoticeId: 'notice-A' }]) }) }));
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('共享混样报告支持通过有效任务关联匹配执行通知，已解除的关联不算', () => {
    const filter = (service as any).noticeFilter('QUALITY_REPORT', 'notice-A');
    expect(filter.OR).toContainEqual({ taskLinks: { some: { unlinkedAt: null, qualityTask: { deletedAt: null, waybill: { dispatchNoticeId: 'notice-A' } } } } });
  });
  it('原单据附件不提供中央改名或删除入口', async () => {
    db.attachment.findFirst.mockResolvedValue({ id: 'legacy', contractId: 'contract' } as any);
    await expect(service.update('legacy', { originalName: '新名.pdf', documentType: 'OTHER', nameConfirmed: true }, 'viewer')).rejects.toThrow('原单据');
    await expect(service.remove('legacy', 'viewer')).rejects.toThrow('原单据');
    expect(db.attachment.delete).not.toHaveBeenCalled();
  });
  it('普通用户不返回操作记录；管理员才返回操作人及时间', async () => {
    expect((await service.detail('image', 'viewer')).operationLogs).toEqual([]);
    expect(db.businessOperationLog.findMany).not.toHaveBeenCalled();
    access.getContext.mockResolvedValue({ ...context, isAdmin: true } as any);
    db.businessOperationLog.findMany.mockResolvedValue([{ action: 'CREATE', operatorId: 'admin', createdAt: new Date() }] as any);
    expect((await service.detail('image', 'admin')).operationLogs).toHaveLength(1);
  });
  it('详情返回归档备注，历史附件不伪造备注', async () => {
    db.attachment.findFirst.mockResolvedValue({ ...archive, businessImage: { ...archive.businessImage, remarks: '第一车\n原始回单' } } as any);
    expect((await service.detail('image', 'viewer')).remarks).toBe('第一车\n原始回单');
    db.attachment.findFirst.mockResolvedValue({ ...archive, businessImage: null } as any);
    expect((await service.detail('image', 'viewer')).remarks).toBe('');
  });
  it.each([
    ['  补充备注\n第二行  ', '补充备注\n第二行'],
    ['', null],
    [null, null],
  ])('编辑备注可保存、清空并记录变更：%s', async (remarks, expected) => {
    db.attachment.findFirst.mockResolvedValue({ ...archive, businessImage: { ...archive.businessImage, remarks: '原备注' } } as any);
    db.attachment.findUnique.mockResolvedValue(archive as any);
    (db.$transaction as jest.Mock).mockImplementation(async callback => callback(db));
    await service.update('image', { originalName: archive.originalName, documentType: 'OTHER', nameConfirmed: true, remarks }, 'viewer');
    expect(db.businessImage.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ remarks: expected }) }));
    expect(db.businessOperationLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ details: expect.objectContaining({ beforeRemarks: '原备注', remarks: expected || '' }) }) }));
  });
  it('旧客户端未传备注时保留原值', async () => {
    db.attachment.findUnique.mockResolvedValue(archive as any);
    (db.$transaction as jest.Mock).mockImplementation(async callback => callback(db));
    await service.update('image', { originalName: archive.originalName, documentType: 'OTHER', nameConfirmed: true }, 'viewer');
    expect((db.businessImage.update.mock.calls[0][0] as any).data).not.toHaveProperty('remarks');
  });
  it('已关联归档资料仍不允许绕过原单据锁定修改', async () => {
    db.attachment.findUnique.mockResolvedValue({ ...archive, contractId: 'contract' } as any);
    (db.$transaction as jest.Mock).mockImplementation(async callback => callback(db));
    await expect(service.update('image', { originalName: archive.originalName, documentType: 'OTHER', nameConfirmed: true, remarks: '修改' }, 'viewer')).rejects.toThrow('已关联文件');
    expect(db.businessImage.update).not.toHaveBeenCalled();
  });
  it('类型筛选覆盖物流结算、库存更正及现场车辆照片', () => {
    expect(JSON.stringify((service as any).typeFilter('SETTLEMENT_DOCUMENT'))).toContain('logisticsSettlementId');
    expect(JSON.stringify((service as any).typeFilter('WAREHOUSE_DOCUMENT'))).toContain('inventoryReversalId');
    expect(JSON.stringify((service as any).typeFilter('VEHICLE_PHOTO'))).toContain('VEHICLE_PLATE');
  });
});
