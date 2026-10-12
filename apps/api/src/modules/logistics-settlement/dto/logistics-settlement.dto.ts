import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';

export class CreateLogisticsSettlementLineDto {
  @IsString() waybillId: string;
  @IsOptional() @IsNumber() @Min(0.01) manualUnitPrice?: number;
}

export class CreateLogisticsSettlementDto {
  /** 历史兼容字段；新单据由所选运单对应合同自动确定我方签约主体 */
  @IsOptional() @IsString() payerCompanyId?: string;
  /** 可选校验字段；实际值必须与所选运单对应合同的我方签约主体一致 */
  @IsOptional() @IsString() payerPartnerId?: string;
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
