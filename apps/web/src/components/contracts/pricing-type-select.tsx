'use client';
import { useId } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GRADE_PRICE_HELP } from '@ricse/shared-types/contract-pricing-policy';

export function PricingTypeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const helpId = useId();
  const labels: Record<string, string> = { FIXED: '固定价格（一口价）', GRADE_TIER: '按 CaF₂ 品位分档计价' };
  return <div className="space-y-1.5">
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="定价类型" aria-required aria-describedby={helpId} className="h-9"><SelectValue>{labels[value] || '历史定价方式'}</SelectValue></SelectTrigger>
      <SelectContent className="max-w-[calc(100vw-2rem)]">
        <SelectItem value="FIXED" textValue={labels.FIXED}><span className="block">{labels.FIXED}</span><span className="block max-w-md whitespace-normal text-xs leading-5 text-muted-foreground">货款＝结算数量×单价。</span></SelectItem>
        <SelectItem value="GRADE_TIER" textValue={labels.GRADE_TIER}><span className="block">{labels.GRADE_TIER}</span><span className="block max-w-md whitespace-normal text-xs leading-5 text-muted-foreground">{GRADE_PRICE_HELP}</span></SelectItem>
        {!labels[value] && <SelectItem value={value}>历史定价方式</SelectItem>}
      </SelectContent>
    </Select>
    <p id={helpId} className="text-xs leading-5 text-muted-foreground">{value === 'GRADE_TIER' ? GRADE_PRICE_HELP : value === 'FIXED' ? '货款＝结算数量×单价。' : '请按合同约定核对定价方式。'}</p>
  </div>;
}
