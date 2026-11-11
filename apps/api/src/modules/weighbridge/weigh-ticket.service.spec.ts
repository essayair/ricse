import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { calculateNetWeight, normalizeWeight, resolveDirectWeights, WeighTicketService } from './weigh-ticket.service';
import { attachmentMimeType } from './weigh-ticket.controller';

describe('磅单附件类型兼容', () => {
  it('兼容浏览器常见的 JPG 和通用二进制 MIME', () => {
    expect(attachmentMimeType('现场磅单.jpg', 'image/jpg')).toBe('image/jpeg');
    expect(attachmentMimeType('扫描磅单.pdf', 'application/octet-stream')).toBe('application/pdf');
  });

  it('拒绝扩展名与文件类型不匹配', () => {
    expect(attachmentMimeType('异常文件.pdf', 'image/png')).toBeNull();
    expect(attachmentMimeType('异常文件.exe', 'application/octet-stream')).toBeNull();
  });
});

describe('磅单重量精度', () => {
  it('整数毛重和皮重得到准确的整数净重', () => {
    expect(calculateNetWeight(130, 10)).toBe(120);
  });

  it('重量和净重统一保留最多三位小数', () => {
    expect(normalizeWeight(130.0004)).toBe(130);
    expect(calculateNetWeight(130.001, 10)).toBe(120.001);
  });
});

describe('磅单直接录入重量', () => {
  it('只有净重时保留毛皮重空白', () => {
    expect(resolveDirectWeights(null, null, 87.58)).toMatchObject({ mismatch: false, invalidPair: false, effectiveGross: null, effectiveTare: null, effectiveNet: 87.58 });
  });
  it('毛重和皮重推算净重，不反写原始录入值', () => {
    expect(resolveDirectWeights(111.34, 23.76, null).effectiveNet).toBe(87.58);
  });
  it('毛重和净重推算皮重', () => {
    expect(resolveDirectWeights(111.34, null, 87.58).effectiveTare).toBe(23.76);
  });
  it('皮重和净重推算毛重', () => {
    expect(resolveDirectWeights(null, 23.76, 87.58).effectiveGross).toBe(111.34);
  });
  it('三项不一致时标识差异', () => {
    expect(resolveDirectWeights(111.34, 23.76, 87.5)).toMatchObject({ mismatch: true });
  });
  it('毛重不得小于或等于皮重', () => {
    expect(resolveDirectWeights(10, 12, null)).toMatchObject({ invalidPair: true, effectiveNet: null });
  });
});

describe('WeighTicketService', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = {
    assertPermission: jest.fn().mockResolvedValue({}),
    getWaybillScope: jest.fn().mockResolvedValue({}),
    getWeighTicketScope: jest.fn().mockResolvedValue({}),
  };
  let service: WeighTicketService;

  const waybill = {
    id: 'waybill-1',
    status: 'ARRIVED',
    totalQuantity: 100,
    plateNo: '甘A12345',
    driverName: '张师傅',
    lineItems: [{ materialId: 'material-1', materialName: '测试物料' }],
    dispatchNotice: {
      type: 'PURCHASE',
      order: {
        contract: {
          type: 'PURCHASE', seller: { name: '发货单位' },
          buyer: null, signingPartner: { name: '收货单位' },
        },
      },
    },
  };
  const ticket = {
    id: 'ticket-1',
    ticketNo: 'PD-20260720-0001',
    status: 'WEIGHING',
    selectedGrossRecordId: 'gross-1',
    selectedTareRecordId: 'tare-1',
    netWeight: 100,
    settlementWeight: 100,
    abnormal: false,
    records: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WeighTicketService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: accessControl },
      ],
    }).compile();
    service = module.get(WeighTicketService);
    prisma.weighTicket.count.mockResolvedValue(0);
    prisma.material.findMany.mockResolvedValue([{ id: 'material-1', spec: '一级品', grade: null }] as any);
    prisma.user.findUnique.mockResolvedValue({ name: '司磅员' } as any);
    prisma.weighTicket.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
  });

  it('复核前删除有效称重记录，自动选用剩余同类记录并退回称重中', async () => {
    const records = [
      { id: 'gross-1', weighingType: 'GROSS', sequence: 1, weight: 130 },
      { id: 'gross-2', weighingType: 'GROSS', sequence: 2, weight: 128 },
      { id: 'tare-1', weighingType: 'TARE', sequence: 3, weight: 10 },
    ];
    jest.spyOn(service, 'findOne').mockResolvedValue({
      ...ticket, status: 'COMPLETED', waybillId: 'waybill-1', records,
      selectedGrossRecordId: 'gross-2', selectedTareRecordId: 'tare-1',
    } as any);
    jest.spyOn(service, 'syncTaskForWaybill').mockResolvedValue(undefined as any);
    prisma.weighTicket.findUniqueOrThrow
      .mockResolvedValueOnce({ ...ticket, selectedGrossRecordId: 'gross-1', selectedTareRecordId: 'tare-1', records: [records[0], records[2]], plannedQuantity: 100, settlementBasis: 'RECEIVING', toleranceRate: 10 } as any)
      .mockResolvedValueOnce({ ...ticket, status: 'WEIGHING', records: [records[0], records[2]] } as any);

    const result = await service.deleteRecord('ticket-1', 'gross-2', 'user-1');
    expect(prisma.weighRecord.delete).toHaveBeenCalledWith({ where: { id: 'gross-2' } });
    expect(prisma.weighTicket.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'WEIGHING', selectedGrossRecordId: 'gross-1' }),
    }));
    expect(result.status).toBe('WEIGHING');
  });

  it('已复核磅单不能删除称重记录', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ ...ticket, status: 'REVIEWED', records: [{ id: 'gross-1' }] } as any);
    await expect(service.deleteRecord('ticket-1', 'gross-1', 'user-1')).rejects.toThrow('复核后不能删除');
    expect(prisma.weighRecord.delete).not.toHaveBeenCalled();
  });

  it('采购运单到达前不能创建收货称重磅单', async () => {
    prisma.waybill.findFirst.mockResolvedValue({ ...waybill, status: 'IN_TRANSIT' } as any);
    await expect(service.create({ waybillId: waybill.id, weighingStage: 'RECEIVING' }, 'user-1'))
      .rejects.toThrow('物流运单到达后才能创建或关联收货称重磅单');
  });

  it('采购运单确认到达后补齐供应商发货和我方收货两张空白磅单', async () => {
    prisma.waybill.findFirst.mockResolvedValue(waybill as any);
    prisma.weighTicket.findFirst.mockResolvedValue(null);
    prisma.weighTicket.create.mockResolvedValue({
      ...ticket, status: 'PENDING', direction: 'INBOUND', weighingStage: 'RECEIVING',
    } as any);

    await service.ensurePrimaryTicketForWaybill(waybill.id, 'user-1');

    expect(accessControl.assertPermission).not.toHaveBeenCalled();
    expect(prisma.weighTicket.create).toHaveBeenCalledTimes(2);
    expect(prisma.weighTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        waybillId: waybill.id,
        direction: 'INBOUND',
        weighingStage: 'RECEIVING',
        remarks: expect.stringContaining('我方收货待填写空白磅单'),
        packageCount: undefined,
      }),
    }));
  });

  it('采购运单到达前生成发货侧空白单，不提前生成收货侧空白单', async () => {
    prisma.waybill.findFirst.mockResolvedValue({ ...waybill, status: 'IN_TRANSIT' } as any);
    prisma.weighTicket.findFirst.mockResolvedValue(null);
    prisma.weighTicket.create.mockResolvedValue({ ...ticket, weighingStage: 'SHIPPING' } as any);

    await expect(service.ensurePrimaryTicketForWaybill(waybill.id, 'user-1')).resolves.toBeNull();

    expect(prisma.weighTicket.create).toHaveBeenCalledTimes(1);
    expect(prisma.weighTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ weighingStage: 'SHIPPING', remarks: expect.stringContaining('供应商发货待填写空白磅单') }),
    }));
  });

  it('销售运单确定车辆后自动生成我方发货待过磅单且重复调用不重复创建', async () => {
    const salesWaybill = {
      ...waybill,
      status: 'PENDING',
      dispatchNotice: {
        type: 'SALES',
        order: {
          contract: {
            type: 'SALES', seller: { name: '客户' },
            buyer: null, signingPartner: { name: '我方单位' },
          },
        },
      },
    };
    prisma.waybill.findFirst.mockResolvedValue(salesWaybill as any);
    prisma.weighTicket.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'ticket-auto', weighingStage: 'SHIPPING' } as any);
    prisma.weighTicket.create.mockResolvedValue({
      ...ticket, id: 'ticket-auto', status: 'PENDING', direction: 'OUTBOUND', weighingStage: 'SHIPPING',
    } as any);

    await service.ensurePrimaryTicketForWaybill(waybill.id, 'user-1');
    await service.ensurePrimaryTicketForWaybill(waybill.id, 'user-1');

    expect(prisma.weighTicket.create).toHaveBeenCalledTimes(1);
    expect(prisma.weighTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        direction: 'OUTBOUND',
        weighingStage: 'SHIPPING',
        remarks: expect.stringContaining('我方发货待填写空白磅单'),
        packageCount: undefined,
      }),
    }));
  });

  it('销售运单到达后补齐客户收货侧空白磅单', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      ...waybill, status: 'ARRIVED',
      dispatchNotice: { ...waybill.dispatchNotice, type: 'SALES' },
    } as any);
    prisma.weighTicket.findFirst.mockImplementation(((args: any) =>
      args.where.weighingStage === 'SHIPPING' ? ({ id: 'shipping-ticket' } as any) : null) as any);
    prisma.weighTicket.create.mockResolvedValue({ ...ticket, weighingStage: 'RECEIVING' } as any);
    await service.ensurePrimaryTicketForWaybill(waybill.id, 'user-1');
    expect(prisma.weighTicket.create).toHaveBeenCalledTimes(1);
    expect(prisma.weighTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ weighingStage: 'RECEIVING', remarks: expect.stringContaining('客户收货待填写空白磅单') }),
    }));
  });

  it('仅生成发货和收货空白磅单时，过磅任务仍为待过磅', async () => {
    prisma.waybill.findFirst.mockResolvedValueOnce({ id: waybill.id, status: 'ARRIVED', plateNo: '甘A12345', totalQuantity: 100 } as any);
    prisma.weighTask.findUnique.mockResolvedValueOnce({ id: 'task-1', plannedQuantity: 100, status: 'PENDING_WEIGHING' } as any);
    prisma.waybill.findUnique.mockResolvedValueOnce({
      status: 'ARRIVED',
      weighTickets: [{ status: 'PENDING', abnormal: false }, { status: 'PENDING', abnormal: false }],
      weightSelections: [],
    } as any);
    await service.syncTaskForWaybill(waybill.id, 'user-1');
    expect(prisma.weighTask.update).toHaveBeenCalledWith({ where: { id: 'task-1' }, data: { status: 'PENDING_WEIGHING' } });
  });

  it.each([
    [[], 'PENDING_CONFIRMATION'],
    [[{ id: 'selection-1', purpose: 'INVENTORY' }], 'COMPLETED'],
    [[{ id: 'selection-stage', purpose: 'SHIPPING' }], 'PENDING_CONFIRMATION'],
  ])('已复核磅单的执行口径为 %j 时过磅任务状态为 %s', async (weightSelections, expectedStatus) => {
    prisma.waybill.findFirst.mockResolvedValue({
      id: waybill.id, status: 'ARRIVED', vehicleId: null, plateNo: '甘A12345', totalQuantity: 100,
    } as any);
    prisma.weighTask.findUnique.mockResolvedValue({ id: 'task-1', plannedQuantity: 100, status: 'IN_PROGRESS' } as any);
    prisma.waybill.findUnique.mockResolvedValue({
      status: 'ARRIVED',
      weighTickets: [{ status: 'REVIEWED', abnormal: false }],
      weightSelections,
    } as any);
    prisma.weighTask.update.mockResolvedValue({ id: 'task-1', status: expectedStatus } as any);

    await service.syncTaskForWaybill(waybill.id, 'user-1');

    expect(prisma.weighTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' }, data: { status: expectedStatus },
    });
  });

  it('磅差异常经确认后不再把过磅任务保持在异常状态', async () => {
    prisma.waybill.findFirst.mockResolvedValueOnce({ id: waybill.id, status: 'ARRIVED', plateNo: '甘A12345', totalQuantity: 100 } as any);
    prisma.weighTask.findUnique.mockResolvedValueOnce({ id: 'task-1', plannedQuantity: 100, status: 'IN_PROGRESS' } as any);
    prisma.waybill.findUnique.mockResolvedValueOnce({ status: 'ARRIVED', weighTickets: [{ status: 'REVIEWED', abnormal: true }], weightSelections: [{ id: 'selection-1', purpose: 'INVENTORY' }] } as any);
    await service.syncTaskForWaybill(waybill.id, 'user-1');
    expect(prisma.weighTask.update).toHaveBeenCalledWith({ where: { id: 'task-1' }, data: { status: 'COMPLETED' } });
  });

  it('待确认的异常磅单仍在任务中提示异常', async () => {
    prisma.waybill.findFirst.mockResolvedValueOnce({ id: waybill.id, status: 'ARRIVED', plateNo: '甘A12345', totalQuantity: 100 } as any);
    prisma.weighTask.findUnique.mockResolvedValueOnce({ id: 'task-1', plannedQuantity: 100, status: 'IN_PROGRESS' } as any);
    prisma.waybill.findUnique.mockResolvedValueOnce({ status: 'ARRIVED', weighTickets: [{ status: 'COMPLETED', abnormal: true }], weightSelections: [] } as any);
    await service.syncTaskForWaybill(waybill.id, 'user-1');
    expect(prisma.weighTask.update).toHaveBeenCalledWith({ where: { id: 'task-1' }, data: { status: 'EXCEPTION' } });
  });

  it('销售运单允许在发运前创建出库磅单', async () => {
    prisma.waybill.findFirst.mockResolvedValue({
      ...waybill,
      status: 'PENDING',
      dispatchNotice: {
        type: 'SALES',
        order: {
          contract: {
            type: 'SALES',
            seller: { name: '客户' },
            buyer: null,
            signingPartner: { name: '我方单位' },
          },
        },
      },
    } as any);
    prisma.weighTicket.create.mockResolvedValue({ ...ticket, direction: 'OUTBOUND' } as any);

    await service.create({ waybillId: waybill.id }, 'user-1');

    expect(prisma.weighTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ direction: 'OUTBOUND', weighingStage: 'SHIPPING', sequence: 1 }),
    }));
  });

  it('默认按收货称重净重作为结算口径', async () => {
    prisma.waybill.findFirst.mockResolvedValue(waybill as any);
    prisma.weighTicket.create.mockResolvedValue({ ...ticket, settlementBasis: 'RECEIVING' } as any);
    await service.create({ waybillId: waybill.id }, 'user-1');
    expect(prisma.weighTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        waybillId: waybill.id,
        direction: 'INBOUND',
        weighingStage: 'RECEIVING',
        sequence: 1,
        plannedQuantity: 100,
        settlementBasis: 'RECEIVING',
        plateNo: '甘A12345',
        materialName: '测试物料',
        materialSpec: '一级品',
        shipperName: '发货单位',
        receiverName: '收货单位',
        driverName: '张师傅',
        weighmasterName: '司磅员',
      }),
    }));
  });

  it.each([undefined, 0, 68])('包/袋数为 %s 时仅保存人工录入值，不使用默认数量', async (packageCount) => {
    prisma.waybill.findFirst.mockResolvedValue(waybill as any);
    prisma.weighTicket.create.mockResolvedValue(ticket as any);

    await service.create({ waybillId: waybill.id, packageCount }, 'user-1');

    expect(prisma.weighTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ packageCount }),
    }));
  });

  it('同一运单同一节点追加完整磅单必须填写原因并保留序次', async () => {
    prisma.waybill.findFirst.mockResolvedValue(waybill as any);
    prisma.weighTicket.findMany.mockResolvedValue([
      { id: 'ticket-old', ticketNo: 'PD-OLD', sequence: 1 },
    ] as any);
    await expect(service.create({ waybillId: waybill.id, weighingStage: 'RECEIVING' }, 'user-1'))
      .rejects.toThrow('追加完整磅单必须填写追加原因');

    prisma.weighTicket.create.mockResolvedValue({ ...ticket, sequence: 2, isSupplementary: true } as any);
    await service.create({
      waybillId: waybill.id,
      weighingStage: 'RECEIVING',
      additionReason: '客户要求重新称重',
    }, 'user-1');
    expect(prisma.weighTicket.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sequence: 2,
        isSupplementary: true,
        previousTicketId: 'ticket-old',
        additionReason: '客户要求重新称重',
      }),
    }));
  });

  it('允许追加多次称重记录并自动选择最新记录', async () => {
    prisma.weighTicket.findFirst.mockResolvedValue({ ...ticket, status: 'WEIGHING' } as any);
    prisma.weighRecord.aggregate.mockResolvedValue({ _max: { sequence: 2 } } as any);
    prisma.weighRecord.create.mockResolvedValue({
      id: 'gross-2', weighTicketId: ticket.id, weighingType: 'GROSS', sequence: 3, weight: 121,
    } as any);
    prisma.weighTicket.findUniqueOrThrow
      .mockResolvedValueOnce({
        ...ticket,
        plannedQuantity: 100,
        toleranceRate: 0.5,
        settlementBasis: 'RECEIVING',
        selectedGrossRecordId: 'gross-2',
        records: [
          { id: 'gross-2', weight: 121 },
          { id: 'tare-1', weight: 20 },
        ],
      } as any)
      .mockResolvedValueOnce({ ...ticket, selectedGrossRecordId: 'gross-2', netWeight: 101 } as any);

    await service.addRecord(ticket.id, { weighingType: 'GROSS', weight: 121 }, 'user-1');

    expect(prisma.weighRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sequence: 3, weighingType: 'GROSS', weight: 121 }),
    }));
    expect(prisma.weighTicket.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ selectedGrossRecordId: 'gross-2' }),
    }));
  });

  it('按提交顺序批量保存称重记录并分别选用最新毛重和皮重', async () => {
    prisma.weighTicket.findFirst.mockResolvedValue({
      ...ticket, direction: 'OUTBOUND', status: 'PENDING',
    } as any);
    prisma.weighRecord.aggregate.mockResolvedValue({ _max: { sequence: null } } as any);
    prisma.weighRecord.create
      .mockResolvedValueOnce({
        id: 'tare-1', weighTicketId: ticket.id, weighingType: 'TARE', sequence: 1, weight: 20,
      } as any)
      .mockResolvedValueOnce({
        id: 'gross-1', weighTicketId: ticket.id, weighingType: 'GROSS', sequence: 2, weight: 120,
      } as any);
    prisma.weighTicket.findUniqueOrThrow
      .mockResolvedValueOnce({
        ...ticket,
        plannedQuantity: 100,
        toleranceRate: 0.5,
        settlementBasis: 'RECEIVING',
        selectedGrossRecordId: 'gross-1',
        selectedTareRecordId: 'tare-1',
        records: [
          { id: 'tare-1', weight: 20 },
          { id: 'gross-1', weight: 120 },
        ],
      } as any)
      .mockResolvedValueOnce({
        ...ticket, selectedGrossRecordId: 'gross-1', selectedTareRecordId: 'tare-1',
      } as any);

    await service.addRecords(ticket.id, [
      { weighingType: 'TARE', weight: 20 },
      { weighingType: 'GROSS', weight: 120 },
    ], 'user-1');

    expect(prisma.weighRecord.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ sequence: 1, weighingType: 'TARE' }),
    }));
    expect(prisma.weighRecord.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ sequence: 2, weighingType: 'GROSS' }),
    }));
    expect(prisma.weighTicket.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        selectedGrossRecordId: 'gross-1',
        selectedTareRecordId: 'tare-1',
      }),
    }));
  });

  it('未完成毛重和皮重时不能完成称重', async () => {
    prisma.weighTicket.findFirst.mockResolvedValue({
      ...ticket, selectedTareRecordId: null, netWeight: null, settlementWeight: null,
    } as any);
    await expect(service.updateStatus(ticket.id, 'COMPLETED', 'user-1'))
      .rejects.toThrow(BadRequestException);
  });

  it('完成称重前必须上传磅单附件', async () => {
    prisma.weighTicket.findFirst.mockResolvedValue({
      ...ticket, attachments: [],
    } as any);
    await expect(service.updateStatus(ticket.id, 'COMPLETED', 'user-1'))
      .rejects.toThrow('完成称重前必须上传至少一份磅单附件');
  });

  it('只有净重的直接录入磅单可完成称重', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      ...ticket, waybillId: 'waybill-1', weightEntrySource: 'DIRECT',
      selectedGrossRecordId: null, selectedTareRecordId: null,
      enteredGrossWeight: null, enteredTareWeight: null, enteredNetWeight: 87.58,
      netWeight: 87.58, settlementWeight: 87.58, attachments: [{ id: 'attachment-1' }],
    } as any);
    jest.spyOn(service, 'syncTaskForWaybill').mockResolvedValue(undefined as any);
    prisma.weighTicket.update.mockResolvedValue({ ...ticket, status: 'COMPLETED' } as any);
    await expect(service.updateStatus(ticket.id, 'COMPLETED', 'user-1')).resolves.toMatchObject({ status: 'COMPLETED' });
  });

  it('保存只有净重的直接录入时不伪造毛重和皮重', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ ...ticket, waybillId: 'waybill-1' } as any);
    jest.spyOn(service, 'syncTaskForWaybill').mockResolvedValue(undefined as any);
    prisma.weighTicket.findUniqueOrThrow.mockResolvedValueOnce({
      ...ticket, weightEntrySource: 'DIRECT', enteredGrossWeight: null,
      enteredTareWeight: null, enteredNetWeight: 87.58,
      records: [], plannedQuantity: 100, settlementBasis: 'RECEIVING', toleranceRate: 10,
    } as any).mockResolvedValueOnce({ ...ticket, netWeight: 87.58 } as any);
    await service.updateWeights(ticket.id, { source: 'DIRECT', grossWeight: null, tareWeight: null, netWeight: 87.58 }, 'user-1');
    expect(prisma.weighTicket.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ grossWeight: null, tareWeight: null, netWeight: 87.58 }),
    }));
  });

  it('三项不一致不能保存，避免进入待复核数据', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ ...ticket, waybillId: 'waybill-1' } as any);
    await expect(service.updateWeights(ticket.id, {
      source: 'DIRECT', grossWeight: 111.34, tareWeight: 23.76, netWeight: 87.5,
    }, 'user-1')).rejects.toThrow('毛重－皮重必须等于净重');
    expect(prisma.weighTicket.update).not.toHaveBeenCalled();
  });

  it('直接录入只有毛重时不能保存，净重必须存在或可计算', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ ...ticket, waybillId: 'waybill-1' } as any);
    await expect(service.updateWeights(ticket.id, {
      source: 'DIRECT', grossWeight: 111.34, tareWeight: null, netWeight: null,
    }, 'user-1')).rejects.toThrow('请填写净重');
  });

  it('三项直接录入不一致时不能完成，即使填写了旧的采信原因', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      ...ticket, weightEntrySource: 'DIRECT', enteredGrossWeight: 111.34,
      enteredTareWeight: 23.76, enteredNetWeight: 87.5,
      weightOverrideReason: '旧理由', attachments: [{ id: 'attachment-1' }],
    } as any);
    await expect(service.updateStatus(ticket.id, 'COMPLETED', 'user-1'))
      .rejects.toThrow('毛重、皮重、净重不一致');
  });

  it('异常磅单可一键按实际磅单复核', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ ...ticket, status: 'COMPLETED', abnormal: true, waybillId: 'waybill-1' } as any);
    jest.spyOn(service, 'syncTaskForWaybill').mockResolvedValue(undefined as any);
    jest.spyOn(service as any, 'applyDefaultSelections').mockResolvedValue(undefined);
    prisma.weighTicket.update.mockResolvedValueOnce({ ...ticket, status: 'REVIEWED' } as any);
    await service.updateStatus(ticket.id, 'REVIEWED', 'user-1', ' ');
    expect(prisma.weighTicket.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reviewRemark: '按实际磅单' }) }));
  });

  it('待复核磅单可返回称重中修改', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ ...ticket, status: 'COMPLETED', waybillId: 'waybill-1' } as any);
    jest.spyOn(service, 'syncTaskForWaybill').mockResolvedValue(undefined as any);
    prisma.weighTicket.update.mockResolvedValueOnce({ ...ticket, status: 'WEIGHING' } as any);
    await expect(service.updateStatus(ticket.id, 'WEIGHING', 'user-1')).resolves.toMatchObject({ status: 'WEIGHING' });
    expect(prisma.weighTicket.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'WEIGHING' } }));
  });

  it('其他结算口径必须填写对应重量', async () => {
    prisma.waybill.findFirst.mockResolvedValue(waybill as any);
    await expect(service.create({
      waybillId: waybill.id,
      settlementBasis: 'THIRD_PARTY',
    }, 'user-1')).rejects.toThrow('所选结算口径必须填写对应重量');
  });

  it('按运单查询磅单信息时一条运单只返回一条聚合记录', async () => {
    prisma.waybill.findMany.mockResolvedValue([{ ...waybill, weighTickets: [ticket] }] as any);

    const result = await service.findManagementFiles({ search: '甘A12345' }, 'user-1');

    expect(result.total).toBe(1);
    expect(prisma.waybill.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        weighTask: { is: { deletedAt: null } },
      }),
    }));
  });

  it('采购库存选用不自动选用同一张货款结算磅单', async () => {
    prisma.waybill.findFirst.mockResolvedValue({ id: waybill.id, dispatchNotice: { type: 'PURCHASE' } } as any);
    prisma.weighTicket.findFirst.mockResolvedValue({
      id: ticket.id, ticketNo: ticket.ticketNo, status: 'REVIEWED', netWeight: 100, weighingStage: 'RECEIVING',
    } as any);
    prisma.waybillWeightSelection.findFirst.mockResolvedValue(null);
    prisma.waybillWeightSelection.create.mockResolvedValue({ id: 'selection-inventory', purpose: 'INVENTORY' } as any);

    const result = await service.selectEffectiveTicket(waybill.id, ticket.id, undefined, 'user-1');

    expect(result).toHaveLength(1);
    expect(prisma.waybillWeightSelection.updateMany).toHaveBeenCalledWith({
      where: { waybillId: waybill.id, purpose: 'INVENTORY', isCurrent: true },
      data: { isCurrent: false },
    });
    expect(prisma.waybillWeightSelection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purpose: 'INVENTORY', weighTicketId: ticket.id, quantity: 100 }),
    }));
  });

  it('更换库存磅单必须填写原因', async () => {
    prisma.waybill.findFirst.mockResolvedValue({ id: waybill.id, dispatchNotice: { type: 'PURCHASE' } } as any);
    prisma.weighTicket.findFirst.mockResolvedValue({
      id: ticket.id, ticketNo: ticket.ticketNo, status: 'REVIEWED', netWeight: 100, weighingStage: 'RECEIVING',
    } as any);
    prisma.waybillWeightSelection.findFirst.mockResolvedValue({ id: 'old', waybillId: waybill.id, purpose: 'INVENTORY', weighTicketId: 'ticket-old' } as any);

    await expect(service.selectEffectiveTicket(waybill.id, ticket.id, undefined, 'user-1'))
      .rejects.toThrow('更换已选磅单必须填写变更原因');
  });

  it('唯一供应商发货磅单不能静默作为我方库存依据', async () => {
    prisma.weighTicket.findUniqueOrThrow.mockResolvedValue({
      id: ticket.id, waybillId: waybill.id, weighingStage: 'SHIPPING', netWeight: 100,
      waybill: { dispatchNotice: { type: 'PURCHASE' } },
    } as any);
    await (service as any).applyDefaultSelections(ticket.id, 'user-1');
    expect(prisma.waybillWeightSelection.create).not.toHaveBeenCalled();
  });

  it('供应商发货磅单不能作为我方库存入库依据', async () => {
    prisma.waybill.findFirst.mockResolvedValue({ id: waybill.id, dispatchNotice: { type: 'PURCHASE' } } as any);
    prisma.weighTicket.findFirst.mockResolvedValue({ id: 'supplier-ticket', status: 'REVIEWED', netWeight: 98, weighingStage: 'SHIPPING' } as any);
    await expect(service.selectEffectiveTicket(waybill.id, 'supplier-ticket', undefined, 'user-1', 'INVENTORY'))
      .rejects.toThrow('采购入库只能采用我方收货采信磅单');
    expect(prisma.waybillWeightSelection.create).not.toHaveBeenCalled();
  });

  it('销售出库后允许单独选择客户收货磅单作为货款依据，不回写出库', async () => {
    prisma.waybill.findFirst.mockResolvedValue({ id: waybill.id, dispatchNotice: { type: 'SALES' } } as any);
    prisma.weighTicket.findFirst.mockResolvedValue({ id: 'customer', netWeight: 98, weighingStage: 'RECEIVING' } as any);
    prisma.waybillWeightSelection.findFirst.mockResolvedValue({ id: 'old', weighTicketId: 'shipping', purpose: 'SETTLEMENT' } as any);
    prisma.financialSettlementLine.count.mockResolvedValue(0);
    prisma.waybillWeightSelection.create.mockResolvedValue({ id: 'new' } as any);
    await service.selectForPurpose(waybill.id, 'SETTLEMENT', 'customer', '按客户收货磅单结货款', 'user-1');
    expect(prisma.waybillWeightSelection.updateMany).toHaveBeenCalledWith({ where: { waybillId: waybill.id, purpose: 'SETTLEMENT', isCurrent: true }, data: { isCurrent: false } });
    expect(prisma.outboundReceipt.updateMany).not.toHaveBeenCalled();
    expect(prisma.waybillWeightSelection.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ purpose: 'SETTLEMENT', weighTicketId: 'customer', quantity: 98 }) }));
  });

  it('销售客户收货磅单不能选作我方出库依据', async () => {
    prisma.waybill.findFirst.mockResolvedValue({ id: waybill.id, dispatchNotice: { type: 'SALES' } } as any);
    prisma.weighTicket.findFirst.mockResolvedValue({ id: 'customer', netWeight: 98, weighingStage: 'RECEIVING' } as any);
    await expect(service.selectForPurpose(waybill.id, 'INVENTORY', 'customer', '错误选择', 'user-1')).rejects.toThrow('我方发货磅单');
  });

  it('销售已过账或已拣配时仍禁止直接更换我方出库磅单', async () => {
    prisma.waybill.findFirst.mockResolvedValue({ id: waybill.id, dispatchNotice: { type: 'SALES' } } as any);
    prisma.weighTicket.findFirst.mockResolvedValue({ id: 'new-shipping', netWeight: 99, weighingStage: 'SHIPPING' } as any);
    prisma.waybillWeightSelection.findFirst.mockResolvedValue({ id: 'old', weighTicketId: 'shipping', purpose: 'INVENTORY' } as any);
    prisma.outboundReceipt.findFirst.mockResolvedValue({ receiptNo: 'CK001' } as any);
    await expect(service.selectForPurpose(waybill.id, 'INVENTORY', 'new-shipping', '更换出库单', 'user-1')).rejects.toThrow('不能直接更换');
  });

  it('采购唯一我方收货磅单只自动作为库存依据', async () => {
    prisma.weighTicket.findUniqueOrThrow.mockResolvedValue({
      id: ticket.id,
      waybillId: waybill.id,
      weighingStage: 'RECEIVING',
      netWeight: 100,
      waybill: { dispatchNotice: { type: 'PURCHASE' } },
    } as any);
    prisma.waybillWeightSelection.findFirst.mockResolvedValue(null);
    prisma.weighTicket.count.mockResolvedValue(1);
    prisma.waybillWeightSelection.findMany.mockResolvedValue([]);
    prisma.waybillWeightSelection.create.mockResolvedValue({ id: 'selection-inventory' } as any);

    await (service as any).applyDefaultSelections(ticket.id, 'user-1');

    expect(prisma.waybillWeightSelection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purpose: 'RECEIVING', weighTicketId: ticket.id, reason: '该侧唯一有效磅单，系统自动采信' }),
    }));
    expect(prisma.waybillWeightSelection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purpose: 'INVENTORY', weighTicketId: ticket.id, quantity: 100 }),
    }));
  });

  it('供应商发货采信磅单与我方入库依据分开记录', async () => {
    jest.spyOn(service, 'syncTaskForWaybill').mockResolvedValue(null);
    prisma.waybill.findFirst.mockResolvedValue({ id: waybill.id, dispatchNotice: { type: 'PURCHASE' } } as any);
    prisma.weighTicket.findFirst.mockResolvedValue({ id: 'supplier-shipping', status: 'REVIEWED', weighingStage: 'SHIPPING', netWeight: 98 } as any);
    prisma.waybillWeightSelection.findFirst.mockResolvedValue(null);
    prisma.waybillWeightSelection.create.mockResolvedValue({ id: 'shipping-selection' } as any);

    await service.selectForPurpose(waybill.id, 'SHIPPING', 'supplier-shipping', undefined, 'user-1');

    expect(prisma.waybillWeightSelection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purpose: 'SHIPPING', weighTicketId: 'supplier-shipping', quantity: 98 }),
    }));
    expect(prisma.inboundReceipt.updateMany).not.toHaveBeenCalled();
  });

  it('人工采信我方收货磅单时同步更新尚未收货的入库依据', async () => {
    jest.spyOn(service, 'syncTaskForWaybill').mockResolvedValue(null);
    prisma.waybill.findFirst.mockResolvedValue({ id: waybill.id, dispatchNotice: { type: 'PURCHASE' } } as any);
    prisma.weighTicket.findFirst.mockResolvedValue({ id: 'receiving-2', status: 'REVIEWED', weighingStage: 'RECEIVING', netWeight: 99 } as any);
    prisma.waybillWeightSelection.findFirst.mockImplementation((async ({ where }: any) => where.purpose === 'INVENTORY'
      ? { id: 'inventory-1', weighTicketId: 'receiving-1' } as any
      : { id: 'receiving-choice-1', weighTicketId: 'receiving-1' } as any) as any);
    prisma.waybillWeightSelection.create.mockResolvedValue({ id: 'new-selection' } as any);

    await service.selectForPurpose(waybill.id, 'RECEIVING', 'receiving-2', '原磅单记录有误，改用复磅', 'user-1');

    expect(prisma.waybillWeightSelection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purpose: 'INVENTORY', weighTicketId: 'receiving-2' }),
    }));
    expect(prisma.waybillWeightSelection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purpose: 'RECEIVING', weighTicketId: 'receiving-2' }),
    }));
    expect(prisma.inboundReceipt.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { weighTicketId: 'receiving-2', receivedQuantity: 99 } }));
  });

  it('同侧多张磅单不能绕过采信确认直接选货款依据', async () => {
    prisma.waybill.findFirst.mockResolvedValue({ id: waybill.id, dispatchNotice: { type: 'PURCHASE' } } as any);
    prisma.weighTicket.findFirst.mockResolvedValue({ id: 'supplier-2', status: 'REVIEWED', weighingStage: 'SHIPPING', netWeight: 98 } as any);
    prisma.weighTicket.count.mockResolvedValue(2);
    prisma.waybillWeightSelection.findFirst.mockResolvedValue(null);
    await expect(service.selectForPurpose(waybill.id, 'SETTLEMENT', 'supplier-2', undefined, 'user-1'))
      .rejects.toThrow('请先确定采信磅单');
  });

  it('销售交付已确认但未正式结算时，可带原因改选客户收货复磅并更新差异快照', async () => {
    jest.spyOn(service, 'syncTaskForWaybill').mockResolvedValue(null);
    prisma.waybill.findFirst.mockResolvedValueOnce({ id: waybill.id, dispatchNotice: { type: 'SALES' } } as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ salesCompletionCustomerTicketId: 'receiving-1', salesCompletionShippingWeight: 100, salesCompletionRemarks: '原客户签收' } as any);
    prisma.weighTicket.findFirst.mockResolvedValue({ id: 'receiving-2', ticketNo: '客户收货复磅', weighingStage: 'RECEIVING', status: 'REVIEWED', netWeight: 97 } as any);
    prisma.waybillWeightSelection.findFirst.mockResolvedValue({ id: 'old-selection', weighTicketId: 'receiving-1', purpose: 'RECEIVING' } as any);
    prisma.financialSettlementLine.findFirst.mockResolvedValue(null);
    prisma.waybillWeightSelection.create.mockResolvedValue({ id: 'new-selection' } as any);

    await service.selectForPurpose(waybill.id, 'RECEIVING', 'receiving-2', '客户重新确认复磅结果', 'user-1');

    expect(prisma.waybill.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ salesCompletionCustomerTicketId: 'receiving-2', salesCompletionCustomerWeight: 97,
        salesCompletionWeightVariance: expect.objectContaining({}) }),
    }));
  });

  it('配对直拨已确认或待复核时，必须先撤销才能更换采信磅单', async () => {
    prisma.waybill.findFirst.mockResolvedValueOnce({ id: waybill.id, dispatchNotice: { type: 'SALES' } } as any)
      .mockResolvedValueOnce({ directDeliveries: [{ id: 'active-direct-delivery' }] } as any);
    prisma.weighTicket.findFirst.mockResolvedValue({ id: 'receiving-2', weighingStage: 'RECEIVING', status: 'REVIEWED', netWeight: 97 } as any);
    await expect(service.selectForPurpose(waybill.id, 'RECEIVING', 'receiving-2', '重新采信', 'user-1')).rejects.toThrow('请先撤销交付');
    expect(prisma.waybillWeightSelection.updateMany).not.toHaveBeenCalled();
  });
});
