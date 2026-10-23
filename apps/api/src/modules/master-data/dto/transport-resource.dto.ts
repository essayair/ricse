import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { OmitType } from '@nestjs/swagger';
import { CreateDriverDto } from './driver.dto';
import { CreateVehicleDto } from './vehicle.dto';

export class ResourceVehicleDto extends OmitType(CreateVehicleDto, ['drivers', 'driverName', 'driverPhone'] as const) {}

export class CreateTransportResourceDto {
  @IsOptional() @IsString() @IsNotEmpty() driverId?: string;
  @IsOptional() @ValidateNested() @Type(() => CreateDriverDto) newDriver?: CreateDriverDto;
  @IsOptional() @IsString() @IsNotEmpty() vehicleId?: string;
  @IsOptional() @ValidateNested() @Type(() => ResourceVehicleDto) newVehicle?: ResourceVehicleDto;
}

export class RecognizeTransportResourceDto {
  @IsString() @IsNotEmpty() @MaxLength(10000) text: string;
}
