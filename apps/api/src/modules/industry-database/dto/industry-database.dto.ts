import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class IndustryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageNo?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(50) province?: string;
  @IsOptional() @IsString() @MaxLength(30) status?: string;
}

export class IndustryBaseDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(100) shortName?: string;
  @IsOptional() @IsString() @MaxLength(50) province?: string;
  @IsOptional() @IsString() @MaxLength(50) city?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(30) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1900) @Max(2200) dataYear?: number;
  @IsOptional() @IsString() @MaxLength(500) source?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(2000) remark?: string;
}

export class CreateFluoriteProducerDto extends IndustryBaseDto {
  @IsOptional() @IsArray() @IsString({ each: true }) mainProducts?: string[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) designCapacity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) effectiveCapacity?: number;
  @IsOptional() @IsString() @MaxLength(30) capacityUnit?: string;
}
export class UpdateFluoriteProducerDto extends PartialType(CreateFluoriteProducerDto) {}

export class CreateFluorochemicalProducerDto extends IndustryBaseDto {
  @IsOptional() @IsArray() @IsString({ each: true }) productCategories?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) mainProducts?: string[];
}
export class UpdateFluorochemicalProducerDto extends PartialType(CreateFluorochemicalProducerDto) {}

export class CreateMineResourceDto extends IndustryBaseDto {
  @IsOptional() @IsString() @MaxLength(50) district?: string;
  @IsOptional() @IsString() @MaxLength(200) operatorName?: string;
  @IsOptional() @IsString() @MaxLength(100) mineralType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) reserveAmount?: number;
  @IsOptional() @IsString() @MaxLength(30) reserveUnit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) averageGrade?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) miningCapacity?: number;
  @IsOptional() @IsString() @MaxLength(30) capacityUnit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
}
export class UpdateMineResourceDto extends PartialType(CreateMineResourceDto) {}

export class CreateCapacityProjectDto extends IndustryBaseDto {
  @IsString() @MaxLength(200) companyName: string;
  @IsString() @MaxLength(100) productName: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) designCapacity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) effectiveCapacity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) plannedCapacity?: number;
  @IsOptional() @IsString() @MaxLength(30) capacityUnit?: string;
  @IsOptional() @IsDateString() commissioningDate?: string;
}
export class UpdateCapacityProjectDto extends PartialType(CreateCapacityProjectDto) {}

export class CreateIndustryParkDto extends IndustryBaseDto {
  @IsOptional() @IsString() @MaxLength(100) level?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) focusIndustries?: string[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
}
export class UpdateIndustryParkDto extends PartialType(CreateIndustryParkDto) {}
