import { ConfigService } from '@nestjs/config';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { PublicContactService } from './public-contact.service';
import { ContentService } from './content.service';
import { PublicRateLimitService } from './public-rate-limit.service';

// 业务存储在本组测试中替身隔离，不加载文章清洗器等无关依赖。
jest.mock('./content.service', () => ({ ContentService: class ContentService {} }));

describe('合作意向匿名写入防护', () => {
  const content = { createContactOnce: jest.fn() };
  const claims = new Map<string, string>(), accepted = new Set<string>();
  const rate = { assert: jest.fn(), claim: jest.fn(), has: jest.fn(), remember: jest.fn(), release: jest.fn() };
  const config = { get: jest.fn() };
  const service = new PublicContactService(content as unknown as ContentService, rate as unknown as PublicRateLimitService, config as unknown as ConfigService);
  const ip = '203.0.113.12', ua = 'Test Browser';
  const fields = { name: ' 测试访客 ', company: ' 测试企业 ', phone: '13800000000', message: ' 产业合作 ', sourcePage: '/about', website: '' };
  const token = async () => { const result = await service.issue(ip, ua); jest.advanceTimersByTime(2100); return result.token; };
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-09T00:00:00Z')); jest.clearAllMocks(); claims.clear(); accepted.clear();
    config.get.mockImplementation(key => key === 'JWT_SECRET' ? 'test-only-secret-not-used-in-production' : undefined);
    rate.assert.mockResolvedValue(undefined); content.createContactOnce.mockResolvedValue(undefined);
    rate.claim.mockImplementation(async (scope, identity, owner) => { const key = `${scope}:${identity}`; if (claims.has(key)) return false; claims.set(key, owner); return true; });
    rate.has.mockImplementation(async (_scope, identity) => accepted.has(identity));
    rate.remember.mockImplementation(async (_scope, identity) => { accepted.add(identity); });
    rate.release.mockImplementation(async (scope, identity, owner) => { const key = `${scope}:${identity}`; if (claims.get(key) === owner) claims.delete(key); });
  });
  afterEach(() => jest.useRealTimers());

  it('有效请求只写白名单字段，公开响应不回传主键、联系方式和IP', async () => {
    const result = await service.submit({ ...fields, submissionToken: await token() }, ip, ua);
    expect(result).toEqual({ success: true, message: '提交成功，我们将尽快与您联系。' });
    expect(content.createContactOnce).toHaveBeenCalledWith({ name: '测试访客', company: '测试企业', phone: '13800000000', message: '产业合作', sourcePage: '/about', email: undefined }, ip);
    expect(rate.assert).toHaveBeenCalledWith('contact-hour', ip, 5, 3600, true);
    expect(rate.assert).toHaveBeenCalledWith('contact-phone-day', '13800000000', 3, 86400, true);
    expect(rate.assert).toHaveBeenCalledWith('contact-global-day', 'all', 200, 86400, true);
  });
  it('伪造凭证、隐藏字段和同一凭证重放不能入库', async () => {
    await expect(service.submit({ ...fields, submissionToken: 'forged.token' }, ip, ua)).rejects.toThrow('提交凭证无效');
    const valid = await token();
    await expect(service.submit({ ...fields, website: 'bot-value', submissionToken: valid }, ip, ua)).rejects.toThrow('提交未完成');
    await service.submit({ ...fields, submissionToken: valid }, ip, ua);
    await expect(service.submit({ ...fields, submissionToken: valid }, ip, ua)).rejects.toThrow('提交凭证已使用');
    expect(content.createContactOnce).toHaveBeenCalledTimes(1);
  });
  it('凭证绑定来源IP和浏览器，且有最短填写时间和有效期', async () => {
    const fast = await service.issue(ip, ua);
    await expect(service.submit({ ...fields, submissionToken: fast.token }, ip, ua)).rejects.toThrow('请稍候');
    jest.advanceTimersByTime(2100);
    await expect(service.submit({ ...fields, submissionToken: fast.token }, '203.0.113.13', ua)).rejects.toThrow('提交凭证无效');
    await expect(service.submit({ ...fields, submissionToken: fast.token }, ip, 'Other browser')).rejects.toThrow('提交凭证无效');
    jest.advanceTimersByTime(15 * 60 * 1000);
    await expect(service.submit({ ...fields, submissionToken: fast.token }, ip, ua)).rejects.toThrow('提交凭证无效');
    expect(content.createContactOnce).not.toHaveBeenCalled();
  });
  it('相同内容换凭证重复提交，24小时只入库一次，返回相同成功反馈', async () => {
    await service.submit({ ...fields, submissionToken: await token() }, ip, ua);
    expect(await service.submit({ ...fields, submissionToken: await token() }, ip, ua)).toEqual({ success: true, message: '提交成功，我们将尽快与您联系。' });
    expect(content.createContactOnce).toHaveBeenCalledTimes(1);
  });
  it('并发相同内容只允许一笔执行入库', async () => {
    const first = await token(), second = await token();
    let finish!: () => void;
    content.createContactOnce.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const pending = service.submit({ ...fields, submissionToken: first }, ip, ua);
    for (let i = 0; i < 15 && !finish; i++) await Promise.resolve();
    expect(finish).toBeDefined();
    await expect(service.submit({ ...fields, submissionToken: second }, ip, ua)).rejects.toBeInstanceOf(ConflictException);
    finish(); await pending;
    expect(content.createContactOnce).toHaveBeenCalledTimes(1);
  });
  it('入库失败释放处理中锁，下一次使用新凭证可重试', async () => {
    content.createContactOnce.mockRejectedValueOnce(new Error('test db failure'));
    await expect(service.submit({ ...fields, submissionToken: await token() }, ip, ua)).rejects.toThrow('test db failure');
    await expect(service.submit({ ...fields, submissionToken: await token() }, ip, ua)).resolves.toHaveProperty('success', true);
    expect(content.createContactOnce).toHaveBeenCalledTimes(2);
  });
  it('Redis/限流故障不再允许匿名入库，缺少签名密钥同样拒绝', async () => {
    const valid = await token(); rate.assert.mockRejectedValueOnce(new ServiceUnavailableException('提交服务暂时不可用'));
    await expect(service.submit({ ...fields, submissionToken: valid }, ip, ua)).rejects.toBeInstanceOf(ServiceUnavailableException);
    config.get.mockReturnValue(undefined);
    await expect(service.issue(ip, ua)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(content.createContactOnce).not.toHaveBeenCalled();
  });
});
