'use client';

import { Input } from '@/components/ui/input';

export interface WeightInputs {
  gross: string;
  tare: string;
  net: string;
}

export function calculateWeightInputs(value: WeightInputs) {
  const number = (raw: string) => raw.trim() === '' ? null : Number(raw);
  const gross = number(value.gross);
  const tare = number(value.tare);
  const net = number(value.net);
  const calculatedNet = gross !== null && tare !== null && gross > tare ? Math.round((gross - tare) * 1000) / 1000 : null;
  const calculatedTare = gross !== null && net !== null && gross > net ? Math.round((gross - net) * 1000) / 1000 : null;
  const calculatedGross = tare !== null && net !== null ? Math.round((tare + net) * 1000) / 1000 : null;
  const mismatch = calculatedNet !== null && net !== null && Math.round(calculatedNet * 1000) !== Math.round(net * 1000);
  const invalid = (gross !== null && tare !== null && gross <= tare) || (gross !== null && net !== null && gross <= net);
  const derivedField: keyof WeightInputs | null = value.gross === '' && calculatedGross !== null ? 'gross'
    : value.tare === '' && calculatedTare !== null ? 'tare'
      : value.net === '' && calculatedNet !== null ? 'net' : null;
  const displayed = { ...value, ...(derivedField ? { [derivedField]: String(derivedField === 'gross' ? calculatedGross : derivedField === 'tare' ? calculatedTare : calculatedNet) } : {}) };
  return { displayed, derivedField, mismatch, invalid };
}

export function WeightEntryFields({ value, onChange }: { value: WeightInputs; onChange: (value: WeightInputs) => void }) {
  const { displayed, derivedField, mismatch, invalid } = calculateWeightInputs(value);
  const update = (field: keyof WeightInputs, text: string) => {
    if (!/^\d*(?:\.\d{0,3})?$/.test(text)) return;
    onChange({ ...value, [field]: text });
  };
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-3">
      {([['gross', '毛重'], ['tare', '皮重'], ['net', '净重']] as const).map(([key, label]) => <label key={key} className="block text-sm font-medium">{label}（吨）{derivedField === key && <span className="ml-1 text-xs font-normal text-muted-foreground">自动计算</span>}<Input className="mt-1" inputMode="decimal" value={displayed[key]} placeholder={key === 'net' ? '完成称重前必填或自动计算' : '未提供可留空'} onChange={event => update(key, event.target.value)} /></label>)}
    </div>
    {invalid && <p className="text-sm text-destructive">毛重须大于皮重和净重，请核对。</p>}
    {mismatch && <p className="text-sm text-destructive">毛重－皮重与净重不一致，请修改后保存。</p>}
    {value.net !== '' && value.gross === '' && value.tare === '' && <p className="text-sm text-muted-foreground">仅有净重时可直接保存，其他两项保持空白。</p>}
  </div>;
}
