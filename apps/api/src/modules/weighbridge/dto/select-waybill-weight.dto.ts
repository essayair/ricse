import { IsIn, IsOptional, IsString } from 'class-validator';

export class SelectWaybillWeightDto {
  @IsOptional()
  @IsIn(['INVENTORY', 'SETTLEMENT'])
  purpose?: string;
  @IsString()
  weighTicketId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
