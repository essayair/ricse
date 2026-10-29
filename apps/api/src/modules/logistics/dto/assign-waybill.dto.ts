import { IsOptional, IsString } from 'class-validator';

/** 运单运力调度；Web 与小程序共用。计划时间沿用服务层的日期解析与先后校验。 */
export class AssignWaybillDto {
  @IsOptional() @IsString() freightMode?: string;
  @IsOptional() @IsString() vehicleId?: string | null;
  @IsOptional() @IsString() driverId?: string | null;
  @IsOptional() @IsString() carrierPartnerId?: string | null;
  @IsOptional() @IsString() carrierName?: string | null;
  @IsOptional() @IsString() plateNo?: string | null;
  @IsOptional() @IsString() driverName?: string | null;
  @IsOptional() @IsString() driverPhone?: string | null;
  @IsOptional() @IsString() plannedDepartureAt?: string;
  @IsOptional() @IsString() plannedArrivalAt?: string;
}
