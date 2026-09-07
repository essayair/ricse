import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsNumber, IsOptional,
  IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';

export class CreateWaybillLineDto {
  @IsString()
  dispatchNoticeLineItemId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class WaybillCreateFieldsDto {
  @IsOptional()
  @IsIn(['SELF', 'THIRD_PARTY'])
  freightMode?: string;

  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() carrierPartnerId?: string;
  @IsOptional() @IsString() carrierName?: string;
  @IsOptional() @IsString() plateNo?: string;
  @IsOptional() @IsString() driverName?: string;
  @IsOptional() @IsString() driverPhone?: string;
  @IsOptional() @IsString() originLocation?: string;
  @IsOptional() @IsString() destinationLocation?: string;
  @IsOptional() @IsDateString() plannedDepartureAt?: string;
  @IsOptional() @IsDateString() plannedArrivalAt?: string;
  @IsOptional() @IsString() remarks?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWaybillLineDto)
  lineItems: CreateWaybillLineDto[];
}

export class CreateWaybillDto extends WaybillCreateFieldsDto {
  @IsString()
  dispatchNoticeId: string;
}

export class BatchWaybillItemDto extends WaybillCreateFieldsDto {
  @IsUUID()
  clientRowId: string;
}

export class BatchCreateWaybillDto {
  @IsString()
  dispatchNoticeId: string;

  @IsUUID()
  batchRequestId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BatchWaybillItemDto)
  items: BatchWaybillItemDto[];
}
