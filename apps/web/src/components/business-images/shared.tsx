'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';

export const IMAGE_TYPES: Record<string, string> = { CONTRACT: '合同附件', WEIGH_TICKET: '磅单', QUALITY_REPORT: '检测报告', VEHICLE_PHOTO: '车辆照片', SCENE_PHOTO: '现场照片', RECEIPT: '签收交接凭证', WAREHOUSE_DOCUMENT: '出入库凭证', SETTLEMENT_DOCUMENT: '结算凭证', OTHER: '其他资料' };
export const TARGET_TYPES: Record<string, string> = { CONTRACT: '合同', WAYBILL: '物流运单', WEIGH_TICKET: '磅单', QUALITY_REPORT: '检测报告', INBOUND: '入库单', OUTBOUND: '出库单', SETTLEMENT: '采购/销售结算单', PAYMENT_REQUEST: '付款申请单', FUND: '收付款单' };
export interface ContractOption { id: string; contractNo: string; title: string }
export interface NoticeOption { id: string; noticeNo: string }
export const sizeText = (size: number) => size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(2)} MB` : size >= 1024 ? `${Math.round(size / 1024)} KB` : `${size} B`;
export function FieldSelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={`h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${props.className || ''}`}>{children}</select>; }
export function ContractPicker({ value, onChange, disabled = false }: { value: ContractOption | null; onChange: (value: ContractOption | null) => void; disabled?: boolean }) {
  const [search, setSearch] = useState(''); const [open, setOpen] = useState(false); const [items, setItems] = useState<ContractOption[]>([]); const [error, setError] = useState(''); const node = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; let active = true; const timer = setTimeout(() => { void api.get<ContractOption[]>(`/business-images/contracts?search=${encodeURIComponent(search)}`).then(data => { if (active) { setItems(data); setError(''); } }).catch(e => { if (active) setError(e.message); }); }, 250); return () => { active = false; clearTimeout(timer); }; }, [search, open]);
  useEffect(() => { const close = (event: MouseEvent) => { if (!node.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  return <div ref={node} className="relative min-w-0"><Input aria-label="搜索并选择合同" disabled={disabled} value={open ? search : value ? `${value.contractNo} · ${value.title}` : ''} placeholder="搜索合同编号或标题" onFocus={() => { setOpen(true); setSearch(''); }} onChange={e => { setSearch(e.target.value); setOpen(true); }} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }} role="combobox" aria-expanded={open} />
    {open && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"><button type="button" className="w-full rounded px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent" onClick={() => { onChange(null); setOpen(false); }}>清空选择</button>{error ? <p role="alert" className="p-3 text-sm text-destructive">{error}</p> : !items.length ? <p className="p-3 text-sm text-muted-foreground">暂无匹配合同</p> : items.map(item => <button type="button" key={item.id} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => { onChange(item); setOpen(false); }}><span className="font-medium">{item.contractNo}</span><span className="ml-2">{item.title}</span></button>)}</div>}
  </div>;
}
export function BusinessImageThumbnail({ id, name }: { id: string; name: string }) {
  const [url, setUrl] = useState(''); const [failed, setFailed] = useState(false); const node = useRef<HTMLDivElement>(null);
  useEffect(() => { let active = true; let timer: ReturnType<typeof setTimeout>; const load = (attempt = 0) => { void api.get<{ url: string; mimeType: string }>(`/business-images/${id}/preview-url`).then(result => { if (!active) return; if (result.mimeType.startsWith('image/')) setUrl(result.url); else if (attempt < 5) timer = setTimeout(() => load(attempt + 1), 1500 * (attempt + 1)); else setFailed(true); }).catch(() => { if (active) setFailed(true); }); }; const observer = new IntersectionObserver(entries => { if (entries.some(i => i.isIntersecting)) { observer.disconnect(); load(); } }, { rootMargin: '200px' }); if (node.current) observer.observe(node.current); return () => { active = false; clearTimeout(timer); observer.disconnect(); }; }, [id]);
  return <div ref={node} className="relative flex h-32 w-44 items-center justify-center overflow-hidden rounded border bg-muted/30">{url && !failed ? <Image unoptimized fill src={url} alt={`${name}缩略图`} className="object-contain" onError={() => setFailed(true)} /> : <span className="flex flex-col items-center gap-2 text-xs text-muted-foreground"><FileText className="h-8 w-8" />{failed ? '点击查看原件' : '加载预览…'}</span>}</div>;
}
/** 仅普通照片适用；单据原件和 PDF 不进入此函数。 */
export async function compressOrdinaryPhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 512 * 1024) return file;
  const bitmap = await createImageBitmap(file);
  try { const ratio = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio)); const context = canvas.getContext('2d'); if (!context) return file; context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86)); return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file; } finally { bitmap.close(); }
}
