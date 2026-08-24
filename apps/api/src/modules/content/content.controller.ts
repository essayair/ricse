import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { FileService } from '../common/file.service';
import { PermissionGuard } from '../common/permission.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { ContentService } from './content.service';
import {
  ArticleQueryDto,
  ContactQueryDto,
  CreateArticleDto,
  CreateCategoryDto,
  CreateContentJobDto,
  CreateDataSourceDto,
  CreatePriceDto,
  CreateSupplyDemandDto,
  PageQueryDto,
  PriceQueryDto,
  ProductTypeDto,
  ReviewSupplyDemandDto,
  SupplyDemandQueryDto,
  UpdateArticleDto,
  UpdateArticleStatusDto,
  UpdateCategoryDto,
  UpdateContactDto,
  UpdateDataSourceDto,
} from './dto/content.dto';

@ApiTags('内容运营中心')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionGuard)
@Controller('content')
export class ContentController {
  constructor(
    private readonly service: ContentService,
    private readonly fileService: FileService,
  ) {}

  @Get('categories')
  @RequirePermission('content.article.view')
  categories() { return this.service.listCategories(); }

  @Post('categories')
  @RequirePermission('content.article.manage')
  createCategory(@Body() dto: CreateCategoryDto) { return this.service.createCategory(dto); }

  @Patch('categories/:id')
  @RequirePermission('content.article.manage')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.updateCategory(id, dto);
  }

  @Get('articles')
  @RequirePermission('content.article.view')
  articles(@Query() query: ArticleQueryDto) { return this.service.listArticles(query); }

  @Get('articles/:id')
  @RequirePermission('content.article.view')
  article(@Param('id') id: string) { return this.service.getArticle(id); }

  @Post('articles')
  @RequirePermission('content.article.manage')
  createArticle(@Body() dto: CreateArticleDto, @CurrentUser('id') userId: string) {
    return this.service.createArticle(dto, userId);
  }

  @Patch('articles/:id')
  @RequirePermission('content.article.manage')
  updateArticle(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.service.updateArticle(id, dto);
  }

  @Patch('articles/:id/status')
  @RequirePermission('content.article.publish')
  updateArticleStatus(
    @Param('id') id: string,
    @Body() dto: UpdateArticleStatusDto,
    @CurrentUser('id') userId: string,
  ) { return this.service.updateArticleStatus(id, dto, userId); }

  @Delete('articles/:id')
  @RequirePermission('content.article.delete')
  deleteArticle(@Param('id') id: string) { return this.service.deleteArticle(id); }

  @Post('articles/:id/assets')
  @RequirePermission('content.article.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 } }))
  async uploadAsset(
    @Param('id') articleId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('purpose') purpose: string | undefined,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) throw new BadRequestException('请选择文件');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException('仅支持图片和 PDF');
    const uploaded = await this.fileService.upload(file.buffer, file.originalname, file.mimetype, 'content');
    const asset = await this.service.createAsset({
      articleId,
      objectKey: uploaded.fileName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: uploaded.size,
      purpose: ['COVER', 'INLINE', 'ATTACHMENT'].includes(purpose || '') ? purpose : 'ATTACHMENT',
      createdById: userId,
    });
    const coverUrl = `/api/v1/public/content/assets/${asset.id}`;
    if (asset.purpose === 'COVER') await this.service.setArticleCover(articleId, coverUrl);
    return { ...asset, coverUrl: asset.purpose === 'COVER' ? coverUrl : undefined };
  }

  @Get('assets/:id/view-url')
  @RequirePermission('content.article.view')
  async assetUrl(@Param('id') id: string) {
    const asset = await this.service.getAsset(id);
    return { url: await this.fileService.getUrl(asset.objectKey) };
  }

  @Delete('assets/:id')
  @RequirePermission('content.article.manage')
  async deleteAsset(@Param('id') id: string) {
    const asset = await this.service.deleteAsset(id);
    try { await this.fileService.delete(asset.objectKey); } catch {}
  }

  @Get('product-types')
  @RequirePermission('content.price.view')
  productTypes() { return this.service.listProductTypes(); }

  @Post('product-types')
  @RequirePermission('content.price.manage')
  createProductType(@Body() dto: ProductTypeDto) { return this.service.createProductType(dto); }

  @Patch('product-types/:id')
  @RequirePermission('content.price.manage')
  updateProductType(@Param('id') id: string, @Body() dto: ProductTypeDto) {
    return this.service.updateProductType(id, dto);
  }

  @Get('prices')
  @RequirePermission('content.price.view')
  prices(@Query() query: PriceQueryDto) { return this.service.listPrices(query); }

  @Post('prices')
  @RequirePermission('content.price.manage')
  createPrice(@Body() dto: CreatePriceDto, @CurrentUser('id') userId: string) {
    return this.service.createPrice(dto, userId);
  }

  @Delete('prices/:id')
  @RequirePermission('content.price.manage')
  deletePrice(@Param('id') id: string) { return this.service.deletePrice(id); }

  @Get('contacts')
  @RequirePermission('content.contact.view')
  contacts(@Query() query: ContactQueryDto) { return this.service.listContacts(query); }

  @Patch('contacts/:id')
  @RequirePermission('content.contact.manage')
  updateContact(@Param('id') id: string, @Body() dto: UpdateContactDto, @CurrentUser('id') userId: string) {
    return this.service.updateContact(id, dto, userId);
  }

  @Get('supply-demand')
  @RequirePermission('content.supply-demand.view')
  supplyDemand(@Query() query: SupplyDemandQueryDto) { return this.service.listSupplyDemand(query); }

  @Post('supply-demand')
  @RequirePermission('content.supply-demand.review')
  createSupplyDemand(@Body() dto: CreateSupplyDemandDto, @CurrentUser('id') userId: string) {
    return this.service.createSupplyDemand(dto, { platform: true, userId });
  }

  @Patch('supply-demand/:id/review')
  @RequirePermission('content.supply-demand.review')
  reviewSupplyDemand(@Param('id') id: string, @Body() dto: ReviewSupplyDemandDto, @CurrentUser('id') userId: string) {
    return this.service.reviewSupplyDemand(id, dto, userId);
  }

  @Get('data-sources')
  @RequirePermission('content.datasource.manage')
  dataSources() { return this.service.listDataSources(); }

  @Post('data-sources')
  @RequirePermission('content.datasource.manage')
  createDataSource(@Body() dto: CreateDataSourceDto) { return this.service.createDataSource(dto); }

  @Patch('data-sources/:id')
  @RequirePermission('content.datasource.manage')
  updateDataSource(@Param('id') id: string, @Body() dto: UpdateDataSourceDto) {
    return this.service.updateDataSource(id, dto);
  }

  @Post('data-sources/:id/import')
  @RequirePermission('content.datasource.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async importDataSource(
    @Param('id') sourceId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    if (!file) throw new BadRequestException('请选择 Excel 文件');
    if (!/\.(xlsx?|csv)$/i.test(file.originalname)) throw new BadRequestException('仅支持 xls、xlsx 或 csv');
    const uploaded = await this.fileService.upload(file.buffer, file.originalname, file.mimetype, 'content/imports');
    const asset = await this.service.createAsset({ objectKey: uploaded.fileName, originalName: file.originalname, mimeType: file.mimetype, size: uploaded.size, purpose: 'DATA_IMPORT', createdById: userId });
    return this.service.createJob({ type: 'DATA_IMPORT', sourceId, payload: { assetId: asset.id } }, userId);
  }

  @Get('jobs')
  @RequirePermission('content.collection.manage')
  jobs(@Query() query: PageQueryDto, @Query('status') status?: string, @Query('type') type?: string) {
    return this.service.listJobs({ ...query, status, type });
  }

  @Post('jobs')
  @RequirePermission('content.collection.manage')
  createJob(@Body() dto: CreateContentJobDto, @CurrentUser('id') userId: string) {
    return this.service.createJob(dto, userId);
  }

  @Patch('jobs/:id/retry')
  @RequirePermission('content.collection.manage')
  retryJob(@Param('id') id: string) { return this.service.retryJob(id); }

  @Patch('jobs/:id/cancel')
  @RequirePermission('content.collection.manage')
  cancelJob(@Param('id') id: string) { return this.service.cancelJob(id); }
}
