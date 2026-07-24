import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { QualityInspectionController } from './quality-inspection.controller';
import { QualityInspectionService } from './quality-inspection.service';

@Module({
  imports: [CommonModule],
  controllers: [QualityInspectionController],
  providers: [QualityInspectionService],
  exports: [QualityInspectionService],
})
export class QualityModule {}
