import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { ProductionService } from './production.service';

describe('ProductionService', () => {
  const prisma = mockDeep<PrismaService>();
  const accessControl = {
    assertPermission: jest.fn().mockResolvedValue({}),
    getContext: jest.fn().mockResolvedValue({ isAdmin: true, permissions: [] }),
    getProductionRecipeScope: jest.fn().mockResolvedValue({}),
    getProductionTaskScope: jest.fn().mockResolvedValue({}),
  };
  let service: ProductionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProductionService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessControlService, useValue: accessControl },
      ],
    }).compile();
    service = module.get(ProductionService);
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
  });

  it('生产方案的投入与产出必须使用不同物料编码', async () => {
    await expect(service.createRecipe({
      name: '加工方案', ownerPartnerId: 'owner-1', outputMaterialId: 'material-1',
      baseOutputQuantity: 100, inputs: [{ materialId: 'material-1', quantity: 105 }],
    }, 'user-1')).rejects.toThrow('投入物料与产出物料必须使用不同物料编码');
  });

  it('按基准方案比例生成生产任务计划用量', async () => {
    prisma.productionRecipe.findFirst.mockResolvedValue({
      id: 'recipe-1', ownerPartnerId: 'owner-1', outputMaterialId: 'finished-1',
      baseOutputQuantity: 100, lossToleranceRate: 5, qualityRequired: true,
      inputs: [{ materialId: 'raw-1', materialRole: 'RAW', quantity: 108, unit: 'TON', sort: 0, remark: null }],
    } as any);
    prisma.warehouse.findMany.mockResolvedValue([{ id: 'warehouse-1' }, { id: 'warehouse-2' }] as any);
    prisma.productionTask.count.mockResolvedValue(0);
    prisma.productionTask.create.mockResolvedValue({ id: 'task-1' } as any);

    await service.createTask({
      name: '200吨任务', mode: 'INTERNAL', recipeId: 'recipe-1', ownerPartnerId: 'owner-1',
      sourceWarehouseId: 'warehouse-1', targetWarehouseId: 'warehouse-2', plannedOutputQuantity: 200,
    }, 'user-1');

    expect(prisma.productionTask.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        plannedOutputQuantity: 200,
        inputs: { create: [expect.objectContaining({ materialId: 'raw-1', plannedQuantity: 216 })] },
      }),
    }));
  });

  it('委外生产必须选择已维护的加工服务商', async () => {
    prisma.productionRecipe.findFirst.mockResolvedValue({
      id: 'recipe-1', ownerPartnerId: 'owner-1', outputMaterialId: 'finished-1',
      baseOutputQuantity: 100, inputs: [],
    } as any);
    prisma.warehouse.findMany.mockResolvedValue([{ id: 'warehouse-1' }, { id: 'warehouse-2' }] as any);

    await expect(service.createTask({
      name: '委外任务', mode: 'OUTSOURCED', recipeId: 'recipe-1', ownerPartnerId: 'owner-1',
      sourceWarehouseId: 'warehouse-1', targetWarehouseId: 'warehouse-2', plannedOutputQuantity: 100,
    }, 'user-1')).rejects.toThrow('委外加工必须选择加工服务商');
  });

  it('领料扣减原库存批次并写入生产领料台账', async () => {
    const task = {
      id: 'task-1', taskNo: 'MO-001', status: 'MATERIAL_PREPARED', mode: 'INTERNAL',
      actualStartAt: null,
      inputs: [{
        id: 'input-1', plannedQuantity: 10, reservedQuantity: 10,
        allocations: [{
          id: 'allocation-1', inventoryLotId: 'lot-1', reservedQuantity: 10,
          inventoryLot: { id: 'lot-1', lotNo: 'LOT-001' },
        }],
      }],
    };
    prisma.productionTask.findFirst.mockResolvedValue(task as any);
    prisma.inventoryLot.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryLot.findUniqueOrThrow.mockResolvedValue({
      id: 'lot-1', warehouseId: 'warehouse-1', materialId: 'raw-1', availableQuantity: 20,
    } as any);

    await service.issueMaterials('task-1', 'user-1');

    expect(prisma.inventoryLot.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { availableQuantity: { decrement: 10 } },
    }));
    expect(prisma.inventoryLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessType: 'PRODUCTION_ISSUE', quantityChange: -10, balanceAfter: 20 }),
    }));
    expect(prisma.productionTask.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'IN_PROGRESS' }),
    }));
  });

  it('返工或报废质量结论必须填写原因', async () => {
    prisma.productionCompletion.findUnique.mockResolvedValue({ id: 'completion-1', taskId: 'task-1', status: 'PENDING_QC' } as any);
    prisma.productionTask.count.mockResolvedValue(1);

    await expect(service.confirmCompletionQuality('completion-1', { conclusion: 'REWORK' }, 'user-1'))
      .rejects.toThrow(BadRequestException);
  });

  it('合格完工过账生成产成品库存批次和生产入库台账', async () => {
    prisma.productionCompletion.findUnique.mockResolvedValue({
      id: 'completion-1', completionNo: 'PC-001', taskId: 'task-1', materialId: 'finished-1',
      quantity: 90, status: 'READY_TO_POST', qualityConclusion: 'PASS', inventoryLot: null,
      task: {
        taskNo: 'MO-001', targetWarehouseId: 'warehouse-2', ownerPartnerId: 'owner-1',
        plannedOutputQuantity: 90, processorOrganization: null,
      },
    } as any);
    prisma.productionTask.count.mockResolvedValue(1);
    prisma.productionCompletion.aggregate.mockResolvedValue({ _sum: { quantity: 0 } } as any);
    prisma.productionTaskInput.aggregate.mockResolvedValue({ _sum: { consumedQuantity: 100 } } as any);
    prisma.material.findUniqueOrThrow.mockResolvedValue({ name: '产成品' } as any);
    prisma.inventoryLot.create.mockResolvedValue({
      id: 'finished-lot', warehouseId: 'warehouse-2', materialId: 'finished-1', availableQuantity: 90,
    } as any);

    await service.postCompletion('completion-1', 'user-1');

    expect(prisma.inventoryLot.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lotNo: 'LOT-PC-001', productionCompletionId: 'completion-1', availableQuantity: 90 }),
    }));
    expect(prisma.inventoryLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessType: 'PRODUCTION_INBOUND', quantityChange: 90 }),
    }));
    expect(prisma.productionTask.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'COMPLETED', actualYieldRate: 90 }),
    }));
  });
});
