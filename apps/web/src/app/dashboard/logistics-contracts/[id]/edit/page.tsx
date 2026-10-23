'use client';
import { useParams } from 'next/navigation';
import { LogisticsContractEditor } from '@/components/logistics/logistics-contract-editor';
export default function Page() { const { id } = useParams<{ id: string }>(); return <LogisticsContractEditor id={id}/>; }
