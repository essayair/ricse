'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ServiceOrganizationForm } from '../service-organization-form';

function Content() {
  const params = useSearchParams();
  return <ServiceOrganizationForm type={params.get('type') || 'LOGISTICS_CARRIER'} />;
}

export default function NewServiceOrganizationPage() {
  return <Suspense fallback={<div className="p-12 text-center text-muted-foreground">加载中...</div>}><Content /></Suspense>;
}
