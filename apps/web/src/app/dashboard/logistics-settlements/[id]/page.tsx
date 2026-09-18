'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { StatusText } from '@/components/status-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface SettlementLine {
  id: string;
  netWeight: string;
  unitPrice: string | null;
  amount: string | null;
  priceSource: 'CONTRACT' | 'MANUAL' | 'CONTRACT_OVERRIDDEN';
  overrideReason: string | null;
  waybill: {
    id: string; waybillNo: string; plateNo: string | null; signedAt: string | null;
    originLocation: string | null; destinationLocation: string | null; carrierName: string | null;
  };
}

interface SettlementDetail {
  id: string;
  settlementNo: string;
  status: 'DRAFT' | 'SUBMITTED' | 'REVIEWED' | 'VOIDED';
  periodStart: string;
  periodEnd: string;
  totalGrossWeight: string;
  totalNetWeight: string;
  totalAmount: string;
  remarks: string | null;
  payerCompany: { id: string; name: string };
  preparer: { id: string; name: string };
  reviewer: { id: string; name: string } | null;
  lines: SettlementLine[];
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿', SUBMITTED: '已提交', REVIEWED: '已复核', VOIDED: '已作废',
};

const PRICE_SOURCE_LABEL: Record<string, string> = {
  CONTRACT: '合同价', MANUAL: '手工录入', CONTRACT_OVERRIDDEN: '合同价已调整',
};

export default function LogisticsSettlementDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [settlement, setSettlement] = useState<SettlementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.get<SettlementDetail>(`/logistics-settlements/${id}`);
      setSettlement(result);
    } catch (error: any) { alert(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [id]);

  const startEdit = (line: SettlementLine) => {
    setEditingLine(line.id);
    setPriceInput(line.unitPrice || '');
    setReasonInput(line.overrideReason || '');
  };

  const savePrice = async (lineId: string) => {
    if (!priceInput || Number(priceInput) <= 0) { alert('请填写有效单价'); return; }
    setBusy(true);
    try {
      await api.post(`/logistics-settlements/${id}/lines/${lineId}/price`, {
        unitPrice: Number(priceInput), overrideReason: reasonInput || undefined,
      });
      setEditingLine(null);
      await load();
    } catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };

  const doAction = async (action: 'submit' | 'review' | 'void', confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    try { await api.post(`/logistics-settlements/${id}/${action}`); await load(); }
    catch (error: any) { alert(error.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="p-12 text-center text-muted-foreground">加载中...</div>;
  if (!settlement) return <div className="p-12 text-center text-muted-foreground">结算单不存在</div>;

  const isDraft = settlement.status === 'DRAFT';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-mono">{settlement.settlementNo}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            货主方：{settlement.payerCompany.name} · 结算周期：{settlement.periodStart.slice(0, 10)} ~ {settlement.periodEnd.slice(0, 10)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusText status={settlement.status}>{STATUS_LABEL[settlement.status]}</StatusText>
          {isDraft && <Button size="sm" disabled={busy} onClick={() => void doAction('submit')}>提交</Button>}
          {settlement.status === 'SUBMITTED' && <Button size="sm" disabled={busy} onClick={() => void doAction('review')}>复核通过</Button>}
          {settlement.status !== 'VOIDED' && (
            <Button size="sm" variant="destructive" disabled={busy}
              onClick={() => void doAction('void', '确认作废该结算单？作废后运单会重新回到未结算池，可被新的结算单再次选取。')}>
              作废
            </Button>
          )}
        </div>
      </div>

      <Card className="grid grid-cols-2 gap-4 p-6 text-sm md:grid-cols-4">
        <div><div className="text-muted-foreground">毛重合计</div><div className="mt-1">{settlement.totalGrossWeight}</div></div>
        <div><div className="text-muted-foreground">净重合计</div><div className="mt-1">{settlement.totalNetWeight}</div></div>
        <div><div className="text-muted-foreground">金额合计</div><div className="mt-1 font-medium">{settlement.totalAmount}</div></div>
        <div><div className="text-muted-foreground">制表人 / 复核人</div><div className="mt-1">{settlement.preparer.name} / {settlement.reviewer?.name || '—'}</div></div>
        {settlement.remarks && <div className="col-span-2 md:col-span-4"><div className="text-muted-foreground">备注</div><div className="mt-1">{settlement.remarks}</div></div>}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-4 font-medium">结算明细（{settlement.lines.length} 车）</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="p-3">运单号</th>
                <th className="p-3">车牌</th>
                <th className="p-3">线路</th>
                <th className="p-3">净重</th>
                <th className="p-3">单价</th>
                <th className="p-3">金额</th>
                <th className="p-3">单价来源</th>
                {isDraft && <th className="p-3">操作</th>}
              </tr>
            </thead>
            <tbody>
              {settlement.lines.map((line) => (
                <tr key={line.id} className="border-b align-top">
                  <td className="p-3 font-mono">{line.waybill.waybillNo}</td>
                  <td className="p-3">{line.waybill.plateNo || '—'}</td>
                  <td className="p-3">{line.waybill.originLocation || '—'} → {line.waybill.destinationLocation || '—'}</td>
                  <td className="p-3">{line.netWeight}</td>
                  <td className="p-3">
                    {editingLine === line.id ? (
                      <Input type="number" className="w-28" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} />
                    ) : (line.unitPrice ?? <span className="text-muted-foreground">未填写</span>)}
                  </td>
                  <td className="p-3">{line.amount ?? '—'}</td>
                  <td className="p-3">
                    <div>{PRICE_SOURCE_LABEL[line.priceSource]}</div>
                    {editingLine === line.id && (line.priceSource === 'CONTRACT' || line.priceSource === 'CONTRACT_OVERRIDDEN') && (
                      <Input className="mt-1 w-48" placeholder="调整原因（必填）" value={reasonInput} onChange={(e) => setReasonInput(e.target.value)} />
                    )}
                    {line.priceSource === 'CONTRACT_OVERRIDDEN' && line.overrideReason && editingLine !== line.id && (
                      <div className="mt-1 text-xs text-muted-foreground">原因：{line.overrideReason}</div>
                    )}
                  </td>
                  {isDraft && (
                    <td className="p-3">
                      {editingLine === line.id ? (
                        <div className="flex gap-1">
                          <Button size="sm" disabled={busy} onClick={() => void savePrice(line.id)}>保存</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingLine(null)}>取消</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => startEdit(line)}>调整单价</Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
