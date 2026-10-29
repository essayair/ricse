import { IsArray, IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateMaterialCategoryDto {
  @IsString() name: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsInt() sort?: number;
}

export class UpdateMaterialCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsInt() sort?: number;
}

export class CreateMaterialDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() baseName?: string;
  @IsString() categoryId: string;
  @IsOptional() @IsString() commodityForm?: string;
  @IsOptional() @IsString() coreSpecName?: string;
  @IsOptional() @IsString() coreSpecOperator?: string;
  @IsOptional() @IsString() coreSpecValue?: string;
  @IsOptional() @IsString() coreSpecUnit?: string;
  @IsOptional() @IsString() referenceType?: string;
  @IsOptional() @IsString() grade?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() spec?: string;
  @IsOptional() @IsString() sourceRegion?: string;
  @IsOptional() @IsString() packageType?: string;
  @IsOptional() @IsBoolean() isVirtual?: boolean;
  @IsOptional() @IsArray() specs?: object[];
  @IsOptional() @IsString() hsCode?: string;
  @IsOptional() @IsString() taxCode?: string;
  @IsOptional() @IsString() internalCode?: string;
  @IsOptional() @IsString() qcTemplate?: string;
  @IsOptional() @IsString() qualityTemplateId?: string;
  @IsOptional() @IsString() pricingQuantityBasis?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() remark?: string;
}

export class UpdateMaterialDto {
  @IsOptional() @IsBoolean() isVirtual?: boolean;
  @IsOptional() @IsArray() specs?: object[];
  @IsOptional() @IsString() hsCode?: string | null;
  @IsOptional() @IsString() taxCode?: string | null;
  @IsOptional() @IsString() internalCode?: string | null;
  @IsOptional() @IsString() qcTemplate?: string | null;
  @IsOptional() @IsString() qualityTemplateId?: string | null;
  @IsOptional() @IsString() pricingQuantityBasis?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() remark?: string | null;
}

export class CreateWarehouseDto {
  @IsString() code: string;
  @IsString() name: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() partnerId?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() manager?: string;
  @IsOptional() @IsString() managerPhone?: string;
  @IsOptional() @IsString() remark?: string;
}

export class UpdateWarehouseDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() partnerId?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() manager?: string;
  @IsOptional() @IsString() managerPhone?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() remark?: string;
}
