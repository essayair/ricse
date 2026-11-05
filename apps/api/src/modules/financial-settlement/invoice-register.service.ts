import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FinancialSettlementService } from './financial-settlement.service';
import { CreateInvoiceRecordDto } from './dto/invoice-record.dto';

@Injectable()
export class InvoiceRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlements: FinancialSettlementService,
  ) {}

  async list(settlementId: string, userId: string) {
    const settlement = await this.settlements.findOne(settlementId, userId, 'settlement.view');
    const records = await this.prisma.invoiceRecord.findMany({
      where: { settlementId },
      include: { creator: { select: { id: true, name: true } } },
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
    });
    const active = records.filter(record => record.status === 'ACTIVE');
    const invoiceQuantity = active.reduce((sum, record) => sum.plus(record.quantity || 0), new Prisma.Decimal(0));
    const invoiceAmount = active.reduce((sum, record) => sum.plus(record.taxInclusiveAmount), new Prisma.Decimal(0));
    const settlementQuantity = settlement.quantity == null ? null : new Prisma.Decimal(settlement.quantity);
    const settlementAmount = new Prisma.Decimal(settlement.totalAmount);
    const quantityDifference = settlementQuantity == null ? null : invoiceQuantity.minus(settlementQuantity);
    const amountDifference = invoiceAmount.minus(settlementAmount);
    const warnings: string[] = [];
    if (!active.length) warnings.push('尚未登记发票');
    else {
      if (quantityDifference && !quantityDifference.eq(0)) warnings.push(`发票数量与结算数量相差 ${quantityDifference.toFixed(3)} 吨`);
      if (!amountDifference.eq(0)) warnings.push(`发票含税金额与结算金额相差 ${amountDifference.toFixed(2)} 元`);
      if (active.some(record => !record.materialName.trim())) warnings.push('部分发票缺少品名规格');
    }
    return {
      records,
      summary: {
        direction: settlement.direction === 'PAYABLE' ? 'INPUT' : 'OUTPUT',
        settlementQuantity: settlementQuantity?.toFixed(3) ?? null,
        invoiceQuantity: invoiceQuantity.toFixed(3),
        quantityDifference: quantityDifference?.toFixed(3) ?? null,
        settlementAmount: settlementAmount.toFixed(2),
        invoiceAmount: invoiceAmount.toFixed(2),
        amountDifference: amountDifference.toFixed(2),
        warnings,
        matched: active.length > 0 && warnings.length === 0,
      },
    };
  }

  async create(settlementId: string, dto: CreateInvoiceRecordDto, userId: string) {
    const settlement = await this.settlements.findOne(settlementId, userId, 'settlement.create');
    if (!['CONFIRMED', 'PARTIALLY_SETTLED', 'SETTLED'].includes(settlement.status)) throw new BadRequestException('结算单确认后才能登记发票');
    const invoiceNo = dto.invoiceNo.trim();
    const materialName = dto.materialName.trim();
    if (!invoiceNo || !materialName) throw new BadRequestException('请填写发票号码和品名规格');
    if (dto.quantity != null && dto.quantity <= 0) throw new BadRequestException('发票数量必须大于零');
    const direction = settlement.direction === 'PAYABLE' ? 'INPUT' : 'OUTPUT';
    const sellerPartnerId = direction === 'INPUT' ? settlement.counterpartyId : settlement.legalEntityPartnerId;
    const buyerPartnerId = direction === 'INPUT' ? settlement.legalEntityPartnerId : settlement.counterpartyId;
    const duplicate = await this.prisma.invoiceRecord.findUnique({ where: { direction_sellerPartnerId_invoiceNo: { direction, sellerPartnerId, invoiceNo } } });
    if (duplicate) throw new BadRequestException('同一开票方的该发票号码已登记，请勿重复录入');
    return this.prisma.invoiceRecord.create({ data: {
      settlementId, contractId: settlement.contractId, direction, invoiceNo, invoiceCode: dto.invoiceCode?.trim() || null,
      issuedAt: new Date(dto.issuedAt), sellerPartnerId, buyerPartnerId, materialName,
      quantity: dto.quantity ?? null, unitPrice: dto.unitPrice ?? null, taxRate: dto.taxRate ?? null,
      taxAmount: dto.taxAmount ?? null, taxInclusiveAmount: dto.taxInclusiveAmount,
      remarks: dto.remarks?.trim() || null, createdBy: userId,
    } });
  }

  async void(settlementId: string, invoiceId: string, reason: string, userId: string) {
    await this.settlements.findOne(settlementId, userId, 'settlement.reverse');
    if (!reason.trim()) throw new BadRequestException('请填写发票作废原因');
    const updated = await this.prisma.invoiceRecord.updateMany({
      where: { id: invoiceId, settlementId, status: 'ACTIVE' },
      data: { status: 'VOIDED', voidedBy: userId, voidedAt: new Date(), voidReason: reason.trim() },
    });
    if (!updated.count) throw new NotFoundException('有效发票记录不存在');
    return this.prisma.invoiceRecord.findUniqueOrThrow({ where: { id: invoiceId } });
  }
}
