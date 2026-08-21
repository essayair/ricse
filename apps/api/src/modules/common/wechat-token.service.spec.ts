import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WechatTokenService } from './wechat-token.service';

describe('WechatTokenService', () => {
  let service: WechatTokenService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WechatTokenService,
        { provide: ConfigService, useValue: { get: (key: string) => key === 'WECHAT_TOKEN_SECRET' ? 'test-secret' : undefined } },
      ],
    }).compile();
    service = module.get(WechatTokenService);
  });

  it('内容 API 和核心 API 可使用同一密钥签发并验证小程序身份', () => {
    const token = service.sign('openid-1');
    expect(service.verify(token)).toBe('openid-1');
    expect(service.verifyBearer(`Bearer ${token}`)).toBe('openid-1');
  });
});
