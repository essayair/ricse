import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { FileService } from '../common/file.service';

const exec = promisify(execFile);

@Injectable()
export class BusinessImagePreviewService {
  private readonly logger = new Logger(BusinessImagePreviewService.name);
  private readonly pending = new Map<string, Promise<string | null>>();
  constructor(private readonly files: FileService) {}

  async render(buffer: Buffer, mimeType: string): Promise<Buffer> {
    if (mimeType !== 'application/pdf') {
      // 原生缩略图库异常不得影响核心交易 API 启动。
      const sharp = (await import('sharp')).default;
      return sharp(buffer, { limitInputPixels: 40_000_000 }).rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).timeout({ seconds: 10 }).toBuffer();
    }
    const dir = await fs.mkdtemp(join(tmpdir(), 'ricse-preview-'));
    try {
      await fs.writeFile(join(dir, 'original.pdf'), buffer);
      await exec('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '1200', '-jpeg', join(dir, 'original.pdf'), join(dir, 'page')], { timeout: 12_000, maxBuffer: 128 * 1024 });
      return await fs.readFile(join(dir, 'page.jpg'));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  async ensure(fileName: string, mimeType: string, buffer?: Buffer): Promise<string | null> {
    const cached = await this.files.previewUrl(fileName);
    if (cached) return cached;
    if (this.pending.has(fileName)) return this.pending.get(fileName)!;
    // 限制并发，避免 PDF 渲染占用交易 API 的全部资源；超出时仍可查看原件。
    if (this.pending.size >= 2) return null;
    const task = (async () => {
      try {
        const preview = await this.render(buffer || await this.files.download(fileName), mimeType);
        await this.files.uploadPreview(fileName, preview);
        return await this.files.previewUrl(fileName);
      } catch {
        this.logger.warn('影像缩略图生成失败，保留原件查看入口');
        return null;
      } finally { this.pending.delete(fileName); }
    })();
    this.pending.set(fileName, task);
    return task;
  }
}
