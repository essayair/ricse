import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class FinalizeQualityTaskDto {
  @IsIn(['PASS', 'DEDUCTION', 'FUSE'])
  conclusion: string;

  @IsString()
  basisInspectionId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
