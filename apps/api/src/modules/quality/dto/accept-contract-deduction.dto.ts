import { IsInt, IsOptional, IsString } from 'class-validator';

export class AcceptContractDeductionDto {
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsInt() decisionVersion?: number;
}
