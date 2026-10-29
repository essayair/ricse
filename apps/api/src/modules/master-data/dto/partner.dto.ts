import { ArrayNotEmpty, IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

/** 创建合作伙伴；编码、税号、是否内部企业仅在创建时确定。 */
export class CreatePartnerDto {
  @IsOptional() @IsString() code?: string;
  @IsString() name: string;
  @IsOptional() @IsString() shortName?: string;
  @IsOptional() @IsString() shortCode?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() orgType?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() legalPerson?: string;
  @IsOptional() @IsString() legalPersonType?: string;
  @IsOptional() @IsString() legalIdCard?: string;
  @IsOptional() @IsString() controller?: string;
  @IsOptional() @IsString() controllerTitle?: string;
  @IsOptional() @IsString() controllerPhone?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsBoolean() isInternal?: boolean;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() bizAddress?: string;
  @IsOptional() @IsString() sourceRegion?: string;
  @IsOptional() @IsString() regNo?: string;
  @IsOptional() @IsString() estDate?: string;
  @IsOptional() @IsNumber() regCapital?: number;
  @IsOptional() @IsString() regCurrency?: string;
  @IsOptional() @IsString() revenueScale?: string;
  @IsOptional() @IsString() groupName?: string;
  @IsOptional() @IsBoolean() isParent?: boolean;
  @IsOptional() @IsString() taxType?: string;
  @IsOptional() @IsString() taxRating?: string;
  @IsOptional() @IsString() invoiceType?: string;
  @IsOptional() @IsString() relatedPartyType?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() corpType?: string;
  @IsOptional() @IsString() licenseType?: string;
  @IsOptional() @IsString() licenseExpiry?: string;
  @IsOptional() @IsString() bizScope?: string;
  @IsOptional() @IsString() mainBiz?: string;
  @IsOptional() @IsString() tradingGoods?: string;
  @IsOptional() @IsString() equityStructure?: string;
  @IsOptional() @IsString() intro?: string;
  @IsOptional() @IsNumber() creditLimit?: number;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) roles: string[];
  @IsOptional() @IsString() remark?: string;
}

/** 编辑合作伙伴；null 表示主动清空。编码、税号、是否内部企业不在可编辑范围内。 */
export class UpdatePartnerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() shortName?: string | null;
  @IsOptional() @IsString() shortCode?: string | null;
  @IsOptional() @IsString() orgType?: string | null;
  @IsOptional() @IsString() category?: string | null;
  @IsOptional() @IsString() legalPerson?: string | null;
  @IsOptional() @IsString() legalPersonType?: string | null;
  @IsOptional() @IsString() legalIdCard?: string | null;
  @IsOptional() @IsString() controller?: string | null;
  @IsOptional() @IsString() controllerTitle?: string | null;
  @IsOptional() @IsString() controllerPhone?: string | null;
  @IsOptional() @IsString() contactPerson?: string | null;
  @IsOptional() @IsString() contactPhone?: string | null;
  @IsOptional() @IsString() country?: string | null;
  @IsOptional() @IsString() province?: string | null;
  @IsOptional() @IsString() city?: string | null;
  @IsOptional() @IsString() address?: string | null;
  @IsOptional() @IsString() bizAddress?: string | null;
  @IsOptional() @IsString() sourceRegion?: string | null;
  @IsOptional() @IsString() regNo?: string | null;
  @IsOptional() @IsString() estDate?: string | null;
  @IsOptional() @IsNumber() regCapital?: number | null;
  @IsOptional() @IsString() regCurrency?: string | null;
  @IsOptional() @IsString() revenueScale?: string | null;
  @IsOptional() @IsString() groupName?: string | null;
  @IsOptional() @IsBoolean() isParent?: boolean | null;
  @IsOptional() @IsString() taxType?: string | null;
  @IsOptional() @IsString() taxRating?: string | null;
  @IsOptional() @IsString() invoiceType?: string | null;
  @IsOptional() @IsString() relatedPartyType?: string | null;
  @IsOptional() @IsString() industry?: string | null;
  @IsOptional() @IsString() corpType?: string | null;
  @IsOptional() @IsString() licenseType?: string | null;
  @IsOptional() @IsString() licenseExpiry?: string | null;
  @IsOptional() @IsString() bizScope?: string | null;
  @IsOptional() @IsString() mainBiz?: string | null;
  @IsOptional() @IsString() tradingGoods?: string | null;
  @IsOptional() @IsString() equityStructure?: string | null;
  @IsOptional() @IsString() intro?: string | null;
  @IsOptional() @IsNumber() creditLimit?: number | null;
  @IsOptional() @IsArray() @IsString({ each: true }) roles?: string[];
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() remark?: string | null;
}

export class CreateBankAccountDto {
  @IsString() accountName: string;
  @IsString() accountNo: string;
  @IsString() bankName: string;
  @IsOptional() @IsString() bankCode?: string;
  @IsOptional() @IsString() accountType?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
