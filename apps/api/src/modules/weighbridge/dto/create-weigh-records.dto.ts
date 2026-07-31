import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateWeighRecordDto } from './create-weigh-record.dto';

export class CreateWeighRecordsDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateWeighRecordDto)
  records: CreateWeighRecordDto[];
}
