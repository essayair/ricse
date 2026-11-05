'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { pairFromExclusive, pairFromInclusive } from './tax-price-fields';

type Spec = 'FRAGMENT' | 'RUN_OF_MINE';
type GradeBand = { lower: number | null; upper: number | null; rates: { FRAGMENT: number | null; RUN_OF_MINE: number | null } };

export interface GradePriceSnapshot {
  version: 1; method: 'CAF2_GRADE_TIER'; gradeUnit: 'PERCENT_POINTS'; rateUnit: 'CNY_PER_DEGREE_EX_TAX';
  quantityBasis?: 'PHYSICAL' | 'DRY_MATTER';
  moistureMaxPct: number | null; selectedSpec: Spec | ''; formulaConfirmed: boolean;
  exceptionHandling: 'MANUAL_REVIEW';
  bands: GradeBand[];
  /** 选矿回收率扣价：低于基准时每低 1 个百分点扣若干不含税元/度，只扣不奖。 */
  recoveryAdjustment?: RecoveryAdjustment | null;
}
export type RecoveryAdjustment = { baselinePct: number | null; deductionPerPointPerDegree: number | null; stepMode: 'PROPORTIONAL' | 'FULL_POINT'; note?: string };
const defaultRecovery = (): RecoveryAdjustment => ({ baselinePct: null, deductionPerPointPerDegree: null, stepMode: 'PROPORTIONAL' });
const numberOrNull = (text: string) => text === '' ? null : Number(text);

function RecoveryAdjustmentFields({ rule, taxRate, onChange }: { rule: GradePriceSnapshot; taxRate: string; onChange: (value: GradePriceSnapshot) => void }) {
  const recovery = rule.recoveryAdjustment;
  const update = (patch: Partial<RecoveryAdjustment>) => onChange({ ...rule, recoveryAdjustment: { ...(recovery || defaultRecovery()), ...patch } });
  return <div className="mt-4 rounded-md border border-dashed p-3">
    <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={Boolean(recovery)} onChange={event => onChange({ ...rule, recoveryAdjustment: event.target.checked ? defaultRecovery() : null })} />合同约定选矿回收率扣价</label>
    {recovery && <>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="text-sm">回收率基准（%）<Input className="mt-1" type="number" min="0" max="100" step="0.01" value={recovery.baselinePct ?? ''} onChange={event => update({ baselinePct: numberOrNull(event.target.value) })} placeholder="例如 86" /></label>
        <label className="text-sm">每低 1 个百分点扣（不含税元/度）<Input className="mt-1" type="number" min="0" step="0.0001" value={recovery.deductionPerPointPerDegree ?? ''} onChange={event => update({ deductionPerPointPerDegree: numberOrNull(event.target.value) })} placeholder="例如 0.4" /></label>
        <label className="text-sm">含税（元/度）<Input className="mt-1" type="number" min="0" step="0.0001" value={recovery.deductionPerPointPerDegree == null ? '' : pairFromExclusive(String(recovery.deductionPerPointPerDegree), taxRate).inclusive} onChange={event => update({ deductionPerPointPerDegree: numberOrNull(event.target.value === '' ? '' : pairFromInclusive(event.target.value, taxRate).exclusive) })} /></label>
        <label className="text-sm">差额计算<select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={recovery.stepMode} onChange={event => update({ stepMode: event.target.value as RecoveryAdjustment['stepMode'] })}><option value="PROPORTIONAL">按实际差额（84.5% 计 1.5 点）</option><option value="FULL_POINT">按整百分点（84.5% 计 1 点）</option></select></label>
      </div>
      <label className="mt-3 block text-sm">合同条款原文 / 说明<Input className="mt-1" value={recovery.note || ''} onChange={event => update({ note: event.target.value || undefined })} placeholder="例如：选矿回收率低于86%，每低1个百分点扣0.4元/度" /></label>
      <p className="mt-2 text-xs text-muted-foreground">结算时读取所选检测报告中的“选矿回收率”指标（编码 RECOVERY 或名称含“回收率”），报告附件即为依据。扣价 = 实测度数 × 差额百分点 × 每点扣价；回收率达到基准不加价。报告缺回收率时该车转人工确认。</p>
    </>}
  </div>;
}
const emptyBand = (): GradeBand => ({ lower: null, upper: null, rates: { FRAGMENT: null, RUN_OF_MINE: null } });
export const defaultGradePriceSnapshot: GradePriceSnapshot = {
  version: 1, method: 'CAF2_GRADE_TIER', gradeUnit: 'PERCENT_POINTS', rateUnit: 'CNY_PER_DEGREE_EX_TAX',
  moistureMaxPct: null, quantityBasis: 'DRY_MATTER', selectedSpec: '', formulaConfirmed: false, exceptionHandling: 'MANUAL_REVIEW',
  bands: [[10, 15], [15, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, 45], [45, 50]]
    .map(([lower, upper]) => ({ lower, upper, rates: { FRAGMENT: null, RUN_OF_MINE: null } })),
};

/** 支持 Excel 多行：下限、上限、单价（当前规格）或下限、上限、碎屑价、统矿价。 */
function parsePastedBands(text: string, selectedSpec: Spec | ''): GradeBand[] {
  const rows = text.split(/\r?\n/).map(row => row.trim()).filter(row =>
    row && /\d/.test(row.replace(/CaF[₂2]/gi, '品位')),
  );
  if (!rows.length) throw new Error('请先粘贴品位区间和单价');
  return rows.map((row, index) => {
    const numbers = row.replace(/CaF[₂2]/gi, '品位').match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    if (numbers.length !== 3 && numbers.length !== 4) throw new Error(`第 ${index + 1} 行应填写下限、上限和单价；也可以分别填写两种规格的单价`);
    const [lower, upper, firstRate, secondRate] = numbers;
    if (lower < 0 || upper > 100 || lower >= upper || firstRate <= 0 || (secondRate !== undefined && secondRate <= 0)) throw new Error(`第 ${index + 1} 行的品位区间或单价无效`);
    if (secondRate === undefined && !selectedSpec) throw new Error('粘贴单列价格前，请先选择本行货物规格');
    return { lower, upper, rates: {
      FRAGMENT: secondRate === undefined ? (selectedSpec === 'FRAGMENT' ? firstRate : null) : firstRate,
      RUN_OF_MINE: secondRate === undefined ? (selectedSpec === 'RUN_OF_MINE' ? firstRate : null) : secondRate,
    } };
  });
}

export function GradePriceRulesEditor({ value, taxRate = '13', onChange }: { value: GradePriceSnapshot | null | undefined; taxRate?: string; onChange: (value: GradePriceSnapshot) => void }) {
  const rule = value || defaultGradePriceSnapshot;
  const [pastedText, setPastedText] = useState('');
  const [pasteError, setPasteError] = useState('');
  const updateBand = (index: number, patch: Partial<GradeBand>) => onChange({ ...rule,
    bands: rule.bands.map((band, i) => i === index ? { ...band, ...patch } : band),
  });
  const updateRate = (index: number, spec: Spec, text: string, input: 'exclusive' | 'inclusive') => {
    const exclusive = input === 'inclusive' ? pairFromInclusive(text, taxRate).exclusive : text;
    updateBand(index, { rates: { ...rule.bands[index].rates, [spec]: exclusive === '' ? null : Number(exclusive) } });
  };
  const pasteBands = () => {
    try {
      onChange({ ...rule, bands: parsePastedBands(pastedText, rule.selectedSpec) });
      setPastedText('');
      setPasteError('');
    } catch (error) {
      setPasteError(error instanceof Error ? error.message : '无法识别粘贴的价格表');
    }
  };
  return <div className="mt-4 rounded-lg border p-4">
    <div className="font-medium">按 CaF₂ 品位分档计价</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-sm">本行货物规格<select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={rule.selectedSpec} onChange={event => onChange({ ...rule, selectedSpec: event.target.value as GradePriceSnapshot['selectedSpec'] })}><option value="">请选择</option><option value="FRAGMENT">碎屑</option><option value="RUN_OF_MINE">统矿</option></select></label><label className="text-sm">计价重量<select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={rule.quantityBasis || 'DRY_MATTER'} onChange={event => onChange({ ...rule, quantityBasis: event.target.value as 'PHYSICAL' | 'DRY_MATTER' })}><option value="DRY_MATTER">所选磅单净重折干</option><option value="PHYSICAL">所选磅单净重</option></select></label><label className="text-sm">水分上限（%）<Input className="mt-1" type="number" min="0" max="100" step="0.01" value={rule.moistureMaxPct ?? ''} onChange={event => onChange({ ...rule, moistureMaxPct: event.target.value === '' ? null : Number(event.target.value) })} /></label></div>
    <div className="mt-4 overflow-x-auto"><table className="min-w-[960px] w-full text-sm"><thead className="border-b bg-muted/50 text-left"><tr><th className="px-2 py-2">品位下限（%）</th><th className="px-2 py-2">品位上限（%，不含）</th><th className="px-2 py-2">碎屑不含税（元/度）</th><th className="px-2 py-2">碎屑含税（元/度）</th><th className="px-2 py-2">统矿不含税（元/度）</th><th className="px-2 py-2">统矿含税（元/度）</th><th className="px-2 py-2">操作</th></tr></thead><tbody>{rule.bands.map((band, index) => <tr key={index} className="border-b"><td className="px-2 py-2"><Input aria-label={`第${index + 1}档品位下限`} type="number" min="0" max="100" step="0.01" value={band.lower ?? ''} onChange={event => updateBand(index, { lower: event.target.value === '' ? null : Number(event.target.value) })} /></td><td className="px-2 py-2"><Input aria-label={`第${index + 1}档品位上限`} type="number" min="0" max="100" step="0.01" value={band.upper ?? ''} onChange={event => updateBand(index, { upper: event.target.value === '' ? null : Number(event.target.value) })} /></td>{(['FRAGMENT', 'RUN_OF_MINE'] as const).flatMap(spec => [<td key={`${spec}-ex`} className="px-2 py-2"><Input aria-label={`第${index + 1}档${spec}不含税价`} type="number" min="0" step="0.0001" value={band.rates[spec] ?? ''} onChange={event => updateRate(index, spec, event.target.value, 'exclusive')} /></td>, <td key={`${spec}-in`} className="px-2 py-2"><Input aria-label={`第${index + 1}档${spec}含税价`} type="number" min="0" step="0.0001" value={band.rates[spec] == null ? '' : pairFromExclusive(String(band.rates[spec]), taxRate).inclusive} onChange={event => updateRate(index, spec, event.target.value, 'inclusive')} /></td>])}<td className="px-2 py-2"><button type="button" className="text-destructive hover:underline" onClick={() => onChange({ ...rule, bands: rule.bands.filter((_, i) => i !== index) })}>删除</button></td></tr>)}</tbody></table></div>
    <button type="button" className="mt-3 rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={() => onChange({ ...rule, bands: [...rule.bands, emptyBand()] })}>添加品位区间</button>
    <div className="mt-4"><label className="text-sm font-medium">从表格粘贴价格<textarea className="mt-1 min-h-20 w-full rounded-md border bg-background p-2 text-sm font-normal" value={pastedText} onChange={event => { setPastedText(event.target.value); setPasteError(''); }} placeholder={'每行：下限　上限　当前规格单价；或下限　上限　碎屑单价　统矿单价\n例如：10\t15\t14.80'} /></label><p className="mt-1 text-xs text-muted-foreground">从 Excel 复制多行即可；按不含税元/度读取，填入后替换当前区间。</p>{pasteError && <p role="alert" className="mt-1 text-sm text-destructive">{pasteError}</p>}<button type="button" className="mt-2 rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={pasteBands}>解析并填入</button></div>
    <label className="mt-4 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={rule.formulaConfirmed} onChange={event => onChange({ ...rule, formulaConfirmed: event.target.checked })} /><span>我已核对纸质合同：“元/度”按 CaF₂ 实测百分数的百分点计价（例如 37% 按 37 度），实际税前金额为结算吨数 × 实测度数 × 所在档位价格。</span></label>
    <RecoveryAdjustmentFields rule={rule} taxRate={taxRate} onChange={onChange} />
    <p className="mt-2 text-xs text-warning">CaF₂ 不在表内、水分超上限或证据缺失时，系统不自动计算正式结算金额，须人工确认合同处理方式。</p>
  </div>;
}

export function GradePriceRulesView({ value, title, taxRate }: { value: GradePriceSnapshot | null | undefined; title: string; taxRate?: string | number | null }) {
  if (!value?.bands?.length) return null;
  const price = (rate: number | null) => rate == null ? '—' : String(rate);
  const inclusive = (rate: number | null) => rate == null ? '—' : pairFromExclusive(String(rate), String(taxRate)).inclusive;
  return <div className="mt-3 overflow-x-auto rounded-md border p-3 text-xs"><div className="mb-2 font-semibold">{title} · {value.selectedSpec === 'FRAGMENT' ? '碎屑' : value.selectedSpec === 'RUN_OF_MINE' ? '统矿' : '未选规格'} · 水分≤{value.moistureMaxPct ?? '—'}%</div><table className="w-full border-collapse"><thead className="border-b bg-muted/50 text-left"><tr><th className="p-2">CaF₂ 实测品位</th><th className="p-2">碎屑不含税（元/度）</th>{taxRate != null && <th className="p-2">碎屑含税（元/度）</th>}<th className="p-2">统矿不含税（元/度）</th>{taxRate != null && <th className="p-2">统矿含税（元/度）</th>}</tr></thead><tbody>{value.bands.map((band, index) => <tr key={index} className="border-b"><td className="p-2">{band.lower ?? '—'}% ≤ CaF₂ &lt; {band.upper ?? '—'}%</td><td className="p-2">{price(band.rates.FRAGMENT)}</td>{taxRate != null && <td className="p-2">{inclusive(band.rates.FRAGMENT)}</td>}<td className="p-2">{price(band.rates.RUN_OF_MINE)}</td>{taxRate != null && <td className="p-2">{inclusive(band.rates.RUN_OF_MINE)}</td>}</tr>)}</tbody></table>{value.recoveryAdjustment && <p className="mt-2">选矿回收率扣价：低于 {value.recoveryAdjustment.baselinePct ?? '—'}% 时，每低 1 个百分点扣 {value.recoveryAdjustment.deductionPerPointPerDegree ?? '—'} 元/度（不含税）{taxRate != null && value.recoveryAdjustment.deductionPerPointPerDegree != null ? `，含税 ${pairFromExclusive(String(value.recoveryAdjustment.deductionPerPointPerDegree), String(taxRate)).inclusive} 元/度` : ''}；{value.recoveryAdjustment.stepMode === 'FULL_POINT' ? '按整百分点计算' : '按实际差额计算'}，只扣不奖。{value.recoveryAdjustment.note ? `条款原文：${value.recoveryAdjustment.note}` : ''}</p>}<p className="mt-2 text-muted-foreground">元/度按实测百分数百分点计算；越档或水分超限须人工确认，不自动套价。</p></div>;
}
