import { IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { DispatchLocationDto } from '../dispatch-notice/dto/create-dispatch-notice.dto';

export class CreateDirectExecutionDto extends DispatchLocationDto {
  @IsString() @IsNotEmpty() contractId: string;
  @IsString() @IsNotEmpty() contractLineItemId: string;
  @IsString() @IsNotEmpty() @MaxLength(100) requestId: string;
  @IsNumber() @Min(0.001) quantity: number;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() purchaseOrderId?: string;
  @IsOptional() @IsString() salesOrderId?: string;
  @IsOptional() @IsDateString() plannedDate?: string;
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}

export class ConfirmDirectDeliveryDto {
  @IsString() @IsNotEmpty() weighTicketId: string;
  @IsString() @IsNotEmpty() qualityReportId: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) remarks: string;
  @IsOptional() @IsBoolean() requestReview?: boolean;
  @IsOptional() @IsBoolean() acceptQualityException?: boolean;
}

export class DirectReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}

export class ReviewDirectDeliveryDto extends DirectReasonDto {
  @IsBoolean() approved: boolean;
}

export class ConvertDirectDeliveryDto extends DirectReasonDto {
  @IsString() @IsNotEmpty() warehouseId: string;
  @IsOptional() @IsString() @MaxLength(200) originLocation?: string;
  @IsOptional() @IsNumber() @Min(0.001) plannedQuantity?: number;
}
