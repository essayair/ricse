import { Body, Controller, Get, Headers, Ip, Post, Query } from '@nestjs/common';
import { ContentService } from './content.service';
import { WechatAuthService } from './wechat-auth.service';
import { PublicRateLimitService } from './public-rate-limit.service';

/** 旧官网和已发布小程序的短期字段/路径适配层，业务逻辑仍统一调用 ContentService。 */
@Controller('legacy')
export class LegacyContentController {
  constructor(private readonly content: ContentService, private readonly wechat: WechatAuthService, private readonly rate: PublicRateLimitService) {}

  @Get('news/list')
  async newsList(@Query() query: any) {
    const result = await this.content.listArticles({ pageNo: Number(query.pageNo || 1), pageSize: Number(query.pageSize || 20), type: this.articleType(query.type), search: query.keyword }, true);
    return { ...result, list: result.list.map((item) => this.legacyArticle(item)) };
  }

  @Get('news/detail')
  async newsDetail(@Query('id') id: string) { return this.legacyArticle(await this.content.getArticle(id, true)); }

  @Get('website/industry-news/page')
  async websiteNews(@Query() query: any) {
    const result = await this.content.listArticles({ pageNo: Number(query.pageNo || 1), pageSize: Number(query.pageSize || 20), categoryId: query.categoryId, search: query.keyword, type: 'NEWS' }, true);
    return this.envelope({ ...result, list: result.list.map((item) => this.legacyArticle(item)) });
  }

  @Get('website/industry-news/get')
  async websiteNewsDetail(@Query('id') id: string) { return this.envelope(this.legacyArticle(await this.content.getArticle(id, true))); }

  @Get('website/price/list')
  async websitePrices() {
    const rows = await this.content.marketRegions();
    return this.envelope(rows.map((row) => ({ name: row.marketName, price: row.price, unit: row.unit, change: row.change, changePercent: row.changeRate, region: row.region, updateTime: row.date })));
  }

  @Post('website/contact/create')
  async websiteContact(@Body() body: any, @Ip() ip: string) {
    await this.rate.assert('contact', ip, 5, 3600);
    const row = await this.content.createContact({ name: String(body.name || '').trim(), company: body.companyName, phone: String(body.contactInfo || '').trim(), message: [body.cooperationDirection, body.description].filter(Boolean).join('\n'), sourcePage: body.sourcePage || 'legacy-website' }, ip);
    return this.envelope(row);
  }

  @Get('supply-demand/list')
  async supplyList(@Query() query: any) {
    const result = await this.content.listSupplyDemand({ pageNo: Number(query.pageNo || 1), pageSize: Number(query.pageSize || 20), type: query.type ? String(query.type).toUpperCase() : undefined, region: query.region, search: query.search }, true);
    return { ...result, list: result.list.map((item) => this.legacySupply(item)) };
  }

  @Get('supply-demand/detail')
  async supplyDetail(@Query('id') id: string) { return this.legacySupply(await this.content.getPublicSupplyDemand(id)); }

  @Post('supply-demand/submit')
  async supplySubmit(@Body() body: any, @Headers('authorization') authorization?: string) {
    const openId = this.wechat.verifyBearer(authorization);
    await this.rate.assert('supply-submit', openId, 10, 86400);
    return this.content.createSupplyDemand({
      type: String(body.type || '').toUpperCase(),
      productName: String(body.productName || ''),
      spec: body.spec,
      quantity: body.quantity,
      priceText: body.priceText || body.price,
      region: body.region,
      description: body.description,
      contactName: String(body.contactName || ''),
      contactPhone: String(body.contactPhone || ''),
      company: body.company,
      status: 'PENDING',
    }, { openId });
  }

  @Get('supply-demand/mine')
  async supplyMine(@Headers('authorization') authorization?: string) {
    const openId = this.wechat.verifyBearer(authorization);
    const list = await this.content.listMine(openId);
    return { list: list.map((item) => this.legacySupply(item)) };
  }

  @Post('auth/wx-login')
  async wxLogin(@Body('code') code: string, @Ip() ip: string) {
    await this.rate.assert('wechat-login', ip, 20, 60);
    return this.wechat.login(code);
  }

  private articleType(value: unknown) {
    if (value == null || value === '') return undefined;
    if (value === 2 || value === '2') return 'SUPPLY';
    if (value === 3 || value === '3') return 'DEMAND';
    return 'NEWS';
  }

  private legacyArticle(item: any) {
    return { ...item, id: item.legacyId || item.id, type: item.type === 'SUPPLY' ? 2 : item.type === 'DEMAND' ? 3 : 1, categoryName: item.category?.name || '', coverImage: item.coverUrl || '', tags: Array.isArray(item.tags) ? item.tags.join(',') : item.tags, publishTime: new Date(item.publishAt || item.createdAt).getTime(), createTime: new Date(item.createdAt).getTime(), price: item.priceText || '', address: item.region || '' };
  }

  private legacySupply(item: any) {
    return { ...item, id: item.legacyId || item.id, type: String(item.type).toLowerCase(), price: item.priceText || '', createdAt: new Date(item.createdAt).getTime(), publishedAt: item.publishedAt ? new Date(item.publishedAt).getTime() : null };
  }

  private envelope<T>(data: T) { return { code: 0, data, message: '' }; }
}
