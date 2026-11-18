'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import { api, API_BASE_URL } from '@/lib/api';
import { attachmentFileError, attachmentUploadError, pastedAttachmentFiles, readClipboardAttachmentFiles } from '@/lib/attachment-file';
import { openLocalAttachment } from '@/lib/attachment-preview';
import { confirmAction } from '@/lib/system-dialog';
import { applyArchiveBatchType, archiveBatchTypeError, archiveRowErrors } from '@/lib/business-image-validation';
import { LocalAttachmentThumbnail } from '@/components/attachment-thumbnail';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ContractOption, ContractPicker, FieldSelect, IMAGE_TYPES, NoticeOption, compressOrdinaryPhoto, sizeText } from '@/components/business-images/shared';

type Item = { key: string; file: File; name: string; type: string; remarks: string; confirmed: boolean; status: 'READY' | 'UPLOADING' | 'DONE' | 'ERROR'; error?: string; result?: string; savedSize?: number };
export default function NewBusinessImagesPage() {
  const router = useRouter(); const params = useSearchParams(); const [contract, setContract] = useState<ContractOption | null>(null); const [notice, setNotice] = useState(''); const [notices, setNotices] = useState<NoticeOption[]>([]);
  const [type, setType] = useState(''); const [compress, setCompress] = useState(true); const [items, setItems] = useState<Item[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [validating, setValidating] = useState(false);
  const typeRef = useRef(type); typeRef.current = type;
  const hasArchived = items.some(i => i.status === 'DONE');
  const input = useRef<HTMLInputElement>(null); const rows = useRef(items); rows.current = items; const hasPending = items.some(i => i.status !== 'DONE');
  const fieldErrors = validating ? archiveRowErrors(items) : {};
  useEffect(() => { const before = (e: BeforeUnloadEvent) => { if (rows.current.some(i => i.status !== 'DONE')) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before); }, []);
  useEffect(() => {
    const leave = (event: MouseEvent) => {
      if (!rows.current.some(i => i.status !== 'DONE')) return;
      const anchor = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.href === window.location.href || new URL(anchor.href).hash && new URL(anchor.href).pathname === window.location.pathname) return;
      event.preventDefault(); event.stopPropagation();
      if (rows.current.some(i => i.status === 'UPLOADING')) { setError('正在归档，请等待上传完成后离开'); return; }
      void confirmAction('还有未归档的文件，确认离开？已归档的资料会保留。', { title: '资料尚未全部归档', confirmText: '离开', cancelText: '继续归档' }).then(ok => { if (ok) router.push(anchor.href); });
    };
    document.addEventListener('click', leave, true);
    return () => document.removeEventListener('click', leave, true);
  }, [router]);
  useEffect(() => { const id = params.get('contractId'); if (id) void api.get<ContractOption>(`/contracts/${encodeURIComponent(id)}`).then(value => setContract({ id: value.id, title: value.title, contractNo: value.contractNo })).catch(e => setError(e.message)); }, [params]);
  useEffect(() => { let current = true; setNotice(''); setNotices([]); if (contract) void api.get<NoticeOption[]>(`/business-images/notices?contractId=${contract.id}`).then(value => { if (current) setNotices(value); }).catch(e => { if (current) setError(e.message); }); return () => { current = false; }; }, [contract]);
  function add(files: File[]) { if (busy || !files.length) return; const selectedType = typeRef.current; if (!selectedType || !IMAGE_TYPES[selectedType]) { setError('请先选择影像类型，再添加文件'); return; } const errors = files.map(attachmentFileError).filter(Boolean); setError(errors.join('；')); const valid = files.filter(f => !attachmentFileError(f)); setItems(prev => [...prev, ...valid.filter(file => !prev.some(i => i.file.name === file.name && i.file.size === file.size && i.file.lastModified === file.lastModified)).map(file => ({ key: crypto.randomUUID(), file, name: file.name, type: selectedType, remarks: '', confirmed: false, status: 'READY' as const }))]); }
  function changeBatchType(value: string) {
    if (busy || hasArchived || value === type) return;
    typeRef.current = value; setType(value); setItems(prev => applyArchiveBatchType(prev, value)); setError(''); setValidating(false);
  }
  function startNewBatch() {
    if (busy || hasPending) return;
    setItems([]); setType(''); typeRef.current = ''; setError(''); setValidating(false);
  }
  const change = (key: string, data: Partial<Item>) => setItems(prev => prev.map(i => i.key === key ? { ...i, ...data } : i));
  async function upload(onlyKey?: string) {
    if (busy) return; const selected = rows.current.filter(i => i.status !== 'DONE' && (!onlyKey || i.key === onlyKey));
    setValidating(true);
    const batchError = archiveBatchTypeError(typeRef.current, selected);
    if (batchError) { setError(batchError); return; }
    const invalid = archiveRowErrors(rows.current);
    if (selected.some(row => invalid[row.key]?.name || invalid[row.key]?.type || invalid[row.key]?.remarks)) { setError('请检查标红的填写项，修正后再归档'); return; }
    if (!contract) { setError('请选择归档合同'); return; } if (!selected.length) return; if (selected.some(i => !i.name.trim() || !i.confirmed)) { setError('请逐份核对资料名称，并勾选“名称已核对”'); return; }
    setBusy(true); setError(''); let index = 0;
    async function worker() { while (index < selected.length) { const row = selected[index++]; change(row.key, { status: 'UPLOADING', error: '' }); try {
      let file = row.file; if (compress && ['SCENE_PHOTO', 'VEHICLE_PHOTO'].includes(row.type)) { try { file = await compressOrdinaryPhoto(file); } catch { file = row.file; } }
      const body = new FormData(); body.append('file', file); body.append('contractId', contract!.id); if (notice) body.append('dispatchNoticeId', notice); body.append('documentType', row.type); body.append('originalName', row.name.trim()); body.append('sourceOriginalName', row.file.name); body.append('remarks', row.remarks.trim()); body.append('clientRequestId', row.key); body.append('nameConfirmed', 'true'); body.append('originalSize', String(row.file.size)); body.append('photoCompressed', String(file !== row.file));
      const token = localStorage.getItem('token'); const response = await fetch(`${API_BASE_URL}/business-images`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body }); if (!response.ok) throw new Error(await attachmentUploadError(response, row.name)); const result = await response.json() as { duplicate: boolean; originalName: string; size: number; remarks: string; documentType: string }; change(row.key, { status: 'DONE', result: result.duplicate ? `相同资料已归档${result.documentType !== row.type ? `（${IMAGE_TYPES[result.documentType] || result.documentType}）` : ''}，未重复上传` : '归档成功', savedSize: result.size, name: result.originalName, remarks: result.remarks || '', type: result.documentType });
    } catch (e) { change(row.key, { status: 'ERROR', error: e instanceof Error ? e.message : '上传失败，请重试' }); } } }
    try { await Promise.all([worker(), worker()]); } finally { setBusy(false); }
  }
  async function back() { if (busy) return; if (!hasPending || await confirmAction('还有未归档的文件，确认离开？已成功归档的资料会保留。', { title: '资料尚未全部归档', confirmText: '离开', cancelText: '继续归档' })) router.push('/dashboard/business-images'); }
  return <div className="space-y-5" onPaste={e => { const files = pastedAttachmentFiles(e.clipboardData); if (files.length) { e.preventDefault(); add(files); } }}>
    <div className="flex items-center gap-3"><Button variant="ghost" size="icon" aria-label="返回业务影像" onClick={() => void back()}><ArrowLeft className="h-5 w-5" /></Button><h1 className="text-2xl font-bold">归档业务影像</h1></div>
    <Card className="grid gap-4 p-5 md:grid-cols-2"><label className="space-y-2 text-sm"><span>归档合同 *</span><ContractPicker value={contract} disabled={busy || items.some(i => i.status === 'DONE')} onChange={setContract} /></label><label className="space-y-2 text-sm"><span>执行通知</span><FieldSelect className="w-full" value={notice} onChange={e => setNotice(e.target.value)} disabled={!contract || busy || items.some(i => i.status === 'DONE')}><option value="">不指定</option>{notices.map(n => <option key={n.id} value={n.id}>{n.noticeNo}</option>)}</FieldSelect></label></Card>
    <Card className="p-5" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); add(Array.from(e.dataTransfer.files)); }}><div className="flex flex-wrap items-center gap-3"><label className="flex flex-wrap items-center gap-2 text-sm"><span>影像类型 *</span><FieldSelect aria-label="本批影像类型" value={type} onChange={e => changeBatchType(e.target.value)} disabled={busy || hasArchived}><option value="">请选择影像类型</option>{Object.entries(IMAGE_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</FieldSelect></label><Button type="button" variant="outline" disabled={busy || !type} onClick={() => input.current?.click()}><Plus className="mr-2 h-4 w-4" />添加文件</Button><Button variant="outline" disabled={busy || !type} onClick={() => void readClipboardAttachmentFiles().then(add).catch(e => setError(e.message))}><ClipboardPaste className="mr-2 h-4 w-4" />粘贴文件</Button><input ref={input} hidden multiple type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={e => { add(Array.from(e.target.files || [])); e.target.value = ''; }} /></div>{!type && <p className="mt-3 text-sm text-muted-foreground">请先选择影像类型，再添加文件。</p>}{hasArchived && <p className="mt-3 text-sm text-muted-foreground">本批已有归档资料，类型已锁定。上传其他类型请开始新一批。</p>}<p className="mt-3 text-sm text-muted-foreground">支持拖入、粘贴图片或 PDF，单份不超过 20 MB。归档后可再关联业务单据。</p><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={compress} disabled={busy} onChange={e => setCompress(e.target.checked)} />适度压缩车辆照片和现场照片（单据与 PDF 保留原件）</label></Card>
    {error && <p role="alert" className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    <div className="space-y-3">{items.map((row, index) => <Card key={row.key} className="grid gap-4 p-4 lg:grid-cols-[260px_minmax(250px,1fr)_220px]"><button type="button" aria-label={`查看${row.file.name}`} onClick={() => openLocalAttachment(row.file)}><LocalAttachmentThumbnail file={row.file} large /></button><div className="space-y-3"><label className="block space-y-2 text-sm"><span>资料名称 {index + 1} *</span><Input aria-label={`资料名称${index + 1}`} maxLength={255} aria-invalid={Boolean(fieldErrors[row.key]?.name)} className={fieldErrors[row.key]?.name ? 'border-destructive' : ''} value={row.name} disabled={busy || row.status === 'DONE'} onChange={e => change(row.key, { name: e.target.value, confirmed: false, status: 'READY', error: '' })} /></label>{fieldErrors[row.key]?.name && <p role="alert" className="text-xs text-destructive">{fieldErrors[row.key].name}</p>}<p className="break-all text-xs text-muted-foreground">原文件：{row.file.name} · {sizeText(row.file.size)}</p><div className="space-y-2 text-sm"><span className="text-muted-foreground">影像类型</span><p aria-label={`资料类型${index + 1}`} className="font-medium">{IMAGE_TYPES[row.type] || '未选择'}</p></div>{fieldErrors[row.key]?.type && <p role="alert" className="text-xs text-destructive">{fieldErrors[row.key].type}</p>}<label className="block space-y-2 text-sm"><span>备注（选填）</span><textarea aria-label={`资料备注${index + 1}`} maxLength={1000} className="min-h-[88px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" value={row.remarks} disabled={busy || row.status === 'DONE'} placeholder="填写这份资料的补充说明" onChange={e => change(row.key, { remarks: e.target.value })} /></label>{fieldErrors[row.key]?.remarks && <p role="alert" className="text-xs text-destructive">{fieldErrors[row.key].remarks}</p>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={row.confirmed} disabled={busy || row.status === 'DONE'} onChange={e => change(row.key, { confirmed: e.target.checked })} />名称已核对</label></div><div className="flex flex-col justify-between gap-4 text-sm"><div>{row.status === 'UPLOADING' ? <span className="text-primary">正在上传…</span> : row.status === 'DONE' ? <p className="text-primary">{row.result}{row.savedSize !== undefined && <span className="mt-1 block text-xs text-muted-foreground">保存大小：{sizeText(row.savedSize)}</span>}</p> : row.status === 'ERROR' ? <p role="alert" className="break-all text-destructive">{row.error}</p> : <span className="text-muted-foreground">{row.confirmed ? '待归档' : '请核对资料名称'}</span>}</div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => openLocalAttachment(row.file)}>查看原件</Button>{row.status === 'ERROR' && <Button size="sm" disabled={busy} onClick={() => void upload(row.key)}>重试</Button>}{row.status !== 'DONE' && <Button variant="ghost" size="icon" aria-label={`移除${row.name}`} disabled={busy} onClick={() => setItems(prev => prev.filter(i => i.key !== row.key))}><Trash2 className="h-4 w-4" /></Button>}</div></div></Card>)}</div>
    {!items.length && <Card className="py-16 text-center text-sm text-muted-foreground">请添加需要归档的资料</Card>}
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-t-lg border bg-background p-4 shadow-sm"><p className="text-sm">已归档 {items.filter(i => i.status === 'DONE').length} / {items.length} 份 · 待核对 {items.filter(i => i.status !== 'DONE' && !i.confirmed).length} 份</p><div className="flex flex-wrap gap-3">{hasArchived && !hasPending && <Button variant="outline" disabled={busy} onClick={startNewBatch}>开始新一批</Button>}<Button variant="outline" disabled={busy} onClick={() => void back()}>返回资料库</Button><Button disabled={busy || !hasPending} onClick={() => void upload()}>{busy ? '正在归档…' : items.some(i => i.status === 'ERROR') ? '重试未完成资料' : '确认归档'}</Button></div></div>
  </div>;
}
