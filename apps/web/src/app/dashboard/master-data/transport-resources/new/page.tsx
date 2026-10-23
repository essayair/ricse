import { Suspense } from 'react';
import { TransportResourceEditor } from '@/components/transport-resource-editor';

export default function NewTransportResourcePage() {
  return <Suspense fallback={<div className="p-10 text-center text-muted-foreground">加载中…</div>}><TransportResourceEditor/></Suspense>;
}
