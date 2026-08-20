import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ContentApiModule } from './content-api.module';

async function bootstrap() {
  const app = await NestFactory.create(ContentApiModule);
  const logger = new Logger('ContentApi');
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  const configuredOrigins = (process.env.CONTENT_CORS_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:3001')
    .split(',').map((item) => item.trim()).filter(Boolean);
  app.enableCors({
    origin: configuredOrigins,
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const config = new DocumentBuilder()
    .setTitle('RICSE Content API')
    .setDescription('内容运营中心、官网与小程序公开 API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/content-docs', app, SwaggerModule.createDocument(app, config));
  const port = Number(process.env.CONTENT_API_PORT || 3002);
  await app.listen(port);
  logger.log(`Content API running on http://localhost:${port}`);
}

void bootstrap();
