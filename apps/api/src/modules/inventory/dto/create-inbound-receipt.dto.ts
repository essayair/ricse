import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInboundReceiptDto {
  @IsString() waybillId: string;
  @IsString() weighTicketId: string;
  @IsString() qualityInspectionId: string;
  @IsString() warehouseId: string;
  @IsDateString() receivedAt: string;
  @IsString() @MaxLength(100) receiverName: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
}
