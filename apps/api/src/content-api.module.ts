import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './modules/common/common.module';
import { ContentModule } from './modules/content/content.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, CommonModule, ContentModule],
})
export class ContentApiModule {}
