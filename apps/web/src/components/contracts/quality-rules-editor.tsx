'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Rule = {
  indicatorId?: string; code: string; name: string; symbol?: string | null; unit: string;
  operator: string; standardValue: number | null; upperValue: number | null;
  deductionMode: 'NONE' | 'PER_STEP' | 'FLAT'; deductionStep: number | null;
  deductionAmount: number | null; deductionCondition: 'OUTSIDE_STANDARD' | 'IN_RANGE';
  deductionLowerValue: number | null; deductionUpperValue: number | null;
  deductionLimitValue: number | null; rejectOperator: string; rejectValue: number | null;
};

type Snapshot = { materialId?: string; templateId?: string; templateCode?: string; templateName?: string; templateVersion?: number; items: Rule[] };

function preset(item: any): Rule {
  const code = String(item.indicator?.code || '').toLowerCase();
  const name = String(item.indicator?.name || '').toLowerCase();
  const symbol = String(item.indicator?.symbol || '').toLowerCase();
  const is = (...keys: string[]) => keys.some(key => `${code} ${name} ${symbol}`.includes(key.toLowerCase()));
  const rule: Rule = {
    indicatorId: item.indicatorId, code: item.indicator?.code || '', name: item.indicator?.name || '',
    symbol: item.indicator?.symbol || null, unit: item.unit || '%', operator: item.operator,
    standardValue: item.standardValue == null ? null : Number(item.standardValue),
    upperValue: item.upperValue == null ? null : Number(item.upperValue),
    deductionMode: 'NONE', deductionStep: null, deductionAmount: null,
    deductionCondition: 'OUTSIDE_STANDARD', deductionLowerValue: null, deductionUpperValue: null,
    deductionLimitValue: null, rejectOperator: 'NONE', rejectValue: null,
  };
  if (is('caf2', 'caf₂', '氟化钙')) Object.assign(rule, { deductionMode: 'PER_STEP', deductionStep: 0.1, deductionAmount: 20, rejectOperator: 'LT', rejectValue: 96.5 });
  else if (is('caco3', '碳酸钙')) Object.assign(rule, { deductionMode: 'PER_STEP', deductionStep: 0.1, deductionAmount: 20 });
  else if (is('sio2', '二氧化硅')) Object.assign(rule, { deductionMode: 'PER_STEP', deductionStep: 0.1, deductionAmount: 20, rejectOperator: 'GT', rejectValue: 2 });
  else if (is('moisture', '水分')) Object.assign(rule, { deductionMode: 'PER_STEP', deductionStep: 1, deductionAmount: 20, rejectOperator: 'GT', rejectValue: 15 });
  else if (is('sulfur', 'sulphur', '硫')) Object.assign(rule, { rejectOperator: 'GT', rejectValue: rule.standardValue });
  else if (is('organic', '有机物')) Object.assign(rule, { rejectOperator: 'GT', rejectValue: rule.standardValue });
  else if (is('325', '泰勒', '筛')) Object.assign(rule, {
    deductionMode: 'FLAT', deductionAmount: 20, deductionCondition: 'IN_RANGE',
    deductionLowerValue: rule.standardValue ?? 45, deductionUpperValue: rule.upperValue ?? 50,
    rejectOperator: 'GT', rejectValue: rule.upperValue ?? 50,
  });
  return rule;
}

export function QualityRulesEditor({ materialId, scene, value, onChange }: {
  materialId: string; scene: string; value?: Snapshot | null; onChange: (snapshot: Snapshot) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const snapshot = value && value.materialId === materialId ? value : null;

  useEffect(() => {
    if (!materialId || snapshot) return;
    let active = true;
    setLoading(true); setError('');
    api.get<any>(`/quality-standards/resolve?materialId=${encodeURIComponent(materialId)}&scene=${encodeURIComponent(scene)}`)
      .then(result => {
        if (!active) return;
        const template = result.template;
        onChange({
          materialId,
          templateId: template?.id,
          templateCode: template?.code,
          templateName: template?.name,
          templateVersion: template?.version,
          items: (template?.items || []).map(preset),
        });
      })
      .catch((e: Error) => { if (active) setError(e.message || '读取物料质检模板失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [materialId, scene, snapshot, onChange]);

  if (!materialId) return null;
  const update = (index: number, patch: Partial<Rule>) => {
    if (!snapshot) return;
    onChange({ ...snapshot, items: snapshot.items.map((item, i) => i === index ? { ...item, ...patch } : item) });
  };
  return <div className="col-span-12 rounded-md border bg-background p-3">
    <div className="mb-2">
      <div className="text-sm font-medium">质量结算规则</div>
      {snapshot?.templateName && <div className="mt-1 text-xs text-muted-foreground">模板：{snapshot.templateName}（V{snapshot.templateVersion || 1}）</div>}
      <div className="mt-1 text-xs text-muted-foreground">质量指标默认取自物料质检模板，请按本合同约定确认扣款及拒收规则。合同审批通过后，系统据此判定最终检测结果。</div>
    </div>
    {loading && <div className="py-3 text-sm text-muted-foreground">正在读取物料质检模板…</div>}
    {error && <div className="py-2 text-sm text-destructive">{error}</div>}
    {!loading && snapshot && !snapshot.items.length && <div className="rounded bg-amber-50 p-3 text-sm text-amber-900">该物料尚未配置质检模板。请先在物料/质检模板中配置检测指标，再返回合同选择物料。</div>}
    {snapshot?.items.map((rule, index) => <div key={`${rule.indicatorId || rule.code}-${index}`} className="mt-3 grid grid-cols-12 items-end gap-2 rounded border p-2">
      <div className="col-span-12 md:col-span-3"><div className="text-xs text-muted-foreground">检测指标 / 合同要求</div><div className="mt-1 text-sm font-medium">{rule.symbol || rule.name}　{rule.operator} {rule.standardValue}{rule.operator === 'RANGE' ? ` – ${rule.upperValue}` : ''} {rule.unit}</div></div>
      <label className="col-span-6 md:col-span-2 text-xs">偏差处理<select className="mt-1 h-9 w-full rounded border bg-background px-2 text-sm" value={rule.deductionMode} onChange={e => update(index, { deductionMode: e.target.value as Rule['deductionMode'] })}><option value="NONE">按标准验收</option><option value="PER_STEP">按偏差扣款</option><option value="FLAT">固定扣款</option></select></label>
      {rule.deductionMode === 'PER_STEP' && <><label className="col-span-3 md:col-span-2 text-xs">每步偏差<input className="mt-1 h-9 w-full rounded border bg-background px-2 text-sm" type="number" min="0.0001" step="0.1" value={rule.deductionStep ?? ''} onChange={e => update(index, { deductionStep: e.target.value === '' ? null : Number(e.target.value) })} /></label><label className="col-span-3 md:col-span-2 text-xs">扣款标准（元/吨）<input className="mt-1 h-9 w-full rounded border bg-background px-2 text-sm" type="number" min="0" step="0.01" value={rule.deductionAmount ?? ''} onChange={e => update(index, { deductionAmount: e.target.value === '' ? null : Number(e.target.value) })} /></label></>}
      {rule.deductionMode === 'FLAT' && <label className="col-span-6 md:col-span-2 text-xs">固定扣款（元/吨）<input className="mt-1 h-9 w-full rounded border bg-background px-2 text-sm" type="number" min="0" step="0.01" value={rule.deductionAmount ?? ''} onChange={e => update(index, { deductionAmount: e.target.value === '' ? null : Number(e.target.value) })} /></label>}
      {rule.deductionCondition === 'IN_RANGE' && <><label className="col-span-3 md:col-span-1 text-xs">区间下限<input className="mt-1 h-9 w-full rounded border bg-background px-2 text-sm" type="number" step="0.01" value={rule.deductionLowerValue ?? ''} onChange={e => update(index, { deductionLowerValue: e.target.value === '' ? null : Number(e.target.value) })} /></label><label className="col-span-3 md:col-span-1 text-xs">区间上限<input className="mt-1 h-9 w-full rounded border bg-background px-2 text-sm" type="number" step="0.01" value={rule.deductionUpperValue ?? ''} onChange={e => update(index, { deductionUpperValue: e.target.value === '' ? null : Number(e.target.value) })} /></label></>}
      {rule.deductionMode !== 'NONE' && <label className="col-span-6 md:col-span-2 text-xs">拒收条件<select className="mt-1 h-9 w-full rounded border bg-background px-2 text-sm" value={rule.rejectOperator} onChange={e => update(index, { rejectOperator: e.target.value })}><option value="NONE">无</option><option value="LT">小于</option><option value="LTE">小于等于</option><option value="GT">大于</option><option value="GTE">大于等于</option></select></label>}
      {rule.rejectOperator !== 'NONE' && <label className="col-span-3 md:col-span-1 text-xs">拒收值<input className="mt-1 h-9 w-full rounded border bg-background px-2 text-sm" type="number" step="0.01" value={rule.rejectValue ?? ''} onChange={e => update(index, { rejectValue: e.target.value === '' ? null : Number(e.target.value) })} /></label>}
      {rule.deductionMode === 'PER_STEP' && <label className="col-span-6 md:col-span-2 text-xs">扣款区间边界（可选）<input className="mt-1 h-9 w-full rounded border bg-background px-2 text-sm" type="number" step="0.01" value={rule.deductionLimitValue ?? ''} onChange={e => update(index, { deductionLimitValue: e.target.value === '' ? null : Number(e.target.value) })} /></label>}
    </div>)}
    {snapshot && snapshot.items.length > 0 && <p className="mt-2 text-xs text-muted-foreground">未配置扣款方式的指标，若实测值偏离合同质量要求，系统将标记“待人工判定”，不会自动放行或扣款。按偏差比例线性计算，结算金额仍由资金结算模块单独生成。</p>}
  </div>;
}
