import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { OutboundService } from '../inventory/outbound.service';
import { DispatchNoticeService } from './dispatch-notice.service';

describe('DispatchNoticeService', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = {
    assertPermission: jest.fn().mockResolvedValue({}),
    getOrderScope: jest.fn().mockResolvedValue({}),
    getDispatchNoticeScope: jest.fn().mockResolvedValue({}),
  };
  let service: DispatchNoticeService;
  const outboundService = { ensureOrderForNotice: jest.fn().mockResolvedValue({ id: 'outbound-order-1' }) };
  const order = {
    id: 'order-1', orderNo: 'PC-001', type: 'PURCHASE', status: 'CONFIRMED',
    deliveryLocation: '目的地',
    contract: { id: 'contract-1' },
    lineItems: [{ id: 'line-1', materialId: 'm-1', materialName: '物料', quantity: 10, unit: 'TON' }],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DispatchNoticeService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: accessControl },
        { provide: OutboundService, useValue: outboundService },
      ],
    }).compile();
    service = module.get(DispatchNoticeService);
    prisma.dispatchNotice.count.mockResolvedValue(0);
    prisma.dispatchNoticeLineItem.groupBy.mockResolvedValue([] as any);
  });

  it('从已确认采购执行批次创建供应商发货指令', async () => {
    prisma.order.findFirst.mockResolvedValue(order as any);
    prisma.dispatchNotice.create.mockResolvedValue({ id: 'notice-1', noticeNo: 'PI-20260717-0001' } as any);
    const result = await service.create({
      orderId: order.id,
      lineItems: [{ orderLineItemId: 'line-1', quantity: 3 }],
    }, 'user-1');
    expect(result.noticeNo).toBe('PI-20260717-0001');
    expect(prisma.dispatchNotice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'PURCHASE', totalQuantity: 3 }),
    }));
  });

  it('销售常规出库未选仓库时拒绝创建', async () => {
    prisma.order.findFirst.mockResolvedValue({ ...order, type: 'SALES' } as any);
    await expect(service.create({
      orderId: order.id,
      mode: 'STANDARD',
      lineItems: [{ orderLineItemId: 'line-1', quantity: 3 }],
    }, 'user-1')).rejects.toThrow(BadRequestException);
  });
});
