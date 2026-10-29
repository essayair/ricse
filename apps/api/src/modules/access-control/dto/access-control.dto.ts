import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CreateRoleDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissionIds?: string[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() status?: string;
}

export class ReplaceRolePermissionsDto {
  @IsArray() @IsString({ each: true }) permissionIds: string[];
}

export class RoleAssignmentDto {
  @IsString() roleId: string;
  @IsString() scopeType: string;
  @IsOptional() @IsArray() @IsString({ each: true }) targetCompanyIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) targetBusinessUnitIds?: string[];
  @IsOptional() @IsDateString() expiresAt?: string | null;
}

export class ReplaceUserAssignmentsDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RoleAssignmentDto) assignments?: RoleAssignmentDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) businessUnitIds?: string[];
  @IsOptional() @IsString() defaultBusinessUnitId?: string | null;
}
