import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString,
  MaxLength, Min, ValidateNested,
} from 'class-validator';

export class OutboundAllocationDto {
  @IsString()
  inventoryLotId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class CreateOutboundReceiptDto {
  @IsString()
  waybillId: string;

  @IsString()
  weighTicketId: string;

  @IsDateString()
  departedAt: string;

  @IsString()
  @MaxLength(100)
  operatorName: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OutboundAllocationDto)
  allocations: OutboundAllocationDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}
