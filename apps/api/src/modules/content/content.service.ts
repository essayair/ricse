import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentQueueService } from './content-queue.service';
import {
  ArticleQueryDto,
  ContactQueryDto,
  CreateArticleDto,
  CreateCategoryDto,
  CreateContactDto,
  CreateContentJobDto,
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

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService, private readonly queue: ContentQueueService) {}

  private page(query: PageQueryDto) {
    const pageNo = Math.max(1, query.pageNo || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    return { pageNo, pageSize, skip: (pageNo - 1) * pageSize };
  }

  listCategories(activeOnly = false) {
    return this.prisma.contentCategory.findMany({
      where: activeOnly ? { status: 'ACTIVE' } : undefined,
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    const code = dto.code.trim().toUpperCase();
    try {
      return await this.prisma.contentCategory.create({
        data: { ...dto, code, name: dto.name.trim() },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('栏目编码已存在');
      }
      throw error;
    }
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.requireCategory(id);
    return this.prisma.contentCategory.update({
      where: { id },
      data: { ...dto, name: dto.name?.trim() },
    });
  }

  private async requireCategory(id: string) {
    const category = await this.prisma.contentCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('资讯栏目不存在');
    return category;
  }

  async listArticles(query: ArticleQueryDto, publicOnly = false) {
    const { pageNo, pageSize, skip } = this.page(query);
    const now = new Date();
    const and: Prisma.ContentArticleWhereInput[] = [];
    if (publicOnly) {
      and.push({ status: 'PUBLISHED' });
      and.push({ OR: [{ publishAt: null }, { publishAt: { lte: now } }] });
    } else if (query.status) {
      and.push({ status: query.status });
    }
    if (query.search) {
      and.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { summary: { contains: query.search, mode: 'insensitive' } },
          { productName: { contains: query.search, mode: 'insensitive' } },
          { company: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.ContentArticleWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(and.length ? { AND: and } : {}),
    };
    const [total, list] = await this.prisma.$transaction([
      this.prisma.contentArticle.count({ where }),
      this.prisma.contentArticle.findMany({
        where,
        skip,
        take: pageSize,
        include: { category: true, assets: { orderBy: { createdAt: 'desc' } } },
        orderBy: [{ publishAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);
    const safeList = publicOnly ? list.map((item) => this.publicArticle(item)) : list;
    return { total, list: safeList, pageNo, pageSize };
  }

  async getArticle(id: string, publicOnly = false) {
    const identity = { OR: [{ id }, { legacyId: id }] };
    const article = await this.prisma.contentArticle.findFirst({
      where: publicOnly
        ? { AND: [identity, { status: 'PUBLISHED' }, { OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] }] }
        : identity,
      include: { category: true, assets: { orderBy: { createdAt: 'desc' } } },
    });
    if (!article) throw new NotFoundException('内容不存在或尚未发布');
    return publicOnly ? this.publicArticle(article) : article;
  }

  private publicArticle<T extends Record<string, any>>(article: T) {
    const { contactName, contactPhone, createdById, publishedById, sourceHash, ...safe } = article;
    void contactName; void contactPhone; void createdById; void publishedById; void sourceHash;
    return safe as T;
  }

  async createArticle(dto: CreateArticleDto, userId: string) {
    await this.validateArticle(dto);
    return this.prisma.contentArticle.create({
      data: this.articleData(dto, { createdById: userId }),
      include: { category: true, assets: true },
    });
  }

  async updateArticle(id: string, dto: UpdateArticleDto) {
    const article = await this.getArticle(id);
    if (article.status === 'OFFLINE' && dto.type !== article.type) {
      throw new BadRequestException('已下线内容不能修改类型');
    }
    await this.validateArticle(dto);
    return this.prisma.contentArticle.update({
      where: { id: article.id },
      data: this.articleData(dto),
      include: { category: true, assets: true },
    });
  }

  private articleData(dto: CreateArticleDto, extra: Record<string, unknown> = {}) {
    return {
      ...extra,
      type: dto.type,
      title: dto.title.trim(),
      categoryId: dto.categoryId || null,
      summary: dto.summary?.trim() || null,
      content: this.cleanRichText(dto.content || ''),
      coverUrl: dto.coverUrl?.trim() || null,
      source: dto.source?.trim() || null,
      author: dto.author?.trim() || null,
      tags: [...new Set((dto.tags || []).map((item) => item.trim()).filter(Boolean))],
      publishAt: dto.publishAt ? new Date(dto.publishAt) : null,
      productName: dto.productName?.trim() || null,
      spec: dto.spec?.trim() || null,
      quantity: dto.quantity?.trim() || null,
      priceText: dto.priceText?.trim() || null,
      region: dto.region?.trim() || null,
      deliveryMethod: dto.deliveryMethod?.trim() || null,
      requirements: dto.requirements?.trim() || null,
      company: dto.company?.trim() || null,
      contactName: dto.contactName?.trim() || null,
      contactPhone: dto.contactPhone?.trim() || null,
    };
  }

  private cleanRichText(value: string) {
    return sanitizeHtml(value, {
      allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'figure', 'figcaption'],
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        a: ['href', 'name', 'target', 'rel'],
        img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
        '*': ['class'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      transformTags: {
        a: (_tagName, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'noopener noreferrer' } }),
        img: (_tagName, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy' } }),
      },
    });
  }

  private async validateArticle(dto: CreateArticleDto) {
    if (dto.categoryId) await this.requireCategory(dto.categoryId);
    if (dto.type !== 'NEWS' && !dto.productName?.trim()) {
      throw new BadRequestException('供需信息必须填写商品名称');
    }
  }

  async updateArticleStatus(id: string, dto: UpdateArticleStatusDto, userId: string) {
    const article = await this.getArticle(id);
    if (dto.status === 'PUBLISHED' && !article.title.trim()) {
      throw new BadRequestException('标题为空，不能发布');
    }
    return this.prisma.contentArticle.update({
      where: { id: article.id },
      data: {
        status: dto.status,
        publishAt: dto.status === 'PUBLISHED'
          ? new Date(dto.publishAt || article.publishAt || new Date())
          : article.publishAt,
        publishedById: dto.status === 'PUBLISHED' ? userId : article.publishedById,
      },
      include: { category: true, assets: true },
    });
  }

  async deleteArticle(id: string) {
    const article = await this.getArticle(id);
    if (article.status !== 'DRAFT') throw new BadRequestException('只有从未发布的草稿可以删除');
    await this.prisma.contentArticle.delete({ where: { id: article.id } });
  }

  async createAsset(data: {
    articleId?: string;
    objectKey: string;
    originalName: string;
    mimeType: string;
    size: number;
    purpose?: string;
    createdById?: string;
  }) {
    if (data.articleId) await this.getArticle(data.articleId);
    return this.prisma.contentAsset.create({ data });
  }

  async getAsset(id: string) {
    const asset = await this.prisma.contentAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('内容附件不存在');
    return asset;
  }

  async getPublicAsset(id: string) {
    const asset = await this.prisma.contentAsset.findFirst({
      where: {
        id,
        article: {
          status: 'PUBLISHED',
          OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }],
        },
      },
    });
    if (!asset) throw new NotFoundException('内容附件不存在或尚未发布');
    return asset;
  }

  async deleteAsset(id: string) {
    const asset = await this.getAsset(id);
    await this.prisma.contentAsset.delete({ where: { id } });
    return asset;
  }

  async setArticleCover(articleId: string, coverUrl: string) {
    const article = await this.getArticle(articleId);
    return this.prisma.contentArticle.update({ where: { id: article.id }, data: { coverUrl } });
  }

  listProductTypes(activeOnly = false) {
    return this.prisma.contentProductType.findMany({
      where: activeOnly ? { status: 'ACTIVE' } : undefined,
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });
  }

  async createProductType(dto: ProductTypeDto) {
    try {
      return await this.prisma.contentProductType.create({
        data: { ...dto, code: dto.code.trim().toUpperCase(), name: dto.name.trim() },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('产品类型编码已存在');
      }
      throw error;
    }
  }

  async updateProductType(id: string, dto: ProductTypeDto) {
    const exists = await this.prisma.contentProductType.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('产品类型不存在');
    return this.prisma.contentProductType.update({
      where: { id },
      data: { ...dto, code: dto.code.trim().toUpperCase(), name: dto.name.trim() },
    });
  }

  async listPrices(query: PriceQueryDto, publicOnly = false) {
    const { pageNo, pageSize, skip } = this.page(query);
    const where: Prisma.ContentProductPriceWhereInput = {
      ...(query.productTypeId ? { productTypeId: query.productTypeId } : {}),
      ...(query.region ? { region: { contains: query.region, mode: 'insensitive' } } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.dateFrom || query.dateTo ? { businessDate: {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      } } : {}),
      ...(query.search ? { OR: [
        { marketName: { contains: query.search, mode: 'insensitive' } },
        { region: { contains: query.search, mode: 'insensitive' } },
        { productType: { name: { contains: query.search, mode: 'insensitive' } } },
      ] } : {}),
      ...(publicOnly ? { productType: { status: 'ACTIVE' } } : {}),
    };
    const [total, list] = await this.prisma.$transaction([
      this.prisma.contentProductPrice.count({ where }),
      this.prisma.contentProductPrice.findMany({
        where, skip, take: pageSize, include: { productType: true },
        orderBy: [{ businessDate: 'desc' }, { region: 'asc' }],
      }),
    ]);
    return { total, list, pageNo, pageSize };
  }

  async createPrice(dto: CreatePriceDto, userId: string) {
    const product = await this.prisma.contentProductType.findUnique({ where: { id: dto.productTypeId } });
    if (!product) throw new NotFoundException('产品类型不存在');
    return this.prisma.contentProductPrice.create({
      data: {
        ...dto,
        businessDate: new Date(dto.businessDate),
        price: new Prisma.Decimal(dto.price),
        changeAmount: dto.changeAmount == null ? null : new Prisma.Decimal(dto.changeAmount),
        rawData: dto.rawData as Prisma.InputJsonValue | undefined,
        createdById: userId,
      },
      include: { productType: true },
    });
  }

  async deletePrice(id: string) {
    const price = await this.prisma.contentProductPrice.findUnique({ where: { id } });
    if (!price) throw new NotFoundException('价格记录不存在');
    if (price.source !== 'MANUAL') throw new BadRequestException('采集或导入价格不能直接删除');
    await this.prisma.contentProductPrice.delete({ where: { id } });
  }

  async averagePricesByRegion(productTypeId?: string) {
    const latest = await this.prisma.contentProductPrice.aggregate({
      where: productTypeId ? { productTypeId } : undefined,
      _max: { businessDate: true },
    });
    if (!latest._max.businessDate) return { businessDate: null, list: [] };
    const rows = await this.prisma.contentProductPrice.groupBy({
      by: ['region', 'unit'],
      where: { businessDate: latest._max.businessDate, ...(productTypeId ? { productTypeId } : {}) },
      _avg: { price: true },
      _count: { _all: true },
      orderBy: { region: 'asc' },
    });
    return { businessDate: latest._max.businessDate, list: rows.map((row) => ({
      region: row.region, unit: row.unit, averagePrice: row._avg.price, samples: row._count._all,
    })) };
  }

  async marketRegions(productTypeCode = 'FLUORITE_97') {
    const product = await this.prisma.contentProductType.findFirst({
      where: { code: productTypeCode, status: 'ACTIVE' },
    });
    if (!product) return [];
    const rows = await this.prisma.contentProductPrice.findMany({
      where: { productTypeId: product.id },
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
    });
    const seen = new Set<string>();
    return rows.flatMap((row) => {
      const key = row.marketName || row.region;
      if (seen.has(key)) return [];
      seen.add(key);
      const raw = (row.rawData || {}) as Record<string, unknown>;
      const price = Number(row.price);
      const change = Number(row.changeAmount || 0);
      const previous = price - change;
      return [{
        region: row.region,
        province: String(raw.province || row.region),
        marketName: row.marketName || row.region,
        shortName: String(raw.shortName || row.marketName || row.region),
        price,
        date: row.businessDate.toISOString().slice(0, 10),
        change,
        changeRate: previous ? Number(((change / previous) * 100).toFixed(2)) : 0,
        remark: row.remark || String(raw.remark || ''),
        unit: row.unit,
      }];
    });
  }

  async marketTrend(marketName: string, productTypeCode = 'FLUORITE_97') {
    const product = await this.prisma.contentProductType.findFirst({
      where: { code: productTypeCode, status: 'ACTIVE' },
    });
    if (!product) throw new NotFoundException('行情产品尚未配置');
    const rows = await this.prisma.contentProductPrice.findMany({
      where: { productTypeId: product.id, marketName },
      orderBy: { businessDate: 'desc' },
      take: 180,
    });
    if (!rows.length) throw new NotFoundException('未找到该市场的行情数据');
    rows.reverse();
    const latest = rows[rows.length - 1];
    const raw = (latest.rawData || {}) as Record<string, unknown>;
    const points = rows.map((row) => ({
      date: row.businessDate.toISOString().slice(0, 10),
      price: Number(row.price),
    }));
    const highPoint = points.reduce((best, item) => item.price > best.price ? item : best);
    const lowPoint = points.reduce((best, item) => item.price < best.price ? item : best);
    return {
      marketName,
      shortName: String(raw.shortName || marketName),
      region: latest.region,
      province: String(raw.province || latest.region),
      unit: latest.unit,
      remark: latest.remark || String(raw.remark || ''),
      latestPrice: Number(latest.price),
      latestDate: latest.businessDate.toISOString().slice(0, 10),
      change: Number(latest.changeAmount || 0),
      points,
      high: highPoint,
      low: lowPoint,
    };
  }

  async hydrofluoricAcidTrend() {
    const product = await this.prisma.contentProductType.findFirst({
      where: { code: 'HYDROFLUORIC_ACID', status: 'ACTIVE' },
    });
    if (!product) return { latestDate: null, unit: '美元/公斤', sourceUrl: null, series: [] };
    const rows = await this.prisma.contentProductPrice.findMany({
      where: { productTypeId: product.id, source: 'BUSINESS_ANALYTIQ' },
      orderBy: [{ businessDate: 'asc' }, { region: 'asc' }],
      take: 240,
    });
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) grouped.set(row.region, [...(grouped.get(row.region) || []), row]);
    const latest = rows.at(-1);
    const latestRaw = (latest?.rawData || {}) as Record<string, unknown>;
    return {
      latestDate: latest?.businessDate.toISOString().slice(0, 10) || null,
      unit: product.unit,
      sourceUrl: String(latestRaw.sourceUrl || ''),
      series: [...grouped.entries()].map(([region, items]) => {
        const current = items.at(-1)!;
        const raw = (current.rawData || {}) as Record<string, unknown>;
        return {
          region,
          latestPrice: Number(current.price),
          change: Number(current.changeAmount || 0),
          changeRate: Number(raw.changeRate || 0),
          points: items.map((item) => ({ date: item.businessDate.toISOString().slice(0, 10), price: Number(item.price) })),
        };
      }),
    };
  }

  async fluorsparPriceTrend() {
    const product = await this.prisma.contentProductType.findFirst({
      where: { code: 'FLUORSPAR_TREND_INDEX', status: 'ACTIVE' },
    });
    if (!product) return { latestDate: null, unit: '美元/吨', source: 'fluorspar.com', series: [] };
    const rows = await this.prisma.contentProductPrice.findMany({
      where: { productTypeId: product.id, source: 'FLUORSPAR_COM' },
      orderBy: [{ businessDate: 'asc' }, { region: 'asc' }],
    });
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) grouped.set(row.region, [...(grouped.get(row.region) || []), row]);
    const regionOrder = ['华中', '华东', '北方'];
    const series = [...grouped.entries()].sort(([left], [right]) => regionOrder.indexOf(left) - regionOrder.indexOf(right)).map(([region, items]) => {
      const latest = items.at(-1)!;
      const raw = (latest.rawData || {}) as Record<string, unknown>;
      return {
        region,
        sourceUrl: String(raw.sourceUrl || ''),
        latestDate: latest.businessDate.toISOString().slice(0, 10),
        latestPrice: Number(latest.price),
        points: items.map((item) => {
          const itemRaw = (item.rawData || {}) as Record<string, unknown>;
          return {
            date: item.businessDate.toISOString().slice(0, 10),
            price: Number(item.price),
            qualityFlag: itemRaw.qualityFlag || null,
          };
        }),
      };
    });
    const latestDate = series.reduce((latest, item) => item.latestDate > latest ? item.latestDate : latest, '');
    return { latestDate: latestDate || null, unit: product.unit, source: 'fluorspar.com', series };
  }

  async listContacts(query: ContactQueryDto) {
    const { pageNo, pageSize, skip } = this.page(query);
    const where: Prisma.WebsiteContactWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { company: { contains: query.search, mode: 'insensitive' } },
        { message: { contains: query.search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [total, list] = await this.prisma.$transaction([
      this.prisma.websiteContact.count({ where }),
      this.prisma.websiteContact.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
    ]);
    return { total, list, pageNo, pageSize };
  }

  createContact(dto: CreateContactDto, sourceIp?: string) {
    if (!dto.name?.trim() || !dto.phone?.trim() || !dto.message?.trim()) {
      throw new BadRequestException('姓名、联系方式和咨询内容为必填');
    }
    return this.prisma.websiteContact.create({
      data: { ...dto, name: dto.name.trim(), phone: dto.phone.trim(), message: dto.message.trim(), sourceIp },
    });
  }

  async updateContact(id: string, dto: UpdateContactDto, userId: string) {
    const contact = await this.prisma.websiteContact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException('咨询记录不存在');
    return this.prisma.websiteContact.update({
      where: { id },
      data: {
        ...dto,
        assigneeId: dto.assigneeId || contact.assigneeId || userId,
        handledAt: ['COMPLETED', 'INVALID'].includes(dto.status) ? new Date() : null,
      },
    });
  }

  async listSupplyDemand(query: SupplyDemandQueryDto, publicOnly = false) {
    const { pageNo, pageSize, skip } = this.page(query);
    const where: Prisma.SupplyDemandPostWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(publicOnly ? { status: 'PUBLISHED' } : query.status ? { status: query.status } : {}),
      ...(query.region ? { region: { contains: query.region, mode: 'insensitive' } } : {}),
      ...(query.search ? { OR: [
        { productName: { contains: query.search, mode: 'insensitive' } },
        { company: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [total, list] = await this.prisma.$transaction([
      this.prisma.supplyDemandPost.count({ where }),
      this.prisma.supplyDemandPost.findMany({ where, skip, take: pageSize, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }] }),
    ]);
    return { total, list: publicOnly ? list.map((item) => this.publicSupply(item)) : list, pageNo, pageSize };
  }

  createSupplyDemand(dto: CreateSupplyDemandDto, options: { openId?: string; userId?: string; platform?: boolean } = {}) {
    if (!['SUPPLY', 'DEMAND'].includes(dto.type)) throw new BadRequestException('供需类型无效');
    if (!dto.productName?.trim() || !dto.contactName?.trim() || !dto.contactPhone?.trim()) {
      throw new BadRequestException('商品名称、联系人和联系电话为必填');
    }
    const published = dto.status === 'PUBLISHED';
    return this.prisma.supplyDemandPost.create({
      data: {
        ...dto,
        productName: dto.productName.trim(),
        contactName: dto.contactName.trim(),
        contactPhone: dto.contactPhone.trim(),
        status: published ? 'PUBLISHED' : 'PENDING',
        source: options.platform ? 'PLATFORM' : 'USER',
        wechatOpenId: options.openId,
        reviewedById: published ? options.userId : null,
        reviewedAt: published ? new Date() : null,
        publishedAt: published ? new Date() : null,
      },
    });
  }

  async reviewSupplyDemand(id: string, dto: ReviewSupplyDemandDto, userId: string) {
    const post = await this.prisma.supplyDemandPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('供需信息不存在');
    if (dto.status === 'REJECTED' && !dto.reason?.trim()) throw new BadRequestException('驳回必须填写原因');
    return this.prisma.supplyDemandPost.update({
      where: { id },
      data: {
        status: dto.status,
        rejectReason: dto.status === 'REJECTED' ? dto.reason!.trim() : null,
        reviewedById: userId,
        reviewedAt: new Date(),
        publishedAt: dto.status === 'PUBLISHED' ? (post.publishedAt || new Date()) : post.publishedAt,
      },
    });
  }

  listMine(openId: string) {
    return this.prisma.supplyDemandPost.findMany({ where: { wechatOpenId: openId }, orderBy: { createdAt: 'desc' } });
  }

  async getPublicSupplyDemand(id: string) {
    const post = await this.prisma.supplyDemandPost.findFirst({
      where: { OR: [{ id }, { legacyId: id }], status: 'PUBLISHED' },
    });
    if (!post) throw new NotFoundException('供需信息不存在或尚未发布');
    return this.publicSupply(post);
  }

  private publicSupply<T extends Record<string, any>>(post: T) {
    const { contactName, contactPhone, company, wechatOpenId, rejectReason, reviewedById, ...safe } = post;
    void contactName; void contactPhone; void company; void wechatOpenId; void rejectReason; void reviewedById;
    return safe;
  }

  listDataSources() {
    return this.prisma.contentDataSource.findMany({ orderBy: [{ status: 'asc' }, { name: 'asc' }] });
  }

  async updateDataSource(id: string, dto: UpdateDataSourceDto) {
    const source = await this.prisma.contentDataSource.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('数据源不存在');
    return this.prisma.contentDataSource.update({
      where: { id }, data: { ...dto, config: dto.config as Prisma.InputJsonValue | undefined },
    });
  }

  listJobs(query: PageQueryDto & { status?: string; type?: string }) {
    const { pageNo, pageSize, skip } = this.page(query);
    const where: Prisma.ContentJobWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    return this.prisma.$transaction([
      this.prisma.contentJob.count({ where }),
      this.prisma.contentJob.findMany({ where, skip, take: pageSize, include: { source: true }, orderBy: { createdAt: 'desc' } }),
    ]).then(([total, list]) => ({ total, list, pageNo, pageSize }));
  }

  async createJob(dto: CreateContentJobDto, userId?: string) {
    const businessKey = `${dto.type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const job = await this.prisma.contentJob.create({
      data: {
        type: dto.type, sourceId: dto.sourceId, businessKey,
        payload: dto.payload as Prisma.InputJsonValue | undefined,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
        createdById: userId,
      },
      include: { source: true },
    });
    await this.queue.enqueue(job.id, job.type, (dto.payload || {}) as Record<string, unknown>, job.scheduledAt);
    return job;
  }

  async retryJob(id: string) {
    const job = await this.prisma.contentJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('任务不存在');
    if (!['FAILED', 'CANCELLED'].includes(job.status)) throw new BadRequestException('只有失败或已取消任务可以重试');
    const updated = await this.prisma.contentJob.update({
      where: { id },
      data: { status: 'PENDING', scheduledAt: new Date(), nextRetryAt: null, errorMessage: null, finishedAt: null },
    });
    await this.queue.enqueue(updated.id, updated.type, (updated.payload || {}) as Record<string, unknown>);
    return updated;
  }

  async cancelJob(id: string) {
    const job = await this.prisma.contentJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('任务不存在');
    if (!['PENDING', 'FAILED'].includes(job.status)) throw new BadRequestException('当前任务不能取消');
    return this.prisma.contentJob.update({ where: { id }, data: { status: 'CANCELLED', finishedAt: new Date() } });
  }
}
