import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class CreateSettlementLineDto {
  @IsString()
  orderId!: string;

  @IsOptional() @IsString()
  waybillLineItemId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  adjustmentAmount?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateFinancialSettlementDto {
  @IsString()
  contractId!: string;

  @IsIn(['RECEIVABLE', 'PAYABLE'])
  direction!: string;

  @IsOptional()
  @IsIn(['CONTRACT', 'MANUAL'])
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceNo?: string;

  @IsIn(['BATCH', 'GOODS', 'CONTRACT_STAGE', 'CONTRACT_FINAL', 'ADJUSTMENT'])
  settlementScope!: string;

  @IsOptional()
  @IsString()
  stageName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  stageRatio?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSettlementLineDto)
  lines?: CreateSettlementLineDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  grossAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  adjustmentAmount?: number;

  /** 品位分档价格为不含税元/度；结算人明确填写本次适用税率。 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxRatePct?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateFundTransactionDto {
  @IsOptional()
  @IsString()
  contractId?: string;

  @IsOptional()
  @IsString()
  legalEntityPartnerId?: string;

  @IsIn(['PURCHASE', 'SALES'])
  businessType!: string;

  @IsIn(['ADVANCE', 'PROGRESS', 'SETTLEMENT', 'FINAL', 'GUARANTEE', 'REFUND', 'GUARANTEE_RETURN', 'OTHER'])
  paymentStage!: string;

  @IsIn(['BANK_TRANSFER', 'BANK_ACCEPTANCE', 'COMMERCIAL_ACCEPTANCE', 'LETTER_OF_CREDIT', 'FUNDING_PAYMENT', 'CASH', 'OTHER'])
  paymentMethod!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  relatedTransactionId?: string;

  @IsOptional()
  @IsString()
  bankReference?: string;

  @IsOptional()
  @IsString()
  ourBankAccount?: string;

  @IsOptional() @IsString() ourBankAccountName?: string;
  @IsOptional() @IsString() ourBankName?: string;
  @IsOptional() @IsString() ourBankCode?: string;

  @IsOptional()
  @IsString()
  counterpartyBankAccount?: string;

  @IsOptional() @IsString() counterpartyBankAccountName?: string;
  @IsOptional() @IsString() counterpartyBankName?: string;
  @IsOptional() @IsString() counterpartyBankCode?: string;

  @IsOptional()
  @IsString()
  actualPayerName?: string;

  @IsOptional()
  @IsString()
  actualPayeeName?: string;

  @IsOptional()
  @IsBoolean()
  isThirdParty?: boolean;

  @IsOptional()
  @IsString()
  thirdPartyReason?: string;

  @IsOptional()
  @IsString()
  instrumentNo?: string;

  @IsOptional()
  @IsDateString()
  instrumentDueDate?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreatePaymentRequestDto {
  @IsOptional() @IsString()
  contractId?: string;

  @IsOptional() @IsString()
  logisticsSettlementId?: string;

  @IsOptional() @IsIn(['CONTRACT', 'BATCH', 'SETTLEMENT', 'LOGISTICS_SETTLEMENT'])
  basisType?: string;

  @IsOptional() @IsString() stageName?: string;
  @IsOptional() @IsString() conditionText?: string;
  @IsOptional() @IsString() clientRequestId?: string;
  @IsOptional() @IsArray()
  @IsIn(['SIGNED', 'DISPATCHED', 'ARRIVED', 'SIGNED_RECEIPT', 'QUALITY', 'INBOUND', 'INVOICE', 'DATE', 'OTHER'], { each: true })
  conditionTypes?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  sourceLineIds?: string[];

  @IsOptional()
  @IsString()
  settlementId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  relatedTransactionId?: string;

  @IsIn(['PURCHASE', 'SALES', 'LOGISTICS'])
  businessType!: string;

  @IsIn(['ADVANCE', 'PROGRESS', 'SETTLEMENT', 'FINAL', 'GUARANTEE', 'REFUND', 'GUARANTEE_RETURN', 'OTHER'])
  paymentStage!: string;

  @IsIn(['BANK_TRANSFER', 'BANK_ACCEPTANCE', 'COMMERCIAL_ACCEPTANCE', 'LETTER_OF_CREDIT', 'FUNDING_PAYMENT', 'CASH', 'OTHER'])
  paymentMethod!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsDateString()
  requestedPayDate?: string;

  @IsOptional()
  @IsString()
  ourBankAccount?: string;

  @IsOptional() @IsString() ourBankAccountName?: string;
  @IsOptional() @IsString() ourBankName?: string;
  @IsOptional() @IsString() ourBankCode?: string;

  @IsOptional()
  @IsString()
  counterpartyBankAccount?: string;

  @IsOptional() @IsString() counterpartyBankAccountName?: string;
  @IsOptional() @IsString() counterpartyBankName?: string;
  @IsOptional() @IsString() counterpartyBankCode?: string;

  @IsOptional()
  @IsString()
  actualPayeeName?: string;

  @IsOptional()
  @IsBoolean()
  isThirdParty?: boolean;

  @IsOptional()
  @IsString()
  thirdPartyReason?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpdatePaymentRequestDto extends CreatePaymentRequestDto {}

export class CreateFundEarmarkDto {
  @IsOptional() @IsString() settlementId?: string;
  @IsOptional() @IsString() orderId?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsString() reason!: string;
}

export class ClaimFundDto {
  @IsString()
  contractId!: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsIn(['ADVANCE', 'PROGRESS', 'SETTLEMENT', 'FINAL', 'GUARANTEE', 'OTHER'])
  paymentStage!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class ReviewPaymentRequestDto {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class RejectPaymentRequestDto {
  @IsString()
  reason!: string;
}

export class ExecutePaymentRequestDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  bankReference?: string;

  @IsOptional()
  @IsIn(['CNY', 'USD'])
  currency?: string;

  @IsOptional()
  @IsString()
  ourBankAccount?: string;

  @IsOptional() @IsString() ourBankAccountName?: string;
  @IsOptional() @IsString() ourBankName?: string;
  @IsOptional() @IsString() ourBankCode?: string;

  @IsOptional()
  @IsString()
  counterpartyBankAccount?: string;

  @IsOptional() @IsString() counterpartyBankAccountName?: string;
  @IsOptional() @IsString() counterpartyBankName?: string;
  @IsOptional() @IsString() counterpartyBankCode?: string;

  @IsOptional()
  @IsString()
  actualPayeeName?: string;

  @IsOptional()
  @IsString()
  actualPayerName?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  bankAccountDifferenceReason?: string;

  @IsOptional()
  @IsString()
  recognitionProvider?: string;

  @IsOptional()
  @IsString()
  recognitionRawText?: string;

  @IsOptional()
  @IsBoolean()
  isThirdParty?: boolean;

  @IsOptional()
  @IsString()
  thirdPartyReason?: string;

  @IsOptional()
  @IsString()
  instrumentNo?: string;

  @IsOptional()
  @IsDateString()
  instrumentDueDate?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class AllocateFundDto {
  @IsString()
  fundTransactionId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}

export class ReverseAllocationDto {
  @IsString()
  reason!: string;
}
