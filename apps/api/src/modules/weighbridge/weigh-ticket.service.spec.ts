import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { WeighTicketService } from './weigh-ticket.service';
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

  it('采购运单到达前不能创建收货称重磅单', async () => {
    prisma.waybill.findFirst.mockResolvedValue({ ...waybill, status: 'IN_TRANSIT' } as any);
    await expect(service.create({ waybillId: waybill.id, weighingStage: 'RECEIVING' }, 'user-1'))
      .rejects.toThrow('物流运单到达后才能创建或关联收货称重磅单');
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

  it('异常磅单复核必须填写处理意见', async () => {
    prisma.weighTicket.findFirst.mockResolvedValue({
      ...ticket, status: 'COMPLETED', abnormal: true,
    } as any);
    await expect(service.updateStatus(ticket.id, 'REVIEWED', 'user-1', ' '))
      .rejects.toThrow('异常磅单复核必须填写处理意见');
  });

  it('其他结算口径必须填写对应重量', async () => {
    prisma.waybill.findFirst.mockResolvedValue(waybill as any);
    await expect(service.create({
      waybillId: waybill.id,
      settlementBasis: 'THIRD_PARTY',
    }, 'user-1')).rejects.toThrow('所选结算口径必须填写对应重量');
  });
});
