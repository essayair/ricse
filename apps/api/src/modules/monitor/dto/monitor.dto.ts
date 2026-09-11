import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';

const STATUS = ['ACTIVE', 'INACTIVE'];
const PURPOSE = ['WEIGHBRIDGE', 'UNLOADING', 'WAREHOUSE', 'LAB', 'OTHER'];

export class UpsertMonitorPlatformDto {
  @ApiProperty({ description: '平台标识', example: 'EZVIZ' })
  @IsString() @IsNotEmpty() @MaxLength(50)
  code!: string;

  @ApiProperty({ description: '平台名称' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  name!: string;

  @ApiProperty({ description: 'appKey' })
  @IsString() @IsNotEmpty() @MaxLength(200)
  appKey!: string;

  @ApiProperty({ description: 'appSecret' })
  @IsString() @IsNotEmpty() @MaxLength(200)
  appSecret!: string;

  @ApiPropertyOptional({ description: '开放平台地址', default: 'https://open.ys7.com' })
  @IsOptional() @IsString() @MaxLength(200)
  baseUrl?: string;

  @ApiPropertyOptional({ enum: STATUS })
  @IsOptional() @IsIn(STATUS)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  remark?: string;
}

export class UpdateMonitorPlatformDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(200)
  appKey?: string;

  @ApiPropertyOptional({ description: 'appSecret，留空表示不修改' })
  @IsOptional() @IsString() @MaxLength(200)
  appSecret?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(200)
  baseUrl?: string;

  @ApiPropertyOptional({ enum: STATUS })
  @IsOptional() @IsIn(STATUS)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  remark?: string;
}

export class CreateMonitorSiteDto {
  @ApiProperty({ description: '所属平台 ID' })
  @IsString() @IsNotEmpty()
  platformId!: string;

  @ApiProperty({ description: '分组标识', example: 'panorama' })
  @IsString() @IsNotEmpty() @MaxLength(50)
  code!: string;

  @ApiProperty({ description: '分组名称', example: '玉门仓监控-全景' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: '关联仓库 ID，化验室等非仓库点位可不填' })
  @IsOptional() @IsString()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: STATUS })
  @IsOptional() @IsIn(STATUS)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  remark?: string;
}

export class UpdateMonitorSiteDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: STATUS })
  @IsOptional() @IsIn(STATUS)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  remark?: string;
}

export class CreateMonitorCameraDto {
  @ApiProperty({ description: '所属分组 ID' })
  @IsString() @IsNotEmpty()
  siteId!: string;

  @ApiProperty({ description: '点位标识', example: 'gk-3' })
  @IsString() @IsNotEmpty() @MaxLength(50)
  code!: string;

  @ApiProperty({ description: '点位名称', example: '广角摄像头全景' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  name!: string;

  @ApiProperty({ description: '设备序列号', example: 'GK9665972' })
  @IsString() @IsNotEmpty() @MaxLength(50)
  deviceSerial!: string;

  @ApiProperty({ description: '通道号', example: 3 })
  @IsInt() @Min(1) @Max(64)
  channelNo!: number;

  @ApiPropertyOptional({ description: 'ezopen 设备验证码' })
  @IsOptional() @IsString() @MaxLength(50)
  verifyCode?: string;

  @ApiPropertyOptional({ enum: ['hd', 'sd'], default: 'hd' })
  @IsOptional() @IsIn(['hd', 'sd'])
  streamQuality?: string;

  @ApiPropertyOptional({ description: '是否支持云台' })
  @IsOptional() @IsBoolean()
  ptzSupport?: boolean;

  @ApiPropertyOptional({ enum: PURPOSE })
  @IsOptional() @IsIn(PURPOSE)
  purpose?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: STATUS })
  @IsOptional() @IsIn(STATUS)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  remark?: string;
}

export class UpdateMonitorCameraDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  siteId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(50)
  deviceSerial?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1) @Max(64)
  channelNo?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(50)
  verifyCode?: string;

  @ApiPropertyOptional({ enum: ['hd', 'sd'] })
  @IsOptional() @IsIn(['hd', 'sd'])
  streamQuality?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  ptzSupport?: boolean;

  @ApiPropertyOptional({ enum: PURPOSE })
  @IsOptional() @IsIn(PURPOSE)
  purpose?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: STATUS })
  @IsOptional() @IsIn(STATUS)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(500)
  remark?: string;
}

export class MonitorPtzDto {
  @ApiProperty({ description: '摄像头点位 ID' })
  @IsString() @IsNotEmpty()
  cameraId!: string;

  @ApiProperty({ description: '方向：8=拉近，9=拉远', example: 8 })
  @IsInt() @Min(0) @Max(15)
  direction!: number;

  @ApiPropertyOptional({ description: '速度 0-7', default: 4 })
  @IsOptional() @IsInt() @Min(0) @Max(7)
  speed?: number;
}
