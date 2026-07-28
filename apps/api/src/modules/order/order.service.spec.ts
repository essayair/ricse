import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { OrderService } from './order.service';

describe('OrderService', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = {
    assertPermission: jest.fn().mockResolvedValue({}),
    getContractScope: jest.fn().mockResolvedValue({}),
    getOrderScope: jest.fn().mockResolvedValue({}),
  };
  let service: OrderService;

  const contract = {
    id: 'contract-1',
    type: 'PURCHASE',
    status: 'APPROVED',
    deletedAt: null,
    lineItems: [{
      id: 'line-1',
      materialId: 'material-1',
      materialName: '测试物料',
      quantity: 100,
      unit: 'TON',
      unitPrice: 500,
    }],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: accessControl },
      ],
    }).compile();
    service = module.get(OrderService);
    prisma.order.count.mockResolvedValue(0);
    prisma.orderLineItem.groupBy.mockResolvedValue([] as any);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
  });

  it('从已审批合同创建执行批次并将合同置为执行中', async () => {
    prisma.contract.findFirst.mockResolvedValue(contract as any);
    prisma.order.create.mockResolvedValue({ id: 'order-1', status: 'DRAFT' } as any);

    const result = await service.create({
      name: '7月第一批采购',
      contractId: contract.id,
      type: 'PURCHASE',
      lineItems: [{ contractLineItemId: 'line-1', quantity: 20 }],
    }, 'user-1');

    expect(result.id).toBe('order-1');
    expect(prisma.order.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: '7月第一批采购', totalAmount: 10000, type: 'PURCHASE' }),
    }));
    expect(prisma.contract.update).toHaveBeenCalledWith({
      where: { id: contract.id },
      data: { status: 'EXECUTING' },
    });
  });

  it('拒绝从未审批合同创建执行批次', async () => {
    prisma.contract.findFirst.mockResolvedValue({ ...contract, status: 'DRAFT' } as any);

    await expect(service.create({
      name: '未审批合同批次',
      contractId: contract.id,
      type: 'PURCHASE',
      lineItems: [{ contractLineItemId: 'line-1', quantity: 20 }],
    }, 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('累计数量不能超过合同数量', async () => {
    prisma.contract.findFirst.mockResolvedValue(contract as any);
    prisma.orderLineItem.groupBy.mockResolvedValue([{
      contractLineItemId: 'line-1',
      _sum: { quantity: 90 },
    }] as any);

    await expect(service.create({
      name: '超量批次',
      contractId: contract.id,
      type: 'PURCHASE',
      lineItems: [{ contractLineItemId: 'line-1', quantity: 20 }],
    }, 'user-1')).rejects.toThrow('剩余可执行数量 10');
  });

  it('执行批次名称不能为空', async () => {
    await expect(service.create({
      name: '   ',
      contractId: contract.id,
      type: 'PURCHASE',
      lineItems: [{ contractLineItemId: 'line-1', quantity: 20 }],
    }, 'user-1')).rejects.toThrow('请填写执行批次名称');
  });

  it('按草稿、确认、发运、完成顺序流转', async () => {
    prisma.order.findFirst
      .mockResolvedValueOnce({ id: 'order-1', status: 'DRAFT' } as any)
      .mockResolvedValueOnce({ id: 'order-1', status: 'CONFIRMED' } as any)
      .mockResolvedValueOnce({ id: 'order-1', status: 'DISPATCHED' } as any);
    prisma.order.update
      .mockResolvedValueOnce({ id: 'order-1', status: 'CONFIRMED' } as any)
      .mockResolvedValueOnce({ id: 'order-1', status: 'DISPATCHED' } as any)
      .mockResolvedValueOnce({ id: 'order-1', status: 'COMPLETED' } as any);

    await expect(service.updateStatus('order-1', 'CONFIRMED', 'user-1')).resolves.toMatchObject({ status: 'CONFIRMED' });
    await expect(service.updateStatus('order-1', 'DISPATCHED', 'user-1')).resolves.toMatchObject({ status: 'DISPATCHED' });
    await expect(service.updateStatus('order-1', 'COMPLETED', 'user-1')).resolves.toMatchObject({ status: 'COMPLETED' });
  });

  it('拒绝非法状态跳转', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'order-1', status: 'DRAFT' } as any);
    await expect(service.updateStatus('order-1', 'COMPLETED', 'user-1')).rejects.toThrow(BadRequestException);
  });
});
