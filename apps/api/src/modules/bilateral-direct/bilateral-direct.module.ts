import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { BilateralDirectController } from './bilateral-direct.controller';
import { BilateralDirectService } from './bilateral-direct.service';

@Module({ imports: [AccessControlModule], controllers: [BilateralDirectController], providers: [BilateralDirectService], exports: [BilateralDirectService] })
export class BilateralDirectModule {}
