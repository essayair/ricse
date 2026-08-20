import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ContentWorkerModule } from './content-worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(ContentWorkerModule);
  app.enableShutdownHooks();
  new Logger('ContentWorker').log('RICSE Content Worker ready');
}

void bootstrap();
