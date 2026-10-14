import { Module } from '@nestjs/common';
import { IndustryDatabaseController } from './industry-database.controller';
import { IndustryDatabaseService } from './industry-database.service';

@Module({
  controllers: [IndustryDatabaseController],
  providers: [IndustryDatabaseService],
})
export class IndustryDatabaseModule {}
