import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureContentHttp } from '../../content-http';
import { PublicContentController } from './public-content.controller';
import { PublicContactService } from './public-contact.service';
import { PublicRateLimitService } from './public-rate-limit.service';
import { ContentService } from './content.service';
import { WechatAuthService } from './wechat-auth.service';
import { FileService } from '../common/file.service';

jest.mock('./content.service', () => ({ ContentService: class ContentService {} }));
jest.mock('./wechat-auth.service', () => ({ WechatAuthService: class WechatAuthService {} }));
jest.mock('../common/file.service', () => ({ FileService: class FileService {} }));

describe('官网合作意向 HTTP 边界', () => {
  let app: INestApplication;
  let now = Date.parse('2026-11-09T00:00:00Z');
  const claims = new Set<string>(), accepted = new Set<string>();
  const content = { createContactOnce: jest.fn() };
  const fields = { name: '测试访客', company: '测试企业', phone: '13800000000', message: '合作咨询', website: '' };
  const path = '/api/v1/public/content/contacts';
  const proxyChain = '198.51.100.11, 203.0.113.20, 172.20.0.3';
  const rate = {
    assert: jest.fn().mockResolvedValue(undefined),
    claim: jest.fn(async (scope, id) => { const key = `${scope}:${id}`; if (claims.has(key)) return false; claims.add(key); return true; }),
    has: jest.fn(async (_scope, id) => accepted.has(id)),
    remember: jest.fn(async (_scope, id) => { accepted.add(id); }),
    release: jest.fn(async (scope, id) => { claims.delete(`${scope}:${id}`); }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicContentController],
      providers: [PublicContactService,
        { provide: ContentService, useValue: content }, { provide: PublicRateLimitService, useValue: rate },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? 'test-only-secret' : undefined } },
        { provide: WechatAuthService, useValue: {} }, { provide: FileService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureContentHttp(app);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks(); claims.clear(); accepted.clear();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => app?.close());
  const token = async () => {
    const res = await request(app.getHttpServer()).get(`${path}/submission-token`).set('User-Agent', 'Test Browser').set('X-Forwarded-For', proxyChain).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    now += 2100;
    return res.body.token;
  };
  const submit = (body: object) => request(app.getHttpServer()).post(path).set('User-Agent', 'Test Browser').set('X-Forwarded-For', proxyChain).send(body);

  it('真实路由可提交；客户端不能伪造 XFF 左侧地址绕过绑定；响应不暴露个人资料', async () => {
    const submissionToken = await token();
    const res = await request(app.getHttpServer()).post(path).set('User-Agent', 'Test Browser')
      .set('X-Forwarded-For', '192.0.2.99, 203.0.113.20, 172.20.0.3').send({ ...fields, submissionToken }).expect(201);
    expect(res.body).toEqual({ success: true, message: '提交成功，我们将尽快与您联系。' });
    expect(content.createContactOnce).toHaveBeenCalledWith(expect.objectContaining(fieldsWithoutHoneypot()), '203.0.113.20');
  });
  it('白名单、字段类型、空值和联系方式均在服务端校验', async () => {
    for (const patch of [{ status: 'COMPLETED' }, { assigneeId: 'someone' }, { company: null }, { name: '  ' }, { phone: 'bad' }, { message: 'x'.repeat(5001) }]) {
      await submit({ ...fields, submissionToken: 'unused', ...patch }).expect(400);
    }
    expect(content.createContactOnce).not.toHaveBeenCalled();
  });
  it('仅接受 JSON，错误 JSON 返回400，超过24KB的正文返回413', async () => {
    await request(app.getHttpServer()).post(path).type('form').send(fields).expect(415);
    await request(app.getHttpServer()).post(path).type('json').send('{broken').expect(400);
    await submit({ ...fields, message: 'x'.repeat(25 * 1024), submissionToken: 'unused' }).expect(413);
    expect(content.createContactOnce).not.toHaveBeenCalled();
  });
  it('重复凭证不写入、来源IP变化不接受原凭证', async () => {
    const submissionToken = await token();
    await submit({ ...fields, submissionToken }).expect(201);
    await submit({ ...fields, submissionToken }).expect(400);
    const another = await token();
    await request(app.getHttpServer()).post(path).set('User-Agent', 'Test Browser')
      .set('X-Forwarded-For', '203.0.113.21, 172.20.0.3').send({ ...fields, submissionToken: another }).expect(400);
    expect(content.createContactOnce).toHaveBeenCalledTimes(1);
  });
});

function fieldsWithoutHoneypot() {
  return { name: '测试访客', company: '测试企业', phone: '13800000000', message: '合作咨询' };
}
