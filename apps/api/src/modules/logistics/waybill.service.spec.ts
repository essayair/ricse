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
    ensurePrimaryTicketForWaybill: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
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
    prisma.$queryRaw.mockResolvedValue([] as any);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    prisma.waybillLineItem.groupBy.mockResolvedValue([] as any);
  });

  it('从已下达执行通知创建物流运单', async () => {
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    prisma.waybill.create.mockResolvedValue({ id: 'waybill-1', waybillNo: 'WB-20260717-0001' } as any);
    const result = await service.create({
      dispatchNoticeId: notice.id,
      plateNo: ' 甘a00001 ', driverName: ' 张三 ', driverPhone: ' 13800000001 ',
      lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
    }, 'user-1');
    expect(result.waybillNo).toBe('WB-20260717-0001');
    expect(prisma.waybill.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalQuantity: 5, status: 'PENDING', plateNo: '甘A00001', driverName: '张三', driverPhone: '13800000001' }),
    }));
  });

  it('单车建单未填写计划数量时保留物料关联且不阻止创建', async () => {
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    prisma.waybill.create.mockResolvedValue({ id: 'waybill-1', waybillNo: 'WB-1' } as any);
    await service.create({
      dispatchNoticeId: notice.id, plateNo: '甘A00001', driverName: '张三', driverPhone: '13800000001',
    }, 'user-1');
    expect(prisma.waybill.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        totalQuantity: 0,
        lineItems: { create: [expect.objectContaining({ dispatchNoticeLineItemId: 'notice-line-1', materialId: 'm-1', quantity: 0 })] },
      }),
    }));
  });

  it.each([
    ['车牌', { plateNo: ' ', driverName: '张三', driverPhone: '13800000001' }, '填写车牌号'],
    ['司机', { plateNo: '甘A00001', driverName: ' ', driverPhone: '13800000001' }, '填写司机姓名'],
    ['电话', { plateNo: '甘A00001', driverName: '张三', driverPhone: ' ' }, '司机联系电话'],
  ])('单车接口缺少%s时拒绝创建空运单', async (_label, fields, message) => {
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    await expect(service.create({
      dispatchNoticeId: notice.id, ...(fields as object),
      lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
    }, 'user-1')).rejects.toThrow(message as string);
    expect(prisma.waybill.create).not.toHaveBeenCalled();
    expect(weighTicketService.ensureTaskForWaybill).not.toHaveBeenCalled();
  });

  it.each([
    ['车牌', { plateNo: ' ', driverName: '张三', driverPhone: '13800000001' }],
    ['司机', { plateNo: '甘A00001', driverName: ' ', driverPhone: '13800000001' }],
    ['电话', { plateNo: '甘A00001', driverName: '张三', driverPhone: ' ' }],
  ])('统一建单缺少%s时整批不创建', async (_label, fields) => {
    prisma.waybill.findMany.mockResolvedValue([]);
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    await expect(service.createBatch({
      dispatchNoticeId: notice.id, batchRequestId: '123e4567-e89b-42d3-a456-426614174000',
      items: [{ clientRowId: '123e4567-e89b-42d3-a456-426614174001', ...(fields as object),
        lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
      }],
    }, 'user-1')).rejects.toThrow(BadRequestException);
    expect(prisma.waybill.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('统一建单只填写一行也创建一张待发运运单', async () => {
    prisma.waybill.findMany.mockResolvedValue([]);
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    prisma.waybill.create.mockResolvedValue({
      id: 'single-row', status: 'PENDING', plateNo: '甘A00001', dispatchNotice: { type: 'PURCHASE' },
    } as any);
    const result = await service.createBatch({
      dispatchNoticeId: notice.id, batchRequestId: '123e4567-e89b-42d3-a456-426614174000',
      items: [{ clientRowId: '123e4567-e89b-42d3-a456-426614174001',
        plateNo: '甘A00001', driverName: '张三', driverPhone: '13800000001',
        lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
      }],
    }, 'user-1');
    expect(result.createdCount).toBe(1);
    expect(prisma.waybill.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }));
  });

  it('批量派车按每行生成独立物流运单', async () => {
    prisma.waybill.findMany.mockResolvedValue([]);
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    prisma.$queryRaw.mockResolvedValue([] as any);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    prisma.waybill.create
      .mockResolvedValueOnce({
        id: 'waybill-1', waybillNo: 'WB-20260717-0001', dispatchNoticeId: notice.id,
        createdBy: 'user-1', vehicleId: null, plateNo: '甘A00001', dispatchNotice: { type: 'PURCHASE', mode: 'STANDARD' },
      } as any)
      .mockResolvedValueOnce({
        id: 'waybill-2', waybillNo: 'WB-20260717-0002', dispatchNoticeId: notice.id,
        createdBy: 'user-1', vehicleId: null, plateNo: '甘A00002', dispatchNotice: { type: 'PURCHASE', mode: 'STANDARD' },
      } as any);

    const result = await service.createBatch({
      dispatchNoticeId: notice.id,
      batchRequestId: '123e4567-e89b-42d3-a456-426614174000',
      items: [
        {
          clientRowId: '123e4567-e89b-42d3-a456-426614174001', plateNo: '甘a00001',
          driverName: '张三', driverPhone: '13800000001',
          lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 4 }],
        },
        {
          clientRowId: '123e4567-e89b-42d3-a456-426614174002', plateNo: '甘a00002',
          driverName: '李四', driverPhone: '13800000002',
          lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
        },
      ],
    }, 'user-1');

    expect(result.createdCount).toBe(2);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.waybill.create).toHaveBeenCalledTimes(2);
    expect(prisma.waybill.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        creationBatchId: '123e4567-e89b-42d3-a456-426614174000',
        creationRowId: '123e4567-e89b-42d3-a456-426614174001',
        plateNo: '甘A00001', totalQuantity: 4,
      }),
    }));
    expect(weighTicketService.ensureTaskForWaybill).toHaveBeenCalledTimes(2);
  });

  it('批量派车计划参考数量超过通知剩余量时提示但仍创建', async () => {
    prisma.waybill.findMany.mockResolvedValue([]);
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    prisma.waybill.create.mockResolvedValue({ id: 'waybill-1', plateNo: '甘A00001', dispatchNotice: { type: 'PURCHASE' } } as any);

    const result = await service.createBatch({
      dispatchNoticeId: notice.id,
      batchRequestId: '123e4567-e89b-42d3-a456-426614174000',
      items: [
        {
          clientRowId: '123e4567-e89b-42d3-a456-426614174001', plateNo: '甘A00001',
          driverName: '张三', driverPhone: '13800000001',
          lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 6 }],
        },
        {
          clientRowId: '123e4567-e89b-42d3-a456-426614174002', plateNo: '甘A00002',
          driverName: '李四', driverPhone: '13800000002',
          lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
        },
      ],
    }, 'user-1');

    expect(result.createdCount).toBe(2);
    expect(result.warnings.join(' ')).toContain('超过通知剩余参考数量');
    expect(prisma.waybill.create).toHaveBeenCalledTimes(2);
  });

  it('批量派车所有车辆均未填写计划数量时照常创建', async () => {
    prisma.waybill.findMany.mockResolvedValue([]);
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    prisma.waybill.create.mockResolvedValue({ id: 'waybill-1', plateNo: '甘A00001', dispatchNotice: { type: 'PURCHASE' } } as any);
    const result = await service.createBatch({
      dispatchNoticeId: notice.id,
      batchRequestId: '123e4567-e89b-42d3-a456-426614174000',
      items: [{ clientRowId: '123e4567-e89b-42d3-a456-426614174001', plateNo: '甘A00001', driverName: '张三', driverPhone: '13800000001' }],
    }, 'user-1');
    expect(result.createdCount).toBe(1);
    expect(prisma.waybill.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalQuantity: 0, lineItems: { create: [expect.objectContaining({ materialId: 'm-1', quantity: 0 })] } }),
    }));
  });

  it('同一批量请求重复提交时返回原运单而不重复创建', async () => {
    prisma.waybill.findMany.mockResolvedValue([
      {
        id: 'waybill-1', dispatchNoticeId: notice.id, createdBy: 'user-1',
        vehicleId: null, plateNo: '甘A00001', dispatchNotice: { type: 'PURCHASE', mode: 'STANDARD' },
      },
    ] as any);

    const result = await service.createBatch({
      dispatchNoticeId: notice.id,
      batchRequestId: '123e4567-e89b-42d3-a456-426614174000',
      items: [{
        clientRowId: '123e4567-e89b-42d3-a456-426614174001', plateNo: '甘A00001',
        driverName: '张三', driverPhone: '13800000001',
        lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 4 }],
      }],
    }, 'user-1');

    expect(result.createdCount).toBe(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.waybill.create).not.toHaveBeenCalled();
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

  it('历史缺资料运单可补齐运输信息后继续处理', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'legacy', status: 'PENDING', freightMode: 'SOCIAL', vehicleId: null, driverId: null,
      carrierPartnerId: null, plateNo: null, driverName: null, driverPhone: null,
      plannedDepartureAt: null, plannedArrivalAt: null,
    } as any);
    prisma.waybill.update.mockResolvedValue({ id: 'legacy', status: 'PENDING', plateNo: '甘A00001' } as any);
    await service.assign('legacy', { plateNo: '甘a00001', driverName: '张三', driverPhone: '13800000001' }, 'user-1');
    expect(prisma.waybill.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      plateNo: '甘A00001', driverName: '张三', driverPhone: '13800000001', carrierPartnerId: null,
    }) }));
  });

  it('待发运修改不得清空车辆司机信息重新形成空运单', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'pending', status: 'PENDING', freightMode: 'SOCIAL', vehicleId: null, driverId: null,
      carrierPartnerId: null, plateNo: '甘A00001', driverName: '张三', driverPhone: '13800000001',
      plannedDepartureAt: null, plannedArrivalAt: null,
    } as any);
    await expect(service.assign('pending', { plateNo: ' ' }, 'user-1')).rejects.toThrow('请补齐车牌号、司机姓名和联系电话');
    expect(prisma.waybill.update).not.toHaveBeenCalled();
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
    expect(weighTicketService.ensurePrimaryTicketForWaybill).toHaveBeenCalledWith('waybill-purchase', 'user-1');
  });

  it('销售运单确定车辆后自动生成我方发货待过磅单', async () => {
    prisma.dispatchNotice.findFirst.mockResolvedValue({
      ...notice,
      type: 'SALES',
      mode: 'DIRECT',
    } as any);
    prisma.waybill.create.mockResolvedValue({
      id: 'waybill-sales', waybillNo: 'WB-20260717-0002',
      plateNo: '甘A12345', vehicleId: null,
      dispatchNotice: { type: 'SALES', mode: 'DIRECT' },
    } as any);

    await service.create({
      dispatchNoticeId: notice.id,
      plateNo: '甘A12345',
      driverName: '张师傅',
      driverPhone: '13800000000',
      lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
    }, 'user-1');

    expect(weighTicketService.ensureTaskForWaybill).toHaveBeenCalledWith('waybill-sales', 'user-1');
    expect(weighTicketService.ensurePrimaryTicketForWaybill).toHaveBeenCalledWith('waybill-sales', 'user-1');
  });

  it('确认签收前必须上传物流收货附件', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-1', status: 'ARRIVED', attachments: [],
      dispatchNotice: { id: notice.id, type: 'PURCHASE', status: 'IN_PROGRESS' },
    } as any);
    await expect(service.updateStatus('waybill-1', 'SIGNED', 'user-1'))
      .rejects.toThrow('确认收货前必须上传至少一份物流收货凭证');
  });

  it.each(['RECEIPT_DOCUMENT', 'RECEIPT_PHOTO', 'RECEIPT_OTHER', 'RECEIPT'])(
    '%s 分类附件均可满足确认签收校验',
    async (category) => {
      prisma.waybill.findFirst.mockResolvedValue({
        id: 'waybill-1', status: 'ARRIVED', attachments: [{ id: 'attachment-1', category }],
        outboundReceipts: [], dispatchNotice: { id: notice.id, type: 'PURCHASE', status: 'IN_PROGRESS' },
        weighTickets: [{ status: 'REVIEWED', netWeight: 10 }],
        weightSelections: [
          { purpose: 'INVENTORY', weighTicketId: 'ticket-1' },
          { purpose: 'SETTLEMENT', weighTicketId: 'ticket-1' },
        ],
      } as any);
      prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
      prisma.waybill.update.mockResolvedValue({ id: 'waybill-1', status: 'SIGNED' } as any);

      await expect(service.updateStatus('waybill-1', 'SIGNED', 'user-1')).resolves.toEqual(expect.objectContaining({ status: 'SIGNED' }));
    },
  );

  it('采购库存与结算执行磅单不一致时不允许确认签收', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: 'waybill-1', status: 'ARRIVED',
      attachments: [{ id: 'attachment-1', category: 'RECEIPT_DOCUMENT' }],
      outboundReceipts: [], dispatchNotice: { id: notice.id, type: 'PURCHASE', status: 'IN_PROGRESS' },
      weighTickets: [
        { id: 'ticket-1', status: 'REVIEWED', netWeight: 10 },
        { id: 'ticket-2', status: 'REVIEWED', netWeight: 9.8 },
      ],
      weightSelections: [
        { purpose: 'INVENTORY', weighTicketId: 'ticket-1' },
        { purpose: 'SETTLEMENT', weighTicketId: 'ticket-2' },
      ],
    } as any);

    await expect(service.updateStatus('waybill-1', 'SIGNED', 'user-1'))
      .rejects.toThrow('库存与结算执行磅单不一致，请先统一选择执行口径');
  });

  it('销售按我方出库、客户货款两种口径时允许确认客户签收', async () => {
    prisma.waybill.findFirst.mockResolvedValue({ id: 'waybill-1', status: 'ARRIVED', attachments: [{ category: 'RECEIPT_DOCUMENT' }], outboundReceipts: [{ status: 'POSTED' }],
      dispatchNotice: { id: notice.id, type: 'SALES', status: 'IN_PROGRESS' }, weighTickets: [{ status: 'REVIEWED', netWeight: 10 }],
      weightSelections: [{ purpose: 'INVENTORY', weighTicketId: 'shipping' }, { purpose: 'SETTLEMENT', weighTicketId: 'customer' }] } as any);
    prisma.$transaction.mockImplementation(async (f: any) => f(prisma));
    prisma.waybill.update.mockResolvedValue({ id: 'waybill-1', status: 'SIGNED' } as any);
    await expect(service.updateStatus('waybill-1', 'SIGNED', 'user-1')).resolves.toMatchObject({ status: 'SIGNED' });
  });

  it('新增物流收货附件必须使用明确分类', async () => {
    await expect(service.createAttachment({
      waybillId: 'waybill-1', fileName: 'file.pdf', originalName: '签收单.pdf',
      mimeType: 'application/pdf', size: 10, category: 'RECEIPT' as any,
    }, 'user-1')).rejects.toThrow('物流收货附件分类无效');
    expect(prisma.waybill.findFirst).not.toHaveBeenCalled();
  });

  it('按签收单分类保存物流收货附件', async () => {
    prisma.waybill.findFirst.mockResolvedValue({ id: 'waybill-1', status: 'ARRIVED' } as any);
    prisma.attachment.create.mockResolvedValue({ id: 'attachment-1' } as any);

    await service.createAttachment({
      waybillId: 'waybill-1', fileName: 'file.pdf', originalName: '签收单.pdf',
      mimeType: 'application/pdf', size: 10, category: 'RECEIPT_DOCUMENT',
    }, 'user-1');

    expect(prisma.attachment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ category: 'RECEIPT_DOCUMENT' }) });
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

  it('社会运力运单不校验车辆和司机的归属一致性', async () => {
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1', ownerType: 'OUTSOURCED', ownerId: 'carrier-other', plateNo: '甘A00001' } as any);
    prisma.driver.findFirst.mockResolvedValue({ id: 'driver-1', name: '散户司机', phone: '13800000000', serviceOrganization: null } as any);
    prisma.waybill.create.mockResolvedValue({ id: 'waybill-social', waybillNo: 'WB-20260717-0003' } as any);

    await service.create({
      dispatchNoticeId: notice.id,
      freightMode: 'SOCIAL',
      vehicleId: 'vehicle-1',
      driverId: 'driver-1',
      lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
    }, 'user-1');

    expect(prisma.waybill.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ freightMode: 'SOCIAL', carrierPartnerId: null, carrierName: null }),
    }));
  });

  it('车队绑定承运商后，队内车辆在第三方承运模式下直接可用', async () => {
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    prisma.serviceOrganization.findFirst.mockResolvedValue({
      id: 'org-1', partner: { id: 'carrier-1', name: 'XX物流' },
    } as any);
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-1', ownerType: 'OUTSOURCED', ownerId: 'carrier-other' } as any);
    prisma.vehicleFleet.findFirst.mockResolvedValue({ id: 'link-1' } as any);
    prisma.waybill.create.mockResolvedValue({ id: 'waybill-fleet', waybillNo: 'WB-20260717-0004' } as any);

    await service.create({
      dispatchNoticeId: notice.id,
      freightMode: 'THIRD_PARTY',
      carrierPartnerId: 'carrier-1',
      vehicleId: 'vehicle-1',
      plateNo: '甘A00001', driverName: '临时司机', driverPhone: '13800000001',
      lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
    }, 'user-1');

    expect(prisma.vehicleFleet.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { vehicleId: 'vehicle-1', fleet: { carrierPartnerId: 'carrier-1', status: 'ACTIVE', deletedAt: null } },
    }));
    expect(prisma.waybill.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ carrierPartnerId: 'carrier-1' }),
    }));
  });

  it('车队绑定承运商后，队内司机在第三方承运模式下直接可用', async () => {
    prisma.dispatchNotice.findFirst.mockResolvedValue(notice as any);
    prisma.serviceOrganization.findFirst.mockResolvedValue({
      id: 'org-1', partner: { id: 'carrier-1', name: 'XX物流' },
    } as any);
    prisma.driver.findFirst.mockResolvedValue({
      id: 'driver-1', name: '车队司机', phone: '13800000000',
      serviceOrganization: { partnerId: 'carrier-other', partner: { isInternal: false } },
    } as any);
    prisma.driverFleet.findFirst.mockResolvedValue({ id: 'link-2' } as any);
    prisma.waybill.create.mockResolvedValue({ id: 'waybill-fleet-driver', waybillNo: 'WB-20260717-0005' } as any);

    await service.create({
      dispatchNoticeId: notice.id,
      freightMode: 'THIRD_PARTY',
      carrierPartnerId: 'carrier-1',
      driverId: 'driver-1',
      plateNo: '甘A00001',
      lineItems: [{ dispatchNoticeLineItemId: 'notice-line-1', quantity: 5 }],
    }, 'user-1');

    expect(prisma.driverFleet.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { driverId: 'driver-1', fleet: { carrierPartnerId: 'carrier-1', status: 'ACTIVE', deletedAt: null } },
    }));
    expect(prisma.waybill.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ carrierPartnerId: 'carrier-1' }),
    }));
  });

  it('非社会运力运单不能通过单独绑定承运商接口修改', async () => {
    prisma.waybill.findFirst.mockResolvedValue({ id: 'waybill-1', freightMode: 'THIRD_PARTY' } as any);
    await expect(service.bindCarrier('waybill-1', 'carrier-1', 'user-1')).rejects.toThrow('仅社会运力运单支持单独绑定开票承运商');
  });

  it('社会运力运单可以在签收后补绑开票承运商', async () => {
    prisma.waybill.findFirst
      .mockResolvedValueOnce({ id: 'waybill-social', freightMode: 'SOCIAL', status: 'SIGNED' } as any)
      .mockResolvedValueOnce({ id: 'waybill-social', freightMode: 'SOCIAL', status: 'SIGNED', carrierPartnerId: 'carrier-1', carrierName: 'XX物流' } as any);
    prisma.serviceOrganization.findFirst.mockResolvedValue({
      id: 'org-1', partner: { id: 'carrier-1', name: 'XX物流' },
    } as any);
    prisma.waybill.update.mockResolvedValue({ id: 'waybill-social' } as any);

    const result = await service.bindCarrier('waybill-social', 'carrier-1', 'user-1');

    expect(prisma.waybill.update).toHaveBeenCalledWith({
      where: { id: 'waybill-social' },
      data: { carrierPartnerId: 'carrier-1', carrierName: 'XX物流' },
    });
    expect(result.carrierPartnerId).toBe('carrier-1');
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
