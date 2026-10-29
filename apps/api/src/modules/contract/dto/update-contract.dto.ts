import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { CreateContractLineItemDto } from './create-contract.dto';

/** 编辑草稿或已驳回合同：字段均可选，草稿允许暂存不完整内容，业务完整性在提交审批时校验。 */
export class UpdateContractDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsNumber() @Min(0) totalAmount?: number;
  @IsOptional() @IsString() sellerId?: string | null;
  @IsOptional() @IsString() buyerId?: string | null;
  @IsOptional() @IsString() signingPartnerId?: string | null;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() businessUnitId?: string | null;
  @IsOptional() @IsString() externalNo?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() pricingType?: string;
  @IsOptional() @IsNumber() overfillPct?: number;
  @IsOptional() @IsNumber() shortfallPct?: number;
  @IsOptional() @IsString() deliveryMethod?: string;
  @IsOptional() @IsString() deliveryLocation?: string;
  @IsOptional() @IsDateString() signedAt?: string;
  @IsOptional() @IsDateString() effectiveAt?: string | null;
  @IsOptional() @IsDateString() expireAt?: string | null;
  @IsOptional() @IsString() @MaxLength(100) settlementMethod?: string;
  @IsOptional() @IsString() @MaxLength(200) settlementBasis?: string;
  @IsOptional() @IsNumber() prepayPct?: number;
  @IsOptional() @IsNumber() paymentDays?: number;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() moistureRule?: string;
  @IsOptional() @IsString() impurityRule?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsObject() draftData?: Record<string, unknown>;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateContractLineItemDto) lineItems?: CreateContractLineItemDto[];
}
