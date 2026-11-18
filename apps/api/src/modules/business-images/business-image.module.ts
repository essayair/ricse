import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { BusinessImageService } from './business-image.service';
import { BusinessImageController } from './business-image.controller';
import { BusinessImagePreviewService } from './business-image-preview.service';
@Module({ imports: [CommonModule, AccessControlModule], controllers: [BusinessImageController], providers: [BusinessImageService, BusinessImagePreviewService] })
export class BusinessImageModule {}
