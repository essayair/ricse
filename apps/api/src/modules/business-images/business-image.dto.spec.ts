import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBusinessImageDto, UploadBusinessImageDto } from './business-image.dto';

describe('业务影像备注校验', () => {
  const base = { contractId: 'contract', documentType: 'OTHER', originalName: '回单.pdf', sourceOriginalName: '回单.pdf', clientRequestId: 'request', nameConfirmed: true };
  for (const Dto of [UploadBusinessImageDto, UpdateBusinessImageDto]) {
    it(Dto.name + '：允许省略、清空、多行与1000字备注', async () => {
      for (const remarks of [undefined, null, '', '第一行\n第二行', '字'.repeat(1000)]) {
        const value = plainToInstance(Dto as typeof UploadBusinessImageDto, { ...base, remarks });
        expect((await validate(value)).filter(e => e.property === 'remarks')).toEqual([]);
      }
    });
    it(Dto.name + '：拒绝超长或非文本备注', async () => {
      for (const remarks of ['字'.repeat(1001), { invalid: true }]) {
        const value = plainToInstance(Dto as typeof UploadBusinessImageDto, { ...base, remarks });
        expect((await validate(value)).some(e => e.property === 'remarks')).toBe(true);
      }
    });
  }
});
