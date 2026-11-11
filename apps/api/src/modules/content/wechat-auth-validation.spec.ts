import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { WechatLoginDto, WechatPhoneDto } from './dto/content.dto';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const consent = { accepted: true, serviceAgreementVersion: 'v1', privacyPolicyVersion: 'v1' };

describe.each([
  ['登录', WechatLoginDto, {}],
  ['手机号授权', WechatPhoneDto, consent],
] as const)('%s授权码校验', (_label, metatype, otherFields) => {
  const validate = (code: unknown) => pipe.transform({ ...otherFields, code }, { type: 'body', metatype });

  it.each([32, 201, 1024, 4096, 4097, 8192, 65536])('接受 %i 字符凭证且完整保留原值', async length => {
    const code = 'a'.repeat(length - 4) + '+/=_';
    await expect(validate(code)).resolves.toMatchObject({ code });
  });

  it.each([undefined, null, '', '   ', '\t\n', 123, { code: 'not-a-string' }])('拒绝缺失、空白或非字符串凭证：%p', async code => {
    await expect(validate(code)).rejects.toBeInstanceOf(BadRequestException);
  });

});

it('放宽手机号授权码长度不绕过用户协议同意校验', async () => {
  await expect(pipe.transform({ ...consent, accepted: false, code: 'a'.repeat(1024) }, {
    type: 'body', metatype: WechatPhoneDto,
  })).rejects.toBeInstanceOf(BadRequestException);
});
