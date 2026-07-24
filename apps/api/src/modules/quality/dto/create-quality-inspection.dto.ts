import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString,
  MaxLength, Min, ValidateNested,
} from 'class-validator';

export class QualityIndicatorDto {
  @IsString() @MaxLength(50) code: string;
  @IsString() @MaxLength(100) name: string;
  @IsIn(['GTE', 'LTE', 'EQ', 'RANGE']) operator: string;
  @IsOptional() @IsNumber() standardValue?: number;
  @IsOptional() @IsNumber() upperValue?: number;
  @IsOptional() @IsNumber() fuseValue?: number;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsNumber() measuredValue?: number;
}

export class CreateQualityInspectionDto {
  @IsString() weighTicketId: string;
  @IsDateString() sampledAt: string;
  @IsString() @MaxLength(100) samplerName: string;
  @IsOptional() @IsString() @MaxLength(100) samplingMethod?: string;
  @IsOptional() @IsString() @MaxLength(100) sampleNo1?: string;
  @IsOptional() @IsString() @MaxLength(100) sampleNo2?: string;
  @IsOptional() @IsString() @MaxLength(100) sampleNo3?: string;
  @IsOptional() @IsIn(['DEVICE', 'MANUAL', 'OCR']) dataSource?: string;

  @IsIn(['OUR', 'PARTNER', 'THIRD_PARTY', 'OTHER']) institutionType: string;
  @IsOptional() @IsString() institutionPartnerId?: string;
  @IsOptional() @IsString() @MaxLength(200) institutionName?: string;
  @IsString() @MaxLength(100) reportNo: string;
  @IsDateString() testedAt: string;

  @IsOptional() @IsNumber() @Min(0) moistureDeductionWeight?: number;
  @IsOptional() @IsNumber() @Min(0) impurityDeductionWeight?: number;
  @IsOptional() @IsNumber() @Min(0) deductionAmount?: number;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
  @IsOptional() @IsBoolean() submit?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QualityIndicatorDto)
  indicators: QualityIndicatorDto[];
}
