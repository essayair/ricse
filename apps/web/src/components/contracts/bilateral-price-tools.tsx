'use client';
import { GradePriceSnapshot } from './grade-price-rules-editor';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/lib/system-dialog';

export function BilateralPriceTools({ purchase, sales, onCopy }: { purchase?: GradePriceSnapshot | null; sales?: GradePriceSnapshot | null; onCopy?: (snapshot: GradePriceSnapshot) => void }) {
  const boundaries = [...new Set([...(purchase?.bands || []), ...(sales?.bands || [])].flatMap(b => [b.lower, b.upper]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)))].sort((a, b) => a - b);
  const rate = (snapshot: GradePriceSnapshot | null | undefined, lower: number, upper: number) => {
    if (!snapshot?.selectedSpec) return null;
    return snapshot.bands.find(b => b.lower != null && b.upper != null && b.lower <= lower && b.upper >= upper)?.rates[snapshot.selectedSpec] ?? null;
  };
  const ranges = boundaries.slice(0, -1).map((lower, i) => ({ lower, upper: boundaries[i + 1], purchase: rate(purchase, lower, boundaries[i + 1]), sales: rate(sales, lower, boundaries[i + 1]) }));
  return <div className="my-4 space-y-3 rounded-md border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">采销分档价格对照</h3>{onCopy && <Button type="button" size="sm" variant="outline" disabled={!purchase} onClick={async () => {
    if (purchase && await confirmAction('将以采购方向的档位、价格及条款替换销售方向，请按销售合同重新核对。', { title: '复制采购价格条款' })) onCopy(JSON.parse(JSON.stringify(purchase)));
  }}>复制采购档位至销售</Button>}</div>
    {purchase?.selectedSpec && sales?.selectedSpec && purchase.selectedSpec !== sales.selectedSpec && <p className="text-sm text-warning">采销规格不同，请核对纸质合同；系统不禁止保存。</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="p-2">CaF₂区间（%）</th><th className="p-2">采购元/度</th><th className="p-2">销售元/度</th><th className="p-2">差价</th></tr></thead><tbody>{ranges.map(r => <tr key={r.lower} className="border-b last:border-0"><td className="p-2">{r.lower} ≤ CaF₂ &lt; {r.upper}</td><td className="p-2">{r.purchase ?? '待填'}</td><td className="p-2">{r.sales ?? '待填'}</td><td className={`p-2 ${r.purchase != null && r.sales != null && r.sales < r.purchase ? 'text-destructive' : ''}`}>{r.purchase == null || r.sales == null ? '—' : (r.sales - r.purchase).toFixed(4)}</td></tr>)}</tbody></table></div>
    <p className="text-xs text-muted-foreground">不含税元/度，未计入回收率扣价、水分及其他费用。</p>
  </div>;
}
