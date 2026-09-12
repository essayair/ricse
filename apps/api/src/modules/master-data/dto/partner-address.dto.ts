import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePartnerAddressDto {
  @IsString() @MaxLength(50) addressName: string;
  @IsString() @MaxLength(30) province: string;
  @IsString() @MaxLength(30) city: string;
  @IsString() @MaxLength(30) district: string;
  @IsString() @MaxLength(160) detailAddress: string;
  @IsString() @MaxLength(50) contactPerson: string;
  @IsString() @MaxLength(30) contactPhone: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsString() @MaxLength(300) remark?: string;
}

export class UpdatePartnerAddressDto {
  @IsOptional() @IsString() @MaxLength(50) addressName?: string;
  @IsOptional() @IsString() @MaxLength(30) province?: string;
  @IsOptional() @IsString() @MaxLength(30) city?: string;
  @IsOptional() @IsString() @MaxLength(30) district?: string;
  @IsOptional() @IsString() @MaxLength(160) detailAddress?: string;
  @IsOptional() @IsString() @MaxLength(50) contactPerson?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @IsOptional() @IsString() @MaxLength(300) remark?: string;
}
