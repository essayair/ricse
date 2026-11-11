import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MinLength,
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
  @IsOptional() @IsIn(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'OFFLINE']) status?: string;
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
  @IsIn(['PUBLISHED', 'REJECTED', 'OFFLINE']) status: string;
  @IsOptional() @IsDateString() publishAt?: string;
  @IsOptional() @IsString() @MaxLength(500) reviewNote?: string;
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

const trimText = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class PublicCreateContactDto {
  @Transform(trimText) @IsString() @MinLength(1, { message: '请填写姓名' }) @MaxLength(50)
  name: string;
  @Transform(trimText) @IsString() @MinLength(1, { message: '请填写公司或机构' }) @MaxLength(200)
  company: string;
  @Transform(trimText) @IsString() @MaxLength(30)
  @Matches(/^(?:[A-Za-z][A-Za-z0-9_-]{5,29}|\+?\d[\d ()-]{5,28}\d)$/, { message: '请填写有效的手机号、联系电话或微信号' })
  phone: string;
  @Transform(trimText) @IsString() @MinLength(1, { message: '请填写合作方向或咨询内容' }) @MaxLength(5000)
  message: string;
  @Transform(trimText) @IsOptional() @IsEmail() @MaxLength(200)
  email?: string;
  @Transform(trimText) @IsOptional() @IsString() @MaxLength(500)
  @Matches(/^\/[^\r\n<>]*$/, { message: '来源页面格式无效' })
  sourcePage?: string;
  @IsString() @MinLength(1, { message: '请刷新表单后重试' }) @MaxLength(1024)
  submissionToken: string;
  @IsOptional() @IsString() @MaxLength(200)
  website?: string;
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
  @IsIn(['NEWS_SYNC', 'AI_CLEAN', 'MARKET_SYNC', 'HF_MARKET_SYNC', 'FLUORSPAR_TREND_SYNC', 'STOCK_QUOTE_SYNC', 'DATA_IMPORT']) type: string;
  @IsOptional() @IsString() sourceId?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class StockSymbolDto {
  @IsIn(['SH', 'SZ', 'HK'], { message: '市场只能是沪市、深市或港股' }) market: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Matches(/^\d{5,6}$/, { message: '证券代码应为 5 位（港股）或 6 位（A 股）数字' }) code: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(30) name: string;
  @IsOptional() @IsString() @MaxLength(20) tag?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sort?: number;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
}

export class CreateDataSourceDto {
  @IsString() @MaxLength(50) code: string;
  @IsString() @MaxLength(100) name: string;
  @IsIn(['GDELT', 'RSS']) type: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @IsOptional() @IsString() @MaxLength(100) schedule?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class UpdateDataSourceDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: string;
  @IsOptional() @IsString() @MaxLength(100) schedule?: string;
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

// 微信授权码是不透明凭证，不假设固定字符上限，也不能截断。
// 输入大小统一由内容 API 的 JSON 请求体上限防护，真实性/有效期交给微信验证。

export class WechatLoginDto {
  @IsString({ message: '登录凭证格式不正确，请重新发起登录' })
  @Matches(/\S/, { message: '登录凭证不能为空，请重新发起登录' })
  code: string;
  @IsOptional() @IsString() @MaxLength(100) nickName?: string;
  @IsOptional() @IsString() @MaxLength(1000) avatarUrl?: string;
}

export class UpdateWechatProfileDto {
  @IsOptional() @IsString() @MaxLength(100) nickName?: string;
  @IsOptional() @IsString() @MaxLength(1000) avatarUrl?: string;
}

export class WechatPhoneDto {
  @IsString({ message: '手机号授权凭证格式不正确，请重新授权' })
  @Matches(/\S/, { message: '手机号授权凭证不能为空，请重新授权' })
  code: string;
  @IsBoolean() @Equals(true, { message: '获取手机号前必须同意用户服务协议和隐私政策' }) accepted: boolean;
  @IsString() @MaxLength(30) serviceAgreementVersion: string;
  @IsString() @MaxLength(30) privacyPolicyVersion: string;
}
