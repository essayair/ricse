'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface CandidateWaybill {
  id: string;
  waybillNo: string;
  plateNo: string | null;
  signedAt: string | null;
  originLocation: string | null;
  destinationLocation: string | null;
  carrierName: string | null;
  weightSelections: Array<{ quantity: string }>;
}

export default function NewLogisticsSettlementPage() {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [remarks, setRemarks] = useState('');
  const [candidates, setCandidates] = useState<CandidateWaybill[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!periodStart || !periodEnd) { alert('请先选择结算周期'); return; }
    setLoading(true);
    setSearched(true);
    try {
      const query = new URLSearchParams({ periodStart, periodEnd });
      const result = await api.get<CandidateWaybill[]>(`/logistics-settlements/candidate-waybills?${query}`);
      setCandidates(result || []);
      setSelected({});
    } catch (error: any) { alert(error.message); }
    finally { setLoading(false); }
  };

  const toggle = (id: string) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));

  const submit = async () => {
    const waybillIds = Object.keys(selected).filter((id) => selected[id]);
    if (!waybillIds.length) { alert('请至少勾选一张运单'); return; }
    setSubmitting(true);
    try {
      const lines = waybillIds.map((waybillId) => {
        const manual = manualPrices[waybillId];
        return { waybillId, manualUnitPrice: manual ? Number(manual) : undefined };
      });
      const created = await api.post<{ id: string }>('/logistics-settlements', {
        periodStart, periodEnd, remarks: remarks || undefined, lines,
      });
      router.push(`/dashboard/logistics-settlements/${created.id}`);
    } catch (error: any) { alert(error.message); }
    finally { setSubmitting(false); }
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">新建物流结算单</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          选择结算周期后，系统列出该周期内已签收且尚未结算的运单；能匹配到生效合同运价的自动带出单价，其余需要手工填写单价（运满满、临时车辆）
        </p>
      </div>

      <Card className="space-y-3 p-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">结算周期开始</label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">结算周期结束</label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => void search()} disabled={loading}>{loading ? '查询中...' : '查询可结算运单'}</Button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">备注</label>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="选填" />
        </div>
      </Card>

      {searched && (
        <Card className="overflow-hidden">
          <div className="border-b p-4 font-medium">
            可结算运单（{candidates.length} 条，已选 {selectedCount} 条）
          </div>
          {!candidates.length ? (
            <div className="p-12 text-center text-muted-foreground">该周期内没有可结算的运单</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="p-3"></th>
                    <th className="p-3">运单号</th>
                    <th className="p-3">车牌</th>
                    <th className="p-3">线路</th>
                    <th className="p-3">承运方</th>
                    <th className="p-3">签收时间</th>
                    <th className="p-3">净重</th>
                    <th className="p-3">手工单价（未匹配合同价时填写）</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-3">
                        <input type="checkbox" checked={!!selected[item.id]} onChange={() => toggle(item.id)} />
                      </td>
                      <td className="p-3 font-mono">{item.waybillNo}</td>
                      <td className="p-3">{item.plateNo || '—'}</td>
                      <td className="p-3">{item.originLocation || '—'} → {item.destinationLocation || '—'}</td>
                      <td className="p-3">{item.carrierName || '—'}</td>
                      <td className="p-3 text-xs text-muted-foreground">{item.signedAt?.slice(0, 16).replace('T', ' ') || '—'}</td>
                      <td className="p-3">{item.weightSelections[0]?.quantity ?? '—'}</td>
                      <td className="p-3">
                        <Input type="number" className="w-32" placeholder="留空则按合同价自动匹配"
                          value={manualPrices[item.id] || ''}
                          onChange={(e) => setManualPrices((prev) => ({ ...prev, [item.id]: e.target.value }))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t p-4">
            <Button variant="outline" onClick={() => router.back()}>取消</Button>
            <Button disabled={submitting || !selectedCount} onClick={() => void submit()}>
              {submitting ? '提交中...' : `创建结算单（${selectedCount} 条）`}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
