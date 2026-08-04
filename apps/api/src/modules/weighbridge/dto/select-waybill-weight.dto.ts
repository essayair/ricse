import { IsOptional, IsString } from 'class-validator';

export class SelectWaybillWeightDto {
  @IsString()
  weighTicketId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
