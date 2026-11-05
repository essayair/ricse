'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { GoodsSettlementEditor } from '@/components/settlement/goods-settlement-editor';

export default function EditGoodsSettlementPage() {
  const { id } = useParams<{ id: string }>();
  const [direction, setDirection] = useState<'PAYABLE' | 'RECEIVABLE' | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void api.get<{ direction: 'PAYABLE' | 'RECEIVABLE'; settlementScope: string; status: string }>(`/financial-settlements/${id}`)
    .then(item => { if (item.settlementScope !== 'GOODS' || item.status !== 'DRAFT') throw new Error('只有货物结算草稿可以编辑'); setDirection(item.direction); })
    .catch(cause => setError(cause.message || '加载结算草稿失败')); }, [id]);
  if (error) return <p role="alert" className="p-8 text-sm text-destructive">{error}</p>;
  if (!direction) return <p className="p-8 text-sm text-muted-foreground">正在加载结算草稿…</p>;
  return <GoodsSettlementEditor direction={direction} editId={id} />;
}
