import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';

export class CreateLogisticsSettlementLineDto {
  @IsString() waybillId: string;
  @IsOptional() @IsNumber() @Min(0.01) manualUnitPrice?: number;
}

export class CreateLogisticsSettlementDto {
  /** 不传时默认取当前登录用户所属企业 */
  @IsOptional() @IsString() payerCompanyId?: string;
  @IsDateString() periodStart: string;
  @IsDateString() periodEnd: string;
  @IsOptional() @IsString() remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLogisticsSettlementLineDto)
  lines: CreateLogisticsSettlementLineDto[];
}

export class SetLinePriceDto {
  @IsNumber() @Min(0.01) unitPrice: number;
  @IsOptional() @IsString() overrideReason?: string;
}
