'use client';

import { useState } from 'react';
import { Eye, Paperclip, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { openStoredAttachment } from '@/lib/attachment-preview';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface BusinessAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
  createdAt: string;
}

export function AttachmentPanel({
  title,
  description,
  attachments,
  uploadPath,
  attachmentPath,
  canUpload = true,
  canDelete = true,
  onChanged,
}: {
  title: string;
  description: string;
  attachments: BusinessAttachment[];
  uploadPath: string;
  attachmentPath: string;
  canUpload?: boolean;
  canDelete?: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [uploading, setUploading] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files);
    const invalid = selected.find(file => {
      const extension = file.name.toLowerCase().split('.').pop() || '';
      return !['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(extension) || !file.size || file.size > 20 * 1024 * 1024;
    });
    if (invalid) {
      alert(`${invalid.name} 无法上传：仅支持 JPG/PNG/WEBP/PDF，文件不能为空且单个不能超过 20 MB`);
      return;
    }
    setUploading(true);
    try {
      for (const file of selected) {
        const body = new FormData();
        body.append('file', file);
        await api.upload(uploadPath, body);
      }
      await onChanged();
    } catch (error: any) {
      alert(error.message || '附件上传失败');
    } finally {
      setUploading(false);
    }
  };

  const view = async (id: string) => {
    try {
      await openStoredAttachment(`${attachmentPath}/${id}/view-url`);
    } catch (error: any) {
      alert(error.message || '附件打开失败');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('确定删除此附件？')) return;
    try {
      await api.delete(`${attachmentPath}/${id}`);
      await onChanged();
    } catch (error: any) {
      alert(error.message || '附件删除失败');
    }
  };

  return <Card className="space-y-4 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="flex items-center gap-2"><Paperclip className="h-4 w-4 text-primary" /><h2 className="font-semibold">{title}</h2></div><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>
      {canUpload && <label><input className="hidden" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" disabled={uploading} onChange={event => { void upload(event.currentTarget.files); event.currentTarget.value = ''; }} /><span className="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Upload className="mr-2 h-4 w-4" />{uploading ? '上传中...' : '上传附件'}</span></label>}
    </div>
    {attachments.length ? <div className="space-y-2">{attachments.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{item.originalName}</div><div className="mt-1 text-xs text-muted-foreground">{formatSize(item.size)} · {new Date(item.createdAt).toLocaleString('zh-CN')}</div></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="sm" onClick={() => void view(item.id)}><Eye className="mr-1 h-4 w-4" />查看</Button>{canDelete && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(item.id)}><Trash2 className="mr-1 h-4 w-4" />删除</Button>}</div></div>)}</div> : <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">暂无附件</div>}
  </Card>;
}

function formatSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}
