import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContentAiService } from '../ai.service';

interface LegacyNews {
  id: number | string;
  title?: string;
  summary?: string | null;
  content?: string | null;
  source?: string | null;
  author?: string | null;
  categoryName?: string | null;
  type?: number;
  productName?: string | null;
  spec?: string | null;
  quantity?: string | null;
  price?: string | null;
  address?: string | null;
  deliveryMethod?: string | null;
  requirements?: string | null;
  company?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  viewCount?: number;
  likeCount?: number;
  publishTime?: number | string;
  createTime?: number | string;
  coverImage?: string | null;
}

@Injectable()
export class NewsIngestionService {
  private readonly logger = new Logger(NewsIngestionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly ai: ContentAiService,
  ) {}

  private baseUrl() {
    return (this.config.get<string>('LEGACY_WEBSITE_API_BASE') || 'https://api.hgyunlian.com').replace(/\/$/, '');
  }

  async sync() {
    const pageCount = Math.max(1, Number(this.config.get<string>('NEWS_SYNC_PAGES') || 3));
    const pageSize = 20;
    let scanned = 0;
    let changed = 0;
    let skipped = 0;
    for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
      const response = await fetch(`${this.baseUrl()}/app-api/website/industry-news/page?pageNo=${pageNo}&pageSize=${pageSize}`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new ServiceUnavailableException(`旧资讯接口 HTTP ${response.status}`);
      if (response.headers.get('x-ricse-compatibility') === 'true') {
        this.logger.warn('旧资讯地址已切换到 RICSE 兼容层，本次同步跳过；请停用“旧官网资讯”数据源');
        return { scanned, changed, skipped, sourceCutover: true };
      }
      const body: any = await response.json();
      const list: LegacyNews[] = body?.data?.list || body?.list || [];
      for (const item of list) {
        scanned++;
        const didChange = await this.ingest(item);
        if (didChange) changed++; else skipped++;
      }
      if (list.length < pageSize) break;
    }
    this.logger.log(`资讯同步完成 scanned=${scanned} changed=${changed} skipped=${skipped}`);
    return { scanned, changed, skipped };
  }

  private async ingest(item: LegacyNews) {
    const legacyId = String(item.id);
    const detailRes = await fetch(`${this.baseUrl()}/app-api/website/industry-news/get?id=${encodeURIComponent(legacyId)}`, {
      signal: AbortSignal.timeout(20_000),
    });
    const detailBody: any = detailRes.ok ? await detailRes.json() : null;
    const detail: LegacyNews = detailBody?.data || item;
    const sourceMaterial = JSON.stringify({
      title: detail.title,
      summary: detail.summary,
      content: detail.content,
      coverImage: detail.coverImage,
      publishTime: detail.publishTime,
      type: detail.type,
      productName: detail.productName,
      spec: detail.spec,
      quantity: detail.quantity,
      price: detail.price,
      address: detail.address,
      requirements: detail.requirements,
    });
    const sourceHash = crypto.createHash('sha256').update(sourceMaterial).digest('hex');
    const existing = await this.prisma.contentArticle.findUnique({ where: { legacyId } });
    if (existing?.sourceHash === sourceHash) return false;

    const type = detail.type === 2 ? 'SUPPLY' : detail.type === 3 ? 'DEMAND' : 'NEWS';
    let categoryId: string | null = null;
    if (detail.categoryName?.trim()) {
      const categoryCode = `LEGACY_${crypto.createHash('md5').update(detail.categoryName.trim()).digest('hex').slice(0, 12).toUpperCase()}`;
      const category = await this.prisma.contentCategory.upsert({
        where: { code: categoryCode },
        update: { name: detail.categoryName.trim(), status: 'ACTIVE' },
        create: { code: categoryCode, name: detail.categoryName.trim(), status: 'ACTIVE' },
      });
      categoryId = category.id;
    }

    const cleaned = type === 'NEWS'
      ? await this.ai.cleanArticle(detail.title || '', detail.content || detail.summary || '')
      : { summary: detail.summary || '', content: detail.content || detail.requirements || '' };
    const publishAt = this.date(detail.publishTime || detail.createTime);
    const data = {
      categoryId,
      type,
      title: (detail.title || '').trim(),
      summary: cleaned.summary || null,
      content: cleaned.content || '',
      coverUrl: detail.coverImage || null,
      source: detail.source || null,
      sourceHash,
      author: detail.author || null,
      status: 'PUBLISHED',
      publishAt,
      viewCount: Number(detail.viewCount || 0),
      likeCount: Number(detail.likeCount || 0),
      productName: detail.productName || null,
      spec: detail.spec || null,
      quantity: detail.quantity || null,
      priceText: detail.price || null,
      region: detail.address || null,
      deliveryMethod: detail.deliveryMethod || null,
      requirements: detail.requirements || null,
      company: detail.company || null,
      contactName: detail.contactName || null,
      contactPhone: detail.contactPhone || null,
    };
    await this.prisma.contentArticle.upsert({
      where: { legacyId },
      update: data,
      create: { ...data, legacyId },
    });
    return true;
  }

  private date(value?: number | string) {
    if (!value) return new Date();
    const numeric = Number(value);
    const date = Number.isFinite(numeric) ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric) : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }
}
