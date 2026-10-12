import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { LogisticsSettlementService } from './logistics-settlement.service';

describe('LogisticsSettlementService', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = {
    assertPermission: jest.fn().mockResolvedValue({ user: { company: { id: 'company-1' } } }),
    getWaybillScope: jest.fn().mockResolvedValue({}),
    getLogisticsSettlementScope: jest.fn().mockResolvedValue({}),
  };
  let service: LogisticsSettlementService;

  const waybillBase = {
    id: 'waybill-1', waybillNo: 'WB-20260717-0001', status: 'SIGNED',
    carrierPartnerId: 'carrier-1', originLocation: '额济纳', destinationLocation: '玉门',
    signedAt: new Date('2026-07-27'),
    dispatchNotice: { order: { contract: { signingPartnerId: 'partner-1', signingPartner: { id: 'partner-1', name: '我方主体' } } } },
    weightSelections: [{ quantity: 104.06, weighTicket: { grossWeight: 125.84 } }],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    accessControl.assertPermission.mockResolvedValue({ user: { company: { id: 'company-1' } } });
    accessControl.getWaybillScope.mockResolvedValue({});
    accessControl.getLogisticsSettlementScope.mockResolvedValue({});
    const module = await Test.createTestingModule({
      providers: [
        LogisticsSettlementService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: accessControl },
      ],
    }).compile();
    service = module.get(LogisticsSettlementService);
    prisma.logisticsSettlement.count.mockResolvedValue(0);
    prisma.logisticsSettlementLine.findMany.mockResolvedValue([]);
    prisma.company.findFirst.mockResolvedValue({ id: 'company-1' } as any);
    prisma.logisticsContractPriceTerm.findFirst.mockReset();
    prisma.logisticsContractPriceTerm.findFirst.mockResolvedValue(null);
  });

  describe('listCandidateWaybills', () => {
    it('结算周期结束日期必须晚于开始日期', async () => {
      await expect(service.listCandidateWaybills({ periodStart: '2026-07-31', periodEnd: '2026-07-01' }, 'user-1'))
        .rejects.toThrow('结算周期结束日期必须晚于开始日期');
    });

    it('未绑定开票承运商的运单标记 carrierPending 但不剔除', async () => {
      prisma.waybill.findMany.mockResolvedValue([
        { ...waybillBase, id: 'waybill-pending', carrierPartnerId: null },
        { ...waybillBase, id: 'waybill-ready' },
      ] as any);
      const result = await service.listCandidateWaybills({ periodStart: '2026-07-01', periodEnd: '2026-07-31' }, 'user-1');
      expect(result).toEqual([
        expect.objectContaining({ id: 'waybill-pending', carrierPending: true }),
        expect.objectContaining({ id: 'waybill-ready', carrierPending: false }),
      ]);
    });
  });

  describe('create', () => {
    it('从所选运单合同自动确定我方签约主体', async () => {
      prisma.waybill.findMany.mockResolvedValue([waybillBase] as any);
      prisma.logisticsSettlement.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'settlement-1', ...data }) as any);

      await service.create({
        periodStart: '2026-07-01', periodEnd: '2026-07-31',
        lines: [{ waybillId: 'waybill-1', manualUnitPrice: 100 }],
      }, 'user-1');

      expect(prisma.logisticsSettlement.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ payerPartnerId: 'partner-1', payerCompanyId: 'company-1' }),
      }));
    });

    it('不同我方签约主体的运单不能混在同一张结算单', async () => {
      prisma.waybill.findMany.mockResolvedValue([
        waybillBase,
        {
          ...waybillBase,
          id: 'waybill-2',
          waybillNo: 'WB-20260717-0002',
          dispatchNotice: { order: { contract: { signingPartnerId: 'partner-2', signingPartner: { id: 'partner-2', name: '另一主体' } } } },
        },
      ] as any);

      await expect(service.create({
        periodStart: '2026-07-01', periodEnd: '2026-07-31',
        lines: [{ waybillId: 'waybill-1' }, { waybillId: 'waybill-2' }],
      }, 'user-1')).rejects.toThrow('所选运单属于不同的我方签约主体');
    });

    it('匹配到生效合同运价时按合同价自动生成明细', async () => {
      prisma.waybill.findMany.mockResolvedValue([waybillBase] as any);
      prisma.logisticsSettlementLine.findMany.mockResolvedValueOnce([]);
      prisma.logisticsContractPriceTerm.findFirst.mockResolvedValue({ id: 'term-1', unitPrice: 106.5 } as any);
      prisma.logisticsSettlement.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'settlement-1', ...data }) as any);

      const result = await service.create({
        payerCompanyId: 'company-1', periodStart: '2026-07-01', periodEnd: '2026-07-31',
        lines: [{ waybillId: 'waybill-1' }],
      }, 'user-1');

      expect(prisma.logisticsSettlement.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          totalNetWeight: 104.06,
          totalGrossWeight: 125.84,
          totalAmount: 104.06 * 106.5,
          lines: { createMany: { data: [expect.objectContaining({
            waybillId: 'waybill-1', priceSource: 'CONTRACT', contractPriceTermId: 'term-1', unitPrice: 106.5,
          })] } },
        }),
      }));
      expect(result.id).toBe('settlement-1');
      expect(prisma.logisticsContractPriceTerm.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          originLocation: '额济纳',
          destinationLocation: '玉门',
          contract: { is: expect.objectContaining({ carrierPartnerId: 'carrier-1', companyId: 'company-1', status: 'ACTIVE' }) },
        }),
      }));
    });

    it('我方主体没有专属合同价时使用通用合同价', async () => {
      prisma.waybill.findMany.mockResolvedValue([waybillBase] as any);
      prisma.logisticsSettlementLine.findMany.mockResolvedValueOnce([]);
      prisma.logisticsContractPriceTerm.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'term-common', unitPrice: 98 } as any);
      prisma.logisticsSettlement.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'settlement-1', ...data }) as any);

      await service.create({
        payerCompanyId: 'company-1', periodStart: '2026-07-01', periodEnd: '2026-07-31',
        lines: [{ waybillId: 'waybill-1' }],
      }, 'user-1');

      expect(prisma.logisticsContractPriceTerm.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
        where: expect.objectContaining({
          contract: { is: expect.objectContaining({ companyId: null }) },
        }),
      }));
      expect(prisma.logisticsSettlement.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 104.06 * 98,
          lines: { createMany: { data: [expect.objectContaining({
            priceSource: 'CONTRACT', contractPriceTermId: 'term-common', unitPrice: 98,
          })] } },
        }),
      }));
    });

    it('没有匹配合同价时使用手工单价生成 MANUAL 明细', async () => {
      prisma.waybill.findMany.mockResolvedValue([waybillBase] as any);
      prisma.logisticsSettlementLine.findMany.mockResolvedValueOnce([]);
      prisma.logisticsSettlement.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'settlement-1', ...data }) as any);

      await service.create({
        payerCompanyId: 'company-1', periodStart: '2026-07-01', periodEnd: '2026-07-31',
        lines: [{ waybillId: 'waybill-1', manualUnitPrice: 100 }],
      }, 'user-1');

      expect(prisma.logisticsSettlement.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          lines: { createMany: { data: [expect.objectContaining({
            waybillId: 'waybill-1', priceSource: 'MANUAL', unitPrice: 100, amount: 104.06 * 100,
          })] } },
        }),
      }));
    });

    it('没有匹配合同价也没有手工单价时明细单价和金额为空', async () => {
      prisma.waybill.findMany.mockResolvedValue([waybillBase] as any);
      prisma.logisticsSettlementLine.findMany.mockResolvedValueOnce([]);
      prisma.logisticsSettlement.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'settlement-1', ...data }) as any);

      await service.create({
        payerCompanyId: 'company-1', periodStart: '2026-07-01', periodEnd: '2026-07-31',
        lines: [{ waybillId: 'waybill-1' }],
      }, 'user-1');

      expect(prisma.logisticsSettlement.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 0,
          lines: { createMany: { data: [expect.objectContaining({
            waybillId: 'waybill-1', priceSource: 'MANUAL', unitPrice: undefined, amount: undefined,
          })] } },
        }),
      }));
    });

    it('运单不是已签收状态时拒绝加入结算单', async () => {
      prisma.waybill.findMany.mockResolvedValue([{ ...waybillBase, status: 'ARRIVED' }] as any);
      await expect(service.create({
        payerCompanyId: 'company-1', periodStart: '2026-07-01', periodEnd: '2026-07-31',
        lines: [{ waybillId: 'waybill-1' }],
      }, 'user-1')).rejects.toThrow('尚未签收，不能加入结算单');
    });

    it('社会运力运单未绑定开票承运商时拒绝加入结算单', async () => {
      prisma.waybill.findMany.mockResolvedValue([{ ...waybillBase, carrierPartnerId: null }] as any);
      await expect(service.create({
        payerCompanyId: 'company-1', periodStart: '2026-07-01', periodEnd: '2026-07-31',
        lines: [{ waybillId: 'waybill-1' }],
      }, 'user-1')).rejects.toThrow('尚未确定开票承运商，不能加入结算单');
    });

    it('同一张运单不能在同一次请求中重复加入', async () => {
      await expect(service.create({
        payerCompanyId: 'company-1', periodStart: '2026-07-01', periodEnd: '2026-07-31',
        lines: [{ waybillId: 'waybill-1' }, { waybillId: 'waybill-1' }],
      }, 'user-1')).rejects.toThrow('同一张运单不能重复加入同一结算单');
    });

    it('运单已在其他有效结算单中时拒绝', async () => {
      prisma.waybill.findMany.mockResolvedValue([waybillBase] as any);
      prisma.logisticsSettlementLine.findMany.mockResolvedValueOnce([
        { waybill: { waybillNo: 'WB-20260717-0001' } },
      ] as any);

      await expect(service.create({
        payerCompanyId: 'company-1', periodStart: '2026-07-01', periodEnd: '2026-07-31',
        lines: [{ waybillId: 'waybill-1' }],
      }, 'user-1')).rejects.toThrow('已在其他有效结算单中');
    });

    it('运单尚未确认结算执行磅单时拒绝', async () => {
      prisma.waybill.findMany.mockResolvedValue([{ ...waybillBase, weightSelections: [] }] as any);
      prisma.logisticsSettlementLine.findMany.mockResolvedValueOnce([]);

      await expect(service.create({
        payerCompanyId: 'company-1', periodStart: '2026-07-01', periodEnd: '2026-07-31',
        lines: [{ waybillId: 'waybill-1' }],
      }, 'user-1')).rejects.toThrow('尚未确认结算执行磅单');
    });

    it('存在不在数据范围内的运单时拒绝', async () => {
      prisma.waybill.findMany.mockResolvedValue([]);
      await expect(service.create({
        payerCompanyId: 'company-1', periodStart: '2026-07-01', periodEnd: '2026-07-31',
        lines: [{ waybillId: 'waybill-1' }],
      }, 'user-1')).rejects.toThrow('存在不在当前数据范围内或不存在的运单');
    });
  });

  describe('setLinePrice', () => {
    const settlement = {
      id: 'settlement-1', status: 'DRAFT',
      lines: [{ id: 'line-1', netWeight: 100, priceSource: 'MANUAL', contractUnitPrice: null, overrideReason: null }],
    };

    it('MANUAL 明细调整单价不需要理由', async () => {
      prisma.logisticsSettlement.findFirst.mockResolvedValue(settlement as any);
      prisma.logisticsSettlementLine.update.mockResolvedValue({ id: 'line-1' } as any);
      prisma.logisticsSettlementLine.findMany.mockResolvedValue([{ netWeight: 100, amount: 10000 }] as any);

      await service.setLinePrice('settlement-1', 'line-1', { unitPrice: 100 }, 'user-1');

      expect(prisma.logisticsSettlementLine.update).toHaveBeenCalledWith({
        where: { id: 'line-1' },
        data: {
          unitPrice: 100, amount: 10000, priceSource: 'MANUAL',
          contractUnitPrice: null, overrideReason: null,
        },
      });
    });

    it('调整 CONTRACT 来源明细单价时必须填写理由', async () => {
      const contractSettlement = {
        id: 'settlement-1', status: 'DRAFT',
        lines: [{ id: 'line-1', netWeight: 100, priceSource: 'CONTRACT', unitPrice: 106.5, contractUnitPrice: null, overrideReason: null }],
      };
      prisma.logisticsSettlement.findFirst.mockResolvedValue(contractSettlement as any);

      await expect(service.setLinePrice('settlement-1', 'line-1', { unitPrice: 90 }, 'user-1'))
        .rejects.toThrow('调整合同单价必须填写调整原因');
    });

    it('非草稿状态的结算单不能调整单价', async () => {
      prisma.logisticsSettlement.findFirst.mockResolvedValue({ ...settlement, status: 'SUBMITTED' } as any);
      await expect(service.setLinePrice('settlement-1', 'line-1', { unitPrice: 100 }, 'user-1'))
        .rejects.toThrow('只有草稿状态的结算单可以调整单价');
    });

    it('明细不存在时抛出 NotFoundException', async () => {
      prisma.logisticsSettlement.findFirst.mockResolvedValue(settlement as any);
      await expect(service.setLinePrice('settlement-1', 'line-missing', { unitPrice: 100 }, 'user-1'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('submit', () => {
    it('存在未填写单价的明细时不能提交', async () => {
      prisma.logisticsSettlement.findFirst.mockResolvedValue({
        id: 'settlement-1', status: 'DRAFT', lines: [{ id: 'line-1', unitPrice: null }],
      } as any);
      await expect(service.submit('settlement-1', 'user-1')).rejects.toThrow('存在未填写单价的明细，请先补全后再提交');
    });

    it('单价均已填写时可以提交', async () => {
      prisma.logisticsSettlement.findFirst.mockResolvedValue({
        id: 'settlement-1', status: 'DRAFT', lines: [{ id: 'line-1', unitPrice: 100 }],
      } as any);
      prisma.logisticsSettlement.update.mockResolvedValue({ id: 'settlement-1', status: 'SUBMITTED' } as any);
      const result = await service.submit('settlement-1', 'user-1');
      expect(result.status).toBe('SUBMITTED');
    });

    it('非草稿状态不能重复提交', async () => {
      prisma.logisticsSettlement.findFirst.mockResolvedValue({ id: 'settlement-1', status: 'SUBMITTED', lines: [] } as any);
      await expect(service.submit('settlement-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('review', () => {
    it('只有已提交状态可以复核', async () => {
      prisma.logisticsSettlement.findFirst.mockResolvedValue({ id: 'settlement-1', status: 'DRAFT', lines: [] } as any);
      await expect(service.review('settlement-1', 'user-1')).rejects.toThrow('只有已提交状态可以复核');
    });

    it('复核通过后记录复核人和时间', async () => {
      prisma.logisticsSettlement.findFirst.mockResolvedValue({ id: 'settlement-1', status: 'SUBMITTED', lines: [] } as any);
      prisma.logisticsSettlement.update.mockResolvedValue({ id: 'settlement-1', status: 'REVIEWED' } as any);
      const result = await service.review('settlement-1', 'user-1');
      expect(result.status).toBe('REVIEWED');
      expect(prisma.logisticsSettlement.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'REVIEWED', reviewedBy: 'user-1' }),
      }));
    });
  });

  describe('voidSettlement', () => {
    it('DRAFT/SUBMITTED/REVIEWED 均可直接作废，不需要审批', async () => {
      prisma.logisticsSettlement.findFirst.mockResolvedValue({ id: 'settlement-1', status: 'REVIEWED', lines: [] } as any);
      prisma.logisticsSettlement.update.mockResolvedValue({ id: 'settlement-1', status: 'VOIDED' } as any);
      const result = await service.voidSettlement('settlement-1', 'user-1');
      expect(result.status).toBe('VOIDED');
    });

    it('已作废的结算单不能重复作废', async () => {
      prisma.logisticsSettlement.findFirst.mockResolvedValue({ id: 'settlement-1', status: 'VOIDED', lines: [] } as any);
      await expect(service.voidSettlement('settlement-1', 'user-1')).rejects.toThrow('结算单已作废');
    });
  });
});
