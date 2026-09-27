import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CreateSettlementLineDto {
  @IsString()
  orderId!: string;

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

  @IsIn(['BATCH', 'CONTRACT_STAGE', 'CONTRACT_FINAL', 'ADJUSTMENT'])
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

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateFundTransactionDto {
  @IsString()
  contractId!: string;

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

  @IsOptional()
  @IsString()
  counterpartyBankAccount?: string;

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
  @IsString()
  contractId!: string;

  @IsOptional()
  @IsString()
  settlementId?: string;

  @IsOptional()
  @IsString()
  relatedTransactionId?: string;

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

  @IsOptional()
  @IsDateString()
  requestedPayDate?: string;

  @IsOptional()
  @IsString()
  ourBankAccount?: string;

  @IsOptional()
  @IsString()
  counterpartyBankAccount?: string;

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
  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  bankReference?: string;

  @IsOptional()
  @IsString()
  ourBankAccount?: string;

  @IsOptional()
  @IsString()
  counterpartyBankAccount?: string;

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
