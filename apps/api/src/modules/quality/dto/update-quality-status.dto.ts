import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateQualityStatusDto {
  @IsIn(['TESTING', 'REPORTED', 'CONFIRMED', 'VOIDED'])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}
