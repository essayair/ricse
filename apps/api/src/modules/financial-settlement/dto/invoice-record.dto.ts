import { IsDateString, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateInvoiceRecordDto {
  @IsString() @MaxLength(80) invoiceNo!: string;
  @IsOptional() @IsString() @MaxLength(80) invoiceCode?: string;
  @IsDateString() issuedAt!: string;
  @IsString() @MaxLength(200) materialName!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) quantity?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) taxRate?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) taxAmount?: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) taxInclusiveAmount!: number;
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}

export class VoidInvoiceRecordDto {
  @IsString() @MaxLength(500) reason!: string;
}
