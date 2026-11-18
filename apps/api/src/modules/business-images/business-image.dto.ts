import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IMAGE_TYPES, TARGETS } from './business-image.policy';

export class UploadBusinessImageDto {
  @IsString() @MaxLength(64) contractId: string;
  @IsOptional() @IsString() @MaxLength(64) dispatchNoticeId?: string;
  @IsIn(IMAGE_TYPES, { message: '请选择影像类型' }) documentType: string;
  @IsString() @MaxLength(255) originalName: string;
  @IsString() @MaxLength(255) sourceOriginalName: string;
  @IsOptional() @IsString() @MaxLength(1000, { message: '备注不能超过1000字' }) remarks?: string | null;
  @IsString() @MaxLength(64) clientRequestId: string;
  @Transform(({ value }) => value === 'true' || value === true) @Equals(true, { message: '请逐份核对并确认资料名称' }) nameConfirmed: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() photoCompressed?: boolean;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(20 * 1024 * 1024) originalSize?: number;
}
export class UpdateBusinessImageDto {
  @IsOptional() @IsString() @MaxLength(1000, { message: '备注不能超过1000字' }) remarks?: string | null;
  @IsString() @MaxLength(255) originalName: string;
  @IsIn(IMAGE_TYPES, { message: '请选择影像类型' }) documentType: string;
  @IsOptional() @IsString() @MaxLength(64) dispatchNoticeId?: string | null;
  @Equals(true, { message: '请重新核对并确认资料名称' }) nameConfirmed: boolean;
}
export class LinkBusinessImageDto {
  @IsIn(Object.keys(TARGETS)) targetType: keyof typeof TARGETS;
  @IsString() @MaxLength(64) targetId: string;
  @IsOptional() @IsString() @MaxLength(50) category?: string;
}
export class BusinessImageQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(64) contractId?: string;
  @IsOptional() @IsString() @MaxLength(64) dispatchNoticeId?: string;
  @IsOptional() @IsString() @MaxLength(64) uploadedBy?: string;
  @IsOptional() @IsString() @MaxLength(30) documentType?: string;
  @IsOptional() @IsIn(['', 'ARCHIVED', 'LINKED']) linkState?: string;
  @IsOptional() @IsString() @MaxLength(10) from?: string;
  @IsOptional() @IsString() @MaxLength(10) to?: string;
  @IsOptional() @IsString() @MaxLength(6) page?: string;
}
export class BusinessImageTargetQueryDto {
  @IsString() @MaxLength(64) contractId: string;
  @IsIn(Object.keys(TARGETS)) targetType: keyof typeof TARGETS;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(64) dispatchNoticeId?: string;
}
