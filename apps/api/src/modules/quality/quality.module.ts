import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { CommonModule } from '../common/common.module';
import { InventoryModule } from '../inventory/inventory.module';
import { QualityInspectionController } from './quality-inspection.controller';
import { QualityInspectionService } from './quality-inspection.service';
import { QualityTaskController } from './quality-task.controller';
import { QualityStandardController } from './quality-standard.controller';
import { QualityStandardService } from './quality-standard.service';
import { QualityPhotoRecognitionService } from './quality-photo-recognition.service';

@Module({
  imports: [CommonModule, AccessControlModule, InventoryModule],
  controllers: [QualityInspectionController, QualityTaskController, QualityStandardController],
  providers: [QualityInspectionService, QualityStandardService, QualityPhotoRecognitionService],
  exports: [QualityInspectionService, QualityStandardService, QualityPhotoRecognitionService],
})
export class QualityModule {}
