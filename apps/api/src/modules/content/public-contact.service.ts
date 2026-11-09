import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ContentService } from './content.service';
import { PublicRateLimitService } from './public-rate-limit.service';
import { PublicCreateContactDto } from './dto/content.dto';

const TTL = 15 * 60;
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const response = () => ({ success: true, message: '提交成功，我们将尽快与您联系。' });

@Injectable()
export class PublicContactService {
  constructor(private readonly content: ContentService, private readonly rate: PublicRateLimitService, private readonly config: ConfigService) {}

  private sign(value: string) {
    const secret = this.config.get<string>('PUBLIC_FORM_SECRET') || this.config.get<string>('JWT_SECRET');
    if (!secret) throw new ServiceUnavailableException('提交服务暂时不可用，请稍后再试');
    return createHmac('sha256', secret).update(`ricse:public-contact:v1:${value}`).digest('base64url');
  }

  async issue(ip: string, userAgent: string) {
    await this.rate.assert('contact-token-minute', ip, 10, 60, true);
    await this.rate.assert('contact-token-hour', ip, 40, 3600, true);
    const issuedAt = Date.now();
    const payload = Buffer.from(JSON.stringify({ nonce: randomUUID(), issuedAt, expiresAt: issuedAt + TTL * 1000,
      identity: digest(`${ip}\n${userAgent}`) })).toString('base64url');
    return { token: `${payload}.${this.sign(payload)}`, expiresAt: new Date(issuedAt + TTL * 1000).toISOString(), minWaitMs: 2000 };
  }

  private verify(token: string, ip: string, userAgent: string) {
    const invalid = () => new BadRequestException('提交凭证无效或已过期，请刷新表单后重试');
    const parts = token.split('.');
    if (parts.length !== 2) throw invalid();
    const expected = Buffer.from(this.sign(parts[0])), received = Buffer.from(parts[1]);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw invalid();
    let data: { nonce?: string; issuedAt?: number; expiresAt?: number; identity?: string };
    try { data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { throw invalid(); }
    const now = Date.now();
    if (!data.nonce || !Number.isFinite(data.issuedAt) || !Number.isFinite(data.expiresAt)
      || data.identity !== digest(`${ip}\n${userAgent}`) || now > data.expiresAt! || now < data.issuedAt!
      || data.expiresAt! - data.issuedAt! !== TTL * 1000) throw invalid();
    if (now - data.issuedAt! < 2000) throw new BadRequestException('请稍候再提交');
    return data.nonce;
  }

  async submit(dto: PublicCreateContactDto, ip: string, userAgent: string) {
    // 尝试次数也计入限流，伪造token或隐藏字段不能绕过。
    await this.rate.assert('contact-minute', ip, 3, 60, true);
    await this.rate.assert('contact-hour', ip, 5, 3600, true);
    if (dto.website?.trim()) throw new BadRequestException('提交未完成，请刷新表单后重试');
    const nonce = this.verify(dto.submissionToken, ip, userAgent);
    if (!await this.rate.claim('contact-nonce', nonce, 'used', TTL)) throw new BadRequestException('提交凭证已使用，请刷新表单后重试');
    const data = { name: dto.name.trim(), company: dto.company?.trim(), phone: dto.phone.trim(), email: dto.email?.trim().toLowerCase(),
      message: dto.message.trim(), sourcePage: dto.sourcePage?.trim() };
    const fingerprint = digest(JSON.stringify([data.name, data.company || '', data.phone.toLowerCase(), data.email || '', data.message]));
    if (await this.rate.has('contact-accepted', fingerprint)) return response();
    const owner = randomUUID();
    if (!await this.rate.claim('contact-pending', fingerprint, owner, 60)) throw new ConflictException('相同内容正在提交，请稍后查看提交结果');
    try {
      // 锁后复查，覆盖前一请求恰好完成并释放锁的并发窗口。
      if (await this.rate.has('contact-accepted', fingerprint)) return response();
      await this.rate.assert('contact-phone-day', data.phone.toLowerCase().replace(/[\s()-]/g, ''), 3, 86400, true);
      await this.rate.assert('contact-global-minute', 'all', 20, 60, true);
      await this.rate.assert('contact-global-day', 'all', 200, 86400, true);
      // 即使入库后Redis故障，下次也可从数据库核对最近24小时完全相同内容，避免重复写入。
      await this.content.createContactOnce(data, ip);
      await this.rate.remember('contact-accepted', fingerprint, 86400);
      return response();
    } finally { await this.rate.release('contact-pending', fingerprint, owner); }
  }
}
