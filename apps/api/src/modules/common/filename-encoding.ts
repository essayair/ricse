/**
 * Multer/Busboy may expose the UTF-8 bytes of a multipart filename as Latin-1.
 * Decode only names whose characters all fit in one byte and form valid UTF-8,
 * so already-correct Chinese and genuine Latin filenames remain unchanged.
 */
export function normalizeUploadFilename(name: string): string {
  if ([...name].some((char) => char.charCodeAt(0) > 0xff)) return name;

  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}
