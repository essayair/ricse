import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateWeighRecordDto {
  @IsIn(['GROSS', 'TARE'])
  weighingType: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  weight: number;

  @IsOptional()
  @IsIn(['DEVICE', 'MANUAL', 'IMPORTED'])
  dataSource?: string;

  @IsOptional() @IsDateString() weighedAt?: string;
  @IsOptional() @IsString() remarks?: string;
}
