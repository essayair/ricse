import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/current-user.decorator';
import { BusinessImageService } from './business-image.service';
import { BusinessImageQueryDto, BusinessImageTargetQueryDto, LinkBusinessImageDto, UpdateBusinessImageDto, UploadBusinessImageDto } from './business-image.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('business-images')
export class BusinessImageController {
  constructor(private readonly service: BusinessImageService) {}
  @Get() list(@CurrentUser('id') user: string, @Query() query: BusinessImageQueryDto) { return this.service.list(user, { ...query }); }
  @Get('contracts') contracts(@CurrentUser('id') user: string, @Query() query: BusinessImageQueryDto) { return this.service.contractOptions(user, query.search); }
  @Get('notices') notices(@CurrentUser('id') user: string, @Query() query: BusinessImageQueryDto) { return this.service.notices(user, query.contractId || ''); }
  @Get('targets') targets(@CurrentUser('id') user: string, @Query() query: BusinessImageTargetQueryDto) { return this.service.targets(user, query.contractId, query.targetType, query.search, query.dispatchNoticeId); }
  @Post() @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadBusinessImageDto, @CurrentUser('id') user: string) { return this.service.upload(file, dto, user); }
  @Get(':id') detail(@Param('id') id: string, @CurrentUser('id') user: string) { return this.service.detail(id, user); }
  @Get(':id/view-url') url(@Param('id') id: string, @CurrentUser('id') user: string) { return this.service.url(id, user); }
  @Get(':id/preview-url') preview(@Param('id') id: string, @CurrentUser('id') user: string) { return this.service.url(id, user, true); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateBusinessImageDto, @CurrentUser('id') user: string) { return this.service.update(id, dto, user); }
  @Post(':id/link') link(@Param('id') id: string, @Body() dto: LinkBusinessImageDto, @CurrentUser('id') user: string) { return this.service.link(id, dto, user); }
  @Post(':id/unlink') unlink(@Param('id') id: string, @CurrentUser('id') user: string) { return this.service.link(id, {} as LinkBusinessImageDto, user, true); }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser('id') user: string) { return this.service.remove(id, user); }
}
