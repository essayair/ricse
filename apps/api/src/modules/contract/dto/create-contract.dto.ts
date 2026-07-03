import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class CreateContractLineItemDto {
  @ApiProperty({ description: '物料 ID' })
  @IsString()
  materialId: string;

  @ApiPropertyOptional({ description: '物料名称' })
  @IsOptional()
  @IsString()
  materialName?: string;

  @ApiProperty({ description: '数量' })
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @ApiPropertyOptional({ description: '单位', default: 'TON' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ description: '单价' })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ description: '交货日期' })
  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateContractDto {
  @ApiProperty({ description: '合同标题' })
  @IsString()
  title: string;

  @ApiProperty({ description: '合同类型', enum: ['PURCHASE', 'SALES', 'BILATERAL'] })
  @IsString()
  type: string;

  @ApiProperty({ description: '交易对手方（Partner ID）' })
  @IsString()
  partnerId: string;

  @ApiProperty({ description: '总金额' })
  @IsNumber()
  @Min(0)
  totalAmount: number;

  @ApiPropertyOptional({ description: '签订日期' })
  @IsOptional()
  @IsDateString()
  signedAt?: string;

  @ApiPropertyOptional({ description: '生效日期' })
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;

  @ApiPropertyOptional({ description: '到期日期' })
  @IsOptional()
  @IsDateString()
  expireAt?: string;

  @ApiPropertyOptional({ description: '结算方式', default: 'DELIVERY' })
  @IsOptional()
  @IsString()
  settlementMethod?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ description: '合同行项', type: [CreateContractLineItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateContractLineItemDto)
  lineItems: CreateContractLineItemDto[];
}
