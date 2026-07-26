import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly client: Minio.Client;
  private readonly publicClient: Minio.Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const accessKey = this.configService.get<string>('MINIO_ACCESS_KEY') || 'ricse';
    const secretKey = this.configService.get<string>('MINIO_SECRET_KEY') || 'ricse_dev';
    const region = this.configService.get<string>('MINIO_REGION') || 'us-east-1';
    const internalEndpoint = this.parseEndpoint(
      this.configService.get<string>('MINIO_ENDPOINT') || 'localhost',
      this.configService.get<string>('MINIO_PORT'),
      this.configService.get<string>('MINIO_USE_SSL'),
      9002,
      false,
    );
    const publicEndpoint = this.parseEndpoint(
      this.configService.get<string>('MINIO_PUBLIC_ENDPOINT') || internalEndpoint.endPoint,
      this.configService.get<string>('MINIO_PUBLIC_PORT'),
      this.configService.get<string>('MINIO_PUBLIC_USE_SSL'),
      internalEndpoint.port,
      internalEndpoint.useSSL,
    );

    this.bucket = this.configService.get<string>('MINIO_BUCKET') || 'ricse-attachments';
    this.client = new Minio.Client({ ...internalEndpoint, accessKey, secretKey });
    // 明确区域后，MinIO SDK 生成预签名地址时不再通过公网域名查询存储桶区域。
    // 线上 API 位于 internal Docker 网络，不能依赖公网 DNS 完成这一步。
    this.publicClient = new Minio.Client({ ...publicEndpoint, accessKey, secretKey, region });
    void this.ensureBucket();
  }

  private parseEndpoint(
    rawEndpoint: string,
    configuredPort: string | undefined,
    configuredSsl: string | undefined,
    defaultPort: number,
    defaultSsl: boolean,
  ): { endPoint: string; port: number; useSSL: boolean } {
    const withProtocol = rawEndpoint.includes('://') ? rawEndpoint : `http://${rawEndpoint}`;
    const parsed = new URL(withProtocol);
    const useSSL = configuredSsl === undefined
      ? (rawEndpoint.includes('://') ? parsed.protocol === 'https:' : defaultSsl)
      : configuredSsl.toLowerCase() === 'true';
    const port = Number(configuredPort || parsed.port || (useSSL ? 443 : defaultPort));

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`MINIO 端口配置无效: ${configuredPort || parsed.port}`);
    }

    return { endPoint: parsed.hostname, port, useSSL };
  }

  private async ensureBucket() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Bucket "${this.bucket}" created`);
      }
    } catch (e) {
      this.logger.error('Failed to ensure bucket', e);
    }
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<{ fileName: string; size: number }> {
    await this.ensureBucket();
    const ext = originalName.split('.').pop() || 'bin';
    const fileName = `partner/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    await this.client.putObject(this.bucket, fileName, buffer, buffer.length, {
      'Content-Type': mimeType,
    });

    return { fileName, size: buffer.length };
  }

  async getUrl(fileName: string): Promise<string> {
    return this.publicClient.presignedGetObject(this.bucket, fileName, 60 * 60); // 1 hour
  }

  async delete(fileName: string): Promise<void> {
    await this.client.removeObject(this.bucket, fileName);
  }
}
