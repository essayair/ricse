import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractStatusDto } from './dto/update-status.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ContractService {
  constructor(private prisma: PrismaService) {}

  private readonly include = {
    lineItems: true,
    creator: { select: { id: true, name: true, username: true } },
    approvals: {
      include: { assignee: { select: { id: true, name: true } } },
    },
    seller: { select: { id: true, code: true, name: true, roles: true } },
    buyer: { select: { id: true, code: true, name: true, roles: true } },
  };

  async create(dto: CreateContractDto, userId: string) {
    const count = await this.prisma.contract.count();
    const contractNo = `PO-${String(count + 1).padStart(6, '0')}`;

    return this.prisma.contract.create({
      data: {
        contractNo,
        title: dto.title,
        type: dto.type,
        sellerId: dto.sellerId,
        totalAmount: dto.totalAmount,
        signedAt: dto.signedAt ? new Date(dto.signedAt) : null,
        effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : null,
        expireAt: dto.expireAt ? new Date(dto.expireAt) : null,
        settlementMethod: dto.settlementMethod,
        remarks: dto.remarks,
        createdBy: userId,
        lineItems: {
          create: dto.lineItems.map((item) => ({
            materialId: item.materialId,
            materialName: item.materialName,
            quantity: item.quantity,
            unit: item.unit || 'TON',
            unitPrice: item.unitPrice,
            totalPrice: item.unitPrice * item.quantity,
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
    search?: string;
  }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ContractWhereInput = {
      deletedAt: null,
    };

    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { contractNo: { contains: params.search } },
        { title: { contains: params.search } },
      ];
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
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
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

  async updateStatus(id: string, dto: UpdateContractStatusDto) {
    const contract = await this.findOne(id);
    const { status } = dto;

    this.validateTransition(contract.status, status);

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

  async update(id: string, dto: {
    title?: string; totalAmount?: number; sellerId?: string; buyerId?: string;
    signedAt?: string; effectiveAt?: string; expireAt?: string;
    settlementMethod?: string; remarks?: string;
  }) {
    const contract = await this.findOne(id);
    if (contract.status !== 'DRAFT') {
      throw new BadRequestException('仅草稿状态的合同可以编辑');
    }

    const data: any = { ...dto };
    if (dto.signedAt) data.signedAt = new Date(dto.signedAt);
    if (dto.effectiveAt) data.effectiveAt = new Date(dto.effectiveAt);
    if (dto.expireAt) data.expireAt = new Date(dto.expireAt);

    return this.prisma.contract.update({
      where: { id },
      data,
      include: this.include,
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
      DRAFT: ['PENDING_APPROVAL', 'VOIDED'],
      PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
      APPROVED: ['EXECUTING'],
      EXECUTING: ['COMPLETED', 'VOIDED'],
      REJECTED: ['DRAFT'],
      COMPLETED: [],
      VOIDED: [],
    };

    const allowed = transitions[current];
    if (!allowed || !allowed.includes(next)) {
      throw new BadRequestException(
        `不能从 ${current} 变更为 ${next}`,
      );
    }
  }
}
