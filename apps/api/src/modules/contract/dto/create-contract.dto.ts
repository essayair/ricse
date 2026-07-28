import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
  Min,
  MaxLength,
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
  @ApiPropertyOptional({ description: '客户端请求标识，用于防止重复创建草稿' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientRequestId?: string;

  @ApiProperty({ description: '合同标题' })
  @IsString()
  title: string;

  @ApiProperty({ description: '合同类型', enum: ['PURCHASE', 'SALES', 'BILATERAL'] })
  @IsString()
  type: string;

  @ApiProperty({ description: '卖方（Partner ID）' })
  @IsString()
  sellerId: string;

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

  // 我方信息
  @ApiPropertyOptional({ description: '我方签约主体（Partner ID）' })
  @IsOptional() @IsString()
  signingPartnerId?: string;

  @ApiPropertyOptional({ description: '业务部门' })
  @IsOptional() @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: '外部合同号' })
  @IsOptional() @IsString()
  externalNo?: string;

  // 对手方
  @ApiPropertyOptional({ description: '买方' })
  @IsOptional() @IsString()
  buyerId?: string;

  @ApiPropertyOptional({ description: '联系人' })
  @IsOptional() @IsString()
  contactPerson?: string;

  @ApiPropertyOptional({ description: '联系电话' })
  @IsOptional() @IsString()
  contactPhone?: string;

  // 货物与价格
  @ApiPropertyOptional({ description: '定价类型' })
  @IsOptional() @IsString()
  pricingType?: string;

  @ApiPropertyOptional({ description: '溢装比例' })
  @IsOptional() @IsNumber()
  overfillPct?: number;

  @ApiPropertyOptional({ description: '短装比例' })
  @IsOptional() @IsNumber()
  shortfallPct?: number;

  // 履约
  @ApiPropertyOptional({ description: '交货方式' })
  @IsOptional() @IsString()
  deliveryMethod?: string;

  @ApiPropertyOptional({ description: '交货地点' })
  @IsOptional() @IsString()
  deliveryLocation?: string;

  // 结算
  @ApiPropertyOptional({ description: '结算数量依据' })
  @IsOptional() @IsString()
  settlementBasis?: string;

  @ApiPropertyOptional({ description: '预付比例' })
  @IsOptional() @IsNumber()
  prepayPct?: number;

  @ApiPropertyOptional({ description: '尾款账期(天)' })
  @IsOptional() @IsNumber()
  paymentDays?: number;

  @ApiPropertyOptional({ description: '付款方式' })
  @IsOptional() @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: '扣水规则' })
  @IsOptional() @IsString()
  moistureRule?: string;

  @ApiPropertyOptional({ description: '扣杂规则' })
  @IsOptional() @IsString()
  impurityRule?: string;

  @ApiProperty({ description: '合同行项', type: [CreateContractLineItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateContractLineItemDto)
  lineItems: CreateContractLineItemDto[];
}
