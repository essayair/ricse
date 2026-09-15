import { ConfigService } from '@nestjs/config';
import { QualityPhotoRecognitionService } from './quality-photo-recognition.service';

describe('QualityPhotoRecognitionService', () => {
  it('未配置 OCR 凭据时不阻断现场照片流程', async () => {
    const service = new QualityPhotoRecognitionService(new ConfigService({}));
    await expect(service.recognize(Buffer.from('image'))).resolves.toMatchObject({
      available: false,
      success: false,
      provider: 'NONE',
      fields: {},
    });
  });

  it('从样品标签文字中提取可回填字段', () => {
    const service = new QualityPhotoRecognitionService(new ConfigService({}));
    const fields = (service as any).extractFields([
      '样品标签：A样',
      '封签编号：FX-20260914-01',
      '取样人：张三',
      '取样方法：多点混合取样',
      '送检机构：某检测中心',
    ].join('\n'));
    expect(fields).toEqual({
      sampleLabel: 'A样',
      sealNo: 'FX-20260914-01',
      samplerName: '张三',
      samplingMethod: '多点混合取样',
      destinationInstitutionName: '某检测中心',
    });
  });
});
