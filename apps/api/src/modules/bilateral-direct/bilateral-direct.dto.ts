import { IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** 磅单与水分报告来自不同环节时须说明原因。 */
export const CROSS_SIDE_REASONS = { NEGOTIATED_TICKET: '磅单协商', SINGLE_SIDE_REPORT: '只有一方出质检单' } as const;
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
  @IsOptional() @IsIn(Object.keys(CROSS_SIDE_REASONS)) crossSideReason?: string;
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
