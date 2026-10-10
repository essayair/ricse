import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/swagger';

const cleanText = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || undefined : value;
const cleanUpperText = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() || undefined : value;

export class CreateDriverDto {
  // 可选：不传表示无承运商司机（社会运力专用，或由所在车队继承承运商）。
  // 不加 cleanText 转换，保留空字符串与未传字段的区别，供 update 时表达"显式解绑"。
  @IsOptional()
  @IsString()
  serviceOrganizationId?: string;

  @Transform(cleanText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @Transform(cleanText)
  @Matches(/^1[3-9]\d{9}$/, { message: '司机手机号必须是11位有效手机号' })
  phone: string;

  @IsOptional()
  @Transform(cleanUpperText)
  @Matches(/^(\d{17}[\dXx])$/, { message: '身份证号格式不正确' })
  idCardNo?: string;

  @IsOptional()
  @Transform(cleanUpperText)
  @IsString()
  @MaxLength(50)
  licenseNo?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(20)
  licenseClass?: string;

  @IsOptional()
  @IsDateString()
  licenseExpiry?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class UpdateDriverDto extends PartialType(CreateDriverDto) {}
