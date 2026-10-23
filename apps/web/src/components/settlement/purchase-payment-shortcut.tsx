'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
export function PurchasePaymentShortcut({ contractId, orderId, enabled }: { contractId: string; orderId?: string; enabled: boolean }) {
  const [canApply, setCanApply] = useState(false);
  useEffect(() => { try { const user = JSON.parse(localStorage.getItem('user') || '{}'); setCanApply(user.role === 'ADMIN' || user.permissions?.includes('settlement.payment.apply') || user.permissions?.includes('settlement.manage')); } catch {} }, []);
  if (!enabled || !canApply) return null;
  return <Button variant="outline" size="sm" asChild><Link href={`/dashboard/payment-requests/new?contractId=${contractId}${orderId ? `&orderId=${orderId}` : ''}`}>申请采购付款</Link></Button>;
}
