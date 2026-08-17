import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import {
  ConfirmProductionQualityDto,
  CreateProductionCompletionDto,
  CreateProductionRecipeDto,
  CreateProductionTaskDto,
  RecordProductionQuantitiesDto,
  ReserveProductionMaterialsDto,
  UpdateProductionRecipeDto,
} from './dto/production.dto';

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private readonly recipeInclude = {
    ownerPartner: { select: { id: true, code: true, name: true, isInternal: true } },
    outputMaterial: { select: { id: true, code: true, name: true, unit: true, referenceType: true } },
    inputs: {
      include: { material: { select: { id: true, code: true, name: true, unit: true, referenceType: true } } },
      orderBy: { sort: 'asc' as const },
    },
    creator: { select: { id: true, name: true } },
    _count: { select: { tasks: true } },
  };

  private readonly taskInclude = {
    recipe: { select: { id: true, recipeNo: true, name: true, processDescription: true, qualityRequirements: true } },
    ownerPartner: { select: { id: true, code: true, name: true } },
    processorOrganization: {
      include: { partner: { select: { id: true, code: true, name: true } } },
    },
    sourceWarehouse: { select: { id: true, code: true, name: true, address: true } },
    targetWarehouse: { select: { id: true, code: true, name: true, address: true } },
    outputMaterial: { select: { id: true, code: true, name: true, unit: true, referenceType: true } },
    creator: { select: { id: true, name: true } },
    inputs: {
      include: {
        material: { select: { id: true, code: true, name: true, unit: true, referenceType: true } },
        allocations: {
          include: {
            inventoryLot: {
              include: {
                warehouse: { select: { id: true, code: true, name: true } },
                inventoryOwner: { select: { id: true, code: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' as const },
        },
      },
      orderBy: { sort: 'asc' as const },
    },
    completions: {
      include: {
        creator: { select: { id: true, name: true } },
        qualityConfirmer: { select: { id: true, name: true } },
        poster: { select: { id: true, name: true } },
        inventoryLot: { select: { id: true, lotNo: true, availableQuantity: true, status: true } },
      },
      orderBy: { createdAt: 'asc' as const },
    },
  };

  private clean(value?: string | null) {
    return value?.trim() || null;
  }

  private async nextNo(prefix: string, count: number) {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `${prefix}-${date}-${String(count + 1).padStart(4, '0')}`;
  }

  private async assertAnyPermission(userId: string, permissions: string[]) {
    const context = await this.accessControl.getContext(userId);
    if (!context.isAdmin && !permissions.some(permission => context.permissions.includes(permission))) {
      throw new ForbiddenException(`缺少权限：${permissions.join(' 或 ')}`);
    }
    return context;
  }

  private async getSalesReservedByLot(lots: Array<{
    id: string;
    ownerPartnerId: string | null;
    warehouseId: string;
    materialId: string;
    availableQuantity: unknown;
    createdAt: Date;
  }>) {
    if (!lots.length) return new Map<string, number>();
    const lines = await this.prisma.outboundOrderLine.findMany({
      where: {
        materialId: { in: [...new Set(lots.map(lot => lot.materialId))] },
        outboundOrder: {
          status: { in: ['PENDING', 'PARTIAL'] },
          warehouseId: { in: [...new Set(lots.map(lot => lot.warehouseId))] },
          ownerPartnerId: { in: [...new Set(lots.map(lot => lot.ownerPartnerId).filter(Boolean) as string[])] },
        },
      },
      select: {
        materialId: true,
        reservedQuantity: true,
        actualQuantity: true,
        outboundOrder: { select: { warehouseId: true, ownerPartnerId: true } },
      },
    }) || [];
    const remainingByGroup = new Map<string, number>();
    for (const line of lines) {
      const key = `${line.outboundOrder.ownerPartnerId || 'UNASSIGNED'}:${line.outboundOrder.warehouseId}:${line.materialId}`;
      remainingByGroup.set(
        key,
        (remainingByGroup.get(key) || 0) + Math.max(0, Number(line.reservedQuantity) - Number(line.actualQuantity)),
      );
    }
    const result = new Map<string, number>();
    for (const lot of [...lots].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      const key = `${lot.ownerPartnerId || 'UNASSIGNED'}:${lot.warehouseId}:${lot.materialId}`;
      const reserved = Math.min(Number(lot.availableQuantity), remainingByGroup.get(key) || 0);
      result.set(lot.id, reserved);
      remainingByGroup.set(key, Math.max(0, (remainingByGroup.get(key) || 0) - reserved));
    }
    return result;
  }

  private async validateRecipeData(dto: CreateProductionRecipeDto) {
    if (!dto.inputs?.length) throw new BadRequestException('生产方案至少需要一种投入物料');
    const duplicateIds = dto.inputs.map(item => item.materialId).filter((id, index, all) => all.indexOf(id) !== index);
    if (duplicateIds.length) throw new BadRequestException('同一投入物料不能重复添加');
    if (dto.inputs.some(item => item.materialId === dto.outputMaterialId)) {
      throw new BadRequestException('实质生产加工的投入物料与产出物料必须使用不同物料编码');
    }
    const [owner, output, inputs] = await Promise.all([
      this.prisma.partner.findFirst({ where: { id: dto.ownerPartnerId, deletedAt: null, status: 'ACTIVE', isInternal: true } }),
      this.prisma.material.findFirst({ where: { id: dto.outputMaterialId, deletedAt: null, status: 'ACTIVE' } }),
      this.prisma.material.findMany({ where: { id: { in: dto.inputs.map(item => item.materialId) }, deletedAt: null, status: 'ACTIVE' } }),
    ]);
    if (!owner) throw new BadRequestException('生产方案必须选择有效的内部库存主体');
    if (!output) throw new BadRequestException('产出物料不存在或已停用');
    if (output.isVirtual) throw new BadRequestException('虚拟物料不能形成生产库存');
    if (inputs.length !== dto.inputs.length) throw new BadRequestException('存在无效或已停用的投入物料');
    if (inputs.some(material => material.isVirtual)) throw new BadRequestException('投入物料不能使用虚拟物料');
  }

  async createRecipe(dto: CreateProductionRecipeDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'production.manage');
    await this.validateRecipeData(dto);
    const count = await this.prisma.productionRecipe.count();
    return this.prisma.productionRecipe.create({
      data: {
        recipeNo: await this.nextNo('PRC', count),
        name: dto.name.trim(),
        ownerPartnerId: dto.ownerPartnerId,
        outputMaterialId: dto.outputMaterialId,
        baseOutputQuantity: dto.baseOutputQuantity,
        expectedYieldRate: dto.expectedYieldRate,
        lossToleranceRate: dto.lossToleranceRate ?? 5,
        qualityRequired: dto.qualityRequired ?? true,
        processDescription: this.clean(dto.processDescription),
        qualityRequirements: this.clean(dto.qualityRequirements),
        remark: this.clean(dto.remark),
        createdBy: userId,
        inputs: {
          create: dto.inputs.map((item, index) => ({
            materialId: item.materialId,
            materialRole: item.materialRole || 'RAW',
            quantity: item.quantity,
            unit: item.unit || 'TON',
            sort: index,
            remark: this.clean(item.remark),
          })),
        },
      },
      include: this.recipeInclude,
    });
  }

  async findRecipes(params: { search?: string; status?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'production.view');
    const scope = await this.accessControl.getProductionRecipeScope(userId);
    const where: Prisma.ProductionRecipeWhereInput = { deletedAt: null, AND: [scope] };
    if (params.status) where.status = params.status;
    if (params.search?.trim()) {
      const search = params.search.trim();
      where.OR = [
        { recipeNo: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { outputMaterial: { name: { contains: search, mode: 'insensitive' } } },
        { inputs: { some: { material: { name: { contains: search, mode: 'insensitive' } } } } },
      ];
    }
    return this.prisma.productionRecipe.findMany({ where, include: this.recipeInclude, orderBy: { createdAt: 'desc' } });
  }

  async findRecipe(id: string, userId: string, permission = 'production.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getProductionRecipeScope(userId);
    const recipe = await this.prisma.productionRecipe.findFirst({ where: { id, deletedAt: null, AND: [scope] }, include: this.recipeInclude });
    if (!recipe) throw new NotFoundException('生产方案不存在');
    return recipe;
  }

  async updateRecipe(id: string, dto: UpdateProductionRecipeDto, userId: string) {
    const recipe = await this.findRecipe(id, userId, 'production.manage');
    await this.validateRecipeData(dto);
    if (recipe._count.tasks > 0) {
      const identityChanged = recipe.ownerPartnerId !== dto.ownerPartnerId
        || recipe.outputMaterialId !== dto.outputMaterialId
        || Number(recipe.baseOutputQuantity) !== Number(dto.baseOutputQuantity);
      if (identityChanged) throw new BadRequestException('已被生产任务引用的方案不能修改库存主体、产出物料或基准产量');
    }
    return this.prisma.$transaction(async tx => {
      await tx.productionRecipeInput.deleteMany({ where: { recipeId: id } });
      return tx.productionRecipe.update({
        where: { id },
        data: {
          name: dto.name.trim(), ownerPartnerId: dto.ownerPartnerId, outputMaterialId: dto.outputMaterialId,
          baseOutputQuantity: dto.baseOutputQuantity, expectedYieldRate: dto.expectedYieldRate,
          lossToleranceRate: dto.lossToleranceRate ?? 5, qualityRequired: dto.qualityRequired ?? true,
          processDescription: this.clean(dto.processDescription), qualityRequirements: this.clean(dto.qualityRequirements),
          remark: this.clean(dto.remark), status: dto.status || recipe.status,
          inputs: { create: dto.inputs.map((item, index) => ({ materialId: item.materialId, materialRole: item.materialRole || 'RAW', quantity: item.quantity, unit: item.unit || 'TON', sort: index, remark: this.clean(item.remark) })) },
        },
        include: this.recipeInclude,
      });
    });
  }

  async createTask(dto: CreateProductionTaskDto, userId: string) {
    await this.accessControl.assertPermission(userId, 'production.manage');
    const recipe = await this.prisma.productionRecipe.findFirst({
      where: { id: dto.recipeId, deletedAt: null, status: 'ACTIVE' }, include: { inputs: true },
    });
    if (!recipe) throw new BadRequestException('生产方案不存在或已停用');
    if (recipe.ownerPartnerId !== dto.ownerPartnerId) throw new BadRequestException('生产任务库存主体必须与生产方案一致');
    const warehouses = await this.prisma.warehouse.findMany({
      where: { id: { in: [dto.sourceWarehouseId, dto.targetWarehouseId] }, deletedAt: null, status: 'ACTIVE' },
    });
    if (new Set(warehouses.map(item => item.id)).size !== new Set([dto.sourceWarehouseId, dto.targetWarehouseId]).size) {
      throw new BadRequestException('原料仓库或成品仓库不存在或已停用');
    }
    if (dto.mode === 'OUTSOURCED') {
      if (!dto.processorOrganizationId) throw new BadRequestException('委外加工必须选择加工服务商');
      const processor = await this.prisma.serviceOrganization.findFirst({
        where: { id: dto.processorOrganizationId, organizationType: 'PROCESSING_PROVIDER', status: 'ACTIVE', deletedAt: null },
      });
      if (!processor) throw new BadRequestException('加工服务商不存在或已停用');
    }
    const factor = dto.plannedOutputQuantity / Number(recipe.baseOutputQuantity);
    const count = await this.prisma.productionTask.count();
    return this.prisma.productionTask.create({
      data: {
        taskNo: await this.nextNo('MO', count), name: dto.name.trim(), mode: dto.mode,
        recipeId: recipe.id, ownerPartnerId: dto.ownerPartnerId,
        processorOrganizationId: dto.mode === 'OUTSOURCED' ? dto.processorOrganizationId : null,
        sourceWarehouseId: dto.sourceWarehouseId, targetWarehouseId: dto.targetWarehouseId,
        outputMaterialId: recipe.outputMaterialId, sourceType: dto.sourceType || 'MANUAL',
        sourceOrderId: this.clean(dto.sourceOrderId), sourceOrderNo: this.clean(dto.sourceOrderNo),
        plannedOutputQuantity: dto.plannedOutputQuantity, lossToleranceRate: recipe.lossToleranceRate,
        qualityRequired: recipe.qualityRequired, processingFeeRate: dto.processingFeeRate,
        operatorName: this.clean(dto.operatorName),
        plannedStartAt: dto.plannedStartAt ? new Date(dto.plannedStartAt) : null,
        plannedEndAt: dto.plannedEndAt ? new Date(dto.plannedEndAt) : null,
        remarks: this.clean(dto.remarks), createdBy: userId,
        inputs: {
          create: recipe.inputs.map(input => ({
            materialId: input.materialId, materialRole: input.materialRole,
            plannedQuantity: Number((Number(input.quantity) * factor).toFixed(3)), unit: input.unit,
            sort: input.sort, remark: input.remark,
          })),
        },
      },
      include: this.taskInclude,
    });
  }

  async findTasks(params: { search?: string; status?: string; mode?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'production.view');
    const scope = await this.accessControl.getProductionTaskScope(userId);
    const where: Prisma.ProductionTaskWhereInput = { deletedAt: null, AND: [scope] };
    if (params.status) where.status = params.status;
    if (params.mode) where.mode = params.mode;
    if (params.search?.trim()) {
      const search = params.search.trim();
      where.OR = [
        { taskNo: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { sourceOrderNo: { contains: search, mode: 'insensitive' } },
        { outputMaterial: { name: { contains: search, mode: 'insensitive' } } },
        { processorOrganization: { partner: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }
    const items = await this.prisma.productionTask.findMany({ where, include: this.taskInclude, orderBy: { createdAt: 'desc' }, take: 200 });
    return { items, summary: this.taskSummary(items) };
  }

  private taskSummary(items: Array<{ status: string; plannedOutputQuantity: Prisma.Decimal; qualifiedQuantity: Prisma.Decimal }>) {
    return {
      total: items.length,
      active: items.filter(item => ['RELEASED', 'MATERIAL_PREPARED', 'IN_PROGRESS', 'PENDING_QC', 'PARTIAL_COMPLETED'].includes(item.status)).length,
      pendingQc: items.filter(item => item.status === 'PENDING_QC').length,
      completed: items.filter(item => ['COMPLETED', 'CLOSED'].includes(item.status)).length,
      plannedOutputQuantity: items.reduce((sum, item) => sum + Number(item.plannedOutputQuantity), 0),
      qualifiedQuantity: items.reduce((sum, item) => sum + Number(item.qualifiedQuantity), 0),
    };
  }

  async findTask(id: string, userId: string, permission = 'production.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getProductionTaskScope(userId);
    const task = await this.prisma.productionTask.findFirst({ where: { id, deletedAt: null, AND: [scope] }, include: this.taskInclude });
    if (!task) throw new NotFoundException('生产任务不存在');
    return task;
  }

  async releaseTask(id: string, userId: string) {
    const task = await this.findTask(id, userId, 'production.manage');
    if (task.status !== 'DRAFT') throw new BadRequestException('只有草稿生产任务可以下达');
    if (!task.inputs.length) throw new BadRequestException('生产任务缺少投入物料');
    await this.prisma.productionTask.update({ where: { id }, data: { status: 'RELEASED', releasedAt: new Date() } });
    return this.findTask(id, userId, 'production.manage');
  }

  async eligibleLots(id: string, userId: string) {
    const task = await this.findTask(id, userId);
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        warehouseId: task.sourceWarehouseId, ownerPartnerId: task.ownerPartnerId,
        materialId: { in: task.inputs.map(item => item.materialId) }, status: 'AVAILABLE', availableQuantity: { gt: 0 },
      },
      include: { material: { select: { id: true, code: true, name: true, unit: true } }, warehouse: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const reserved = await this.prisma.productionMaterialAllocation.groupBy({
      by: ['inventoryLotId'],
      where: {
        inventoryLotId: { in: lots.map(lot => lot.id) }, issuedQuantity: 0,
        taskInput: { task: { id: { not: id }, deletedAt: null, status: { in: ['RELEASED', 'MATERIAL_PREPARED'] } } },
      },
      _sum: { reservedQuantity: true },
    });
    const reservedMap = new Map(reserved.map(item => [item.inventoryLotId, Number(item._sum.reservedQuantity || 0)]));
    const salesReservedMap = await this.getSalesReservedByLot(lots);
    return task.inputs.map(input => ({
      taskInputId: input.id, material: input.material, plannedQuantity: input.plannedQuantity,
      reservedQuantity: input.reservedQuantity,
      lots: lots.filter(lot => lot.materialId === input.materialId).map(lot => ({
        ...lot,
        reservedSalesQuantity: salesReservedMap.get(lot.id) || 0,
        availableToReserve: Math.max(
          0,
          Number(lot.availableQuantity)
            - (reservedMap.get(lot.id) || 0)
            - (salesReservedMap.get(lot.id) || 0),
        ),
      })),
    }));
  }

  async reserveMaterials(id: string, dto: ReserveProductionMaterialsDto, userId: string) {
    const task = await this.findTask(id, userId, 'production.manage');
    if (!['RELEASED', 'MATERIAL_PREPARED'].includes(task.status)) throw new BadRequestException('只有已下达或待领料任务可以预占原料');
    if (task.inputs.some(input => Number(input.issuedQuantity) > 0)) throw new BadRequestException('任务已经领料，不能重新分配原料批次');
    if (!dto.allocations.length) throw new BadRequestException('请选择需要预占的原料批次');
    const inputMap = new Map(task.inputs.map(input => [input.id, input]));
    const uniqueKeys = new Set<string>();
    for (const item of dto.allocations) {
      if (!inputMap.has(item.taskInputId)) throw new BadRequestException('原料行不属于当前生产任务');
      const key = `${item.taskInputId}:${item.inventoryLotId}`;
      if (uniqueKeys.has(key)) throw new BadRequestException('同一原料批次不能重复分配');
      uniqueKeys.add(key);
    }
    const lotIds = [...new Set(dto.allocations.map(item => item.inventoryLotId))];
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        warehouseId: task.sourceWarehouseId,
        ownerPartnerId: task.ownerPartnerId,
        materialId: { in: task.inputs.map(input => input.materialId) },
        status: 'AVAILABLE',
        availableQuantity: { gt: 0 },
      },
    });
    const lotMap = new Map(lots.map(lot => [lot.id, lot]));
    const otherReservations = await this.prisma.productionMaterialAllocation.groupBy({
      by: ['inventoryLotId'], where: { inventoryLotId: { in: lotIds }, issuedQuantity: 0, taskInput: { taskId: { not: id }, task: { status: { in: ['RELEASED', 'MATERIAL_PREPARED'] } } } }, _sum: { reservedQuantity: true },
    });
    const otherMap = new Map(otherReservations.map(item => [item.inventoryLotId, Number(item._sum.reservedQuantity || 0)]));
    const salesReservedMap = await this.getSalesReservedByLot(lots);
    for (const item of dto.allocations) {
      const input = inputMap.get(item.taskInputId)!;
      const lot = lotMap.get(item.inventoryLotId);
      if (!lot || lot.ownerPartnerId !== task.ownerPartnerId || lot.warehouseId !== task.sourceWarehouseId || lot.materialId !== input.materialId || lot.status !== 'AVAILABLE') {
        throw new BadRequestException('选择的库存批次与任务主体、仓库或物料不一致');
      }
      const available = Number(lot.availableQuantity)
        - (otherMap.get(lot.id) || 0)
        - (salesReservedMap.get(lot.id) || 0);
      if (item.quantity > available + 0.0005) throw new BadRequestException(`库存批次 ${lot.lotNo} 可预占数量不足`);
    }
    const grouped = new Map<string, number>();
    dto.allocations.forEach(item => grouped.set(item.taskInputId, (grouped.get(item.taskInputId) || 0) + item.quantity));
    for (const input of task.inputs) {
      if ((grouped.get(input.id) || 0) > Number(input.plannedQuantity) + 0.0005) throw new BadRequestException(`${input.material.name} 预占数量不能超过计划用量`);
    }
    const fullyPrepared = task.inputs.every(input => (grouped.get(input.id) || 0) >= Number(input.plannedQuantity) - 0.0005);
    await this.prisma.$transaction(async tx => {
      await tx.productionMaterialAllocation.deleteMany({ where: { taskInput: { taskId: id } } });
      await tx.productionMaterialAllocation.createMany({ data: dto.allocations.map(item => ({ taskInputId: item.taskInputId, inventoryLotId: item.inventoryLotId, reservedQuantity: item.quantity })) });
      for (const input of task.inputs) await tx.productionTaskInput.update({ where: { id: input.id }, data: { reservedQuantity: grouped.get(input.id) || 0 } });
      await tx.productionTask.update({ where: { id }, data: { status: fullyPrepared ? 'MATERIAL_PREPARED' : 'RELEASED' } });
    });
    return this.findTask(id, userId, 'production.manage');
  }

  async issueMaterials(id: string, userId: string) {
    const task = await this.findTask(id, userId, 'production.post');
    if (task.status !== 'MATERIAL_PREPARED') throw new BadRequestException('全部计划原料完成预占后才能领料');
    if (!task.inputs.every(input => input.allocations.length && Number(input.reservedQuantity) >= Number(input.plannedQuantity) - 0.0005)) {
      throw new BadRequestException('原料预占未达到计划用量');
    }
    await this.prisma.$transaction(async tx => {
      for (const input of task.inputs) {
        for (const allocation of input.allocations) {
          const quantity = Number(allocation.reservedQuantity);
          const updated = await tx.inventoryLot.updateMany({
            where: { id: allocation.inventoryLotId, availableQuantity: { gte: quantity }, status: 'AVAILABLE' },
            data: { availableQuantity: { decrement: quantity } },
          });
          if (updated.count !== 1) throw new BadRequestException(`库存批次 ${allocation.inventoryLot.lotNo} 数量不足，领料失败`);
          const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: allocation.inventoryLotId } });
          await tx.productionMaterialAllocation.update({ where: { id: allocation.id }, data: { issuedQuantity: quantity } });
          await tx.inventoryLedger.create({ data: {
            lotId: lot.id, warehouseId: lot.warehouseId, materialId: lot.materialId,
            businessType: 'PRODUCTION_ISSUE', businessNo: task.taskNo, quantityChange: -quantity,
            balanceAfter: lot.availableQuantity,
            remarks: task.mode === 'OUTSOURCED' ? `委外发料进入生产任务 ${task.taskNo} 在制台账` : `生产领料进入任务 ${task.taskNo} 在制台账`,
            createdBy: userId,
          } });
          if (Number(lot.availableQuantity) <= 0) await tx.inventoryLot.update({ where: { id: lot.id }, data: { status: 'DEPLETED' } });
        }
        await tx.productionTaskInput.update({ where: { id: input.id }, data: { issuedQuantity: input.reservedQuantity } });
      }
      await tx.productionTask.update({ where: { id }, data: { status: 'IN_PROGRESS', actualStartAt: task.actualStartAt || new Date() } });
    });
    return this.findTask(id, userId, 'production.post');
  }

  async consumeMaterials(id: string, dto: RecordProductionQuantitiesDto, userId: string) {
    const task = await this.findTask(id, userId, 'production.manage');
    if (!['IN_PROGRESS', 'PENDING_QC', 'PARTIAL_COMPLETED'].includes(task.status)) throw new BadRequestException('当前任务状态不能记录投料耗用');
    const allocationMap = new Map(task.inputs.flatMap(input => input.allocations).map(item => [item.id, item]));
    await this.prisma.$transaction(async tx => {
      for (const item of dto.allocations) {
        const allocation = allocationMap.get(item.allocationId);
        if (!allocation) throw new BadRequestException('原料批次分配记录不存在');
        const remaining = Number(allocation.issuedQuantity) - Number(allocation.consumedQuantity) - Number(allocation.returnedQuantity);
        if (item.quantity > remaining + 0.0005) throw new BadRequestException(`库存批次 ${allocation.inventoryLot.lotNo} 可耗用数量不足`);
        await tx.productionMaterialAllocation.update({ where: { id: item.allocationId }, data: { consumedQuantity: { increment: item.quantity } } });
        await tx.productionTaskInput.update({ where: { id: allocation.taskInputId }, data: { consumedQuantity: { increment: item.quantity } } });
      }
    });
    return this.findTask(id, userId, 'production.manage');
  }

  async returnMaterials(id: string, dto: RecordProductionQuantitiesDto, userId: string) {
    const task = await this.findTask(id, userId, 'production.post');
    if (!['IN_PROGRESS', 'PENDING_QC', 'PARTIAL_COMPLETED', 'COMPLETED'].includes(task.status)) throw new BadRequestException('当前任务状态不能退料');
    const allocationMap = new Map(task.inputs.flatMap(input => input.allocations).map(item => [item.id, item]));
    await this.prisma.$transaction(async tx => {
      for (const item of dto.allocations) {
        const allocation = allocationMap.get(item.allocationId);
        if (!allocation) throw new BadRequestException('原料批次分配记录不存在');
        const remaining = Number(allocation.issuedQuantity) - Number(allocation.consumedQuantity) - Number(allocation.returnedQuantity);
        if (item.quantity > remaining + 0.0005) throw new BadRequestException(`库存批次 ${allocation.inventoryLot.lotNo} 可退数量不足`);
        const lot = await tx.inventoryLot.update({ where: { id: allocation.inventoryLotId }, data: { availableQuantity: { increment: item.quantity }, status: 'AVAILABLE' } });
        await tx.productionMaterialAllocation.update({ where: { id: item.allocationId }, data: { returnedQuantity: { increment: item.quantity } } });
        await tx.productionTaskInput.update({ where: { id: allocation.taskInputId }, data: { returnedQuantity: { increment: item.quantity } } });
        await tx.inventoryLedger.create({ data: {
          lotId: lot.id, warehouseId: lot.warehouseId, materialId: lot.materialId,
          businessType: 'PRODUCTION_RETURN', businessNo: task.taskNo, quantityChange: item.quantity,
          balanceAfter: lot.availableQuantity, remarks: dto.remarks?.trim() || `生产任务 ${task.taskNo} 余料退回`, createdBy: userId,
        } });
      }
    });
    return this.findTask(id, userId, 'production.post');
  }

  async createCompletion(id: string, dto: CreateProductionCompletionDto, userId: string) {
    const task = await this.findTask(id, userId, 'production.manage');
    if (!['IN_PROGRESS', 'PENDING_QC', 'PARTIAL_COMPLETED'].includes(task.status)) throw new BadRequestException('只有加工中的任务可以申报完工');
    const consumed = task.inputs.reduce((sum, input) => sum + Number(input.consumedQuantity), 0);
    if (consumed <= 0) throw new BadRequestException('请先记录实际投料耗用，再申报完工');
    const pendingQuantity = task.completions.filter(item => !['REWORK', 'SCRAPPED'].includes(item.status)).reduce((sum, item) => sum + Number(item.quantity), 0);
    const maxAllowed = Number(task.plannedOutputQuantity) * (1 + Number(task.lossToleranceRate) / 100);
    if (pendingQuantity + dto.quantity > maxAllowed + 0.0005) throw new BadRequestException('累计完工数量超过计划产量及允许偏差');
    const count = await this.prisma.productionCompletion.count();
    await this.prisma.$transaction(async tx => {
      await tx.productionCompletion.create({ data: {
        completionNo: await this.nextNo('PC', count), taskId: id, materialId: task.outputMaterialId,
        quantity: dto.quantity, status: task.qualityRequired ? 'PENDING_QC' : 'READY_TO_POST',
        qualityConclusion: task.qualityRequired ? 'PENDING' : 'PASS',
        producedAt: dto.producedAt ? new Date(dto.producedAt) : new Date(), remarks: this.clean(dto.remarks), createdBy: userId,
      } });
      await tx.productionTask.update({ where: { id }, data: { status: task.qualityRequired ? 'PENDING_QC' : 'IN_PROGRESS' } });
    });
    return this.findTask(id, userId, 'production.manage');
  }

  async confirmCompletionQuality(completionId: string, dto: ConfirmProductionQualityDto, userId: string) {
    await this.assertAnyPermission(userId, ['quality.manage', 'production.manage']);
    const completion = await this.prisma.productionCompletion.findUnique({ include: { task: true }, where: { id: completionId } });
    if (!completion) throw new NotFoundException('完工申报不存在');
    const scope = await this.accessControl.getProductionTaskScope(userId);
    const visible = await this.prisma.productionTask.count({ where: { id: completion.taskId, AND: [scope] } });
    if (!visible) throw new NotFoundException('完工申报不存在');
    if (completion.status !== 'PENDING_QC') throw new BadRequestException('只有待质检完工申报可以确认质量结论');
    if (dto.conclusion !== 'PASS' && !dto.remark?.trim()) throw new BadRequestException('返工或报废必须填写质检说明');
    const status = dto.conclusion === 'PASS' ? 'READY_TO_POST' : dto.conclusion === 'REWORK' ? 'REWORK' : 'SCRAPPED';
    await this.prisma.productionCompletion.update({ where: { id: completionId }, data: {
      status, qualityConclusion: dto.conclusion, qualityRemark: this.clean(dto.remark), qualityConfirmedBy: userId, qualityConfirmedAt: new Date(),
    } });
    const pending = await this.prisma.productionCompletion.count({ where: { taskId: completion.taskId, status: 'PENDING_QC' } });
    if (!pending) await this.prisma.productionTask.update({ where: { id: completion.taskId }, data: { status: 'IN_PROGRESS' } });
    return this.findTask(completion.taskId, userId);
  }

  async postCompletion(completionId: string, userId: string) {
    await this.accessControl.assertPermission(userId, 'production.post');
    const completion = await this.prisma.productionCompletion.findUnique({ where: { id: completionId }, include: { task: { include: { processorOrganization: { include: { partner: true } } } }, inventoryLot: true } });
    if (!completion) throw new NotFoundException('完工申报不存在');
    const scope = await this.accessControl.getProductionTaskScope(userId);
    if (!await this.prisma.productionTask.count({ where: { id: completion.taskId, AND: [scope] } })) throw new NotFoundException('完工申报不存在');
    if (completion.inventoryLot || completion.status === 'POSTED') return this.findTask(completion.taskId, userId, 'production.post');
    if (completion.status !== 'READY_TO_POST' || completion.qualityConclusion !== 'PASS') throw new BadRequestException('只有质检合格的完工申报可以生产入库');
    const quantity = Number(completion.quantity);
    const postedBefore = await this.prisma.productionCompletion.aggregate({ where: { taskId: completion.taskId, status: 'POSTED' }, _sum: { quantity: true } });
    const qualifiedQuantity = Number(postedBefore._sum.quantity || 0) + quantity;
    const consumed = await this.prisma.productionTaskInput.aggregate({
      where: { taskId: completion.taskId, materialRole: 'RAW' },
      _sum: { consumedQuantity: true },
    });
    const consumedQuantity = Number(consumed._sum.consumedQuantity || 0);
    const yieldRate = consumedQuantity > 0 ? qualifiedQuantity / consumedQuantity * 100 : null;
    const isCompleted = qualifiedQuantity >= Number(completion.task.plannedOutputQuantity) - 0.0005;
    const lotNo = `LOT-${completion.completionNo}`;
    await this.prisma.$transaction(async tx => {
      const lot = await tx.inventoryLot.create({ data: {
        lotNo, productionCompletionId: completion.id, warehouseId: completion.task.targetWarehouseId,
        ownerPartnerId: completion.task.ownerPartnerId, materialId: completion.materialId,
        materialName: (await tx.material.findUniqueOrThrow({ where: { id: completion.materialId } })).name,
        supplierName: completion.task.processorOrganization?.partner.name || '自营生产', initialQuantity: quantity,
        availableQuantity: quantity, qualityConclusion: 'PASS', status: 'AVAILABLE',
      } });
      await tx.inventoryLedger.create({ data: {
        lotId: lot.id, warehouseId: lot.warehouseId, materialId: lot.materialId,
        businessType: 'PRODUCTION_INBOUND', businessNo: completion.completionNo,
        quantityChange: quantity, balanceAfter: quantity,
        remarks: `由生产任务 ${completion.task.taskNo} 完工入库生成`, createdBy: userId,
      } });
      await tx.productionCompletion.update({ where: { id: completion.id }, data: { status: 'POSTED', postedBy: userId, postedAt: new Date() } });
      await tx.productionTask.update({ where: { id: completion.taskId }, data: {
        completedQuantity: qualifiedQuantity, qualifiedQuantity, actualYieldRate: yieldRate,
        status: isCompleted ? 'COMPLETED' : 'PARTIAL_COMPLETED', actualEndAt: isCompleted ? new Date() : null,
      } });
    });
    return this.findTask(completion.taskId, userId, 'production.post');
  }

  async closeTask(id: string, userId: string) {
    const task = await this.findTask(id, userId, 'production.manage');
    if (task.status !== 'COMPLETED') throw new BadRequestException('只有已完工任务可以关闭');
    if (task.completions.some(item => ['PENDING_QC', 'READY_TO_POST'].includes(item.status))) throw new BadRequestException('仍有待质检或待入库的完工申报');
    const unresolved = task.inputs.some(input => Number(input.issuedQuantity) - Number(input.consumedQuantity) - Number(input.returnedQuantity) > 0.0005);
    if (unresolved) throw new BadRequestException('仍有已领未耗原料，请先投料或退料');
    await this.prisma.productionTask.update({ where: { id }, data: { status: 'CLOSED', actualEndAt: task.actualEndAt || new Date() } });
    return this.findTask(id, userId, 'production.manage');
  }

  async cancelTask(id: string, userId: string) {
    const task = await this.findTask(id, userId, 'production.manage');
    if (!['DRAFT', 'RELEASED', 'MATERIAL_PREPARED'].includes(task.status)) throw new BadRequestException('已经领料或开始加工的任务不能直接取消');
    if (task.inputs.some(input => Number(input.issuedQuantity) > 0)) throw new BadRequestException('已领料任务不能取消');
    await this.prisma.$transaction(async tx => {
      await tx.productionMaterialAllocation.deleteMany({ where: { taskInput: { taskId: id } } });
      await tx.productionTask.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
    return this.findTask(id, userId, 'production.manage');
  }

  async traceability(userId: string, search?: string) {
    await this.accessControl.assertPermission(userId, 'production.view');
    const scope = await this.accessControl.getProductionTaskScope(userId);
    return this.prisma.productionCompletion.findMany({
      where: {
        status: 'POSTED', task: { AND: [scope] },
        ...(search?.trim() ? { OR: [
          { completionNo: { contains: search.trim(), mode: 'insensitive' } },
          { task: { taskNo: { contains: search.trim(), mode: 'insensitive' } } },
          { material: { name: { contains: search.trim(), mode: 'insensitive' } } },
          { inventoryLot: { lotNo: { contains: search.trim(), mode: 'insensitive' } } },
        ] } : {}),
      },
      include: {
        material: { select: { code: true, name: true, unit: true } }, inventoryLot: true,
        task: { include: {
          ownerPartner: { select: { code: true, name: true } }, sourceWarehouse: { select: { code: true, name: true } }, targetWarehouse: { select: { code: true, name: true } },
          processorOrganization: { include: { partner: { select: { code: true, name: true } } } },
          inputs: { include: { material: { select: { code: true, name: true, unit: true } }, allocations: { include: { inventoryLot: { select: { lotNo: true } } } } } },
        } },
      },
      orderBy: { postedAt: 'desc' }, take: 200,
    });
  }
}
