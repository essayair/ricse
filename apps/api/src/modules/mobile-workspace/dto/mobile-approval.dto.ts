import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class MobileApprovalDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: string;
  @IsString() @MinLength(1) @MaxLength(1000) comment: string;
}
