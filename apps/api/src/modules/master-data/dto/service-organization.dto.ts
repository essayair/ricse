import { PartialType } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import type { ServiceOrganizationInput } from '../service-organization.service';

export class CreateServiceOrganizationDto implements ServiceOrganizationInput {
  @IsString() partnerId: string;
  @IsString() organizationType: string;
  @IsOptional() @IsString() licenseNo?: string;
  @IsOptional() @IsString() licenseExpiry?: string;
  @IsOptional() @IsString() qualificationNo?: string;
  @IsOptional() @IsString() cmaNo?: string;
  @IsOptional() @IsString() cnasNo?: string;
  @IsOptional() @IsString() serviceScope?: string;
  @IsOptional() @IsString() serviceRegions?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) transportModes?: string[];
  @IsOptional() @IsString() cargoTypes?: string;
  @IsOptional() @IsString() supportedMaterials?: string;
  @IsOptional() @IsString() supportedItems?: string;
  @IsOptional() @IsString() operationType?: string;
  @IsOptional() @IsNumber() @Min(0) storageCapacity?: number;
  @IsOptional() @IsString() dispatcherName?: string;
  @IsOptional() @IsString() dispatcherPhone?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() settlementMethod?: string;
  @IsOptional() @IsNumber() @Min(0) reportCycleDays?: number;
  @IsOptional() @IsString() insuranceInfo?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() remark?: string;
}

export class UpdateServiceOrganizationDto extends PartialType(CreateServiceOrganizationDto) {}
