import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min,
  ValidateNested,
} from 'class-validator';

export class InventoryReversalLineDto {
  @IsString()
  inventoryLotId: string;

  @IsOptional()
  @IsString()
  sourceSalesOutboundLineId?: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class CreateInventoryReversalDto {
  @IsIn(['INBOUND', 'OUTBOUND'])
  type: string;

  @IsString()
  sourceId: string;

  @IsString()
  @MaxLength(500)
  reason: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventoryReversalLineDto)
  lines: InventoryReversalLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}
