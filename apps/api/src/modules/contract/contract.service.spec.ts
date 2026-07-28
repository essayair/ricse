import { Test, TestingModule } from '@nestjs/testing';
import { ContractService } from './contract.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep } from 'jest-mock-extended';
import { AccessControlService } from '../access-control/access-control.service';

describe('ContractService', () => {
  let service: ContractService;
  let prisma: ReturnType<typeof mockDeep<PrismaService>>;
  let accessControl: ReturnType<typeof mockDeep<AccessControlService>>;

  const mockContract = {
    id: 'test-id',
    contractNo: 'PO-000001',
    title: '测试合同',
    type: 'PURCHASE',
    status: 'DRAFT',
    supplierId: 'sup-1',
    totalAmount: '100000',
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockInclude = {
    lineItems: true,
    creator: { select: { id: true, name: true, username: true } },
    approvals: { include: { assignee: { select: { id: true, name: true } } } },
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    accessControl = mockDeep<AccessControlService>();
    accessControl.assertPermission.mockImplementation(async (userId) => ({
      isAdmin: userId === 'user-1',
      isExternal: false,
      externalPartnerId: null,
      permissions: [],
      roleCodes: userId === 'user-1' ? ['ADMIN'] : ['USER'],
      assignments: [],
      user: {},
    } as any));
    accessControl.getContractScope.mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (tx: PrismaService) => unknown) => callback(prisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: accessControl },
      ],
    }).compile();

    service = module.get<ContractService>(ContractService);
  });

  describe('create', () => {
    it('应该创建合同并生成编号', async () => {
      prisma.partner.findFirst.mockResolvedValue({ roles: ['CUSTOMER'] } as any);
      prisma.contract.count.mockResolvedValue(0);
      prisma.contract.create.mockResolvedValue(mockContract as any);

      const result = await service.create(
        { title: '测试合同', type: 'PURCHASE', signingPartnerId: 'internal-1', sellerId: 'sup-1', totalAmount: 100000, lineItems: [] },
        'user-1',
      );

      expect(result).toBeDefined();
      expect(prisma.contract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contractNo: expect.stringMatching(/^CG\d{12}$/),
            title: '测试合同',
          }),
        }),
      );
    });

    it('相同客户端请求标识重复提交时返回原草稿', async () => {
      prisma.contract.findFirst.mockResolvedValue(mockContract as any);

      const result = await service.create(
        {
          clientRequestId: 'request-1',
          title: '测试合同',
          type: 'PURCHASE',
          signingPartnerId: 'internal-1',
          sellerId: 'sup-1',
          totalAmount: 100000,
          lineItems: [],
        },
        'user-1',
      );

      expect(result.id).toBe('test-id');
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('应该返回分页结果', async () => {
      prisma.contract.findMany.mockResolvedValue([mockContract] as any);
      prisma.contract.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result.items).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });

    it('按执行批次状态汇总待执行、执行中和已执行的数量金额', async () => {
      prisma.contract.findMany.mockResolvedValue([{
        ...mockContract,
        type: 'PURCHASE',
        totalAmount: '100000',
        lineItems: [{ quantity: '100', unit: 'TON' }],
        orders: [
          { type: 'PURCHASE', status: 'DISPATCHED', totalAmount: '30000', lineItems: [{ quantity: '30', unit: 'TON' }] },
          { type: 'PURCHASE', status: 'COMPLETED', totalAmount: '20000', lineItems: [{ quantity: '20', unit: 'TON' }] },
          { type: 'PURCHASE', status: 'CANCELLED', totalAmount: '10000', lineItems: [{ quantity: '10', unit: 'TON' }] },
        ],
      }] as any);
      prisma.contract.count.mockResolvedValue(1);

      const result = await service.findAll({});
      const summary = result.items[0].fulfillment.directions[0];

      expect(summary.pendingQuantity).toEqual([{ unit: 'TON', quantity: 50 }]);
      expect(summary.pendingAmount).toBe(50000);
      expect(summary.executingQuantity).toEqual([{ unit: 'TON', quantity: 30 }]);
      expect(summary.executingAmount).toBe(30000);
      expect(summary.executedQuantity).toEqual([{ unit: 'TON', quantity: 20 }]);
      expect(summary.executedAmount).toBe(20000);
    });

    it('外部企业合同列表应用企业参与方数据范围', async () => {
      const externalScope = {
        OR: [
          { sellerId: 'partner-external' },
          { buyerId: 'partner-external' },
          { signingPartnerId: 'partner-external' },
        ],
      };
      accessControl.getContractScope.mockResolvedValue(externalScope);
      prisma.contract.findMany.mockResolvedValue([]);
      prisma.contract.count.mockResolvedValue(0);

      await service.findAll({}, 'external-user');

      expect(prisma.contract.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([externalScope]),
        }),
      }));
    });
  });

  describe('findOne', () => {
    it('存在时返回合同', async () => {
      prisma.contract.findFirst.mockResolvedValue(mockContract as any);

      const result = await service.findOne('test-id');
      expect(result.title).toBe('测试合同');
    });

    it('不存在时抛出 NotFoundException', async () => {
      prisma.contract.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getApprovalReadiness', () => {
    it('审批流程和审批人有效时返回可提交', async () => {
      prisma.contract.findFirst.mockResolvedValue({
        ...mockContract,
        status: 'DRAFT',
        type: 'PURCHASE',
        totalAmount: '100000',
      } as any);
      prisma.approvalFlow.findUnique.mockResolvedValue({
        id: 'flow-1',
        name: '采购合同审批流',
        status: 'ACTIVE',
        amountThreshold: 1000000,
        nodes: [{
          id: 'node-1',
          nodeName: '业务主管',
          step: 1,
          assigneeId: 'approver-1',
          condition: 'ALWAYS',
          assignee: {
            id: 'approver-1',
            name: '业务主管',
            username: 'business_manager',
            role: 'APPROVER',
            status: 'ACTIVE',
          },
        }],
      } as any);

      await expect(service.getApprovalReadiness('test-id')).resolves.toEqual(
        expect.objectContaining({ ready: true, flowId: 'flow-1', nodeCount: 1 }),
      );
    });

    it('节点审批人停用时拒绝提交', async () => {
      prisma.contract.findFirst.mockResolvedValue({
        ...mockContract,
        status: 'DRAFT',
        type: 'PURCHASE',
        totalAmount: '100000',
      } as any);
      prisma.approvalFlow.findUnique.mockResolvedValue({
        id: 'flow-1',
        name: '采购合同审批流',
        status: 'ACTIVE',
        amountThreshold: null,
        nodes: [{
          id: 'node-1',
          nodeName: '业务主管',
          step: 1,
          assigneeId: 'approver-1',
          condition: 'ALWAYS',
          assignee: {
            id: 'approver-1',
            name: '业务主管',
            username: 'business_manager',
            role: 'APPROVER',
            status: 'DISABLED',
          },
        }],
      } as any);

      await expect(service.getApprovalReadiness('test-id'))
        .rejects.toThrow('审批流程存在无效审批人：业务主管');
    });
  });

  describe('状态机 — validateTransition', () => {
    const adminUser = { id: 'user-1', role: 'ADMIN' };

    const setupContract = async (status: string) => {
      prisma.contract.findFirst.mockResolvedValue({ ...mockContract, status } as any);
      prisma.contract.findUnique.mockResolvedValue({ ...mockContract, status } as any);
      prisma.contract.updateMany.mockResolvedValue({ count: 1 } as any);
      prisma.approval.updateMany.mockResolvedValue({ count: 1 } as any);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'business-user', username: 'business_manager' },
        { id: 'risk-user', username: 'risk_manager' },
        { id: 'general-user', username: 'general_manager' },
      ]);
      prisma.approval.aggregate.mockResolvedValue({ _max: { round: null } } as any);
      prisma.approval.createMany.mockResolvedValue({ count: 0 } as any);
      prisma.approvalFlow.findUnique.mockResolvedValue({
        id: 'flow-1', contractType: 'PURCHASE', status: 'ACTIVE', amountThreshold: 1_000_000,
        nodes: [
          {
            id: 'node-1',
            nodeName: '业务主管',
            step: 1,
            assigneeId: 'business-user',
            condition: 'ALWAYS',
            enabled: true,
            assignee: { id: 'business-user', name: '业务主管', username: 'business_manager', role: 'APPROVER', status: 'ACTIVE' },
          },
          {
            id: 'node-2',
            nodeName: '风控经理',
            step: 2,
            assigneeId: 'risk-user',
            condition: 'ALWAYS',
            enabled: true,
            assignee: { id: 'risk-user', name: '风控经理', username: 'risk_manager', role: 'APPROVER', status: 'ACTIVE' },
          },
        ],
      } as any);
    };

    // 合法路径
    it('DRAFT → PENDING_APPROVAL', async () => {
      await setupContract('DRAFT');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'PENDING_APPROVAL' } as any);

      const result = await service.updateStatus('test-id', { status: 'PENDING_APPROVAL' }, adminUser);
      expect(result).toBeDefined();
    });

    it('DRAFT → VOIDED', async () => {
      await setupContract('DRAFT');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'VOIDED' } as any);
      await expect(service.updateStatus('test-id', { status: 'VOIDED' }, adminUser)).resolves.toBeDefined();
    });

    it('普通业务用户可以作废草稿合同', async () => {
      await setupContract('DRAFT');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'VOIDED' } as any);
      await expect(service.updateStatus(
        'test-id',
        { status: 'VOIDED' },
        { id: 'user-2', role: 'USER' },
      )).resolves.toBeDefined();
    });

    it('待审批合同作废时取消未处理审批任务', async () => {
      await setupContract('PENDING_APPROVAL');
      prisma.approval.updateMany.mockResolvedValue({ count: 2 } as any);
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'VOIDED' } as any);

      await expect(service.updateStatus(
        'test-id',
        { status: 'VOIDED' },
        { id: 'user-2', role: 'SALESPERSON' },
      )).resolves.toBeDefined();
      expect(prisma.approval.updateMany).toHaveBeenCalledWith({
        where: { contractId: 'test-id', status: { in: ['PENDING', 'WAITING'] } },
        data: { status: 'CANCELLED' },
      });
    });

    it('PENDING_APPROVAL → APPROVED', async () => {
      await setupContract('PENDING_APPROVAL');
      prisma.approval.findFirst
        .mockResolvedValueOnce({ id: 'approval-1', contractId: 'test-id', assigneeId: 'user-1', status: 'PENDING', round: 1, step: 1 } as any)
        .mockResolvedValueOnce(null);
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'APPROVED' } as any);
      await expect(service.updateStatus('test-id', { status: 'APPROVED', comment: 'approved' }, adminUser)).resolves.toBeDefined();
    });

    it('系统管理员可以代为处理任意当前审批节点', async () => {
      await setupContract('PENDING_APPROVAL');
      prisma.approval.findFirst
        .mockResolvedValueOnce({ id: 'approval-1', contractId: 'test-id', assigneeId: 'other-user', status: 'PENDING', round: 1, step: 1 } as any)
        .mockResolvedValueOnce(null);
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'APPROVED' } as any);

      await expect(service.updateStatus(
        'test-id',
        { status: 'APPROVED', comment: '管理员代审批' },
        adminUser,
      )).resolves.toBeDefined();
      expect(prisma.approval.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ actedById: adminUser.id }),
      }));
    });

    it('普通审批员不能处理分配给他人的节点', async () => {
      await setupContract('PENDING_APPROVAL');
      prisma.approval.findFirst.mockResolvedValueOnce({
        id: 'approval-1',
        contractId: 'test-id',
        assigneeId: 'other-user',
        status: 'PENDING',
        round: 1,
        step: 1,
      } as any);

      await expect(service.updateStatus(
        'test-id',
        { status: 'APPROVED', comment: '越权审批' },
        { id: 'approver-user', role: 'APPROVER' },
      )).rejects.toThrow(ForbiddenException);
    });

    it('PENDING_APPROVAL → REJECTED', async () => {
      await setupContract('PENDING_APPROVAL');
      prisma.approval.findFirst.mockResolvedValueOnce({ id: 'approval-1', contractId: 'test-id', assigneeId: 'user-1', status: 'PENDING', round: 1, step: 1 } as any);
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'REJECTED' } as any);
      await expect(service.updateStatus('test-id', { status: 'REJECTED', comment: 'rejected' }, adminUser)).resolves.toBeDefined();
    });

    it('REJECTED → DRAFT', async () => {
      await setupContract('REJECTED');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'DRAFT' } as any);
      await expect(service.updateStatus('test-id', { status: 'DRAFT' }, adminUser)).resolves.toBeDefined();
    });

    it('APPROVED → EXECUTING', async () => {
      await setupContract('APPROVED');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'EXECUTING' } as any);
      await expect(service.updateStatus('test-id', { status: 'EXECUTING' }, adminUser)).resolves.toBeDefined();
    });

    it('EXECUTING → COMPLETED', async () => {
      await setupContract('EXECUTING');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'COMPLETED' } as any);
      await expect(service.updateStatus('test-id', { status: 'COMPLETED' }, adminUser)).resolves.toBeDefined();
    });

    it('EXECUTING → VOIDED', async () => {
      await setupContract('EXECUTING');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'VOIDED' } as any);
      await expect(service.updateStatus('test-id', { status: 'VOIDED' }, adminUser)).resolves.toBeDefined();
    });

    // 非法路径
    it('DRAFT → COMPLETED 应拒绝', async () => {
      await setupContract('DRAFT');
      await expect(service.updateStatus('test-id', { status: 'COMPLETED' }, adminUser)).rejects.toThrow(BadRequestException);
    });

    it('DRAFT → APPROVED 应拒绝', async () => {
      await setupContract('DRAFT');
      await expect(service.updateStatus('test-id', { status: 'APPROVED', comment: 'x' }, adminUser)).rejects.toThrow(BadRequestException);
    });

    it('DRAFT → EXECUTING 应拒绝', async () => {
      await setupContract('DRAFT');
      await expect(service.updateStatus('test-id', { status: 'EXECUTING' }, adminUser)).rejects.toThrow(BadRequestException);
    });

    it('合同创建人可以撤回待审批合同', async () => {
      await setupContract('PENDING_APPROVAL');
      await expect(service.updateStatus('test-id', { status: 'DRAFT' }, adminUser)).resolves.toBeDefined();
      expect(prisma.approval.updateMany).toHaveBeenCalledWith({
        where: { contractId: 'test-id', status: { in: ['PENDING', 'WAITING'] } },
        data: { status: 'CANCELLED' },
      });
    });

    it('非创建人不能撤回他人的待审批合同', async () => {
      await setupContract('PENDING_APPROVAL');
      await expect(service.updateStatus(
        'test-id',
        { status: 'DRAFT' },
        { id: 'other-user', role: 'SALESPERSON' },
      )).rejects.toThrow(ForbiddenException);
    });

    it('PENDING_APPROVAL → EXECUTING 应拒绝', async () => {
      await setupContract('PENDING_APPROVAL');
      await expect(service.updateStatus('test-id', { status: 'EXECUTING' }, adminUser)).rejects.toThrow(BadRequestException);
    });

    it('PENDING_APPROVAL → COMPLETED 应拒绝', async () => {
      await setupContract('PENDING_APPROVAL');
      await expect(service.updateStatus('test-id', { status: 'COMPLETED' }, adminUser)).rejects.toThrow(BadRequestException);
    });

    it('COMPLETED 不再接受任何变更', async () => {
      await setupContract('COMPLETED');
      await expect(service.updateStatus('test-id', { status: 'DRAFT' }, adminUser)).rejects.toThrow(BadRequestException);
      await expect(service.updateStatus('test-id', { status: 'VOIDED' }, adminUser)).rejects.toThrow(BadRequestException);
    });

    it('VOIDED 不再接受任何变更', async () => {
      await setupContract('VOIDED');
      await expect(service.updateStatus('test-id', { status: 'DRAFT' }, adminUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('仅管理员可以删除合同', async () => {
      await expect(service.remove(
        'test-id',
        { id: 'user-2', role: 'SALESPERSON' },
      )).rejects.toThrow(ForbiddenException);
      expect(prisma.contract.findUnique).not.toHaveBeenCalled();
    });

    it('管理员不能直接删除未作废合同', async () => {
      prisma.contract.findFirst.mockResolvedValue({ ...mockContract, status: 'DRAFT' } as any);

      await expect(service.remove('test-id', { id: 'user-1', role: 'ADMIN' }))
        .rejects.toThrow('合同必须先作废，才能删除');
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    it('管理员可以软删除已作废合同', async () => {
      prisma.contract.findFirst.mockResolvedValue({ ...mockContract, status: 'VOIDED' } as any);
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'VOIDED', deletedAt: new Date() } as any);

      await expect(service.remove('test-id', { id: 'user-1', role: 'ADMIN' })).resolves.toBeDefined();
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
