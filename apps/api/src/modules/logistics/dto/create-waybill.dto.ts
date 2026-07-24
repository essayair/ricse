import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CreateWaybillLineDto {
  @IsString()
  dispatchNoticeLineItemId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class CreateWaybillDto {
  @IsString()
  dispatchNoticeId: string;

  @IsOptional()
  @IsIn(['SELF', 'THIRD_PARTY'])
  freightMode?: string;

  @IsOptional() @IsString() vehicleId?: string;
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
