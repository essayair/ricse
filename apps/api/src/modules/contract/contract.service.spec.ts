import { Test, TestingModule } from '@nestjs/testing';
import { ContractService } from './contract.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mockDeep } from 'jest-mock-extended';

describe('ContractService', () => {
  let service: ContractService;
  let prisma: ReturnType<typeof mockDeep<PrismaService>>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ContractService>(ContractService);
  });

  describe('create', () => {
    it('应该创建合同并生成编号', async () => {
      prisma.contract.count.mockResolvedValue(0);
      prisma.contract.create.mockResolvedValue(mockContract as any);

      const result = await service.create(
        { title: '测试合同', type: 'PURCHASE', sellerId: 'sup-1', totalAmount: 100000, lineItems: [] },
        'user-1',
      );

      expect(result).toBeDefined();
      expect(prisma.contract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contractNo: 'PO-000001',
            title: '测试合同',
          }),
        }),
      );
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
  });

  describe('findOne', () => {
    it('存在时返回合同', async () => {
      prisma.contract.findUnique.mockResolvedValue(mockContract as any);

      const result = await service.findOne('test-id');
      expect(result.title).toBe('测试合同');
    });

    it('不存在时抛出 NotFoundException', async () => {
      prisma.contract.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('状态机 — validateTransition', () => {
    const setupContract = async (status: string) => {
      prisma.contract.findUnique.mockResolvedValue({ ...mockContract, status } as any);
    };

    // 合法路径
    it('DRAFT → PENDING_APPROVAL', async () => {
      await setupContract('DRAFT');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'PENDING_APPROVAL' } as any);

      const result = await service.updateStatus('test-id', { status: 'PENDING_APPROVAL' });
      expect(result).toBeDefined();
    });

    it('DRAFT → VOIDED', async () => {
      await setupContract('DRAFT');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'VOIDED' } as any);
      await expect(service.updateStatus('test-id', { status: 'VOIDED' })).resolves.toBeDefined();
    });

    it('PENDING_APPROVAL → APPROVED', async () => {
      await setupContract('PENDING_APPROVAL');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'APPROVED' } as any);
      await expect(service.updateStatus('test-id', { status: 'APPROVED' })).resolves.toBeDefined();
    });

    it('PENDING_APPROVAL → REJECTED', async () => {
      await setupContract('PENDING_APPROVAL');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'REJECTED' } as any);
      await expect(service.updateStatus('test-id', { status: 'REJECTED' })).resolves.toBeDefined();
    });

    it('REJECTED → DRAFT', async () => {
      await setupContract('REJECTED');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'DRAFT' } as any);
      await expect(service.updateStatus('test-id', { status: 'DRAFT' })).resolves.toBeDefined();
    });

    it('APPROVED → EXECUTING', async () => {
      await setupContract('APPROVED');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'EXECUTING' } as any);
      await expect(service.updateStatus('test-id', { status: 'EXECUTING' })).resolves.toBeDefined();
    });

    it('EXECUTING → COMPLETED', async () => {
      await setupContract('EXECUTING');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'COMPLETED' } as any);
      await expect(service.updateStatus('test-id', { status: 'COMPLETED' })).resolves.toBeDefined();
    });

    it('EXECUTING → VOIDED', async () => {
      await setupContract('EXECUTING');
      prisma.contract.update.mockResolvedValue({ ...mockContract, status: 'VOIDED' } as any);
      await expect(service.updateStatus('test-id', { status: 'VOIDED' })).resolves.toBeDefined();
    });

    // 非法路径
    it('DRAFT → COMPLETED 应拒绝', async () => {
      await setupContract('DRAFT');
      await expect(service.updateStatus('test-id', { status: 'COMPLETED' })).rejects.toThrow(BadRequestException);
    });

    it('DRAFT → APPROVED 应拒绝', async () => {
      await setupContract('DRAFT');
      await expect(service.updateStatus('test-id', { status: 'APPROVED' })).rejects.toThrow(BadRequestException);
    });

    it('DRAFT → EXECUTING 应拒绝', async () => {
      await setupContract('DRAFT');
      await expect(service.updateStatus('test-id', { status: 'EXECUTING' })).rejects.toThrow(BadRequestException);
    });

    it('PENDING_APPROVAL → DRAFT 应拒绝', async () => {
      await setupContract('PENDING_APPROVAL');
      await expect(service.updateStatus('test-id', { status: 'DRAFT' })).rejects.toThrow(BadRequestException);
    });

    it('PENDING_APPROVAL → EXECUTING 应拒绝', async () => {
      await setupContract('PENDING_APPROVAL');
      await expect(service.updateStatus('test-id', { status: 'EXECUTING' })).rejects.toThrow(BadRequestException);
    });

    it('PENDING_APPROVAL → COMPLETED 应拒绝', async () => {
      await setupContract('PENDING_APPROVAL');
      await expect(service.updateStatus('test-id', { status: 'COMPLETED' })).rejects.toThrow(BadRequestException);
    });

    it('COMPLETED 不再接受任何变更', async () => {
      await setupContract('COMPLETED');
      await expect(service.updateStatus('test-id', { status: 'DRAFT' })).rejects.toThrow(BadRequestException);
      await expect(service.updateStatus('test-id', { status: 'VOIDED' })).rejects.toThrow(BadRequestException);
    });

    it('VOIDED 不再接受任何变更', async () => {
      await setupContract('VOIDED');
      await expect(service.updateStatus('test-id', { status: 'DRAFT' })).rejects.toThrow(BadRequestException);
    });
  });
});
