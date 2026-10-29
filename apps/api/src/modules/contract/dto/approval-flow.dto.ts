import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateApprovalFlowDto {
  @IsOptional() @IsNumber() @Min(0) amountThreshold?: number | null;
  @IsOptional() @IsString() status?: string;
}

export class UpdateApprovalNodeDto {
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() approvalMode?: string;
  @IsOptional() @IsString() scopeType?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
