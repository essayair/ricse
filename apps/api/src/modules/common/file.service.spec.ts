import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { FileService } from './file.service';

jest.mock('minio', () => ({
  Client: jest.fn(),
}));

describe('FileService', () => {
  const bucketExists = jest.fn().mockResolvedValue(true);
  const makeBucket = jest.fn();
  const presignedGetObject = jest.fn().mockResolvedValue(
    'https://ricse.example.com/ricse-attachments/partner/file.pdf?signed=true',
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (Minio.Client as unknown as jest.Mock).mockImplementation(() => ({
      bucketExists,
      makeBucket,
      presignedGetObject,
    }));
  });

  it('为公网客户端设置区域，生成预签名地址时无需查询公网端点', async () => {
    const values: Record<string, string> = {
      MINIO_ENDPOINT: 'minio',
      MINIO_PORT: '9000',
      MINIO_USE_SSL: 'false',
      MINIO_PUBLIC_ENDPOINT: 'ricse.example.com',
      MINIO_PUBLIC_PORT: '443',
      MINIO_PUBLIC_USE_SSL: 'true',
      MINIO_ACCESS_KEY: 'access-key',
      MINIO_SECRET_KEY: 'secret-key',
      MINIO_BUCKET: 'ricse-attachments',
      MINIO_REGION: 'us-east-1',
    };
    const configService = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    const service = new FileService(configService);
    const publicClientOptions = (Minio.Client as unknown as jest.Mock).mock.calls[1][0];

    expect(publicClientOptions).toEqual(expect.objectContaining({
      endPoint: 'ricse.example.com',
      port: 443,
      useSSL: true,
      region: 'us-east-1',
    }));
    await expect(service.getUrl('partner/file.pdf')).resolves.toContain('signed=true');
    expect(presignedGetObject).toHaveBeenCalledWith(
      'ricse-attachments',
      'partner/file.pdf',
      60 * 60,
    );
  });
});
