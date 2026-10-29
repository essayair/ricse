import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
  @IsString() partnerId: string;
  @IsOptional() @IsString() parentId?: string;
}

export class UpdateCompanyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() shortName?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() parentId?: string;
}

export class CreateDepartmentDto {
  @IsString() name: string;
  @IsString() companyId: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsInt() sort?: number;
}

/** 部门所属企业创建后不可变更，只允许修改名称、上级部门和排序。 */
export class UpdateDepartmentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsInt() sort?: number;
}

export class ReorderDepartmentsDto {
  @IsString() companyId: string;
  @IsArray() @IsString({ each: true }) orderedIds: string[];
}

export class CreateEmployeeDto {
  @IsString() name: string;
  @IsString() departmentId: string;
  @IsString() companyId: string;
  @IsString() phone: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() status?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() status?: string;
}

export class CreateBusinessGroupDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) companyIds?: string[];
}

export class UpdateBusinessGroupDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) companyIds?: string[];
}

export class CreateBusinessUnitDto {
  @IsString() name: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() profitCenterCode?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateBusinessUnitDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsString() profitCenterCode?: string | null;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() description?: string | null;
}
