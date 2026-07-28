import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { CommonModule } from '../common/common.module';
import { QualityInspectionController } from './quality-inspection.controller';
import { QualityInspectionService } from './quality-inspection.service';

@Module({
  imports: [CommonModule, AccessControlModule],
  controllers: [QualityInspectionController],
  providers: [QualityInspectionService],
  exports: [QualityInspectionService],
})
export class QualityModule {}
