import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateQualityTaskSamplingDto {
  @IsDateString() sampledAt: string;
  @IsString() @MaxLength(100) samplerName: string;
  @IsOptional() @IsString() @MaxLength(200) samplingMethod?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) plannedReportCount?: number;
}
