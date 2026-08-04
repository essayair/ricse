import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateWeighTicketDto {
  @IsString()
  waybillId: string;

  @IsOptional()
  @IsIn(['INBOUND', 'OUTBOUND'])
  direction?: string;

  @IsOptional()
  @IsIn(['SHIPPING', 'RECEIVING'])
  weighingStage?: string;

  @IsOptional()
  @IsString()
  additionReason?: string;

  @IsOptional()
  @IsIn(['DEVICE', 'MANUAL', 'IMPORTED'])
  dataSource?: string;

  @IsOptional() @IsDateString() ticketDate?: string;
  @IsOptional() @IsString() plateNo?: string;
  @IsOptional() @IsString() materialName?: string;
  @IsOptional() @IsString() materialSpec?: string;
  @IsOptional() @IsString() shipperName?: string;
  @IsOptional() @IsString() receiverName?: string;
  @IsOptional() @IsInt() @Min(0) packageCount?: number;
  @IsOptional() @IsString() driverName?: string;
  @IsOptional() @IsString() weighmasterName?: string;

  @IsOptional()
  @IsIn(['RECEIVING', 'SHIPPING', 'CUSTOMER', 'THIRD_PARTY', 'MANUAL'])
  settlementBasis?: string;

  @IsOptional() @IsNumber() @Min(0) shippingWeight?: number;
  @IsOptional() @IsNumber() @Min(0) customerWeight?: number;
  @IsOptional() @IsNumber() @Min(0) thirdPartyWeight?: number;
  @IsOptional() @IsNumber() @Min(0) manualWeight?: number;
  @IsOptional() @IsNumber() @Min(0) toleranceRate?: number;
  @IsOptional() @IsString() remarks?: string;
}
