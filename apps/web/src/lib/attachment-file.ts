const SUPPORTED_ATTACHMENT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

export function attachmentFileError(file: File): string | null {
  const extension = file.name.toLowerCase().split('.').pop() || '';
  if (!SUPPORTED_ATTACHMENT_EXTENSIONS.has(extension)) {
    return `${file.name} 无法上传：仅支持 JPG、PNG、WEBP、PDF 格式`;
  }
  if (!file.size) return `${file.name} 无法上传：文件内容为空`;
  if (file.size > MAX_ATTACHMENT_SIZE) return `${file.name} 无法上传：单个文件不能超过 20 MB`;
  return null;
}

export function selectValidAttachmentFiles(files: File[]): File[] {
  const invalid = files.map(file => attachmentFileError(file)).find(Boolean);
  if (invalid) alert(invalid);
  return files.filter(file => !attachmentFileError(file));
}

export async function attachmentUploadError(response: Response, fileName: string): Promise<string> {
  if (response.status === 413) return `${fileName} 上传失败：单个文件不能超过 20 MB`;
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join('；') : body.message;
    if (message) return `${fileName} 上传失败：${message}`;
  } catch {
    // 网关或代理可能返回非 JSON 错误，继续使用状态码给出可排查提示。
  }
  return `${fileName} 上传失败（HTTP ${response.status}）`;
}
