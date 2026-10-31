import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ConfirmSalesCompletionDto {
  @IsString()
  @IsNotEmpty()
  customerWeighTicketId: string;

  @IsString()
  @IsNotEmpty()
  qualityReportId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  remarks: string;
}
