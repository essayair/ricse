import { IsString } from 'class-validator';

export class ResolveOutboundVarianceDto {
  @IsString() decision: string;
  @IsString() reason: string;
}
