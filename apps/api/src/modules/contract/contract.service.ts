import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractStatusDto } from './dto/update-status.dto';
import { Prisma } from '@prisma/client';

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
      include: { assignee: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' as const },
    },
    seller: { select: { id: true, code: true, name: true, roles: true } },
    buyer: { select: { id: true, code: true, name: true, roles: true } },
    company: { select: { id: true, code: true, name: true } },
    attachments: { orderBy: { createdAt: 'desc' as const } },
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

  async create(dto: CreateContractDto, userId: string) {
    const contractNo = await this.generateContractNo(dto.type);

    return this.prisma.contract.create({
      data: {
        contractNo,
        title: dto.title,
        type: dto.type,
        sellerId: dto.sellerId,
        buyerId: dto.buyerId,
        companyId: dto.companyId,
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
      items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findOne(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: this.include,
    });
    if (!contract) throw new NotFoundException('合同不存在');
    return contract;
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
      // 更新对应 Approval 记录
      const pendingApproval = await this.prisma.approval.findFirst({
        where: { contractId: id, assigneeId: user.id, status: 'PENDING' },
      });
      if (pendingApproval) {
        await this.prisma.approval.update({
          where: { id: pendingApproval.id },
          data: {
            status: status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
            comment: comment.trim(),
          },
        });
      } else {
        // 创建一条审批记录（以便留下记录）
        await this.prisma.approval.create({
          data: {
            contractId: id,
            assigneeId: user.id,
            status: status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
            comment: comment.trim(),
          },
        });
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
    // 清除之前的 PENDING 记录（重新提交时）
    await this.prisma.approval.deleteMany({
      where: { contractId, status: 'PENDING' },
    });

    // 找所有 APPROVER 和 ADMIN 用户
    const approvers = await this.prisma.user.findMany({
      where: { role: { in: ['APPROVER', 'ADMIN'] }, status: 'ACTIVE' },
      select: { id: true },
    });

    if (approvers.length === 0) return;

    // 一期写死：所有审批人都收到待审批记录，任一人审批即可
    await this.prisma.approval.createMany({
      data: approvers.map((a) => ({
        contractId,
        assigneeId: a.id,
        status: 'PENDING',
      })),
    });
  }

  async update(
    id: string,
    dto: {
      title?: string; totalAmount?: number; sellerId?: string; buyerId?: string;
      companyId?: string; departmentId?: string; externalNo?: string;
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
}
