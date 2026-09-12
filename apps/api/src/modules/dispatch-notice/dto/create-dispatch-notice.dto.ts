import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class DispatchLocationDto {
  @IsString() @IsNotEmpty() @MaxLength(200) originLocation: string;
  @IsString() @IsNotEmpty() @MaxLength(200) destinationLocation: string;

  @IsOptional() @IsIn(['MANUAL', 'WAREHOUSE', 'PARTNER_ADDRESS']) originSourceType?: string;
  @IsOptional() @IsIn(['MANUAL', 'WAREHOUSE', 'PARTNER_ADDRESS']) destinationSourceType?: string;
  @IsOptional() @IsString() originWarehouseId?: string;
  @IsOptional() @IsString() destinationWarehouseId?: string;
  @IsOptional() @IsString() originPartnerAddressId?: string;
  @IsOptional() @IsString() destinationPartnerAddressId?: string;
  @IsOptional() @IsString() @MaxLength(50) originContactPerson?: string;
  @IsOptional() @IsString() @MaxLength(30) originContactPhone?: string;
  @IsOptional() @IsString() @MaxLength(50) destinationContactPerson?: string;
  @IsOptional() @IsString() @MaxLength(30) destinationContactPhone?: string;
}

export class CreateDispatchNoticeLineDto {
  @IsString()
  orderLineItemId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class CreateDispatchNoticeDto extends DispatchLocationDto {
  @IsString()
  orderId: string;

  @IsOptional()
  @IsIn(['STANDARD', 'DIRECT'])
  mode?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsOptional()
  @IsBoolean()
  qualityRequired?: boolean;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDispatchNoticeLineDto)
  lineItems: CreateDispatchNoticeLineDto[];
}
