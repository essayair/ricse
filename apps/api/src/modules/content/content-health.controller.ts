import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('content-health')
export class ContentHealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'content-api', timestamp: new Date().toISOString() };
  }
}
