import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePendingInboundReceiptDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  // 兼容旧客户端；服务端确认收货时始终以当前操作人覆盖此值。
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}
