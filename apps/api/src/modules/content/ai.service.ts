import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

export interface ContentChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

@Injectable()
export class ContentAiService {
  private readonly logger = new Logger(ContentAiService.name);

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  async enrichPublicContext(messages: ContentChatMessage[]) {
    const question = [...messages].reverse().find((item) => item.role === 'user')?.content || '';
    const context: string[] = [];
    if (/价格|行情|报价|涨跌|萤石/.test(question)) {
      const prices = await this.prisma.contentProductPrice.findMany({
        include: { productType: true }, orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }], take: 20,
      });
      if (prices.length) context.push(`平台近期行情：\n${prices.map((item) => `${item.businessDate.toISOString().slice(0, 10)} ${item.productType.name}${item.spec ? `(${item.spec})` : ''} ${item.marketName || item.region} ${item.price}${item.unit} 涨跌${item.changeAmount || 0}`).join('\n')}`);
    }
    if (/资讯|新闻|动态|政策|市场/.test(question)) {
      const articles = await this.prisma.contentArticle.findMany({
        where: { AND: [{ type: 'NEWS' }, { status: 'PUBLISHED' }, { OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] }] },
        orderBy: [{ publishAt: 'desc' }, { createdAt: 'desc' }], take: 8,
      });
      if (articles.length) context.push(`平台近期资讯：\n${articles.map((item) => `${(item.publishAt || item.createdAt).toISOString().slice(0, 10)} ${item.title}：${item.summary || ''}`).join('\n')}`);
    }
    if (!context.length) return messages;
    return [messages[0], { role: 'system' as const, content: `${context.join('\n\n')}\n\n以上为平台数据库上下文，只能据此引用，并明确数据日期。` }, ...messages.slice(1)];
  }

  private settings() {
    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('AI 服务尚未配置');
    return {
      apiKey,
      baseUrl: this.config.get<string>('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1',
      model: this.config.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat',
    };
  }

  async chatOnce(messages: ContentChatMessage[], timeoutMs = 60_000): Promise<string> {
    const settings = this.settings();
    const res = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: settings.model, messages, stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.warn(`DeepSeek HTTP ${res.status}: ${text.slice(0, 200)}`);
      throw new ServiceUnavailableException('AI 服务暂时不可用');
    }
    const body: any = await res.json();
    return body?.choices?.[0]?.message?.content || '';
  }

  async chatStream(messages: ContentChatMessage[], response: Response, signal?: AbortSignal) {
    const settings = this.settings();
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();
    const upstream = await fetch(`${settings.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: settings.model, messages, stream: true }),
      signal: signal || AbortSignal.timeout(180_000),
    });
    if (!upstream.ok || !upstream.body) {
      response.write(`data: ${JSON.stringify({ error: 'AI 服务暂时不可用' })}\n\n`);
      response.end();
      return;
    }
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        response.write(value);
      }
    } finally {
      response.end();
    }
  }

  async cleanArticle(title: string, sourceText: string) {
    const plain = sourceText
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!this.config.get<string>('DEEPSEEK_API_KEY')) {
      return { summary: plain.slice(0, 80), content: plain };
    }
    const output = await this.chatOnce([
      {
        role: 'system',
        content: '你是产业资讯编辑。删除版权声明、转载提示、联系方式和模板化评论；保留事实、数据和原意。输出严格 JSON：{"summary":"50字以内摘要","content":"Markdown正文"}，不得补充原文没有的信息。',
      },
      { role: 'user', content: `标题：${title}\n\n原文：\n${plain}` },
    ]);
    const match = output.match(/\{[\s\S]*\}/);
    if (!match) return { summary: plain.slice(0, 80), content: plain };
    try {
      const parsed = JSON.parse(match[0]);
      return {
        summary: String(parsed.summary || plain.slice(0, 80)).slice(0, 500),
        content: String(parsed.content || plain),
      };
    } catch {
      return { summary: plain.slice(0, 80), content: plain };
    }
  }
}
