import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PartialType } from '@nestjs/swagger';

const cleanText = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || undefined : value;

export class VehicleDriverInputDto {
  @IsString()
  @IsNotEmpty()
  driverId: string;

  @IsIn(['PRIMARY', 'SECONDARY'])
  role: string;
}

export class CreateVehicleDto {
  @Transform(({ value }) => typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value)
  @IsString()
  @IsNotEmpty()
  @Matches(/^[\u4e00-\u9fa5][A-Z][A-Z0-9挂学警港澳]{5,6}$/, { message: '请输入正确的车牌号' })
  plateNo: string;

  @IsIn(['SEMI_TRAILER', 'HEAVY_SEMI_TRAILER', 'BOX_TRUCK', 'DUMP_TRUCK', 'TANK_TRUCK', 'TRUCK', 'TANK', 'TRAILER'])
  vehicleType: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(100)
  brand?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(9999.99)
  loadCapacity: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(9999.99)
  tareWeight?: number | null;

  @IsOptional()
  @IsIn(['YELLOW', 'GREEN', 'BLUE', 'BLACK', 'OTHER'])
  plateColor?: string | null;

  @IsOptional() @Transform(cleanText) @IsString() @MaxLength(100) licenseNo?: string | null;
  @IsOptional() @IsDateString() annualInspectionExpiry?: string | null;
  @IsOptional() @IsDateString() compulsoryInsuranceExpiry?: string | null;
  @IsOptional() @IsDateString() commercialInsuranceExpiry?: string | null;

  @IsIn(['SELF', 'OUTSOURCED'])
  ownerType: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  ownerId?: string;

  @IsOptional() @Transform(cleanText) @IsString() @MaxLength(50) ownerName?: string | null;
  @IsOptional() @Transform(cleanText) @IsString() @MaxLength(30) ownerPhone?: string | null;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(50)
  driverName?: string;

  @IsOptional()
  @Transform(cleanText)
  @Matches(/^1[3-9]\d{9}$/, { message: '司机手机号必须是11位有效手机号' })
  driverPhone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => VehicleDriverInputDto)
  drivers?: VehicleDriverInputDto[];

  @IsOptional() @IsIn(['BEIDOU', 'GPS', 'NONE']) deviceType?: string | null;
  @IsOptional() @Transform(cleanText) @IsString() @MaxLength(100) deviceNo?: string | null;
  @IsOptional() @IsDateString() deviceInstalledAt?: string | null;

  @IsOptional()
  @IsIn(['ACTIVE', 'MAINTENANCE', 'RETIRED'])
  status?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {}
