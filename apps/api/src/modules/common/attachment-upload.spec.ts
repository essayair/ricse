import { detectAttachmentMimeType, prepareAttachmentUpload } from './attachment-upload';

function uploadFile(originalname: string, mimetype: string, buffer: Buffer) {
  return { originalname, mimetype, buffer } as Express.Multer.File;
}

describe('attachment upload detection', () => {
  it('recognizes an iPhone PNG screenshot without relying on filename or reported MIME', () => {
    const buffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('image-data'),
    ]);
    expect(detectAttachmentMimeType(buffer)).toBe('image/png');
    expect(prepareAttachmentUpload(uploadFile('file', 'application/octet-stream', buffer))).toEqual({
      originalName: 'file.png',
      mimeType: 'image/png',
    });
  });

  it('corrects a temporary filename extension using the actual file signature', () => {
    const buffer = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('image-data')]);
    expect(prepareAttachmentUpload(uploadFile('tmp_upload.png', 'image/png', buffer))).toEqual({
      originalName: 'tmp_upload.jpg',
      mimeType: 'image/jpeg',
    });
  });

  it('rejects content that is not a supported attachment format', () => {
    expect(prepareAttachmentUpload(uploadFile('fake.png', 'image/png', Buffer.from('not-an-image')))).toBeNull();
  });
});
