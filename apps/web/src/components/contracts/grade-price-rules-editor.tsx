'use client';

import { Input } from '@/components/ui/input';

export interface GradePriceSnapshot {
  version: 1; method: 'CAF2_GRADE_TIER'; gradeUnit: 'PERCENT_POINTS'; rateUnit: 'CNY_PER_DEGREE_EX_TAX';
  moistureMaxPct: number; selectedSpec: 'FRAGMENT' | 'RUN_OF_MINE'; formulaConfirmed: boolean;
  exceptionHandling: 'MANUAL_REVIEW';
  bands: Array<{ lower: number; upper: number; rates: { FRAGMENT: number; RUN_OF_MINE: number } }>;
}
export const defaultGradePriceSnapshot: GradePriceSnapshot = {
  version: 1, method: 'CAF2_GRADE_TIER', gradeUnit: 'PERCENT_POINTS', rateUnit: 'CNY_PER_DEGREE_EX_TAX',
  moistureMaxPct: 5, selectedSpec: 'FRAGMENT', formulaConfirmed: false, exceptionHandling: 'MANUAL_REVIEW',
  bands: [[10, 15, 14.8], [15, 20, 18.5], [20, 25, 20.5], [25, 30, 22], [30, 35, 22.7], [35, 40, 23.2], [40, 45, 23.5], [45, 50, 23.8]]
    .map(([lower, upper, rate]) => ({ lower, upper, rates: { FRAGMENT: rate, RUN_OF_MINE: rate } })),
};

export function GradePriceRulesEditor({ value, onChange }: { value: GradePriceSnapshot | null | undefined; onChange: (value: GradePriceSnapshot) => void }) {
  const rule = value || defaultGradePriceSnapshot;
  const updateRate = (index: number, key: 'FRAGMENT' | 'RUN_OF_MINE', text: string) => onChange({ ...rule,
    bands: rule.bands.map((band, i) => i === index ? { ...band, rates: { ...band.rates, [key]: Number(text) } } : band),
  });
  return <div className="mt-4 rounded-lg border p-4">
    <div className="font-medium">按 CaF₂ 品位分档计价</div>
    <p className="mt-1 text-xs text-muted-foreground">合同价格条款，与质量超标扣款规则分开。1000 吨等合同总量不预分配到档位，实际按每车选定的磅单和报告结算。</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm">本行货物规格<select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={rule.selectedSpec} onChange={event => onChange({ ...rule, selectedSpec: event.target.value as GradePriceSnapshot['selectedSpec'] })}><option value="FRAGMENT">碎屑</option><option value="RUN_OF_MINE">统矿</option></select></label><label className="text-sm">水分上限（%）<Input className="mt-1" type="number" min="0" max="100" step="0.01" value={rule.moistureMaxPct} onChange={event => onChange({ ...rule, moistureMaxPct: Number(event.target.value) })} /></label></div>
    <div className="mt-4 overflow-x-auto"><table className="min-w-[620px] w-full text-sm"><thead className="border-b bg-muted/50 text-left"><tr><th className="px-3 py-2">CaF₂ 品位（左闭右开）</th><th className="px-3 py-2">碎屑（元/度，不含税）</th><th className="px-3 py-2">统矿（元/度，不含税）</th></tr></thead><tbody>{rule.bands.map((band, index) => <tr key={`${band.lower}-${band.upper}`} className="border-b"><td className="px-3 py-2">{band.lower}% ≤ CaF₂ &lt; {band.upper}%</td><td className="px-3 py-2"><Input aria-label={`${band.lower}-${band.upper}碎屑单价`} type="number" min="0" step="0.01" value={band.rates.FRAGMENT} onChange={event => updateRate(index, 'FRAGMENT', event.target.value)} /></td><td className="px-3 py-2"><Input aria-label={`${band.lower}-${band.upper}统矿单价`} type="number" min="0" step="0.01" value={band.rates.RUN_OF_MINE} onChange={event => updateRate(index, 'RUN_OF_MINE', event.target.value)} /></td></tr>)}</tbody></table></div>
    <label className="mt-4 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={rule.formulaConfirmed} onChange={event => onChange({ ...rule, formulaConfirmed: event.target.checked })} /><span>我已核对纸质合同：“元/度”按 CaF₂ 实测百分数的百分点计价（例如 37% 按 37 度），实际税前金额为结算吨数 × 实测度数 × 所在档位价格。</span></label>
    <p className="mt-2 text-xs text-amber-700">CaF₂ 不在表内、水分超上限或证据缺失时，系统不自动计算正式结算金额，须人工确认合同处理方式。</p>
  </div>;
}

export function GradePriceRulesView({ value, title }: { value: GradePriceSnapshot | null | undefined; title: string }) {
  if (!value?.bands?.length) return null;
  return <div className="mt-3 overflow-x-auto rounded-md border p-3 text-xs"><div className="mb-2 font-semibold">{title} · {value.selectedSpec === 'FRAGMENT' ? '碎屑' : '统矿'} · 水分≤{value.moistureMaxPct}%</div><table className="w-full border-collapse"><thead className="border-b bg-muted/50 text-left"><tr><th className="p-2">CaF₂ 实测品位</th><th className="p-2">碎屑（元/度，不含税）</th><th className="p-2">统矿（元/度，不含税）</th></tr></thead><tbody>{value.bands.map(band => <tr key={`${band.lower}-${band.upper}`} className="border-b"><td className="p-2">{band.lower}% ≤ CaF₂ &lt; {band.upper}%</td><td className="p-2">{band.rates.FRAGMENT}</td><td className="p-2">{band.rates.RUN_OF_MINE}</td></tr>)}</tbody></table><p className="mt-2 text-muted-foreground">元/度按实测百分数百分点计算；越档或水分超限须人工确认，不自动套价。</p></div>;
}
