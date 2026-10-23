import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';

export class CreateLogisticsSettlementLineDto {
  @IsString() waybillId: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) manualUnitPrice?: number;
  @IsOptional() @IsString() contractPriceTermId?: string;
  @IsOptional() @IsString() weighTicketId?: string;
  @IsOptional() @IsIn(['TICKET', 'CONFIRMED']) weightBasis?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) confirmedWeight?: number;
  @IsOptional() @IsString() weightReason?: string;
  @IsOptional() @IsString() overrideReason?: string;
  @IsOptional() @IsIn(['NET_WEIGHT', 'TRIP']) pricingBasis?: string;
}

export class CreateLogisticsSettlementDto {
  /** 历史兼容字段；新单据由所选运单对应合同自动确定我方签约主体 */
  @IsOptional() @IsString() payerCompanyId?: string;
  /** 默认贸易货主，可通过显式修改及原因改为其他有效内部付款主体；不覆盖原货主 */
  @IsOptional() @IsString() payerPartnerId?: string;
  @IsOptional() @IsString() payerChangeReason?: string;
  /** 不填时由所选运单的最早/最晚签收日期生成结算周期 */
  @IsOptional() @IsDateString() periodStart?: string;
  @IsOptional() @IsDateString() periodEnd?: string;
  @IsOptional() @IsString() remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateLogisticsSettlementLineDto)
  lines: CreateLogisticsSettlementLineDto[];
}

export class SetLinePriceDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) unitPrice: number;
  @IsOptional() @IsString() overrideReason?: string;
}

export class SetLineWeightDto {
  @IsOptional() @IsString() weighTicketId?: string;
  @IsOptional() @IsIn(['TICKET', 'CONFIRMED']) weightBasis?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) confirmedWeight?: number;
  @IsString() weightReason: string;
}

export class SetPayerDto {
  @IsString() payerPartnerId: string;
  @IsString() reason: string;
}
