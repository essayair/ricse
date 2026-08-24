import { ConfigService } from '@nestjs/config';
import { mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../../prisma/prisma.service';
import { NewsCollectorService } from './news-collector.service';

describe('NewsCollectorService', () => {
  const prisma = mockDeep<PrismaService>();
  const config = { get: jest.fn((key: string) => key === 'GDELT_FALLBACK_DELAY_MS' ? '0' : undefined) } as unknown as ConfigService;
  let service: NewsCollectorService;
  let originalFetch: typeof fetch;

  const source = {
    id: 'source-1', code: 'GDELT_FLUORITE_NEWS', name: 'GDELT 萤石产业资讯', type: 'GDELT', status: 'ACTIVE',
    schedule: '17 */2 * * *', config: { query: '(fluorspar OR fluorite)', maxRecords: 20 },
    lastSuccessAt: null, lastErrorAt: null, lastError: null, createdAt: new Date(), updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
    service = new NewsCollectorService(config, prisma);
    prisma.contentDataSource.findMany.mockResolvedValue([source] as any);
    prisma.contentCategory.findUnique.mockResolvedValue(null);
    prisma.contentArticle.findFirst.mockResolvedValue(null);
    prisma.contentArticle.create.mockResolvedValue({ id: 'article-1' } as any);
    prisma.contentDataSource.update.mockResolvedValue(source as any);
  });

  afterEach(() => { global.fetch = originalFetch; });

  it('采集开放 API 后只创建待审核资讯并保留原文追溯字段', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      articles: [{
        url: 'https://example.com/news/1?utm_source=test', title: '萤石市场供应持续趋紧',
        seendate: '20260824T120305Z', domain: 'example.com', language: 'Chinese', sourcecountry: 'China',
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await service.sync();

    expect(result).toEqual(expect.objectContaining({ succeededSources: 1 }));
    expect(prisma.contentArticle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: '萤石市场供应持续趋紧',
        status: 'PENDING_REVIEW',
        ingestionMode: 'AUTO',
        dataSourceId: 'source-1',
        sourceUrl: 'https://example.com/news/1',
      }),
    });
  });

  it('相同来源链接或标题命中已有资讯时跳过，不重复入库', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      articles: [{ url: 'https://example.com/news/1', title: '萤石行业动态', domain: 'example.com' }],
    }), { status: 200 }));
    prisma.contentArticle.findFirst.mockResolvedValue({ id: 'existing' } as any);

    const result: any = await service.sync();

    expect(result.results[0]).toEqual(expect.objectContaining({ created: 0, duplicates: 1 }));
    expect(prisma.contentArticle.create).not.toHaveBeenCalled();
  });

  it('按行业词、排除词和排除域名过滤同名噪声', async () => {
    prisma.contentDataSource.findMany.mockResolvedValue([{
      ...source,
      config: {
        query: 'fluorite', enforceKeywords: true, keywords: ['萤石'],
        excludeKeywords: ['摄像机', '镜头'], excludeDomains: ['zol.com.cn'],
      },
    }] as any);
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      articles: [
        { url: 'https://jd.zol.com.cn/1.html', title: '萤石 AI 摄像机新品发布', domain: 'jd.zol.com.cn' },
        { url: 'https://industry.example.com/2.html', title: '萤石矿供应持续趋紧', domain: 'industry.example.com' },
      ],
    }), { status: 200 }));

    const result: any = await service.sync();

    expect(result.results[0]).toEqual(expect.objectContaining({ fetched: 2, created: 1, filtered: 1 }));
    expect(prisma.contentArticle.create).toHaveBeenCalledTimes(1);
    expect(prisma.contentArticle.create).toHaveBeenCalledWith({ data: expect.objectContaining({ title: '萤石矿供应持续趋紧' }) });
  });

  it('GDELT HTTPS 发生连接级失败时降级到其官方 HTTP API', async () => {
    const networkError = new TypeError('fetch failed') as TypeError & { cause?: { code: string } };
    networkError.cause = { code: 'UND_ERR_CONNECT_TIMEOUT' };
    global.fetch = jest.fn().mockRejectedValueOnce(networkError);
    const fallback = jest.spyOn(service as any, 'fetchGdeltHttp').mockResolvedValue(JSON.stringify({ articles: [] }));

    const result: any = await service.sync();

    expect(result.results[0]).toEqual(expect.objectContaining({ fetched: 0, created: 0 }));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(fallback.mock.calls[0][0])).toMatch(/^http:\/\/api\.gdeltproject\.org/);
  });

  it('RSS 地址必须在服务端域名白名单中', async () => {
    prisma.contentDataSource.findMany.mockResolvedValue([{
      ...source, id: 'rss-1', code: 'TEST_RSS', type: 'RSS', config: { endpoint: 'https://news.example.com/feed.xml' },
    }] as any);

    await expect(service.sync()).rejects.toThrow('NEWS_SOURCE_ALLOWED_HOSTS');
    expect(global.fetch).toBe(originalFetch);
  });

  it('解析预置的上海有色网 RSS 并按行业关键词入待审核库', async () => {
    prisma.contentDataSource.findMany.mockResolvedValue([{
      ...source, id: 'smm-1', code: 'SMM_INDUSTRY_RSS', type: 'RSS',
      config: { endpoint: 'https://news.smm.cn/rss/industry', sourceName: '上海有色网', enforceKeywords: true, keywords: ['萤石'] },
    }] as any);
    global.fetch = jest.fn().mockResolvedValue(new Response(`<?xml version="1.0"?><rss><channel><item>
      <title><![CDATA[萤石矿供应格局出现变化]]></title><link><![CDATA[https://news.smm.cn/news/10001]]></link>
      <description><![CDATA[行业供需信息摘要]]></description><guid>https://news.smm.cn/news/10001</guid>
      <pubDate>Mon, 24 Aug 2026 10:15:48 +0800</pubDate>
    </item></channel></rss>`, { status: 200 }));

    const result: any = await service.sync();

    expect(result.results[0]).toEqual(expect.objectContaining({ fetched: 1, created: 1, pendingReview: 1 }));
    expect(prisma.contentArticle.create).toHaveBeenCalledWith({ data: expect.objectContaining({ source: '上海有色网', status: 'PENDING_REVIEW' }) });
  });

  it('按旧 spiderworks 页面结构采集生意社萤石列表和详情并自动发布', async () => {
    prisma.contentDataSource.findMany.mockResolvedValue([{
      ...source, id: 'sunsirs-1', code: 'SUNSIRS_FLUORITE_NEWS', name: '生意社萤石资讯', type: 'API',
      config: { pageUrl: 'https://www.100ppi.com/qb/?pid=318', maxPages: 1, maxRecords: 20, detailDelayMs: 0, sourceName: '生意社' },
    }] as any);
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response(`<!doctype html><html><body>
        <div class="mb-6 ml-2 w-100">
          <span class="qb-time">10:49 08-21</span><a class="btn-yl">【萤石】</a>
          <p class="mt-1">浙江地区萤石市场行情上涨。</p>
          <a class="btn-xq fl" href="/news/detail-20260821-6101729.html">点击详情</a>
        </div>
      </body></html>`, { status: 200 }))
      .mockResolvedValueOnce(new Response(`<!doctype html><html><body>
        <div class="news-detail"><h1>生意社：浙江地区萤石市场行情上涨</h1>
          <div class="nd-info">https://www.100ppi.com&nbsp;&nbsp;2026年08月21日 10:49&nbsp;&nbsp;生意社</div>
          <div class="nd-c width588">生意社08月21日讯<p>97%萤石粉市场价格上涨。</p><div class="desbk">推广说明</div></div>
        </div>
      </body></html>`, { status: 200 }));

    const result: any = await service.sync();

    expect(result).toEqual(expect.objectContaining({ fetched: 1, created: 1, published: 1, pendingReview: 0 }));
    expect(result.results[0]).toEqual(expect.objectContaining({ fetched: 1, created: 1, published: 1, pendingReview: 0 }));
    expect(prisma.contentArticle.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      title: '生意社：浙江地区萤石市场行情上涨',
      source: '生意社',
      sourceUrl: 'https://www.100ppi.com/news/detail-20260821-6101729.html',
      externalId: '20260821-6101729',
      status: 'PUBLISHED',
      publishAt: new Date('2026-08-21T02:49:00.000Z'),
      content: '生意社08月21日讯97%萤石粉市场价格上涨。',
    }) });
  });

  it('生意社返回安全检查页面时停止采集而不入库', async () => {
    prisma.contentDataSource.findMany.mockResolvedValue([{
      ...source, id: 'sunsirs-1', code: 'SUNSIRS_FLUORITE_NEWS', type: 'API',
      config: { pageUrl: 'https://www.100ppi.com/qb/?pid=318', detailDelayMs: 0 },
    }] as any);
    global.fetch = jest.fn().mockResolvedValue(new Response('<script>document.cookie="HW_CHECK=x";location.reload()</script>', { status: 200 }));

    await expect(service.sync()).rejects.toThrow('安全检查页面');
    expect(prisma.contentArticle.create).not.toHaveBeenCalled();
  });

  it('聚合采集时准确返回部分成功和新增待审核数量', async () => {
    prisma.contentDataSource.findMany.mockResolvedValue([
      source,
      {
        ...source, id: 'fluorspar-rss', code: 'FLUORSPAR_COM_NEWS', type: 'RSS',
        config: { endpoint: 'https://fluorspar.com/feed/', sourceName: 'Fluorspar.com', enforceKeywords: false },
      },
    ] as any);
    global.fetch = jest.fn()
      .mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }))
      .mockResolvedValueOnce(new Response(`<?xml version="1.0"?><rss><channel><item>
        <title>Global fluorspar supply enters a new cycle</title>
        <link>https://fluorspar.com/2026/08/24/global-supply/</link>
        <description>Fluorspar market analysis</description>
        <guid>fluorspar-global-supply</guid>
      </item></channel></rss>`, { status: 200 }));

    const result: any = await service.sync();

    expect(result).toEqual(expect.objectContaining({
      sources: 2, succeededSources: 1, failedSources: 1,
      fetched: 1, created: 1, pendingReview: 1, outcome: 'PARTIAL',
    }));
    expect(result.results[0]).toEqual(expect.objectContaining({ code: 'GDELT_FLUORITE_NEWS', error: '数据源返回 HTTP 429' }));
    expect(result.results[1]).toEqual(expect.objectContaining({ code: 'FLUORSPAR_COM_NEWS', created: 1 }));
  });
});
