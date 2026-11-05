'use client';

import { Input } from '@/components/ui/input';

/** 保留四位单价精度；含税价为合同执行价，税率变动时优先保持含税价不变。 */
export function roundContractPrice(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '';
  return (Math.round((value + Number.EPSILON) * 10000) / 10000).toFixed(4).replace(/\.?0+$/, '');
}

export function pairFromInclusive(inclusive: string, rate: string) {
  if (inclusive === '' || rate === '') return { inclusive, exclusive: '' };
  return { inclusive, exclusive: roundContractPrice(Number(inclusive) / (1 + Number(rate) / 100)) };
}

export function pairFromExclusive(exclusive: string, rate: string) {
  if (exclusive === '' || rate === '') return { inclusive: '', exclusive };
  return { inclusive: roundContractPrice(Number(exclusive) * (1 + Number(rate) / 100)), exclusive };
}

export function TaxPriceFields({ label, inclusive, exclusive, rate, onChange, estimated = false, fieldKey, error }: {
  label: string; inclusive: string; exclusive: string; rate: string;
  onChange: (values: { inclusive: string; exclusive: string }) => void;
  estimated?: boolean; fieldKey?: string; error?: string;
}) {
  return <div data-validation-field={fieldKey} className={`grid gap-3 scroll-mt-28 sm:grid-cols-2 ${error ? '[&_input]:border-destructive [&_input]:bg-destructive/5' : ''}`}>
    <label className="space-y-1 text-sm"><span>{label}不含税价（元/吨）{estimated ? ' · 预计' : ''}</span>
      <Input type="number" min="0" step="0.0001" value={exclusive} onChange={event => onChange(pairFromExclusive(event.target.value, rate))} placeholder="填写其一即可" />
    </label>
    <label className="space-y-1 text-sm"><span>{label}含税价（元/吨）{estimated ? ' · 预计' : ''}</span>
      <Input type="number" min="0" step="0.0001" value={inclusive} onChange={event => onChange(pairFromInclusive(event.target.value, rate))} placeholder="填写其一即可" />
    </label>
    {error && <span className="text-xs text-destructive sm:col-span-2" role="alert">{error}</span>}
  </div>;
}
