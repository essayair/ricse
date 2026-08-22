import { BadRequestException, Body, Controller, Get, Headers, Ip, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { WechatAuthService } from './wechat-auth.service';
import { PublicRateLimitService } from './public-rate-limit.service';
import { FileService } from '../common/file.service';
import {
  ArticleQueryDto,
  CreateContactDto,
  CreateSupplyDemandDto,
  PriceQueryDto,
  SupplyDemandQueryDto,
} from './dto/content.dto';

@ApiTags('公开内容')
@Controller('public/content')
export class PublicContentController {
  constructor(
    private readonly service: ContentService,
    private readonly wechatAuth: WechatAuthService,
    private readonly rate: PublicRateLimitService,
    private readonly files: FileService,
  ) {}

  @Get('categories')
  categories() { return this.service.listCategories(true); }

  @Get('articles')
  articles(@Query() query: ArticleQueryDto) { return this.service.listArticles(query, true); }

  @Get('articles/:id')
  article(@Param('id') id: string) { return this.service.getArticle(id, true); }

  @Get('assets/:id')
  async asset(@Param('id') id: string, @Res() response: Response) {
    const asset = await this.service.getPublicAsset(id);
    response.redirect(302, await this.files.getUrl(asset.objectKey));
  }

  @Get('product-types')
  productTypes() { return this.service.listProductTypes(true); }

  @Get('prices')
  prices(@Query() query: PriceQueryDto) { return this.service.listPrices(query, true); }

  @Get('prices/average-by-region')
  averageByRegion(@Query('productTypeId') productTypeId?: string) {
    return this.service.averagePricesByRegion(productTypeId);
  }

  @Get('industry-data/:code')
  industryDataset(@Param('code') code: string) {
    return this.service.getPublicIndustryDataset(code);
  }

  @Get('market/fluorite/regions')
  marketRegions() { return this.service.marketRegions(); }

  @Get('market/fluorite/trend')
  marketTrend(@Query('marketName') marketName: string) {
    if (!marketName?.trim()) throw new BadRequestException('marketName 必填');
    return this.service.marketTrend(marketName);
  }

  @Get('market/hydrofluoric-acid/trend')
  hydrofluoricAcidTrend() { return this.service.hydrofluoricAcidTrend(); }

  @Get('market/fluorite/price-trend')
  fluorsparPriceTrend() { return this.service.fluorsparPriceTrend(); }

  @Post('contacts')
  async createContact(@Body() dto: CreateContactDto, @Ip() sourceIp: string) {
    await this.rate.assert('contact', sourceIp, 5, 3600);
    return this.service.createContact(dto, sourceIp);
  }

  @Get('supply-demand')
  supplyDemand(@Query() query: SupplyDemandQueryDto) {
    return this.service.listSupplyDemand(query, true);
  }

  @Get('supply-demand/:id')
  supplyDemandDetail(@Param('id') id: string) { return this.service.getPublicSupplyDemand(id); }

  @Post('supply-demand')
  async submitSupplyDemand(@Body() dto: CreateSupplyDemandDto, @Headers('authorization') authorization?: string) {
    const openId = this.wechatAuth.verifyBearer(authorization);
    await this.rate.assert('supply-submit', openId, 10, 86400);
    return this.service.createSupplyDemand({ ...dto, status: 'PENDING' }, { openId });
  }

  @Get('supply-demand-mine')
  mine(@Headers('authorization') authorization?: string) {
    const openId = this.wechatAuth.verifyBearer(authorization);
    return this.service.listMine(openId).then((list) => ({ list }));
  }
}
