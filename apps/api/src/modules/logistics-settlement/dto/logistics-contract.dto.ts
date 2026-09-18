import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateLogisticsContractDto {
  @IsString() carrierPartnerId: string;
  /** 不传时默认取当前登录用户所属企业，与合同模块 companyId 推断口径一致 */
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsIn(['NET_WEIGHT', 'GROSS_WEIGHT', 'TRIP']) settlementBasis?: string;
  @IsOptional() @IsDateString() signedAt?: string;
  @IsOptional() @IsDateString() effectiveAt?: string;
  @IsOptional() @IsDateString() expireAt?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class UpdateLogisticsContractStatusDto {
  @IsIn(['ACTIVE', 'TERMINATED']) status: string;
}

export class CreatePriceTermDto {
  @IsString() originLocation: string;
  @IsString() destinationLocation: string;
  @IsNumber() @Min(0.01) unitPrice: number;
  @IsDateString() effectiveAt: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}
