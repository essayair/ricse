import { BadRequestException, Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ContentAiService, ContentChatMessage } from './ai.service';
import { PublicRateLimitService } from './public-rate-limit.service';

const SYSTEM_PROMPT = '你是产业链运营平台的研究助理。回答专业、克制，事实与观点分开，涉及价格和时效信息时说明数据日期，不确定时明确说明。';

@Controller('public/ai')
export class ContentAiController {
  constructor(private readonly ai: ContentAiService, private readonly rate: PublicRateLimitService) {}

  @Post('chat-once')
  async chatOnce(@Body() body: { messages?: ContentChatMessage[]; systemPrompt?: string }, @Req() req: Request) {
    await this.rate.assert('ai', req.ip, 30, 60);
    const messages = await this.ai.enrichPublicContext(this.messages(body.messages));
    return { content: await this.ai.chatOnce(messages) };
  }

  @Post('chat')
  async chat(@Body() body: { messages?: ContentChatMessage[]; systemPrompt?: string }, @Req() req: Request, @Res() res: Response) {
    await this.rate.assert('ai', req.ip, 30, 60);
    const controller = new AbortController();
    req.on('close', () => controller.abort());
    const messages = await this.ai.enrichPublicContext(this.messages(body.messages));
    await this.ai.chatStream(messages, res, controller.signal);
  }

  private messages(input?: ContentChatMessage[]) {
    if (!Array.isArray(input) || !input.length) throw new BadRequestException('messages 必填');
    if (input.length > 30) throw new BadRequestException('最多保留 30 条对话消息');
    const messages = input.filter((item) => ['user', 'assistant'].includes(item?.role)).map((item) => ({
      role: item.role as 'user' | 'assistant',
      content: String(item.content || '').slice(0, 4000),
    })).filter((item) => item.content.trim());
    if (!messages.length || messages.reduce((total, item) => total + item.content.length, 0) > 20_000) {
      throw new BadRequestException('对话内容为空或过长');
    }
    return [{ role: 'system' as const, content: SYSTEM_PROMPT }, ...messages];
  }
}
