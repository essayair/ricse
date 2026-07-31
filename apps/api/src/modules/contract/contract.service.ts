import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractStatusDto } from './dto/update-status.dto';
import { Prisma } from '@prisma/client';
import { normalizeUploadFilename } from '../common/filename-encoding';
import { AccessControlService } from '../access-control/access-control.service';

type QuantityValue = { quantity: unknown; unit: string };
type ApprovalContractContext = {
  type: string;
  totalAmount: unknown;
  companyId?: string | null;
  departmentId?: string | null;
  createdBy: string;
};

function sumQuantities(lines: QuantityValue[]) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.unit, (totals.get(line.unit) || 0) + Number(line.quantity || 0));
  }
  return Array.from(totals.entries()).map(([unit, quantity]) => ({ unit, quantity }));
}

function subtractQuantities(
  total: Array<{ unit: string; quantity: number }>,
  ...deductions: Array<Array<{ unit: string; quantity: number }>>
) {
  const deducted = new Map<string, number>();
  deductions.flat().forEach((item) => deducted.set(item.unit, (deducted.get(item.unit) || 0) + item.quantity));
  return total.map((item) => ({
    unit: item.unit,
    quantity: Math.max(0, item.quantity - (deducted.get(item.unit) || 0)),
  }));
}

function sumAmounts(items: Array<{ totalAmount: unknown }>) {
  return items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
}

@Injectable()
export class ContractService {
  constructor(
    private prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private readonly include = {
    lineItems: { orderBy: { createdAt: 'asc' as const } },
    creator: { select: { id: true, name: true, username: true } },
    approvals: {
      include: {
        assignee: { select: { id: true, name: true, role: true } },
        actedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: [{ round: 'desc' as const }, { step: 'asc' as const }],
    },
    seller: { select: { id: true, code: true, name: true, roles: true } },
    buyer: { select: { id: true, code: true, name: true, roles: true } },
    signingPartner: { select: { id: true, code: true, name: true, roles: true, isInternal: true } },
    company: { select: { id: true, code: true, name: true } },
    attachments: { orderBy: { createdAt: 'desc' as const } },
    orders: {
      where: { deletedAt: null },
      select: {
        id: true,
        orderNo: true,
        name: true,
        type: true,
        status: true,
        totalAmount: true,
        plannedDate: true,
        dispatchedAt: true,
        completedAt: true,
        createdAt: true,
        lineItems: {
          select: { quantity: true, unit: true, totalPrice: true },
        },
        dispatchNotices: {
          where: { deletedAt: null },
          select: {
            id: true, noticeNo: true, type: true, status: true, totalQuantity: true,
            _count: { select: { waybills: { where: { deletedAt: null } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' as const },
    },
  };

  private async generateContractNo(type: string): Promise<string> {
    const typeCode: Record<string, string> = {
      PURCHASE: 'CG',
      SALES: 'XS',
      BILATERAL: 'SB',
    };
    const prefix = typeCode[type] || 'HT';
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const todayCount = await this.prisma.contract.count({
      where: { createdAt: { gte: startOfDay, lt: endOfDay }, type },
    });
    return `${prefix}${dateStr}${String(todayCount + 1).padStart(4, '0')}`;
  }

  /**
   * 合同履约数量及金额均由有效执行批次实时汇总，不落冗余字段。
   * 已完成批次 = 已执行；执行中批次 = 执行中；合同剩余量 = 待执行。
   * 双边合同分别按采购、销售方向计算，避免把同一合同额度重复相加。
   */
  private withFulfillment<T extends {
    type: string;
    totalAmount: unknown;
    lineItems?: Array<{ quantity: unknown; unit: string }>;
    orders?: Array<{
      type: string;
      status: string;
      totalAmount: unknown;
      lineItems?: Array<{ quantity: unknown; unit: string }>;
    }>;
  }>(contract: T) {
    const directions = contract.type === 'BILATERAL' ? ['PURCHASE', 'SALES'] : [contract.type];
    const totalQuantity = sumQuantities(contract.lineItems || []);
    const contractAmount = Number(contract.totalAmount || 0);

    return {
      ...contract,
      fulfillment: {
        directions: directions.map((type) => {
          const orders = (contract.orders || []).filter((order) => order.type === type && order.status !== 'CANCELLED');
          const executingOrders = orders.filter((order) => order.status === 'DISPATCHED');
          const executedOrders = orders.filter((order) => order.status === 'COMPLETED');
          const executingQuantity = sumQuantities(executingOrders.flatMap((order) => order.lineItems || []));
          const executedQuantity = sumQuantities(executedOrders.flatMap((order) => order.lineItems || []));
          const pendingQuantity = subtractQuantities(totalQuantity, executingQuantity, executedQuantity);
          const executingAmount = sumAmounts(executingOrders);
          const executedAmount = sumAmounts(executedOrders);

          return {
            type,
            totalQuantity,
            totalAmount: contractAmount,
            pendingQuantity,
            pendingAmount: Math.max(0, contractAmount - executingAmount - executedAmount),
            executingQuantity,
            executingAmount,
            executedQuantity,
            executedAmount,
          };
        }),
      },
    };
  }

  private async validateSigningPartner(signingPartnerId: string | undefined, type: string) {
    if (!signingPartnerId) throw new BadRequestException('请选择我方签约主体');
    const partner = await this.prisma.partner.findFirst({
      where: { id: signingPartnerId, isInternal: true, status: 'ACTIVE', deletedAt: null },
      select: { roles: true },
    });
    if (!partner) throw new BadRequestException('我方签约主体必须是有效的内部合作伙伴');

    const requiredRole = type === 'PURCHASE' ? 'CUSTOMER' : type === 'SALES' ? 'SUPPLIER' : undefined;
    if (requiredRole && !partner.roles.includes(requiredRole)) {
      throw new BadRequestException(`我方签约主体缺少${requiredRole === 'CUSTOMER' ? '客户' : '供应商'}角色`);
    }
  }

  private validateContractParties(signingPartnerId?: string, sellerId?: string, buyerId?: string) {
    if (signingPartnerId && sellerId && signingPartnerId === sellerId) {
      throw new BadRequestException('交易对手方不能与我方签约主体相同');
    }
    if (signingPartnerId && buyerId && signingPartnerId === buyerId) {
      throw new BadRequestException('下游对手方不能与我方签约主体相同');
    }
    if (sellerId && buyerId && sellerId === buyerId) {
      throw new BadRequestException('上游与下游对手方不能相同');
    }
  }

  async create(dto: CreateContractDto, userId: string) {
    const access = await this.accessControl.assertPermission(userId, 'contract.create');
    if (
      access.isExternal
      && access.externalPartnerId
      && ![dto.sellerId, dto.buyerId, dto.signingPartnerId].includes(access.externalPartnerId)
    ) {
      throw new ForbiddenException('外部企业只能创建本企业作为交易参与方的合同');
    }

    if (dto.clientRequestId) {
      const existing = await this.prisma.contract.findFirst({
        where: {
          createdBy: userId,
          clientRequestId: dto.clientRequestId,
          deletedAt: null,
        },
        include: this.include,
      });
      if (existing) return this.withFulfillment(existing);
    }

    await this.validateSigningPartner(dto.signingPartnerId, dto.type);
    this.validateContractParties(dto.signingPartnerId, dto.sellerId, dto.buyerId);
    const departmentId = dto.departmentId || access.user?.employee?.departmentId || null;
    let companyId = access.user?.company?.id || null;
    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
        select: { companyId: true },
      });
      if (!department) throw new BadRequestException('业务部门不存在');
      companyId = department.companyId;
    }
    const contractNo = await this.generateContractNo(dto.type);

    try {
      return await this.prisma.contract.create({
        data: {
          contractNo,
          clientRequestId: dto.clientRequestId,
          title: dto.title,
          type: dto.type,
          sellerId: dto.sellerId,
          buyerId: dto.buyerId,
          signingPartnerId: dto.signingPartnerId,
          companyId,
          departmentId,
          externalNo: dto.externalNo,
          contactPerson: dto.contactPerson,
          contactPhone: dto.contactPhone,
          pricingType: dto.pricingType,
          overfillPct: dto.overfillPct,
          shortfallPct: dto.shortfallPct,
          deliveryMethod: dto.deliveryMethod,
          deliveryLocation: dto.deliveryLocation,
          totalAmount: dto.totalAmount,
          signedAt: dto.signedAt ? new Date(dto.signedAt) : null,
          effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : null,
          expireAt: dto.expireAt ? new Date(dto.expireAt) : null,
          settlementMethod: dto.settlementMethod,
          settlementBasis: dto.settlementBasis,
          prepayPct: dto.prepayPct,
          paymentDays: dto.paymentDays,
          paymentMethod: dto.paymentMethod,
          moistureRule: dto.moistureRule,
          impurityRule: dto.impurityRule,
          remarks: dto.remarks,
          createdBy: userId,
          lineItems: {
            create: (dto.lineItems || []).map((item) => ({
              materialId: item.materialId,
              materialName: item.materialName,
              quantity: item.quantity,
              unit: item.unit || 'TON',
              unitPrice: item.unitPrice,
              totalPrice: Number(item.unitPrice) * Number(item.quantity),
              deliveryDate: item.deliveryDate ? new Date(item.deliveryDate) : null,
              remarks: item.remarks,
            })),
          },
        },
        include: this.include,
      });
    } catch (error: any) {
      // 两次相同请求并发到达时，唯一约束只允许创建一份草稿。
      if (dto.clientRequestId && error?.code === 'P2002') {
        const existing = await this.prisma.contract.findFirst({
          where: {
            createdBy: userId,
            clientRequestId: dto.clientRequestId,
            deletedAt: null,
          },
          include: this.include,
        });
        if (existing) return this.withFulfillment(existing);
      }
      throw error;
    }
  }

  async findAll(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    type?: string;
    search?: string;
    sellerId?: string;
    dateFrom?: string;
    dateTo?: string;
  }, userId?: string) {
    const page = params.page || 1;
    const pageSize = Math.min(params.pageSize || 20, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.ContractWhereInput = { deletedAt: null };

    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;
    if (params.sellerId) {
      where.OR = [
        { sellerId: params.sellerId },
        { buyerId: params.sellerId },
      ];
    }
    if (params.dateFrom || params.dateTo) {
      where.signedAt = {};
      if (params.dateFrom) where.signedAt.gte = new Date(params.dateFrom);
      if (params.dateTo) where.signedAt.lte = new Date(params.dateTo);
    }
    if (params.search) {
      const searchCondition = [
        { contractNo: { contains: params.search, mode: 'insensitive' as const } },
        { title: { contains: params.search, mode: 'insensitive' as const } },
        { seller: { name: { contains: params.search, mode: 'insensitive' as const } } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchCondition }];
        delete where.OR;
      } else {
        where.OR = searchCondition;
      }
    }
    if (userId) {
      await this.accessControl.assertPermission(userId, 'contract.view');
      const scope = await this.accessControl.getContractScope(userId);
      const existingAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
      where.AND = [...existingAnd, scope];
    }

    const [items, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        include: this.include,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contract.count({ where }),
    ]);

    return {
      items: items.map((contract) => this.withFulfillment(contract)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string, userId?: string, permissionCode = 'contract.view') {
    let scope: Prisma.ContractWhereInput = {};
    if (userId) {
      await this.accessControl.assertPermission(userId, permissionCode);
      scope = await this.accessControl.getContractScope(userId);
    }
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null, AND: [scope] },
      include: this.include,
    });
    if (!contract || contract.deletedAt) throw new NotFoundException('合同不存在');
    return this.withFulfillment({
      ...contract,
      attachments: (contract.attachments || []).map((attachment) => ({
        ...attachment,
        originalName: normalizeUploadFilename(attachment.originalName),
      })),
    });
  }

  async updateStatus(id: string, dto: UpdateContractStatusDto, user: { id: string; role: string }) {
    const { status, comment } = dto;
    const permissionByStatus: Record<string, string> = {
      PENDING_APPROVAL: 'contract.submit',
      APPROVED: 'contract.approve',
      REJECTED: 'contract.approve',
      DRAFT: 'contract.submit',
      EXECUTING: 'execution.manage',
      COMPLETED: 'execution.manage',
      CLOSED: 'execution.manage',
      VOIDED: 'contract.void',
    };
    const access = await this.accessControl.assertPermission(
      user.id,
      permissionByStatus[status] || 'contract.edit',
    );
    const scope = await this.accessControl.getContractScope(user.id);

    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id, deletedAt: null, AND: [scope] },
        select: {
          id: true,
          status: true,
          type: true,
          totalAmount: true,
          companyId: true,
          departmentId: true,
          createdBy: true,
        },
      });
      if (!contract) throw new NotFoundException('合同不存在');

      this.validateTransition(contract.status, status);

      if (status === 'DRAFT' && contract.status === 'PENDING_APPROVAL' && !access.isAdmin && contract.createdBy !== user.id) {
        throw new ForbiddenException('只有合同创建人或系统管理员可以撤回审批');
      }

      if (['APPROVED', 'REJECTED'].includes(status)) {
        if (!comment?.trim()) throw new BadRequestException('审批意见不能为空');

        const pendingApprovals = await tx.approval.findMany({
          where: { contractId: id, status: 'PENDING' },
          orderBy: [{ round: 'desc' }, { step: 'asc' }],
        });
        if (pendingApprovals.length === 0) throw new BadRequestException('当前没有待处理的审批节点');

        const currentRound = pendingApprovals[0].round;
        const currentStep = pendingApprovals
          .filter((item) => item.round === currentRound)
          .reduce((min, item) => Math.min(min, item.step), Number.MAX_SAFE_INTEGER);
        const currentTasks = pendingApprovals.filter(
          (item) => item.round === currentRound && item.step === currentStep,
        );
        const assignedTask = currentTasks.find((item) => item.assigneeId === user.id);
        if (!access.isAdmin && !assignedTask) {
          throw new ForbiddenException('当前审批节点未分配给该用户');
        }

        const taskToAct = assignedTask || currentTasks[0];
        const actedAt = new Date();
        const approvalMode = taskToAct.approvalMode || 'ALL';
        const acted = await tx.approval.updateMany({
          where: access.isAdmin && status === 'APPROVED'
            ? { contractId: id, round: currentRound, step: currentStep, status: 'PENDING' }
            : { id: taskToAct.id, status: 'PENDING' },
          data: {
            status: status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
            comment: comment.trim(),
            actedAt,
            actedById: user.id,
          },
        });
        if (acted.count < 1) throw new BadRequestException('当前审批节点已被处理，请刷新后重试');

        if (status === 'REJECTED') {
          if (approvalMode === 'ANY') {
            await tx.approval.updateMany({
              where: {
                contractId: id,
                round: currentRound,
                step: currentStep,
                id: { not: taskToAct.id },
                status: 'PENDING',
              },
              data: { status: 'OTHERS_REJECTED' },
            });
          }
          await tx.approval.updateMany({
            where: {
              contractId: id,
              round: currentRound,
              id: { not: taskToAct.id },
              ...(approvalMode === 'ANY' && { step: { not: currentStep } }),
              status: { in: ['PENDING', 'WAITING'] },
            },
            data: { status: 'CANCELLED' },
          });
        } else {
          if (approvalMode === 'ANY' && !access.isAdmin) {
            await tx.approval.updateMany({
              where: {
                contractId: id,
                round: currentRound,
                step: currentStep,
                status: 'PENDING',
              },
              data: { status: 'OTHERS_APPROVED' },
            });
          }

          const remainingCurrentTasks = await tx.approval.count({
            where: {
              contractId: id,
              round: currentRound,
              step: currentStep,
              status: 'PENDING',
            },
          });
          if (remainingCurrentTasks > 0) {
            return tx.contract.findUnique({ where: { id }, include: this.include });
          }

          const nextApproval = await tx.approval.findFirst({
            where: { contractId: id, round: currentRound, status: 'WAITING' },
            orderBy: { step: 'asc' },
          });
          if (nextApproval) {
            await tx.approval.updateMany({
              where: {
                contractId: id,
                round: currentRound,
                step: nextApproval.step,
                status: 'WAITING',
              },
              data: { status: 'PENDING' },
            });
            return tx.contract.findUnique({ where: { id }, include: this.include });
          }
        }
      }

      let approvalScope: { companyId: string | null; departmentId: string | null } | null = null;
      if (status === 'PENDING_APPROVAL') {
        const plan = await this.resolveApprovalPlan(tx, contract);
        approvalScope = { companyId: plan.companyId, departmentId: plan.departmentId };
        await this.assignApprovals(tx, id, plan.nodes);
      }

      if (['VOIDED', 'DRAFT'].includes(status) && contract.status === 'PENDING_APPROVAL') {
        await tx.approval.updateMany({
          where: { contractId: id, status: { in: ['PENDING', 'WAITING'] } },
          data: { status: 'CANCELLED' },
        });
      }

      const updateData: Prisma.ContractUncheckedUpdateManyInput = { status };
      if (status === 'APPROVED') updateData.effectiveAt = new Date();
      if (approvalScope) {
        updateData.companyId = approvalScope.companyId;
        updateData.departmentId = approvalScope.departmentId;
      }

      const changed = await tx.contract.updateMany({
        where: { id, status: contract.status, deletedAt: null },
        data: updateData,
      });
      if (changed.count !== 1) throw new BadRequestException('合同状态已发生变化，请刷新后重试');

      return tx.contract.findUnique({ where: { id }, include: this.include });
    });
  }

  async getApprovalReadiness(id: string, userId?: string) {
    let scope: Prisma.ContractWhereInput = {};
    if (userId) {
      await this.accessControl.assertPermission(userId, 'contract.submit');
      scope = await this.accessControl.getContractScope(userId);
    }
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null, AND: [scope] },
      select: {
        id: true,
        type: true,
        totalAmount: true,
        status: true,
        companyId: true,
        departmentId: true,
        createdBy: true,
      },
    });
    if (!contract) throw new NotFoundException('合同不存在');
    if (!['DRAFT', 'REJECTED'].includes(contract.status)) {
      throw new BadRequestException('只有草稿或已驳回合同可以检查审批流程');
    }

    const plan = await this.resolveApprovalPlan(this.prisma, contract);
    return {
      ready: true,
      flowId: plan.flowId,
      flowName: plan.flowName,
      nodeCount: plan.nodes.length,
      nodes: plan.nodes.map((node) => ({
        nodeName: node.nodeName,
        step: node.step,
        role: node.role,
        approvalMode: node.approvalMode,
        scopeType: node.scopeType,
        assigneeCount: node.members.length,
        assignees: node.members,
      })),
    };
  }

  private async resolveApprovalPlan(
    client: Prisma.TransactionClient | PrismaService,
    contract: ApprovalContractContext,
  ) {
    const flow = await client.approvalFlow.findUnique({
      where: { contractType: contract.type },
      include: {
        nodes: {
          where: { enabled: true },
          include: {
            role: {
              include: {
                permissions: {
                  where: { permission: { code: 'contract.approve' } },
                  include: { permission: true },
                },
              },
            },
          },
          orderBy: { step: 'asc' },
        },
      },
    });
    if (!flow || flow.status !== 'ACTIVE') {
      throw new BadRequestException('当前合同类型未启用审批流程，请联系系统管理员配置');
    }

    const threshold = Number(flow.amountThreshold || 0);
    const activeNodes = flow.nodes.filter((node) =>
      node.condition === 'ALWAYS'
      || (node.condition === 'AMOUNT_GTE_THRESHOLD' && Number(contract.totalAmount) >= threshold),
    );
    if (activeNodes.length === 0) {
      throw new BadRequestException(`审批流程“${flow.name}”没有符合当前金额条件的审批节点`);
    }

    const invalidNodes = activeNodes.filter(
      (node) => node.role.status !== 'ACTIVE' || node.role.permissions.length === 0,
    );
    if (invalidNodes.length > 0) {
      throw new BadRequestException(
        `审批流程存在无效节点角色：${invalidNodes.map((node) => node.nodeName).join('、')}，请联系系统管理员调整`,
      );
    }

    let companyId = contract.companyId || null;
    let departmentId = contract.departmentId || null;
    if (!companyId || !departmentId) {
      const creator = await client.user.findUnique({
        where: { id: contract.createdBy },
        select: {
          companyId: true,
          employee: { select: { departmentId: true } },
        },
      });
      companyId = companyId || creator?.companyId || null;
      departmentId = departmentId || creator?.employee?.departmentId || null;
    }
    if (departmentId) {
      const department = await client.department.findUnique({
        where: { id: departmentId },
        select: { id: true, companyId: true },
      });
      if (!department) throw new BadRequestException('合同业务部门不存在，无法确定审批人员范围');
      companyId = department.companyId;
    }

    const departments = activeNodes.some((node) => node.scopeType === 'DEPARTMENT')
      ? await client.department.findMany({ select: { id: true, parentId: true, companyId: true } })
      : [];
    const departmentParent = new Map(departments.map((item) => [item.id, item.parentId]));
    const isDepartmentOrChild = (targetId: string, ancestorId: string) => {
      let currentId: string | null | undefined = targetId;
      const visited = new Set<string>();
      while (currentId && !visited.has(currentId)) {
        if (currentId === ancestorId) return true;
        visited.add(currentId);
        currentId = departmentParent.get(currentId);
      }
      return false;
    };

    const resolvedNodes = [];
    for (const node of activeNodes) {
      if (node.scopeType === 'COMPANY' && !companyId) {
        throw new BadRequestException(`审批节点“${node.nodeName}”需要合同所属企业`);
      }
      if (node.scopeType === 'DEPARTMENT' && !departmentId) {
        throw new BadRequestException(`审批节点“${node.nodeName}”需要合同业务部门，请编辑合同并选择业务部门`);
      }

      const assignments = await client.userRoleAssignment.findMany({
        where: {
          roleId: node.roleId,
          status: 'ACTIVE',
          effectiveAt: { lte: new Date() },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          user: { status: 'ACTIVE' },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              status: true,
              companyId: true,
              employee: { select: { departmentId: true } },
            },
          },
          scopes: true,
        },
      });

      const coversNodeScope = (assignment: typeof assignments[number]) => {
        if (node.scopeType === 'ALL' || assignment.scopeType === 'ALL') return true;
        const companyScopeIds = assignment.scopes
          .filter((item) => item.targetType === 'COMPANY')
          .map((item) => item.targetId);
        const departmentScopeIds = assignment.scopes
          .filter((item) => item.targetType === 'DEPARTMENT')
          .map((item) => item.targetId);

        if (node.scopeType === 'COMPANY') {
          if (assignment.scopeType === 'COMPANY') {
            return assignment.user.companyId === companyId || companyScopeIds.includes(companyId!);
          }
          if (assignment.scopeType === 'SPECIFIED_COMPANIES') {
            return companyScopeIds.includes(companyId!);
          }
          if (assignment.scopeType === 'SELF') return assignment.user.id === contract.createdBy;
          return false;
        }

        if (assignment.scopeType === 'COMPANY') {
          return assignment.user.companyId === companyId || companyScopeIds.includes(companyId!);
        }
        if (assignment.scopeType === 'SPECIFIED_COMPANIES') {
          return companyScopeIds.includes(companyId!);
        }
        if (assignment.scopeType === 'DEPARTMENT') {
          return assignment.user.employee?.departmentId === departmentId
            || departmentScopeIds.includes(departmentId!);
        }
        if (assignment.scopeType === 'DEPARTMENT_AND_CHILDREN') {
          const ancestorIds = departmentScopeIds.length
            ? departmentScopeIds
            : assignment.user.employee?.departmentId
              ? [assignment.user.employee.departmentId]
              : [];
          return ancestorIds.some((ancestorId) => isDepartmentOrChild(departmentId!, ancestorId));
        }
        if (assignment.scopeType === 'SELF') return assignment.user.id === contract.createdBy;
        return false;
      };

      const members = Array.from(
        new Map(
          assignments
            .filter(coversNodeScope)
            .map((assignment) => [assignment.user.id, {
              id: assignment.user.id,
              username: assignment.user.username,
              name: assignment.user.name,
            }]),
        ).values(),
      );
      if (members.length === 0) {
        throw new BadRequestException(
          `审批节点“${node.nodeName}”在当前合同范围内没有有效的“${node.role.name}”人员`,
        );
      }

      resolvedNodes.push({
        id: node.id,
        nodeName: node.nodeName,
        step: node.step,
        approvalMode: node.approvalMode,
        scopeType: node.scopeType,
        role: { id: node.role.id, code: node.role.code, name: node.role.name },
        members,
      });
    }

    return {
      flowId: flow.id,
      flowName: flow.name,
      companyId,
      departmentId,
      nodes: resolvedNodes,
    };
  }

  private async assignApprovals(
    client: Prisma.TransactionClient,
    contractId: string,
    nodes: Array<{
      nodeName: string;
      approvalMode: string;
      role: { code: string; name: string };
      members: Array<{ id: string }>;
    }>,
  ) {
    await client.approval.updateMany({
      where: { contractId, status: { in: ['PENDING', 'WAITING'] } },
      data: { status: 'CANCELLED' },
    });

    const latest = await client.approval.aggregate({
      where: { contractId },
      _max: { round: true },
    });
    const round = (latest._max.round || 0) + 1;

    await client.approval.createMany({
      data: nodes.flatMap((node, index) =>
        node.members.map((member) => ({
          contractId,
          assigneeId: member.id,
          nodeName: node.nodeName,
          roleCode: node.role.code,
          roleName: node.role.name,
          approvalMode: node.approvalMode,
          step: index + 1,
          round,
          status: index === 0 ? 'PENDING' : 'WAITING',
        })),
      ),
    });
  }

  async update(
    id: string,
    dto: {
      title?: string; type?: string; totalAmount?: number; sellerId?: string; buyerId?: string;
      signingPartnerId?: string; companyId?: string; departmentId?: string; externalNo?: string;
      contactPerson?: string; contactPhone?: string;
      pricingType?: string; overfillPct?: number; shortfallPct?: number;
      deliveryMethod?: string; deliveryLocation?: string;
      signedAt?: string; effectiveAt?: string; expireAt?: string;
      settlementMethod?: string; settlementBasis?: string;
      prepayPct?: number; paymentDays?: number; paymentMethod?: string;
      moistureRule?: string; impurityRule?: string; remarks?: string;
      lineItems?: Array<{
        materialId: string; materialName?: string;
        quantity: number; unit?: string;
        unitPrice: number; deliveryDate?: string; remarks?: string;
      }>;
    },
    userId?: string,
  ) {
    const contract = await this.findOne(id, userId, 'contract.edit');
    if (contract.status !== 'DRAFT' && contract.status !== 'REJECTED') {
      throw new BadRequestException('仅草稿或已驳回状态的合同可以编辑');
    }

    if (dto.signingPartnerId !== undefined || dto.type !== undefined) {
      await this.validateSigningPartner(dto.signingPartnerId ?? contract.signingPartnerId ?? undefined, dto.type ?? contract.type);
    }
    this.validateContractParties(
      dto.signingPartnerId ?? contract.signingPartnerId ?? undefined,
      dto.sellerId ?? contract.sellerId,
      dto.buyerId ?? contract.buyerId ?? undefined,
    );

    const { lineItems, signedAt, effectiveAt, expireAt, ...rest } = dto;
    let resolvedCompanyId = rest.companyId;
    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: dto.departmentId },
        select: { companyId: true },
      });
      if (!department) throw new BadRequestException('业务部门不存在');
      resolvedCompanyId = department.companyId;
    }

    return this.prisma.$transaction(async (tx) => {
      if (lineItems !== undefined) {
        // 删旧 lineItems，重建
        await tx.contractLineItem.deleteMany({ where: { contractId: id } });
        if (lineItems.length > 0) {
          await tx.contractLineItem.createMany({
            data: lineItems.map((item) => ({
              contractId: id,
              materialId: item.materialId,
              materialName: item.materialName,
              quantity: item.quantity,
              unit: item.unit || 'TON',
              unitPrice: item.unitPrice,
              totalPrice: Number(item.unitPrice) * Number(item.quantity),
              deliveryDate: item.deliveryDate ? new Date(item.deliveryDate) : null,
              remarks: item.remarks,
            })),
          });
        }
      }

      return tx.contract.update({
        where: { id },
        data: {
          ...rest,
          companyId: resolvedCompanyId,
          signedAt: signedAt ? new Date(signedAt) : undefined,
          effectiveAt: effectiveAt ? new Date(effectiveAt) : undefined,
          expireAt: expireAt ? new Date(expireAt) : undefined,
        },
        include: this.include,
      });
    });
  }

  async remove(id: string, user: { id: string; role: string }) {
    const access = await this.accessControl.assertPermission(user.id, 'contract.delete');
    if (!access.isAdmin) {
      throw new ForbiddenException('仅系统管理员可以删除合同');
    }
    const contract = await this.findOne(id, user.id, 'contract.delete');
    if (contract.status !== 'VOIDED') {
      throw new BadRequestException('合同必须先作废，才能删除');
    }
    return this.prisma.contract.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private validateTransition(current: string, next: string) {
    const transitions: Record<string, string[]> = {
      DRAFT:            ['PENDING_APPROVAL', 'VOIDED'],
      PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'DRAFT', 'VOIDED'],
      APPROVED:         ['EXECUTING', 'VOIDED'],
      EXECUTING:        ['COMPLETED', 'CLOSED', 'VOIDED'],
      REJECTED:         ['DRAFT', 'VOIDED'],
      COMPLETED:        ['CLOSED'],
      CLOSED:           [],
      VOIDED:           [],
    };

    const allowed = transitions[current] || [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`不能从 ${current} 变更为 ${next}`);
    }
  }

  createAttachment(data: { contractId: string; fileName: string; originalName: string; mimeType: string; size: number; category: string }) {
    return this.prisma.attachment.create({ data });
  }

  async findAttachmentById(id: string, userId?: string, permissionCode = 'contract.view') {
    let contractScope: Prisma.ContractWhereInput = {};
    if (userId) {
      await this.accessControl.assertPermission(userId, permissionCode);
      contractScope = await this.accessControl.getContractScope(userId);
    }
    return this.prisma.attachment.findFirst({
      where: {
        id,
        contractId: { not: null },
        contract: contractScope,
      },
    });
  }

  deleteAttachment(id: string) {
    return this.prisma.attachment.delete({ where: { id } });
  }

  renameAttachment(id: string, originalName: string) {
    return this.prisma.attachment.update({
      where: { id },
      data: { originalName },
    });
  }
}
