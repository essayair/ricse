import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

/** 发票票面信息。 */
export class CreateInvoiceRecordDto {
  @IsString() @MaxLength(80) invoiceNo!: string;
  @IsOptional() @IsString() @MaxLength(80) invoiceCode?: string;
  @IsDateString() issuedAt!: string;
  @IsString() @MaxLength(200) materialName!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) quantity?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) taxRate?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) taxAmount?: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) taxInclusiveAmount!: number;
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}

/** 在结算单（物流结算单）上登记发票并同时分摊到本单；分摊金额缺省为发票金额与本单未到票金额中的较小者。 */
export class CreateSettlementInvoiceDto extends CreateInvoiceRecordDto {
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) allocationAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) allocationQuantity?: number;
}

/** 先登记发票、暂不对应结算单。货款发票须选合同；运费发票须选承运方、付款主体和事业部。 */
export class RegisterInvoiceDto extends CreateInvoiceRecordDto {
  @IsIn(['INPUT', 'OUTPUT']) direction!: 'INPUT' | 'OUTPUT';
  @IsIn(['GOODS', 'FREIGHT']) sourceType!: 'GOODS' | 'FREIGHT';
  @IsOptional() @IsString() contractId?: string;
  @IsOptional() @IsString() carrierPartnerId?: string;
  @IsOptional() @IsString() payerPartnerId?: string;
  @IsOptional() @IsString() businessUnitId?: string;
}

export class InvoiceAllocationItemDto {
  @IsString() invoiceId!: string;
  @IsOptional() @IsString() settlementId?: string;
  @IsOptional() @IsString() logisticsSettlementId?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) quantity?: number;
}

/** 一次提交多条分摊：一张发票分给多张结算单，或一张结算单关联多张发票。 */
export class AllocateInvoicesDto {
  @ValidateNested({ each: true }) @Type(() => InvoiceAllocationItemDto) @ArrayMinSize(1) @ArrayMaxSize(50) items!: InvoiceAllocationItemDto[];
}

export class VoidInvoiceRecordDto {
  @IsString() @MaxLength(500) reason!: string;
}
