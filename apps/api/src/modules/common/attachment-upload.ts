import { normalizeUploadFilename } from './filename-encoding';

export type AttachmentMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

const EXTENSION_BY_MIME: Record<AttachmentMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const MIME_BY_EXTENSION: Record<string, AttachmentMimeType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/**
 * 小程序从 iOS 相册选择截图时，multipart 文件名可能没有扩展名，MIME 也可能
 * 退化为 application/octet-stream。这里以文件签名为准识别真实格式，避免把
 * 合法的 PNG/JPEG/WEBP/PDF 误判为不支持，同时拒绝仅伪造扩展名的文件。
 */
export function detectAttachmentMimeType(buffer: Buffer): AttachmentMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return 'image/png';
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp';
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

export function prepareAttachmentUpload(file: Express.Multer.File) {
  const mimeType = detectAttachmentMimeType(file.buffer);
  if (!mimeType) return null;

  const receivedName = normalizeUploadFilename(file.originalname || '').trim().slice(0, 255);
  const receivedExtension = receivedName.toLowerCase().split('.').pop() || '';
  const extensionMatches = MIME_BY_EXTENSION[receivedExtension] === mimeType;
  const baseName = (receivedName || '微信图片')
    .replace(/\.[^./\\]+$/, '')
    .trim()
    .slice(0, 245) || '微信图片';
  const originalName = extensionMatches
    ? receivedName
    : `${baseName}.${EXTENSION_BY_MIME[mimeType]}`;

  return { originalName, mimeType };
}
