import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageNo?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class ArticleQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['NEWS', 'SUPPLY', 'DEMAND']) type?: string;
  @IsOptional() @IsIn(['DRAFT', 'PUBLISHED', 'OFFLINE']) status?: string;
  @IsOptional() @IsString() categoryId?: string;
}

export class CreateCategoryDto {
  @IsString() @MaxLength(50) code: string;
  @IsString() @MaxLength(100) name: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sort?: number;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sort?: number;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
}

export class CreateArticleDto {
  @IsIn(['NEWS', 'SUPPLY', 'DEMAND']) type: string;
  @IsString() @MaxLength(200) title: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(500) summary?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() @MaxLength(1000) coverUrl?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsString() @MaxLength(100) author?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsDateString() publishAt?: string;
  @IsOptional() @IsString() @MaxLength(100) productName?: string;
  @IsOptional() @IsString() @MaxLength(100) spec?: string;
  @IsOptional() @IsString() @MaxLength(100) quantity?: string;
  @IsOptional() @IsString() @MaxLength(100) priceText?: string;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @IsString() @MaxLength(100) deliveryMethod?: string;
  @IsOptional() @IsString() @MaxLength(2000) requirements?: string;
  @IsOptional() @IsString() @MaxLength(200) company?: string;
  @IsOptional() @IsString() @MaxLength(50) contactName?: string;
  @IsOptional() @IsString() @MaxLength(30) contactPhone?: string;
}

export class UpdateArticleDto extends CreateArticleDto {}

export class UpdateArticleStatusDto {
  @IsIn(['PUBLISHED', 'OFFLINE']) status: string;
  @IsOptional() @IsDateString() publishAt?: string;
}

export class ProductTypeDto {
  @IsString() @MaxLength(50) code: string;
  @IsString() @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(100) spec?: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sort?: number;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
}

export class CreatePriceDto {
  @IsString() productTypeId: string;
  @IsDateString() businessDate: string;
  @IsString() @MaxLength(100) region: string;
  @IsOptional() @IsString() @MaxLength(200) marketName?: string;
  @IsOptional() @IsString() @MaxLength(100) spec?: string;
  @Type(() => Number) @IsNumber() @Min(0) price: number;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() changeAmount?: number;
  @IsOptional() @IsIn(['MANUAL', 'BAIINFO', 'BUSINESS_ANALYTIQ', 'FLUORSPAR_COM', 'IMPORT']) source?: string;
  @IsOptional() @IsString() @MaxLength(500) remark?: string;
  @IsOptional() @IsObject() rawData?: Record<string, unknown>;
}

export class PriceQueryDto extends PageQueryDto {
  @IsOptional() @IsString() productTypeId?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsIn(['MANUAL', 'BAIINFO', 'BUSINESS_ANALYTIQ', 'FLUORSPAR_COM', 'IMPORT']) source?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class ContactQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['NEW', 'FOLLOWING', 'COMPLETED', 'INVALID']) status?: string;
}

export class CreateContactDto {
  @IsString() @MaxLength(50) name: string;
  @IsString() @MaxLength(30) phone: string;
  @IsOptional() @IsString() @MaxLength(200) company?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @IsString() @MaxLength(5000) message: string;
  @IsOptional() @IsString() @MaxLength(500) sourcePage?: string;
}

export class UpdateContactDto {
  @IsIn(['NEW', 'FOLLOWING', 'COMPLETED', 'INVALID']) status: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() @MaxLength(2000) followUpNote?: string;
}

export class SupplyDemandQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['SUPPLY', 'DEMAND']) type?: string;
  @IsOptional() @IsIn(['PENDING', 'PUBLISHED', 'REJECTED', 'OFFLINE']) status?: string;
  @IsOptional() @IsString() region?: string;
}

export class CreateSupplyDemandDto {
  @IsIn(['SUPPLY', 'DEMAND']) type: string;
  @IsString() @MaxLength(100) productName: string;
  @IsOptional() @IsString() @MaxLength(100) spec?: string;
  @IsOptional() @IsString() @MaxLength(100) quantity?: string;
  @IsOptional() @IsString() @MaxLength(100) priceText?: string;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString() @MaxLength(50) contactName: string;
  @IsString() @MaxLength(30) contactPhone: string;
  @IsOptional() @IsString() @MaxLength(200) company?: string;
  @IsOptional() @IsIn(['PENDING', 'PUBLISHED']) status?: string;
}

export class ReviewSupplyDemandDto {
  @IsIn(['PUBLISHED', 'REJECTED', 'OFFLINE']) status: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class CreateContentJobDto {
  @IsIn(['NEWS_SYNC', 'AI_CLEAN', 'MARKET_SYNC', 'HF_MARKET_SYNC', 'FLUORSPAR_TREND_SYNC', 'DATA_IMPORT']) type: string;
  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class UpdateDataSourceDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @IsOptional() @IsString() @MaxLength(100) schedule?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class WechatLoginDto {
  @IsString() @MaxLength(200) code: string;
  @IsOptional() @IsString() @MaxLength(100) nickName?: string;
  @IsOptional() @IsString() @MaxLength(1000) avatarUrl?: string;
}

export class UpdateWechatProfileDto {
  @IsOptional() @IsString() @MaxLength(100) nickName?: string;
  @IsOptional() @IsString() @MaxLength(1000) avatarUrl?: string;
}

export class WechatPhoneDto {
  @IsString() @MaxLength(200) code: string;
}
