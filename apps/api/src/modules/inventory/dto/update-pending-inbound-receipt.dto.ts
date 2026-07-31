import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePendingInboundReceiptDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}
