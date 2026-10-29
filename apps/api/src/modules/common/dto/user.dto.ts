import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
  @IsString() username: string;
  @IsString() password: string;
  @IsString() name: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() businessGroupId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) businessUnitIds?: string[];
  @IsOptional() @IsString() defaultBusinessUnitId?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
}

export class ResetPasswordDto {
  @IsString() password: string;
}
