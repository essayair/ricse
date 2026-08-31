import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpsertQualityIndicatorDefinitionDto {
  @IsString() @MaxLength(50) code: string;
  @IsString() @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(50) symbol?: string;
  @IsString() @MaxLength(20) defaultUnit: string;
  @IsOptional() @IsIn(['NUMBER', 'TEXT', 'BOOLEAN']) dataType?: string;
  @IsOptional() @IsInt() @Min(0) @Max(8) decimalPlaces?: number;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @IsOptional() @IsString() @MaxLength(1000) remark?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) methodIds?: string[];
  @IsOptional() @IsString() defaultMethodId?: string;
}

export class UpsertQualityMethodDto {
  @IsString() @MaxLength(50) code: string;
  @IsString() @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(100) standardNo?: string;
  @IsOptional() @IsString() @MaxLength(50) standardVersion?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
}

export class QualityTemplateItemDto {
  @IsString() indicatorId: string;
  @IsOptional() @IsString() defaultMethodId?: string;
  @IsIn(['GTE', 'LTE', 'EQ', 'RANGE']) operator: string;
  @IsOptional() @IsNumber() standardValue?: number;
  @IsOptional() @IsNumber() upperValue?: number;
  @IsOptional() @IsNumber() fuseValue?: number;
  @IsString() @MaxLength(20) unit: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsBoolean() core?: boolean;
  @IsOptional() @IsBoolean() participates?: boolean;
  @IsOptional() @IsInt() @Min(0) sort?: number;
}

export class UpsertQualityTemplateDto {
  @IsString() @MaxLength(50) code: string;
  @IsString() @MaxLength(100) name: string;
  @IsOptional() @IsString() materialCategoryId?: string;
  @IsIn(['GENERAL', 'PURCHASE', 'SALES', 'PRODUCTION']) businessScene: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @IsOptional() @IsString() @MaxLength(2000) remark?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QualityTemplateItemDto)
  items: QualityTemplateItemDto[];
}

export class SaveQualityMethodPreferenceDto {
  @IsString() materialId: string;
  @IsString() indicatorId: string;
  @IsString() methodId: string;
}
