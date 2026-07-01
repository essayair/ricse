import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateContractStatusDto {
  @ApiProperty({
    description: '目标状态',
    enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTING', 'COMPLETED', 'VOIDED', 'DRAFT'],
  })
  @IsString()
  status: string;
}
