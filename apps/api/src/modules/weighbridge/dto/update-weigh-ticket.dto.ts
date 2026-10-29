import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SelectEffectiveRecordsDto {
  @IsString() grossRecordId: string;
  @IsString() tareRecordId: string;
}

export class UpdateWeighSettlementDto {
  @IsString() settlementBasis: string;
  @IsOptional() @IsNumber() @Min(0) shippingWeight?: number;
  @IsOptional() @IsNumber() @Min(0) customerWeight?: number;
  @IsOptional() @IsNumber() @Min(0) thirdPartyWeight?: number;
  @IsOptional() @IsNumber() @Min(0) manualWeight?: number;
  @IsOptional() @IsNumber() @Min(0) toleranceRate?: number;
}

export class UpdateWeighTicketStatusDto {
  @IsString() status: string;
  @IsOptional() @IsString() reviewRemark?: string;
}

export class UpdateWeighTicketInfoDto {
  @IsString() ticketDate: string;
  @IsString() plateNo: string;
  @IsString() materialName: string;
  @IsString() materialSpec: string;
  @IsString() shipperName: string;
  @IsString() receiverName: string;
  @IsNumber() @Min(0) packageCount: number;
  @IsString() driverName: string;
  @IsString() weighmasterName: string;
  @IsOptional() @IsString() remarks?: string;
}

export class UpdateWeighTicketWaybillDto {
  @IsString() waybillId: string;
  @IsOptional() @IsString() additionReason?: string;
}
