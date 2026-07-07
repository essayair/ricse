import { Injectable, Logger } from '@nestjs/common';
import * as Minio from 'minio';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly client: Minio.Client;
  private readonly bucket = 'ricse-attachments';

  constructor() {
    this.client = new Minio.Client({
      endPoint: 'localhost',
      port: 9002,
      useSSL: false,
      accessKey: 'ricse',
      secretKey: 'ricse_dev',
    });
    this.ensureBucket();
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
    const ext = originalName.split('.').pop() || 'bin';
    const fileName = `partner/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    await this.client.putObject(this.bucket, fileName, buffer, buffer.length, {
      'Content-Type': mimeType,
    });

    return { fileName, size: buffer.length };
  }

  async getUrl(fileName: string): Promise<string> {
    return this.client.presignedGetObject(this.bucket, fileName, 60 * 60); // 1 hour
  }

  async delete(fileName: string): Promise<void> {
    await this.client.removeObject(this.bucket, fileName);
  }
}
