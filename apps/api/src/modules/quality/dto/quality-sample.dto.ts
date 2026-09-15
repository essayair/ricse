import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateQualitySampleDto {
  @IsOptional() @IsString() @MaxLength(100) sampleNo?: string;
  @IsOptional() @IsString() @MaxLength(100) sampleLabel?: string;
  @IsDateString() sampledAt: string;
  @IsOptional() @IsString() @MaxLength(100) samplerName?: string;
  @IsOptional() @IsString() @MaxLength(200) samplingMethod?: string;
  @IsOptional() @IsString() @MaxLength(100) sealNo?: string;
  @IsOptional() @IsString() @MaxLength(200) destinationInstitutionName?: string;
  @IsOptional() @IsDateString() sentAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
  @IsOptional() @IsIn(['SAMPLED', 'SENT', 'RECEIVED']) status?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) plannedReportCount?: number;
}

export class UpdateQualitySampleDto {
  @IsOptional() @IsString() @MaxLength(100) sampleNo?: string;
  @IsOptional() @IsString() @MaxLength(100) sampleLabel?: string;
  @IsOptional() @IsDateString() sampledAt?: string;
  @IsOptional() @IsString() @MaxLength(100) samplerName?: string;
  @IsOptional() @IsString() @MaxLength(200) samplingMethod?: string;
  @IsOptional() @IsString() @MaxLength(100) sealNo?: string;
  @IsOptional() @IsString() @MaxLength(200) destinationInstitutionName?: string;
  @IsOptional() @IsDateString() sentAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) remarks?: string;
  @IsOptional() @IsIn(['SAMPLED', 'SENT', 'RECEIVED']) status?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) plannedReportCount?: number;
}
