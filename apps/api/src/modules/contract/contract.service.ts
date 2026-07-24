import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractStatusDto } from './dto/update-status.dto';
import { Prisma } from '@prisma/client';
import { normalizeUploadFilename } from '../common/filename-encoding';

type QuantityValue = { quantity: unknown; unit: string };

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

// 每个状态转换允许的角色
const TRANSITION_ROLES: Record<string, string[]> = {
  PENDING_APPROVAL: ['SALESPERSON', 'MANAGER', 'ADMIN'],  // 提交审批
  APPROVED:         ['APPROVER', 'ADMIN'],                  // 审批通过
  REJECTED:         ['APPROVER', 'ADMIN'],                  // 驳回
  DRAFT:            ['SALESPERSON', 'MANAGER', 'ADMIN'],   // 撤回草稿
  EXECUTING:        ['MANAGER', 'ADMIN'],                   // 开始执行
  COMPLETED:        ['MANAGER', 'ADMIN'],                   // 完成
  CLOSED:           ['MANAGER', 'ADMIN'],                   // 关闭
  VOIDED:           ['ADMIN'],                              // 作废
};

@Injectable()
export class ContractService {
  constructor(private prisma: PrismaService) {}

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
    await this.validateSigningPartner(dto.signingPartnerId, dto.type);
    this.validateContractParties(dto.signingPartnerId, dto.sellerId, dto.buyerId);
    const contractNo = await this.generateContractNo(dto.type);

    return this.prisma.contract.create({
      data: {
        contractNo,
        title: dto.title,
        type: dto.type,
        sellerId: dto.sellerId,
        buyerId: dto.buyerId,
        signingPartnerId: dto.signingPartnerId,
        departmentId: dto.departmentId,
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
  }) {
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

  async findOne(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: this.include,
    });
    if (!contract) throw new NotFoundException('合同不存在');
    return this.withFulfillment({
      ...contract,
      attachments: (contract.attachments || []).map((attachment) => ({
        ...attachment,
        originalName: normalizeUploadFilename(attachment.originalName),
      })),
    });
  }

  async updateStatus(id: string, dto: UpdateContractStatusDto, user: { id: string; role: string }) {
    const contract = await this.findOne(id);
    const { status, comment } = dto;

    this.validateTransition(contract.status, status);

    // 角色权限校验
    const allowedRoles = TRANSITION_ROLES[status] || [];
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      throw new ForbiddenException(`角色 ${user.role} 无权将合同状态变更为 ${status}`);
    }

    // 审批通过/驳回需要意见
    if (['APPROVED', 'REJECTED'].includes(status)) {
      if (!comment?.trim()) {
        throw new BadRequestException('审批意见不能为空');
      }
      const pendingApproval = await this.prisma.approval.findFirst({
        where: { contractId: id, status: 'PENDING' },
        orderBy: [{ round: 'desc' }, { step: 'asc' }],
      });
      if (!pendingApproval) throw new BadRequestException('当前没有待处理的审批节点');
      if (user.role !== 'ADMIN' && pendingApproval.assigneeId !== user.id) {
        throw new ForbiddenException('当前审批节点未分配给该用户');
      }

      await this.prisma.approval.update({
        where: { id: pendingApproval.id },
        data: {
          status: status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
          comment: comment.trim(),
          actedAt: new Date(),
          actedById: user.id,
        },
      });

      if (status === 'REJECTED') {
        await this.prisma.approval.updateMany({
          where: { contractId: id, round: pendingApproval.round, status: 'WAITING' },
          data: { status: 'CANCELLED' },
        });
      } else {
        const nextApproval = await this.prisma.approval.findFirst({
          where: { contractId: id, round: pendingApproval.round, status: 'WAITING' },
          orderBy: { step: 'asc' },
        });
        if (nextApproval) {
          await this.prisma.approval.update({
            where: { id: nextApproval.id },
            data: { status: 'PENDING' },
          });
          return this.prisma.contract.findUnique({ where: { id }, include: this.include });
        }
      }
    }

    // 提交审批时自动创建 Approval 记录
    if (status === 'PENDING_APPROVAL') {
      await this.autoAssignApprovals(id, contract.totalAmount);
    }

    const updateData: Prisma.ContractUpdateInput = { status };
    if (status === 'APPROVED') {
      updateData.effectiveAt = new Date();
    }

    return this.prisma.contract.update({
      where: { id },
      data: updateData,
      include: this.include,
    });
  }

  private async autoAssignApprovals(contractId: string, totalAmount: any) {
    await this.prisma.approval.updateMany({
      where: { contractId, status: { in: ['PENDING', 'WAITING'] } },
      data: { status: 'CANCELLED' },
    });

    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { type: true },
    });
    if (!contract) throw new NotFoundException('合同不存在');

    const flow = await this.prisma.approvalFlow.findUnique({
      where: { contractType: contract.type },
      include: { nodes: { where: { enabled: true }, orderBy: { step: 'asc' } } },
    });
    if (!flow || flow.status !== 'ACTIVE') throw new BadRequestException('当前合同类型未启用审批流程');
    const threshold = Number(flow.amountThreshold || 0);
    const activeNodes = flow.nodes.filter((node) => node.condition === 'ALWAYS' || Number(totalAmount) >= threshold);
    if (activeNodes.length === 0) throw new BadRequestException('审批流程没有可用节点');

    const latest = await this.prisma.approval.aggregate({
      where: { contractId },
      _max: { round: true },
    });
    const round = (latest._max.round || 0) + 1;

    await this.prisma.approval.createMany({
      data: activeNodes.map((node, index) => ({
        contractId,
        assigneeId: node.assigneeId,
        nodeName: node.nodeName,
        step: index + 1,
        round,
        status: index === 0 ? 'PENDING' : 'WAITING',
      })),
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
  ) {
    const contract = await this.findOne(id);
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
          signedAt: signedAt ? new Date(signedAt) : undefined,
          effectiveAt: effectiveAt ? new Date(effectiveAt) : undefined,
          expireAt: expireAt ? new Date(expireAt) : undefined,
        },
        include: this.include,
      });
    });
  }

  async remove(id: string) {
    const contract = await this.findOne(id);
    if (!['DRAFT', 'VOIDED'].includes(contract.status)) {
      throw new BadRequestException('仅草稿或已作废的合同可以删除');
    }
    return this.prisma.contract.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private validateTransition(current: string, next: string) {
    const transitions: Record<string, string[]> = {
      DRAFT:            ['PENDING_APPROVAL', 'VOIDED'],
      PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
      APPROVED:         ['EXECUTING', 'VOIDED'],
      EXECUTING:        ['COMPLETED', 'CLOSED', 'VOIDED'],
      REJECTED:         ['DRAFT'],
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

  findAttachmentById(id: string) {
    return this.prisma.attachment.findFirst({ where: { id, contractId: { not: null } } });
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
