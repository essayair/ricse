import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalFlowService } from './approval-flow.service';

describe('ApprovalFlowService', () => {
  const prisma = mockDeep<PrismaService>();
  const service = new ApprovalFlowService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('审批节点可以绑定拥有合同审批权限的有效角色', async () => {
    prisma.approvalFlowNode.findUnique.mockResolvedValue({ id: 'node-1' } as any);
    prisma.role.findFirst.mockResolvedValue({
      id: 'role-business',
      code: 'BUSINESS_MANAGER',
      name: '业务主管',
      status: 'ACTIVE',
    } as any);
    prisma.approvalFlowNode.update.mockResolvedValue({
      id: 'node-1',
      roleId: 'role-business',
      approvalMode: 'ALL',
      scopeType: 'DEPARTMENT',
    } as any);

    await expect(service.updateNode('node-1', {
      roleId: 'role-business',
      approvalMode: 'ALL',
      scopeType: 'DEPARTMENT',
    })).resolves.toEqual(expect.objectContaining({ roleId: 'role-business' }));

    expect(prisma.role.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'role-business',
        status: 'ACTIVE',
        permissions: { some: { permission: { code: 'contract.approve' } } },
      },
    });
  });

  it('拒绝绑定没有合同审批权限的角色', async () => {
    prisma.approvalFlowNode.findUnique.mockResolvedValue({ id: 'node-1' } as any);
    prisma.role.findFirst.mockResolvedValue(null);

    await expect(service.updateNode('node-1', { roleId: 'role-user' }))
      .rejects.toThrow(BadRequestException);
    expect(prisma.approvalFlowNode.update).not.toHaveBeenCalled();
  });

  it('拒绝无效的审批方式和人员范围', async () => {
    prisma.approvalFlowNode.findUnique.mockResolvedValue({ id: 'node-1' } as any);

    await expect(service.updateNode('node-1', { approvalMode: 'UNKNOWN' }))
      .rejects.toThrow('审批方式仅支持会签或或签');
    await expect(service.updateNode('node-1', { scopeType: 'WAREHOUSE' }))
      .rejects.toThrow('人员范围仅支持合同部门、合同企业或全平台');
  });

  it('节点不存在时拒绝修改', async () => {
    prisma.approvalFlowNode.findUnique.mockResolvedValue(null);

    await expect(service.updateNode('missing', { enabled: false }))
      .rejects.toThrow(NotFoundException);
  });
});
