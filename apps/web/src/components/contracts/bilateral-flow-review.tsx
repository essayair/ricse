'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';

type Settlement = { id: string; settlementNo: string; quantity: string | null; status: string };
type Review = {
  financeVisible: boolean; contractEvidence: { purchase: boolean; sales: boolean; purchaseNo: boolean; salesNo: boolean };
  trips: Array<{ id: string; waybillNo: string; plateNo: string | null; status: string; delivered: boolean; receiptProvided: boolean; quantitiesConsistent: boolean; quantity?: string; pricingQuantity?: string; purchaseDocumentNo?: string; salesDocumentNo?: string; purchaseSettlements: Settlement[]; salesSettlements: Settlement[] }>;
  funds: { count: number; thirdPartyCount: number; oppositePartyCount: number };
  invoices: { count: number; inconsistentPartyCount: number; inputQuantity: string; outputQuantity: string; namesDiffer: boolean }; note: string;
};
export function BilateralFlowReview({ contractId }: { contractId: string }) {
  const [data, setData] = useState<Review>(); const [error, setError] = useState(''); const [visible, setVisible] = useState(true);
  useEffect(() => {
    try { const u = JSON.parse(localStorage.getItem('user') || '{}'); if (u.company?.type === 'EXTERNAL') { setVisible(false); return; } } catch { /* server still authorizes */ }
    api.get<Review>(`/bilateral-direct/contracts/${contractId}/review`).then(setData).catch(e => setError(e.message));
  }, [contractId]);
  if (!visible) return null;
  return <Card className="space-y-4 p-5"><h2 className="font-semibold">四流核对 · 双边直拨</h2>
    {error && <p className="text-sm text-destructive">{error}</p>}
    {data && <>
      <div className="grid gap-3 text-sm sm:grid-cols-2"><p>采购合同：<Check ok={data.contractEvidence.purchase && data.contractEvidence.purchaseNo} /></p><p>销售合同：<Check ok={data.contractEvidence.sales && data.contractEvidence.salesNo} /></p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="border-b text-left text-muted-foreground"><tr>{['运单 / 车牌', '交付 / 凭证', '采购业务入库', '销售出库', '实物 / 辅助数量（吨）', '采购结算', '销售结算'].map(h => <th key={h} className="p-2 whitespace-nowrap">{h}</th>)}</tr></thead><tbody>
        {data.trips.map(t => <tr key={t.id} className="border-b align-top"><td className="p-2"><Link className="text-primary" href={`/dashboard/waybills/${t.id}`}>{t.waybillNo}</Link><p className="text-xs text-muted-foreground">{t.plateNo || '未录车牌'}</p></td><td className="p-2">{t.status === 'CANCELLED' ? '已取消' : t.delivered ? '已交付' : '待确认'}<p className={t.receiptProvided ? 'text-muted-foreground' : 'text-warning'}>{t.receiptProvided ? '签收凭证已提供' : '凭证待补'}</p></td><td className="p-2">{t.purchaseDocumentNo || '—'}</td><td className="p-2">{t.salesDocumentNo || '—'}</td><td className={`p-2 ${t.delivered && !t.quantitiesConsistent ? 'text-destructive' : ''}`}>{t.quantity ?? '—'} / {t.pricingQuantity ?? '—'}<p className="text-xs">{t.delivered ? t.quantitiesConsistent ? '两向一致' : '两向异常，需核查' : '未生成业务单据'}</p></td><td className="p-2">{data.financeVisible ? <SettlementLinks items={t.purchaseSettlements} /> : '无结算查看权限'}</td><td className="p-2">{data.financeVisible ? <SettlementLinks items={t.salesSettlements} /> : '无结算查看权限'}</td></tr>)}
        {!data.trips.length && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">暂无新配对直拨运单；历史直拨和常规仓储单据不自动转换。</td></tr>}
      </tbody><tfoot className="border-t bg-muted/30"><tr><td className="p-2" colSpan={4}>合计 · {data.trips.length} 趟</td><td className="p-2">{data.trips.reduce((s, t) => s + Number(t.quantity || 0), 0).toFixed(3)} / {data.trips.reduce((s, t) => s + Number(t.pricingQuantity || 0), 0).toFixed(3)}</td><td colSpan={2} /></tr></tfoot></table></div>
      {data.financeVisible && <div className="grid gap-3 text-sm sm:grid-cols-2"><div><h3 className="font-medium">资金流</h3><p>关联资金记录 {data.funds.count} 笔，第三方往来 {data.funds.thirdPartyCount} 笔</p>{data.funds.oppositePartyCount > 0 && <p className="text-destructive">发现上下游反向代付记录 {data.funds.oppositePartyCount} 笔，请核对</p>}</div><div><h3 className="font-medium">发票流</h3><p>已登记 {data.invoices.count} 张 · 进项数量 {data.invoices.inputQuantity} / 销项数量 {data.invoices.outputQuantity}</p>{data.invoices.inconsistentPartyCount > 0 && <p className="text-destructive">开票主体异常 {data.invoices.inconsistentPartyCount} 张</p>}{data.invoices.namesDiffer && <p className="text-warning">发票品名不同，请核对规格及对应业务</p>}</div></div>}
      <p className="text-xs text-muted-foreground">{data.note}</p>
    </>}
  </Card>;
}
function Check({ ok }: { ok: boolean }) { return <span className={ok ? '' : 'text-warning'}>{ok ? '已齐全' : '待补充合同号或分类附件'}</span>; }
function SettlementLinks({ items }: { items: Settlement[] }) { return items.length ? <>{items.map(s => <p key={s.id}><Link className="text-primary" href={`/dashboard/settlements/${s.id}`}>{s.settlementNo}</Link><span className="block text-xs text-muted-foreground">数量 {s.quantity ?? '未填'}</span></p>)}</> : <>待结算</>; }
