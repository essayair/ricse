import { PartialType } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFleetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contactPhone?: string;

  // 可选：不传表示暂未挂靠任何开票承运商。不加 trim/清空转换，
  // 保留空字符串与未传字段的区别，供 update 时表达"显式解绑"。
  @IsOptional()
  @IsString()
  carrierPartnerId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class UpdateFleetDto extends PartialType(CreateFleetDto) {}
