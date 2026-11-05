'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { FileText, Image as ImageIcon } from 'lucide-react';
import { api } from '@/lib/api';

const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp)$/i;
const PDF_EXTENSION = /\.pdf$/i;

function isImage(name: string, mimeType?: string) {
  return mimeType?.startsWith('image/') || IMAGE_EXTENSIONS.test(name);
}

function isPdf(name: string, mimeType?: string) {
  return mimeType === 'application/pdf' || PDF_EXTENSION.test(name);
}

/** Thumbnails are read through the same permission-checked view-url endpoint as the full preview. */
export function StoredAttachmentThumbnail({ name, mimeType, viewUrlPath, large = false }: {
  name: string;
  mimeType?: string;
  viewUrlPath: string;
  large?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const node = useRef<HTMLDivElement>(null);
  const image = isImage(name, mimeType);
  const pdf = isPdf(name, mimeType);

  useEffect(() => {
    setUrl(null);
    setFailed(false);
    if ((!image && !(large && pdf)) || !node.current) return;
    let active = true;
    const load = () => {
      void api.get<{ url: string }>(viewUrlPath)
        .then(result => { if (active) setUrl(result.url); })
        .catch(() => { if (active) setFailed(true); });
    };
    if (typeof IntersectionObserver === 'undefined') load();
    else {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); }
      }, { rootMargin: '160px' });
      observer.observe(node.current);
      return () => { active = false; observer.disconnect(); };
    }
    return () => { active = false; };
  }, [image, large, pdf, viewUrlPath]);

  if (large) return <div ref={node} aria-label={`${name}附件预览`} className="relative flex h-72 w-full items-center justify-center overflow-hidden rounded-md border bg-muted/30 text-muted-foreground">
    {url && !failed && image ? <Image unoptimized fill src={url} alt={name} className="object-contain" onError={() => setFailed(true)} />
      : url && !failed && pdf ? <iframe title={`${name}首页预览`} src={`${url}${url.includes('#') ? '' : '#toolbar=0&navpanes=0&scrollbar=0'}`} loading="lazy" className="h-full w-full border-0 bg-white" />
        : <div className="flex flex-col items-center gap-2">{pdf ? <FileText className="h-14 w-14" /> : <ImageIcon className="h-14 w-14" />}<span className="text-xs">{failed ? '预览加载失败，可放大查看' : '正在加载预览…'}</span></div>}
  </div>;

  return <div ref={node} aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 text-muted-foreground">
    {image && url && !failed ? <Image unoptimized src={url} alt="" width={56} height={56} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      : image ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
  </div>;
}

export function LocalAttachmentThumbnail({ file, large = false }: { file: File; large?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const image = isImage(file.name, file.type);
  const pdf = isPdf(file.name, file.type);
  useEffect(() => {
    if (!image && !(large && pdf)) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, image, large, pdf]);
  if (large) return <div aria-label={`${file.name}附件预览`} className="relative flex h-72 w-full items-center justify-center overflow-hidden rounded-md border bg-muted/30 text-muted-foreground">
    {url && image ? <Image unoptimized fill src={url} alt={file.name} className="object-contain" />
      : url && pdf ? <iframe title={`${file.name}首页预览`} src={`${url}#toolbar=0&navpanes=0&scrollbar=0`} className="h-full w-full border-0 bg-white" />
        : <div className="flex flex-col items-center gap-2">{pdf ? <FileText className="h-14 w-14" /> : <ImageIcon className="h-14 w-14" />}<span className="text-xs">正在加载预览…</span></div>}
  </div>;
  return <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 text-muted-foreground">
    {image && url ? <Image unoptimized src={url} alt="" width={56} height={56} className="h-full w-full object-cover" />
      : image ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
  </div>;
}
