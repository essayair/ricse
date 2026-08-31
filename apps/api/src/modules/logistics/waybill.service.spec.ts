import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { InventoryService } from '../inventory/inventory.service';
import { OutboundService } from '../inventory/outbound.service';
import { WaybillService } from './waybill.service';
import { QualityInspectionService } from '../quality/quality-inspection.service';
import { WeighTicketService } from '../weighbridge/weigh-ticket.service';

describe('WaybillService', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = {
    assertPermission: jest.fn().mockResolvedValue({}),
    getDispatchNoticeScope: jest.fn().mockResolvedValue({}),
    getWaybillScope: jest.fn().mockResolvedValue({}),
  };
  const inventoryService = {
    ensurePendingReceiptForWaybill: jest.fn().mockResolvedValue({ id: 'receipt-1' }),
  };
  const outboundService = {
    ensureReceiptForWaybill: jest.fn().mockResolvedValue({ id: 'outbound-receipt-1' }),
  };
  const qualityService = {
    ensureTaskForWaybill: jest.fn().mockResolvedValue({ id: 'quality-task-1' }),
  };
  const weighTicketService = {
    ensureTaskForWaybill: jest.fn().mockResolvedValue({ id: 'weigh-task-1' }),
    syncTaskForWaybill: jest.fn().mockResolvedValue({ id: 'weigh-task-1' }),
    voidTaskForWaybill: jest.fn().mockResolvedValue({ id: 'weigh-task-1' }),
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
        { provide: InventoryService, useValue: inventoryService },
        { provide: OutboundService, useValue: outboundService },
        { provide: QualityInspectionService, useValue: qualityService },
        { provide: WeighTicketService, useValue: weighTicketService },
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

  it('自有运力不能引用外协车辆', async () => {
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1', ownerType: 'OUTSOURCED', ownerId: 'carrier-1' } as any);
    await expect(service.create({
      dispatchNoticeId: notice.id,
      freightMode: 'SELF',
      vehicleId: 'vehicle-1',
      lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
    }, 'user-1')).rejects.toThrow('自有运力只能选择自有车辆');
  });

  it('自有运力不能引用外部物流服务商的司机', async () => {
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    prisma.driver.findFirst.mockResolvedValue({
      id: 'driver-1', name: '张师傅', phone: '13800138000',
      serviceOrganization: { partnerId: 'carrier-1', partner: { isInternal: false } },
    } as any);
    await expect(service.create({
      dispatchNoticeId: notice.id,
      freightMode: 'SELF',
      driverId: 'driver-1',
      lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
    }, 'user-1')).rejects.toThrow('自有运力只能选择内部物流服务商维护的司机');
  });

  it('改为手工填写车辆时清除原车辆主数据关联', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-1', status: 'PENDING', freightMode: 'SELF',
      vehicleId: 'vehicle-old', carrierPartnerId: null,
      plateNo: '甘A00001', driverName: '原司机', driverPhone: '13800000000',
      plannedDepartureAt: null, plannedArrivalAt: null,
    } as any);
    prisma.waybill.update.mockResolvedValue({ id: 'waybill-1' } as any);

    await service.assign('waybill-1', {
      vehicleId: null,
      plateNo: '甘A99999',
      driverName: '临时司机',
      driverPhone: '13900000000',
    }, 'user-1');

    expect(prisma.vehicle.findFirst).not.toHaveBeenCalled();
    expect(prisma.waybill.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        vehicleId: null,
        plateNo: '甘A99999',
        driverName: '临时司机',
        driverPhone: '13900000000',
      }),
    }));
  });

  it('委外运输缺少承运单位时不能确认发运', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-1', status: 'PENDING', freightMode: 'THIRD_PARTY',
      carrierName: null, plateNo: '甘A12345', driverName: '张师傅',
      dispatchNotice: { id: notice.id, status: 'ISSUED' },
    } as any);
    await expect(service.updateStatus('waybill-1', 'IN_TRANSIT', 'user-1')).rejects.toThrow('必须填写承运单位');
  });

  it('采购运单确认发运后自动生成入库作业单', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-purchase', status: 'PENDING', freightMode: 'SELF',
      plateNo: '甘A12345', driverName: '张师傅', outboundReceipts: [],
      dispatchNotice: { id: notice.id, type: 'PURCHASE', status: 'ISSUED' },
    } as any);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    prisma.waybill.update.mockResolvedValue({ id: 'waybill-purchase', status: 'IN_TRANSIT' } as any);

    await service.updateStatus('waybill-purchase', 'IN_TRANSIT', 'user-1');

    expect(inventoryService.ensurePendingReceiptForWaybill).toHaveBeenCalledWith('waybill-purchase', 'user-1');
  });

  it('采购运单确认到达时幂等补生成入库作业单', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-purchase', status: 'IN_TRANSIT', freightMode: 'SELF',
      plateNo: '甘A12345', driverName: '张师傅', outboundReceipts: [],
      dispatchNotice: { id: notice.id, type: 'PURCHASE', status: 'IN_PROGRESS' },
    } as any);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    prisma.waybill.update.mockResolvedValue({ id: 'waybill-purchase', status: 'ARRIVED' } as any);

    await service.updateStatus('waybill-purchase', 'ARRIVED', 'user-1');

    expect(inventoryService.ensurePendingReceiptForWaybill).toHaveBeenCalledWith('waybill-purchase', 'user-1');
    expect(qualityService.ensureTaskForWaybill).toHaveBeenCalledWith('waybill-purchase', 'user-1');
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

  it('取消未出库运单时同步取消自动生成的车次作业', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-sales',
      status: 'PENDING',
      outboundReceipts: [{ id: 'out-1', status: 'PENDING' }],
      dispatchNotice: { id: 'notice-sales', type: 'SALES', mode: 'STANDARD', status: 'ISSUED' },
    } as any);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    prisma.waybill.update.mockResolvedValue({ id: 'waybill-sales', status: 'CANCELLED' } as any);

    await service.updateStatus('waybill-sales', 'CANCELLED', 'user-1');

    expect(prisma.outboundReceipt.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['out-1'] } }, data: { status: 'CANCELLED' },
    });
  });
});
