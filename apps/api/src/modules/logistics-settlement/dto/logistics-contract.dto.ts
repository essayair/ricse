import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CreatePriceTermDto {
  @IsOptional() @IsString() originLocation?: string;
  @IsOptional() @IsString() destinationLocation?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) unitPrice: number;
  @IsDateString() effectiveAt: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class CreateLogisticsContractDto {
  @IsString() carrierPartnerId: string;
  @IsString() signingPartnerId: string;
  @IsString() title: string;
  @IsOptional() @IsString() externalContractNo?: string;
  @IsOptional() @IsBoolean() allBusinessUnits?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) businessUnitIds?: string[];
  @IsOptional() @IsIn(['SETTLEMENT', 'SHIPPING', 'RECEIVING']) defaultWeightBasis?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreatePriceTermDto) priceTerms?: CreatePriceTermDto[];
  /** 历史兼容参数；新合同管理组织由登录上下文确定，法律主体使用 signingPartnerId */
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
