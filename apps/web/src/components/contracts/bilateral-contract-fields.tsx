'use client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function BilateralContractFields({ form, set }: { form: { salesExternalNo: string; salesSignedAt: string; salesPaymentMethod: string }; set: (key: string, value: string) => void }) {
  return <Card className="space-y-4 p-6"><h2 className="font-semibold text-primary">销售方向合同信息</h2><div className="grid gap-4 md:grid-cols-2">
    <label className="space-y-2 text-sm"><span>销售外部合同号 *</span><Input value={form.salesExternalNo} onChange={e => set('salesExternalNo', e.target.value)} placeholder="无编号时填写“无”" /></label>
    <label className="space-y-2 text-sm"><span>销售合同签订日期 *</span><Input type="date" value={form.salesSignedAt} onChange={e => set('salesSignedAt', e.target.value)} /></label>
    <label className="space-y-2 text-sm md:col-span-2"><span>销售收款约定 *</span><Input value={form.salesPaymentMethod} onChange={e => set('salesPaymentMethod', e.target.value)} placeholder="按销售纸质合同填写收款方式与条件" /></label>
  </div></Card>;
}

export function ContractAttachmentCategory({ value, onChange, disabled }: { value?: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="flex flex-wrap items-center gap-2 text-sm"><span>附件类别</span><select className="h-9 min-w-40 rounded-md border border-input bg-background px-3" value={value || 'OTHER'} disabled={disabled} onChange={e => onChange(e.target.value)}><option value="OTHER">其他 / 待分类</option><option value="PURCHASE_CONTRACT">采购合同</option><option value="SALES_CONTRACT">销售合同</option></select></label>;
}
