import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CreateOrderLineItemDto } from './create-order.dto';

export class UpdateOrderDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsDateString() plannedDate?: string;
  @IsOptional() @IsString() deliveryLocation?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateOrderLineItemDto) lineItems?: CreateOrderLineItemDto[];
}
