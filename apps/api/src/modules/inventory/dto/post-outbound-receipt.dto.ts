import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PostOutboundReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  qualityExceptionReason?: string;
}
