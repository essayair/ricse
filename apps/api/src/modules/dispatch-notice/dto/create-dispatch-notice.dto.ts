import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CreateDispatchNoticeLineDto {
  @IsString()
  orderLineItemId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class CreateDispatchNoticeDto {
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
  @IsString()
  originLocation?: string;

  @IsOptional()
  @IsString()
  destinationLocation?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDispatchNoticeLineDto)
  lineItems: CreateDispatchNoticeLineDto[];
}
