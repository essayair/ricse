import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { CreateLogisticsContractDto, CreatePriceTermDto, UpdateLogisticsContractStatusDto } from './dto/logistics-contract.dto';

const FAR_FUTURE = new Date('9999-12-31T00:00:00Z');

@Injectable()
export class LogisticsContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  private readonly include = {
    carrierPartner: { select: { id: true, name: true, code: true } },
    company: { select: { id: true, name: true, code: true } },
    priceTerms: {
      orderBy: [
        { originLocation: 'asc' as const },
        { destinationLocation: 'asc' as const },
        { effectiveAt: 'desc' as const },
      ],
    },
  };

  private async generateContractNo(): Promise<string> {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const todayCount = await this.prisma.logisticsContract.count({
      where: { createdAt: { gte: startOfDay, lt: endOfDay } },
    });
    return `LC${dateStr}${String(todayCount + 1).padStart(4, '0')}`;
  }

  async create(dto: CreateLogisticsContractDto, userId: string) {
    const context = await this.accessControl.assertPermission(userId, 'logistics.contract.manage');
    const companyId = dto.companyId || context.user.company?.id || undefined;
    const carrier = await this.prisma.serviceOrganization.findFirst({
      where: {
        partnerId: dto.carrierPartnerId,
        organizationType: 'LOGISTICS_CARRIER',
        status: 'ACTIVE',
        deletedAt: null,
      },
    });
    if (!carrier) throw new BadRequestException('承运方必须是有效的物流承运商主数据');

    const contractNo = await this.generateContractNo();
    return this.prisma.logisticsContract.create({
      data: {
        contractNo,
        carrierPartnerId: dto.carrierPartnerId,
        companyId,
        settlementBasis: dto.settlementBasis || 'NET_WEIGHT',
        signedAt: dto.signedAt ? new Date(dto.signedAt) : undefined,
        effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : undefined,
        expireAt: dto.expireAt ? new Date(dto.expireAt) : undefined,
        remarks: dto.remarks,
        createdBy: userId,
      },
      include: this.include,
    });
  }

  async findAll(query: { status?: string; carrierPartnerId?: string; search?: string }, userId: string) {
    await this.accessControl.assertPermission(userId, 'logistics.contract.view');
    const scope = await this.accessControl.getLogisticsContractScope(userId, 'logistics.contract.view');
    return this.prisma.logisticsContract.findMany({
      where: {
        AND: [
          scope,
          query.status ? { status: query.status } : {},
          query.carrierPartnerId ? { carrierPartnerId: query.carrierPartnerId } : {},
          query.search ? { contractNo: { contains: query.search, mode: 'insensitive' as const } } : {},
        ],
      },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, permission = 'logistics.contract.view') {
    await this.accessControl.assertPermission(userId, permission);
    const scope = await this.accessControl.getLogisticsContractScope(userId, permission);
    const contract = await this.prisma.logisticsContract.findFirst({
      where: { AND: [{ id }, scope] },
      include: this.include,
    });
    if (!contract) throw new NotFoundException('物流合同不存在');
    return contract;
  }

  async updateStatus(id: string, dto: UpdateLogisticsContractStatusDto, userId: string) {
    const contract = await this.findOne(id, userId, 'logistics.contract.manage');
    const allowed: Record<string, string[]> = { DRAFT: ['ACTIVE'], ACTIVE: ['TERMINATED'] };
    if (!(allowed[contract.status] || []).includes(dto.status)) {
      throw new BadRequestException(`不能从 ${contract.status} 变更为 ${dto.status}`);
    }
    return this.prisma.logisticsContract.update({
      where: { id },
      data: { status: dto.status },
      include: this.include,
    });
  }

  /**
   * 运价条款不分货物品类，同一路线按生效期分段维护；新增条款如果紧接当前生效（expiresAt 为空）
   * 的条款之后，自动把旧条款的 expiresAt 收口到新条款的 effectiveAt，其余情况下与任何历史条款
   * 存在日期区间重叠一律拒绝，避免同一天出现两条可匹配的价格造成结算取价歧义。
   */
  async addPriceTerm(contractId: string, dto: CreatePriceTermDto, userId: string) {
    await this.findOne(contractId, userId, 'logistics.contract.manage');
    const effectiveAt = new Date(dto.effectiveAt);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= effectiveAt) {
      throw new BadRequestException('失效日期必须晚于生效日期');
    }

    const existingTerms = await this.prisma.logisticsContractPriceTerm.findMany({
      where: { contractId, originLocation: dto.originLocation, destinationLocation: dto.destinationLocation },
    });
    const openTerm = existingTerms.find((term) => term.expiresAt === null) || null;
    const newEnd = expiresAt ?? FAR_FUTURE;

    const conflicting = existingTerms.find((term) => {
      if (openTerm && term.id === openTerm.id) return false;
      const termEnd = term.expiresAt ?? FAR_FUTURE;
      return effectiveAt < termEnd && term.effectiveAt < newEnd;
    });
    if (conflicting) {
      throw new BadRequestException('该路线在此日期区间内已存在运价条款');
    }
    if (openTerm && effectiveAt <= openTerm.effectiveAt) {
      throw new BadRequestException('新运价生效日期必须晚于当前生效条款的生效日期');
    }

    return this.prisma.$transaction(async (tx) => {
      if (openTerm) {
        await tx.logisticsContractPriceTerm.update({ where: { id: openTerm.id }, data: { expiresAt: effectiveAt } });
      }
      return tx.logisticsContractPriceTerm.create({
        data: {
          contractId,
          originLocation: dto.originLocation,
          destinationLocation: dto.destinationLocation,
          unitPrice: dto.unitPrice,
          effectiveAt,
          expiresAt,
          createdBy: userId,
        },
      });
    });
  }
}
