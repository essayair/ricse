import { Body, Controller, INestApplication, Post, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureContentHttp } from '../../content-http';
import { WechatController } from './wechat.controller';
import { WechatAuthService } from './wechat-auth.service';
import { PublicRateLimitService } from './public-rate-limit.service';

jest.mock('./wechat-auth.service', () => ({ WechatAuthService: class WechatAuthService {} }));

@Controller('content-http-regression')
class OtherJsonController {
  @Post()
  echo(@Body() body: Record<string, unknown>) { return body; }
}

describe('微信授权 HTTP 边界', () => {
  let app: INestApplication;
  const auth = { login: jest.fn(), verifyBearer: jest.fn(), bindVerifiedPhone: jest.fn() };
  const rate = { assert: jest.fn() };
  const consent = { accepted: true, serviceAgreementVersion: 'v1', privacyPolicyVersion: 'v1' };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [WechatController, OtherJsonController], providers: [
      { provide: WechatAuthService, useValue: auth }, { provide: PublicRateLimitService, useValue: rate },
    ] }).compile();
    app = module.createNestApplication({ logger: false });
    configureContentHttp(app);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    rate.assert.mockResolvedValue(undefined);
    auth.login.mockResolvedValue({ token: 'test-only' });
    auth.verifyBearer.mockReturnValue('test-openid');
    auth.bindVerifiedPhone.mockResolvedValue({ verified: true });
  });
  afterAll(async () => app?.close());

  it.each([4097, 8192, 65536])('%i字符登录凭证完整交给微信认证服务，不受旧长度假设拦截', async length => {
    const code = 'a'.repeat(length - 4) + '+/=_';
    const response = await request(app.getHttpServer()).post('/api/v1/public/wechat/login').send({ code }).expect(201);
    expect(auth.login).toHaveBeenCalledWith(code, { nickName: undefined, avatarUrl: undefined });
    expect(rate.assert).toHaveBeenCalledWith('wechat-login', expect.any(String), 20, 60);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('手机号长授权码保留原值，并保留身份验证和限流', async () => {
    const code = 'b'.repeat(8192);
    await request(app.getHttpServer()).post('/api/v1/public/wechat/phone').set('Authorization', 'Bearer test-only').send({ code, ...consent }).expect(201);
    expect(auth.verifyBearer).toHaveBeenCalledWith('Bearer test-only');
    expect(auth.bindVerifiedPhone).toHaveBeenCalledWith('test-openid', { code, ...consent });
    expect(rate.assert).toHaveBeenCalledWith('wechat-phone', expect.stringContaining('test-openid:'), 10, 3600);
  });
  it('仍拒绝空值、非字符串、额外字段及未同意协议', async () => {
    for (const body of [{ code: '' }, { code: ' ' }, { code: 123 }, { code: { data: 'x' } }, { code: 'x', bypass: true }]) {
      await request(app.getHttpServer()).post('/api/v1/public/wechat/login').send(body).expect(400);
    }
    await request(app.getHttpServer()).post('/api/v1/public/wechat/phone').send({ ...consent, accepted: false, code: 'x'.repeat(8192) }).expect(400);
    expect(auth.login).not.toHaveBeenCalled();
    expect(auth.bindVerifiedPhone).not.toHaveBeenCalled();
  });
  it('超过100KB按请求体拒绝，不进入认证、不截断凭证', async () => {
    for (const path of ['login', 'phone']) {
      const response = await request(app.getHttpServer()).post(`/api/v1/public/wechat/${path}`).send({ code: 'x'.repeat(101 * 1024), ...(path === 'phone' ? consent : {}) }).expect(413);
      expect(response.body.message).toContain('登录请求内容过大');
    }
    expect(auth.login).not.toHaveBeenCalled();
    expect(auth.bindVerifiedPhone).not.toHaveBeenCalled();
  });
  it('非法JSON返回具体400提示', async () => {
    await request(app.getHttpServer()).post('/api/v1/public/wechat/login').type('json').send('{broken').expect(400).expect(({ body }) => expect(body.message).toContain('登录请求格式不正确'));
  });
  it('通过长度校验不等于通过微信认证，官方验证失败仍然拒绝', async () => {
    auth.login.mockRejectedValue(new UnauthorizedException('微信登录失败：code 无效'));
    await request(app.getHttpServer()).post('/api/v1/public/wechat/login').send({ code: 'x'.repeat(8192) }).expect(401);
  });
  it('官网局部解析器不阻止其他内容API解析JSON正文', async () => {
    const payload = { title: '资讯编辑', nested: { enabled: true }, items: ['a', 'b'] };
    const response = await request(app.getHttpServer()).post('/api/v1/content-http-regression').send(payload).expect(201);
    expect(response.body).toEqual(payload);
  });
});
