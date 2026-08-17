import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProductionRecipeInputDto {
  @IsString() materialId: string;
  @IsOptional() @IsIn(['RAW', 'AUXILIARY', 'PACKAGING']) materialRole?: string;
  @Type(() => Number) @IsNumber() @Min(0.001) quantity: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() @MaxLength(500) remark?: string;
}

export class CreateProductionRecipeDto {
  @IsString() @MaxLength(100) name: string;
  @IsString() ownerPartnerId: string;
  @IsString() outputMaterialId: string;
  @Type(() => Number) @IsNumber() @Min(0.001) baseOutputQuantity: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1000) expectedYieldRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) lossToleranceRate?: number;
  @IsOptional() @IsBoolean() qualityRequired?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) processDescription?: string;
  @IsOptional() @IsString() @MaxLength(2000) qualityRequirements?: string;
  @IsOptional() @IsString() @MaxLength(1000) remark?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ProductionRecipeInputDto)
  inputs: ProductionRecipeInputDto[];
}

export class UpdateProductionRecipeDto extends CreateProductionRecipeDto {
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
}

export class CreateProductionTaskDto {
  @IsString() @MaxLength(100) name: string;
  @IsIn(['INTERNAL', 'OUTSOURCED']) mode: string;
  @IsString() recipeId: string;
  @IsString() ownerPartnerId: string;
  @IsOptional() @IsString() processorOrganizationId?: string;
  @IsString() sourceWarehouseId: string;
  @IsString() targetWarehouseId: string;
  @Type(() => Number) @IsNumber() @Min(0.001) plannedOutputQuantity: number;
  @IsOptional() @IsIn(['MANUAL', 'SALES_ORDER']) sourceType?: string;
  @IsOptional() @IsString() sourceOrderId?: string;
  @IsOptional() @IsString() @MaxLength(100) sourceOrderNo?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) processingFeeRate?: number;
  @IsOptional() @IsString() @MaxLength(100) operatorName?: string;
  @IsOptional() @IsDateString() plannedStartAt?: string;
  @IsOptional() @IsDateString() plannedEndAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}

export class ProductionReservationItemDto {
  @IsString() taskInputId: string;
  @IsString() inventoryLotId: string;
  @Type(() => Number) @IsNumber() @Min(0.001) quantity: number;
}

export class ReserveProductionMaterialsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ProductionReservationItemDto)
  allocations: ProductionReservationItemDto[];
}

export class ProductionQuantityItemDto {
  @IsString() allocationId: string;
  @Type(() => Number) @IsNumber() @Min(0.001) quantity: number;
}

export class RecordProductionQuantitiesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ProductionQuantityItemDto)
  allocations: ProductionQuantityItemDto[];
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}

export class CreateProductionCompletionDto {
  @Type(() => Number) @IsNumber() @Min(0.001) quantity: number;
  @IsOptional() @IsDateString() producedAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
}

export class ConfirmProductionQualityDto {
  @IsIn(['PASS', 'REWORK', 'SCRAP']) conclusion: string;
  @IsOptional() @IsString() @MaxLength(1000) remark?: string;
}
