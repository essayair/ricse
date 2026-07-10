import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateContractStatusDto {
  @ApiProperty({
    description: '目标状态',
    enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTING', 'COMPLETED', 'CLOSED', 'VOIDED', 'DRAFT'],
  })
  @IsString()
  status: string;

  @ApiPropertyOptional({ description: '审批意见（审批通过/驳回时必填）' })
  @IsOptional()
  @IsString()
  comment?: string;
}
