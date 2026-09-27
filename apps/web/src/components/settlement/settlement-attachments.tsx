'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Eye, Paperclip, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface SettlementAttachment {
  id: string; originalName: string; mimeType: string; size: number;
}

export function SettlementAttachments({ attachments = [], uploadPath, editable, onChanged }: {
  attachments?: SettlementAttachment[]; uploadPath: string; editable: boolean; onChanged: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ name: string; mimeType: string; url: string } | null>(null);
  const upload = async (file?: File) => {
    if (!file) return;
    const data = new FormData(); data.append('file', file);
    setBusy(true);
    try { await api.upload(uploadPath, data); await onChanged(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };
  const view = async (item: SettlementAttachment) => {
    try { const result = await api.get<{ url: string }>(`/financial-settlements/attachments/${item.id}/view-url`); setPreview({ name: item.originalName, mimeType: item.mimeType, url: result.url }); }
    catch (error: any) { alert(error.message); }
  };
  const remove = async (item: SettlementAttachment) => {
    if (!confirm(`确定删除附件“${item.originalName}”吗？`)) return;
    try { await api.delete(`/financial-settlements/attachments/${item.id}`); await onChanged(); }
    catch (error: any) { alert(error.message); }
  };
  return <div className="space-y-2 rounded-md border p-3">
    <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-medium"><Paperclip className="h-4 w-4"/>业务依据与银行回单</div>{editable && <><input ref={inputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => void upload(event.target.files?.[0])}/><Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}><Upload className="mr-1 h-4 w-4"/>{busy ? '上传中…' : '上传附件'}</Button></>}</div>
    {!attachments.length ? <p className="text-xs text-muted-foreground">暂无附件，支持 JPG、PNG、WEBP、PDF，单个文件不超过 20MB。</p> : attachments.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t pt-2 text-sm"><span className="min-w-0 flex-1 truncate">{item.originalName}</span><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => void view(item)}><Eye className="mr-1 h-4 w-4"/>查看</Button>{editable && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => void remove(item)}><Trash2 className="h-4 w-4"/></Button>}</div></div>)}
    <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}><DialogContent className="h-[88vh] max-w-5xl"><DialogHeader><DialogTitle>{preview?.name}</DialogTitle></DialogHeader>{preview && (preview.mimeType === 'application/pdf' ? <iframe title={preview.name} src={preview.url} className="h-full w-full rounded-md border"/> : <div className="relative h-full w-full overflow-hidden"><Image unoptimized fill src={preview.url} alt={preview.name} className="object-contain"/></div>)}</DialogContent></Dialog>
  </div>;
}
