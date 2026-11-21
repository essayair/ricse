import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateContractDto } from './create-contract.dto';
import { UpdateContractDto } from './update-contract.dto';

describe('双边合同选填联系人 DTO', () => {
  const base = { title: '测试双边合同', type: 'BILATERAL', totalAmount: 0, lineItems: [] };
  it('两侧联系人均可不填，不增加提交必填约束', async () => {
    expect(await validate(plainToInstance(CreateContractDto, base))).toEqual([]);
    expect(await validate(plainToInstance(UpdateContractDto, {}))).toEqual([]);
  });
  it('允许独立写入或清空姓名和电话，不限制为个人手机号', async () => {
    const contacts = { purchaseContactPerson: '供方', purchaseContactPhone: '0570-1234567 转 8', salesContactPerson: '', salesContactPhone: '' };
    expect(await validate(plainToInstance(CreateContractDto, { ...base, ...contacts }), { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(await validate(plainToInstance(UpdateContractDto, contacts), { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });
});
