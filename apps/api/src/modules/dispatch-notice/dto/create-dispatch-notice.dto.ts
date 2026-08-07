import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

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

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  originLocation: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  destinationLocation: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDispatchNoticeLineDto)
  lineItems: CreateDispatchNoticeLineDto[];
}
