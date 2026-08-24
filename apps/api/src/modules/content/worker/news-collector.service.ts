import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { load } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import http from 'node:http';
import { PrismaService } from '../../../prisma/prisma.service';

type NewsSourceConfig = {
  priority?: number;
  query?: string;
  queries?: string[];
  endpoint?: string;
  timespan?: string;
  maxRecords?: number;
  keywords?: string[];
  excludeKeywords?: string[];
  excludeDomains?: string[];
  enforceKeywords?: boolean;
  categoryCode?: string;
  sourceName?: string;
  transport?: 'auto' | 'https' | 'http';
  queryRotationHours?: number;
  pageUrl?: string;
  maxPages?: number;
  detailDelayMs?: number;
};

type CollectedNewsItem = {
  externalId: string;
  title: string;
  summary?: string;
  content?: string;
  sourceName?: string;
  sourceUrl: string;
  publishedAt?: Date;
  rawData: Record<string, unknown>;
};

@Injectable()
export class NewsCollectorService {
  private readonly logger = new Logger(NewsCollectorService.name);
  private readonly xml = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    processEntities: true,
  });

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async sync(sourceId?: string) {
    const sources = await this.prisma.contentDataSource.findMany({
      where: {
        status: 'ACTIVE',
        ...(sourceId ? { id: sourceId } : { code: 'SUNSIRS_FLUORITE_NEWS' }),
        OR: [{ code: 'SUNSIRS_FLUORITE_NEWS' }, { type: { in: ['GDELT', 'RSS'] } }],
      },
      orderBy: { code: 'asc' },
    });
    sources.sort((left, right) => this.sourcePriority(left.config) - this.sourcePriority(right.config));
    if (!sources.length) throw new Error(sourceId ? '指定的资讯数据源不存在或未启用' : '没有已启用的资讯自动采集数据源');

    const results: Record<string, unknown>[] = [];
    let succeeded = 0;
    let failed = 0;
    let fetched = 0;
    let created = 0;
    let duplicates = 0;
    let filtered = 0;
    let published = 0;
    let pendingReview = 0;
    for (const source of sources) {
      try {
        const result = await this.syncSource(source);
        succeeded += 1;
        fetched += result.fetched;
        created += result.created;
        duplicates += result.duplicates;
        filtered += result.filtered;
        published += result.published;
        pendingReview += result.pendingReview;
        results.push({ sourceId: source.id, code: source.code, ...result });
        await this.prisma.contentDataSource.update({
          where: { id: source.id },
          data: { lastSuccessAt: new Date(), lastError: null },
        });
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`资讯数据源 ${source.code} 采集失败：${message}`);
        results.push({ sourceId: source.id, code: source.code, error: message });
        await this.prisma.contentDataSource.update({
          where: { id: source.id },
          data: { lastErrorAt: new Date(), lastError: message.slice(0, 2000) },
        });
      }
    }
    if (!succeeded) throw new Error(`资讯自动采集全部失败：${results.map((item) => `${item.code}: ${item.error}`).join('；')}`);
    return {
      sources: results.length,
      succeededSources: succeeded,
      failedSources: failed,
      fetched,
      created,
      duplicates,
      filtered,
      published,
      pendingReview,
      outcome: failed > 0 ? 'PARTIAL' : created > 0 ? 'CREATED' : 'NO_NEW_DATA',
      results,
    };
  }

  private async syncSource(source: { id: string; code: string; name: string; type: string; config: Prisma.JsonValue | null }) {
    const config = this.sourceConfig(source.config);
    const items = source.code === 'SUNSIRS_FLUORITE_NEWS'
      ? await this.collectSunsirs(config)
      : source.type === 'GDELT' ? await this.collectGdelt(config) : await this.collectRss(config);
    const category = config.categoryCode
      ? await this.prisma.contentCategory.findUnique({ where: { code: config.categoryCode } })
      : null;
    let created = 0;
    let duplicates = 0;
    let filtered = 0;
    const autoPublish = source.code === 'SUNSIRS_FLUORITE_NEWS';
    for (const item of items) {
      const normalized = this.normalizeItem(item);
      if (!normalized || !this.matchesKeywords(normalized, config, source.type)) {
        filtered += 1;
        continue;
      }
      const sourceHash = this.hash(this.normalizeTitle(normalized.title));
      const existing = await this.prisma.contentArticle.findFirst({
        where: {
          OR: [
            { dataSourceId: source.id, externalId: normalized.externalId },
            { sourceUrl: normalized.sourceUrl },
            { sourceHash },
          ],
        },
        select: { id: true },
      });
      if (existing) {
        duplicates += 1;
        continue;
      }
      try {
        await this.prisma.contentArticle.create({
          data: {
            type: 'NEWS',
            title: normalized.title,
            summary: normalized.summary || null,
            content: normalized.content || '',
            source: normalized.sourceName || config.sourceName || source.name,
            status: autoPublish ? 'PUBLISHED' : 'PENDING_REVIEW',
            publishAt: autoPublish ? (normalized.publishedAt || new Date()) : null,
            ingestionMode: 'AUTO',
            dataSourceId: source.id,
            externalId: normalized.externalId,
            sourceUrl: normalized.sourceUrl,
            sourcePublishedAt: normalized.publishedAt || null,
            collectedAt: new Date(),
            sourceHash,
            rawData: normalized.rawData as Prisma.InputJsonValue,
            categoryId: category?.id || null,
            tags: autoPublish ? ['自动采集', '自动发布'] : ['自动采集'],
          },
        });
        created += 1;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          duplicates += 1;
          continue;
        }
        throw error;
      }
    }
    return {
      fetched: items.length,
      created,
      duplicates,
      filtered,
      published: autoPublish ? created : 0,
      pendingReview: autoPublish ? 0 : created,
    };
  }

  private async collectGdelt(config: NewsSourceConfig): Promise<CollectedNewsItem[]> {
    const configuredQueries = Array.isArray(config.queries)
      ? config.queries.map(String).map((item) => item.trim()).filter(Boolean)
      : [];
    const intervalHours = Math.max(1, Number(config.queryRotationHours || 2));
    const queryIndex = configuredQueries.length
      ? Math.floor(Date.now() / (intervalHours * 60 * 60 * 1000)) % configuredQueries.length
      : 0;
    const query = configuredQueries[queryIndex] || String(config.query || '').trim();
    if (!query) throw new Error('GDELT 数据源缺少 config.query');
    const maxRecords = Math.min(100, Math.max(1, Number(config.maxRecords || 30)));
    const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
    url.searchParams.set('query', query);
    url.searchParams.set('mode', 'artlist');
    url.searchParams.set('format', 'json');
    url.searchParams.set('sort', 'datedesc');
    url.searchParams.set('timespan', String(config.timespan || '3d'));
    url.searchParams.set('maxrecords', String(maxRecords));
    let body: string;
    if (config.transport === 'http') {
      const fallback = new URL(url);
      fallback.protocol = 'http:';
      body = await this.fetchGdeltHttp(fallback);
    } else {
      try {
        body = await this.fetchText(url, 'GDELT');
      } catch (error) {
        if (config.transport === 'https' || !this.isNetworkError(error)) throw error;
        const fallback = new URL(url);
        fallback.protocol = 'http:';
        this.logger.warn('GDELT HTTPS 连接失败，切换其官方 HTTP API；采集结果仍须人工审核后发布');
        const fallbackDelay = Math.max(0, Number(this.config.get<string>('GDELT_FALLBACK_DELAY_MS') ?? 10500));
        if (fallbackDelay) await new Promise((resolve) => setTimeout(resolve, fallbackDelay));
        body = await this.fetchGdeltHttp(fallback);
      }
    }
    let parsed: any;
    try { parsed = JSON.parse(body); } catch { throw new Error('GDELT 返回内容不是有效 JSON'); }
    if (!Array.isArray(parsed?.articles)) throw new Error('GDELT 返回缺少 articles 数组');
    return parsed.articles.map((item: any) => ({
      externalId: String(item.url || ''),
      title: String(item.title || ''),
      sourceName: String(item.domain || config.sourceName || 'GDELT'),
      sourceUrl: String(item.url || ''),
      publishedAt: this.parseDate(item.seendate),
      rawData: {
        url: item.url || null,
        title: item.title || null,
        seendate: item.seendate || null,
        domain: item.domain || null,
        language: item.language || null,
        sourcecountry: item.sourcecountry || null,
      },
    }));
  }

  private async collectRss(config: NewsSourceConfig): Promise<CollectedNewsItem[]> {
    if (!config.endpoint) throw new Error('RSS 数据源缺少 config.endpoint');
    const body = await this.fetchText(new URL(config.endpoint), 'RSS');
    let parsed: any;
    try { parsed = this.xml.parse(body); } catch { throw new Error('RSS/Atom 返回内容无法解析'); }
    const rssItems = this.asArray(parsed?.rss?.channel?.item);
    const atomItems = this.asArray(parsed?.feed?.entry);
    if (!rssItems.length && !atomItems.length) throw new Error('RSS/Atom 中没有可采集条目');
    const rssNews: CollectedNewsItem[] = rssItems.map((item: any) => {
      const link = this.text(item.link);
      const description = this.plainText(this.text(item.description) || this.text(item['content:encoded']));
      return {
        externalId: this.text(item.guid) || link,
        title: this.text(item.title),
        summary: description.slice(0, 500),
        content: description.slice(0, 3000),
        sourceName: config.sourceName,
        sourceUrl: link,
        publishedAt: this.parseDate(this.text(item.pubDate) || this.text(item.date)),
        rawData: { guid: this.text(item.guid) || null, link, pubDate: this.text(item.pubDate) || null },
      };
    });
    const atomNews: CollectedNewsItem[] = atomItems.map((item: any) => {
      const link = this.atomLink(item.link);
      const description = this.plainText(this.text(item.summary) || this.text(item.content));
      return {
        externalId: this.text(item.id) || link,
        title: this.text(item.title),
        summary: description.slice(0, 500),
        content: description.slice(0, 3000),
        sourceName: config.sourceName,
        sourceUrl: link,
        publishedAt: this.parseDate(this.text(item.published) || this.text(item.updated)),
        rawData: { id: this.text(item.id) || null, link, published: this.text(item.published) || null },
      };
    });
    return [...rssNews, ...atomNews];
  }

  private async collectSunsirs(config: NewsSourceConfig): Promise<CollectedNewsItem[]> {
    const baseUrl = new URL(String(config.pageUrl || 'https://www.100ppi.com/qb/?pid=318'));
    this.assertSunsirsUrl(baseUrl, true);
    const maxPages = Math.min(3, Math.max(1, Number(config.maxPages || 1)));
    const maxRecords = Math.min(50, Math.max(1, Number(config.maxRecords || 20)));
    const delayMs = Math.min(10_000, Math.max(0, Number(config.detailDelayMs ?? 3000)));
    const candidates: Array<{ url: URL; summary: string; tag: string; listTime: string; page: number }> = [];

    for (let page = 1; page <= maxPages && candidates.length < maxRecords; page += 1) {
      const pageUrl = new URL(baseUrl);
      pageUrl.searchParams.set('f', 'intelligence');
      pageUrl.searchParams.set('pid', '318');
      pageUrl.searchParams.set('p', String(page));
      const html = await this.fetchSunsirsHtml(pageUrl);
      const $ = load(html);
      const entries = $('div.mb-6.ml-2.w-100');
      if (!entries.length) throw new Error('生意社列表页结构已变化：未找到资讯列表');
      entries.each((_, element) => {
        if (candidates.length >= maxRecords) return false;
        const href = $(element).find('a.btn-xq.fl[href]').first().attr('href');
        if (!href) return;
        const url = new URL(href, pageUrl);
        this.assertSunsirsUrl(url, false);
        candidates.push({
          url,
          summary: $(element).find('p.mt-1').first().text().replace(/\s+/g, ' ').trim(),
          tag: $(element).find('a.btn-yl').first().text().replace(/[【】]/g, '').trim(),
          listTime: $(element).find('span.qb-time').first().text().replace(/\s+/g, ' ').trim(),
          page,
        });
      });
    }

    const results: CollectedNewsItem[] = [];
    for (const candidate of candidates) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const html = await this.fetchSunsirsHtml(candidate.url);
      const $ = load(html);
      const title = $('.news-detail > h1').first().text().replace(/\s+/g, ' ').trim();
      const contentNode = $('.news-detail .nd-c.width588').first();
      contentNode.find('script, style, .desbk, .fx-wc').remove();
      const content = contentNode.text().replace(/\s+/g, ' ').trim();
      if (!title || !content) throw new Error(`生意社详情页结构已变化：${candidate.url.toString()}`);
      const info = $('.news-detail .nd-info').first().text().replace(/\s+/g, ' ').trim();
      const publishedAt = this.parseSunsirsDate(info);
      if (!publishedAt) throw new Error(`生意社详情页发布时间无法解析：${candidate.url.toString()}`);
      const externalId = candidate.url.pathname.match(/detail-([\d-]+)\.html$/)?.[1] || candidate.url.toString();
      results.push({
        externalId,
        title,
        summary: candidate.summary || content.slice(0, 200),
        content,
        sourceName: '生意社',
        sourceUrl: candidate.url.toString(),
        publishedAt,
        rawData: {
          tag: candidate.tag || null,
          listTime: candidate.listTime || null,
          page: candidate.page,
          attribution: '来源：生意社',
        },
      });
    }
    return results;
  }

  private async fetchSunsirsHtml(initialUrl: URL) {
    let url = initialUrl;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      this.assertSunsirsUrl(url, url.pathname === '/qb/' || url.pathname === '/qb');
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'User-Agent': 'RICSE-Content-Collector/1.0 (+https://hgyunlian.com)',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error(`生意社重定向缺少地址（HTTP ${response.status}）`);
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) throw new Error(`生意社返回 HTTP ${response.status}`);
      const declaredSize = Number(response.headers.get('content-length') || 0);
      if (declaredSize > 2 * 1024 * 1024) throw new Error('生意社页面超过 2MB 限制');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('生意社页面超过 2MB 限制');
      const html = new TextDecoder().decode(bytes);
      if (/HW_CHECK|安全检查|document\.cookie\s*=|location\.reload\s*\(/i.test(html)) {
        throw new Error('生意社返回安全检查页面，本次不继续采集');
      }
      return html;
    }
    throw new Error('生意社重定向次数过多');
  }

  private assertSunsirsUrl(url: URL, listPage: boolean) {
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'www.100ppi.com') {
      throw new Error('生意社资讯地址不合法');
    }
    if (listPage) {
      if (!['/qb', '/qb/'].includes(url.pathname) || url.searchParams.get('pid') !== '318') {
        throw new Error('生意社列表地址必须限定为萤石 pid=318');
      }
      return;
    }
    if (!/^\/news\/detail-[\d-]+\.html$/.test(url.pathname)) throw new Error('生意社详情地址不合法');
  }

  private parseSunsirsDate(value: string) {
    const match = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return undefined;
    const pad = (part: string) => part.padStart(2, '0');
    const date = new Date(`${match[1]}-${pad(match[2])}-${pad(match[3])}T${pad(match[4])}:${match[5]}:${pad(match[6] || '0')}+08:00`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private async fetchText(initialUrl: URL, provider: 'GDELT' | 'RSS') {
    let url = initialUrl;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      this.assertAllowedUrl(url, provider);
      const response = await fetch(url, {
        headers: { Accept: 'application/json, application/rss+xml, application/atom+xml, text/xml;q=0.9', 'User-Agent': 'RICSE-Content-Collector/1.0' },
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error(`数据源重定向缺少地址（HTTP ${response.status}）`);
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) throw new Error(`数据源返回 HTTP ${response.status}`);
      const declaredSize = Number(response.headers.get('content-length') || 0);
      if (declaredSize > 5 * 1024 * 1024) throw new Error('数据源返回内容超过 5MB 限制');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('数据源返回内容超过 5MB 限制');
      return new TextDecoder().decode(bytes);
    }
    throw new Error('数据源重定向次数过多');
  }

  private fetchGdeltHttp(url: URL) {
    this.assertAllowedUrl(url, 'GDELT');
    return new Promise<string>((resolve, reject) => {
      const request = http.get(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'RICSE-Content-Collector/1.0' },
        timeout: 30_000,
      }, (response) => {
        if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) {
          response.resume();
          reject(new Error(`数据源返回 HTTP ${response.statusCode || 500}`));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > 5 * 1024 * 1024) {
            request.destroy(new Error('数据源返回内容超过 5MB 限制'));
            return;
          }
          chunks.push(buffer);
        });
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        response.on('error', reject);
      });
      request.on('timeout', () => request.destroy(new Error('GDELT HTTP 连接超时')));
      request.on('error', reject);
    });
  }

  private assertAllowedUrl(url: URL, provider: 'GDELT' | 'RSS') {
    if (provider === 'RSS' && url.protocol !== 'https:') throw new Error('RSS 资讯数据源必须使用 HTTPS');
    if (provider === 'GDELT' && !['http:', 'https:'].includes(url.protocol)) throw new Error('GDELT 数据源协议不合法');
    const host = url.hostname.toLowerCase();
    if (provider === 'GDELT' && host !== 'api.gdeltproject.org') throw new Error('GDELT 数据源地址不合法');
    if (this.isPrivateHost(host)) throw new Error('资讯数据源不能指向本机或内网地址');
    if (provider === 'RSS') {
      const allowed = [
        'news.smm.cn',
        'fluorspar.com',
        ...String(this.config.get<string>('NEWS_SOURCE_ALLOWED_HOSTS') || '')
          .split(',').map((item) => item.trim().toLowerCase()).filter(Boolean),
      ];
      if (!allowed.some((item) => host === item || host.endsWith(`.${item}`))) {
        throw new Error(`RSS 域名 ${host} 未加入 NEWS_SOURCE_ALLOWED_HOSTS`);
      }
    }
  }

  private isNetworkError(error: unknown) {
    if (!(error instanceof Error)) return false;
    const cause = (error as Error & { cause?: { code?: string } }).cause;
    return error.message === 'fetch failed' || ['UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT'].includes(String(cause?.code || ''));
  }

  private isPrivateHost(host: string) {
    return host === 'localhost' || host === '::1' || host.endsWith('.local')
      || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
      || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  }

  private sourceConfig(value: Prisma.JsonValue | null): NewsSourceConfig {
    if (!value || Array.isArray(value) || typeof value !== 'object') return {};
    return value as NewsSourceConfig;
  }

  private sourcePriority(value: Prisma.JsonValue | null) {
    const priority = Number(this.sourceConfig(value).priority || 999);
    return Number.isFinite(priority) ? priority : 999;
  }

  private normalizeItem(item: CollectedNewsItem): CollectedNewsItem | null {
    const title = this.plainText(item.title).replace(/\s+/g, ' ').trim().slice(0, 200);
    const sourceUrl = item.sourceUrl.trim();
    if (title.length < 4 || !sourceUrl) return null;
    let url: URL;
    try { url = new URL(sourceUrl); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((key) => url.searchParams.delete(key));
    return {
      ...item,
      title,
      summary: this.plainText(item.summary || '').slice(0, 500) || undefined,
      content: this.plainText(item.content || '').slice(0, 20_000) || undefined,
      sourceUrl: url.toString(),
      externalId: String(item.externalId || url.toString()).trim().slice(0, 1000),
      sourceName: this.plainText(item.sourceName || '').slice(0, 100) || undefined,
    };
  }

  private matchesKeywords(item: CollectedNewsItem, config: NewsSourceConfig, sourceType: string) {
    const keywords = Array.isArray(config.keywords) ? config.keywords.map(String).filter(Boolean) : [];
    const excludeKeywords = Array.isArray(config.excludeKeywords) ? config.excludeKeywords.map(String).filter(Boolean) : [];
    const excludeDomains = Array.isArray(config.excludeDomains) ? config.excludeDomains.map(String).filter(Boolean) : [];
    const enforce = config.enforceKeywords ?? sourceType === 'RSS';
    const haystack = `${item.title}\n${item.summary || ''}`.toLowerCase();
    if (excludeKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) return false;
    try {
      const host = new URL(item.sourceUrl).hostname.toLowerCase();
      if (excludeDomains.some((domain) => host === domain.toLowerCase() || host.endsWith(`.${domain.toLowerCase()}`))) return false;
    } catch { return false; }
    if (!enforce || !keywords.length) return true;
    return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
  }

  private normalizeTitle(value: string) {
    return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private plainText(value: string) {
    return String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parseDate(value: unknown) {
    const text = String(value || '').trim();
    if (!text) return undefined;
    const gdelt = text.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    const date = gdelt
      ? new Date(`${gdelt[1]}-${gdelt[2]}-${gdelt[3]}T${gdelt[4]}:${gdelt[5]}:${gdelt[6]}Z`)
      : new Date(text);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private text(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object' && '#text' in value) return String(value['#text'] || '');
    return '';
  }

  private atomLink(value: any) {
    const links = this.asArray(value);
    const alternate = links.find((item: any) => !item?.['@_rel'] || item?.['@_rel'] === 'alternate');
    return typeof alternate === 'string' ? alternate : String(alternate?.['@_href'] || this.text(alternate));
  }

  private asArray<T>(value: T | T[] | undefined): T[] {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
  }
}
