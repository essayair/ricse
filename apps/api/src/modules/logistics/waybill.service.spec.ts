import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { WaybillService } from './waybill.service';

describe('WaybillService', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = {
    assertPermission: jest.fn().mockResolvedValue({}),
    getDispatchNoticeScope: jest.fn().mockResolvedValue({}),
    getWaybillScope: jest.fn().mockResolvedValue({}),
  };
  let service: WaybillService;
  const notice = {
    id: 'notice-1', noticeNo: 'PI-20260717-0001', status: 'ISSUED',
    originLocation: '起点', destinationLocation: '终点', warehouse: null,
    order: { id: 'order-1', contract: { id: 'contract-1' } },
    lineItems: [{ id: 'notice-line-1', materialId: 'm-1', materialName: '物料', quantity: 10, unit: 'TON' }],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WaybillService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: accessControl },
      ],
    }).compile();
    service = module.get(WaybillService);
    prisma.waybill.count.mockResolvedValue(0);
    prisma.waybillLineItem.groupBy.mockResolvedValue([] as any);
  });

  it('从已下达执行通知创建物流运单', async () => {
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    prisma.waybill.create.mockResolvedValue({ id: 'waybill-1', waybillNo: 'WB-20260717-0001' } as any);
    const result = await service.create({
      dispatchNoticeId: notice.id,
      lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
    }, 'user-1');
    expect(result.waybillNo).toBe('WB-20260717-0001');
    expect(prisma.waybill.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalQuantity: 5 }),
    }));
  });

  it('缺少车牌或司机时不能确认发运', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-1', status: 'PENDING', plateNo: null, driverName: null,
      dispatchNotice: { id: notice.id, status: 'ISSUED' },
    } as any);
    await expect(service.updateStatus('waybill-1', 'IN_TRANSIT', 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('预计到达时间不能早于计划发运时间', async () => {
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    await expect(service.create({
      dispatchNoticeId: notice.id,
      plannedDepartureAt: '2026-07-18T10:00:00.000Z',
      plannedArrivalAt: '2026-07-18T09:00:00.000Z',
      lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
    }, 'user-1')).rejects.toThrow('预计到达时间必须晚于计划发运时间');
  });

  it('委外运输缺少承运单位时不能确认发运', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-1', status: 'PENDING', freightMode: 'THIRD_PARTY',
      carrierName: null, plateNo: '甘A12345', driverName: '张师傅',
      dispatchNotice: { id: notice.id, status: 'ISSUED' },
    } as any);
    await expect(service.updateStatus('waybill-1', 'IN_TRANSIT', 'user-1')).rejects.toThrow('必须填写承运单位');
  });

  it('确认签收前必须上传物流收货附件', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-1', status: 'ARRIVED', attachments: [],
      dispatchNotice: { id: notice.id, status: 'IN_PROGRESS' },
    } as any);
    await expect(service.updateStatus('waybill-1', 'SIGNED', 'user-1'))
      .rejects.toThrow('确认签收前必须上传至少一份物流收货附件');
  });

  it('销售常规出库未扣减库存时不能确认发运', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-sales',
      status: 'PENDING',
      freightMode: 'SELF',
      plateNo: '甘A12345',
      driverName: '张师傅',
      outboundReceipts: [{ id: 'out-1', status: 'DEPARTURE_CONFIRMED' }],
      dispatchNotice: { id: 'notice-sales', type: 'SALES', mode: 'STANDARD', status: 'ISSUED' },
    } as any);

    await expect(service.updateStatus('waybill-sales', 'IN_TRANSIT', 'user-1'))
      .rejects.toThrow('必须先完成物流出库和库存扣减');
  });

  it('已有有效物流出库单时不能取消运单', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-sales',
      status: 'PENDING',
      outboundReceipts: [{ id: 'out-1', status: 'DRAFT' }],
      dispatchNotice: { id: 'notice-sales', type: 'SALES', mode: 'STANDARD', status: 'ISSUED' },
    } as any);

    await expect(service.updateStatus('waybill-sales', 'CANCELLED', 'user-1'))
      .rejects.toThrow('已有有效物流出库单');
  });
});
