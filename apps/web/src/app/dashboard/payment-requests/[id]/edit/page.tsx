'use client';
import { useParams } from 'next/navigation';
import { PaymentRequestEditor } from '@/components/settlement/payment-request-editor';
export default function EditPaymentRequestPage() { const { id } = useParams<{ id: string }>(); return <PaymentRequestEditor id={id}/>; }
