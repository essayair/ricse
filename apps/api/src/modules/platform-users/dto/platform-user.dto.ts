import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PlatformUserQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['ACTIVE', 'DISABLED']) status?: string;
  @IsOptional() @IsIn(['BOUND', 'UNBOUND']) bindingStatus?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageNo?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

export class LinkableAccountQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() currentIdentityId?: string;
}

export class BindBackendAccountDto {
  @IsString() userId: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class UpdatePlatformUserDto {
  @IsIn(['ACTIVE', 'DISABLED']) status: string;
}

export class UnbindBackendAccountDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
