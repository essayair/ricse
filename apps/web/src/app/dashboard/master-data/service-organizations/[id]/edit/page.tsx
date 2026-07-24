'use client';

import { useParams } from 'next/navigation';
import { ServiceOrganizationForm } from '../../service-organization-form';

export default function EditServiceOrganizationPage() {
  const params = useParams<{ id: string }>();
  return <ServiceOrganizationForm id={params.id} />;
}
