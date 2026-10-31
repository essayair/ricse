'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { FileText, Image as ImageIcon } from 'lucide-react';
import { api } from '@/lib/api';

const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp)$/i;

function isImage(name: string, mimeType?: string) {
  return mimeType?.startsWith('image/') || IMAGE_EXTENSIONS.test(name);
}

/** Thumbnails are read through the same permission-checked view-url endpoint as the full preview. */
export function StoredAttachmentThumbnail({ name, mimeType, viewUrlPath }: {
  name: string;
  mimeType?: string;
  viewUrlPath: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const node = useRef<HTMLDivElement>(null);
  const image = isImage(name, mimeType);

  useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (!image || !node.current) return;
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
  }, [image, viewUrlPath]);

  return <div ref={node} aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 text-muted-foreground">
    {image && url && !failed ? <Image unoptimized src={url} alt="" width={56} height={56} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      : image ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
  </div>;
}

export function LocalAttachmentThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  const image = isImage(file.name, file.type);
  useEffect(() => {
    if (!image) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, image]);
  return <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 text-muted-foreground">
    {image && url ? <Image unoptimized src={url} alt="" width={56} height={56} className="h-full w-full object-cover" />
      : image ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
  </div>;
}
